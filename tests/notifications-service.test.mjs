/**
 * Unit tests for the notification pipeline (notifications/*.ts).
 *
 * Run with `npm run test:notifications`. Needs no emulator -- a hand-rolled
 * fake Firestore stands in, modeling just enough of the Admin SDK surface
 * (`.doc().create()/.get()/.update()`, `.where().get()`, `.runTransaction()`)
 * for these modules to run against. Tenant isolation on the real collection
 * is covered separately by tests/firestore-notifications.test.mjs against
 * the emulator.
 *
 * What this pins down, from the PR 2 plan (docs/whatsapp-communication-plan.md
 * section 11): deterministic id computation, duplicate-enqueue idempotency
 * via create(), concurrent-dispatch compare-and-set, retry classification
 * and exhaustion into "dead", and that a notification record never carries a
 * raw email/phone -- only `recipientMasked`.
 */

import {
  computeNotificationId,
  buildEventKey,
  claimForDispatch,
  dispatchOne,
  dispatchMany,
  notifyCheckins,
  runNotificationSweep,
  NOTIFICATIONS_COLLECTION,
} from "../notifications/service.ts";
import { resolveRecipients } from "../notifications/recipients.ts";
import { maskEmail } from "../notifications/templates.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

// --- Fake Firestore ---------------------------------------------------

class FakeDocRef {
  constructor(store, collectionName, id) {
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }
  key() { return `${this.collectionName}/${this.id}`; }
  async get() {
    const data = this.store.get(this.key());
    return { exists: data !== undefined, id: this.id, data: () => (data ? { ...data } : undefined) };
  }
  async create(data) {
    if (this.store.has(this.key())) {
      const err = new Error("ALREADY_EXISTS: Document already exists");
      err.code = 6;
      throw err;
    }
    this.store.set(this.key(), { ...data });
  }
  async update(patch) {
    if (!this.store.has(this.key())) throw new Error("NOT_FOUND");
    this.store.set(this.key(), { ...this.store.get(this.key()), ...patch });
  }
}

class FakeQuery {
  constructor(store, collectionName, filters = []) {
    this.store = store;
    this.collectionName = collectionName;
    this.filters = filters;
  }
  where(field, op, value) {
    return new FakeQuery(this.store, this.collectionName, [...this.filters, { field, op, value }]);
  }
  limit() { return this; }
  _matches(data) {
    return this.filters.every(({ field, op, value }) => {
      const actual = data[field];
      if (op === "==") return actual === value;
      if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
      if (op === ">=") return actual >= value;
      if (op === "<") return actual < value;
      throw new Error(`unsupported op ${op} in fake query`);
    });
  }
  async get() {
    const prefix = `${this.collectionName}/`;
    const docs = [];
    for (const [key, data] of this.store.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (this._matches(data)) docs.push({ id: key.slice(prefix.length), data: () => ({ ...data }) });
    }
    return { docs, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
}

function makeFakeDb(seed = {}) {
  const store = new Map();
  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) store.set(`${collectionName}/${id}`, { ...data });
  }
  // A real Firestore transaction that reads a document and later writes it
  // will abort/retry if another transaction touched it in between -- that's
  // what makes claimForDispatch's compare-and-set actually exclusive. This
  // fake has no optimistic-concurrency layer to model that with, so it
  // approximates the observable guarantee directly: transactions run one at
  // a time, in submission order, each seeing every earlier one's writes.
  let txLock = Promise.resolve();
  return {
    store,
    collection(name) {
      return {
        doc: (id) => new FakeDocRef(store, name, id),
        where: (field, op, value) => new FakeQuery(store, name, [{ field, op, value }]),
      };
    },
    async runTransaction(fn) {
      const previous = txLock;
      let release;
      txLock = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        const tx = { get: async (ref) => ref.get(), update: (ref, patch) => ref.update(patch) };
        return await fn(tx);
      } finally {
        release();
      }
    },
  };
}

function fakeProvider(resultsByRecipient, calls = []) {
  return {
    channel: "email",
    async send(record) {
      calls.push(record.recipientUserId);
      const r = resultsByRecipient[record.recipientUserId];
      if (!r) throw new Error(`no fixture for ${record.recipientUserId}`);
      return r;
    },
  };
}

// --- Deterministic id ---------------------------------------------------

console.log("\nDeterministic notification id\n");

{
  const a = computeNotificationId("checkin:c1:t1", "parent1", "email");
  const b = computeNotificationId("checkin:c1:t1", "parent1", "email");
  const c = computeNotificationId("checkin:c1:t1", "parent2", "email");
  const d = computeNotificationId("checkout:c1:t1", "parent1", "email");

  check("same event+recipient+channel produces the same id", a, b);
  check("a different recipient produces a different id", true, a !== c);
  check("a different event produces a different id", true, a !== d);
  check("id is 32 hex characters (sha256 truncated, not the full digest)", true, /^[0-9a-f]{32}$/.test(a));
}

{
  const key = buildEventKey("check-in", "checkin_c1_s1_20260903", "2026-09-03T09:00:00.000Z");
  check("buildEventKey composes eventType:checkinId:occurredAt", "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z", key);
}

// --- Duplicate enqueue is idempotent (create() semantics) ----------------

console.log("\nDuplicate enqueue\n");

{
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
  });
  const provider = fakeProvider({ parent1: { ok: true, providerMessageId: "msg_1", retryable: false } });
  const occ = {
    checkinId: "checkin_c1_s1_20260903",
    eventType: "check-in",
    childId: "child1",
    eventKey: "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z",
    payload: { childName: "Kid", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  };

  const first = await notifyCheckins(db, "churchA", [occ], { email: provider });
  const second = await notifyCheckins(db, "churchA", [occ], { email: provider });

  check("first call enqueues and sends one notification", { enqueued: 1, sent: 1, failed: 0 }, first);
  const notificationDocs = [...db.store.keys()].filter((k) => k.startsWith(`${NOTIFICATIONS_COLLECTION}/`));
  check("duplicate call for the same event/recipient lands on the same id, not a second document", 1, notificationDocs.length);
  // Second call's "enqueued" count still reflects the id being produced, but
  // it's the *same* id -- claimForDispatch finds it already "sent" and skips.
  check("the duplicate call's dispatch is skipped (already sent), not resent", 0, second.sent);
}

// --- Concurrent dispatch: compare-and-set -------------------------------

console.log("\nConcurrent dispatch (compare-and-set)\n");

{
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
  });
  const calls = [];
  const provider = fakeProvider({ parent1: { ok: true, providerMessageId: "msg_1", retryable: false } }, calls);

  const occ = {
    checkinId: "checkin_c1_s1_20260903",
    eventType: "check-in",
    childId: "child1",
    eventKey: "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z",
    payload: { childName: "Kid", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  };
  const recipients = await resolveRecipients(db, "churchA", "child1");
  const id = computeNotificationId(occ.eventKey, recipients[0].userId, "email");

  // Enqueue once, then race two dispatch attempts against the same id --
  // this is the in-request dispatch and the cron sweep's retry pass landing
  // on the same record. Only one should actually call the provider.
  await notifyCheckins(db, "churchA", [occ], { email: { channel: "email", async send() { throw new Error("should not be reached by notifyCheckins itself"); } } });
  // notifyCheckins above already dispatched it to "sent" -- reset it to
  // "queued" to simulate two dispatchers racing a fresh enqueue.
  await db.collection(NOTIFICATIONS_COLLECTION).doc(id).update({ status: "queued", attempt: 0 });

  const [a, b] = await Promise.all([
    dispatchOne(db, id, { email: provider }),
    dispatchOne(db, id, { email: provider }),
  ]);

  const outcomes = [a.result, b.result].sort();
  check("exactly one of two racing dispatches actually sends", ["sent", "skipped"], outcomes);
  check("the provider is called exactly once, not twice", 1, calls.length);
}

// --- Retry classification and exhaustion --------------------------------

console.log("\nRetry classification and exhaustion\n");

{
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
  });
  const occ = {
    checkinId: "checkin_c1_s1_20260903",
    eventType: "check-in",
    childId: "child1",
    eventKey: "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z",
    payload: { childName: "Kid", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  };

  // First attempt fails retryably.
  const failingProvider = { channel: "email", async send() { return { ok: false, retryable: true, errorCode: "rate_limit_exceeded", errorMessage: "slow down" }; } };
  const result = await notifyCheckins(db, "churchA", [occ], { email: failingProvider });
  check("a retryable failure is reported as failed, not silently dropped", { enqueued: 1, sent: 0, failed: 1 }, result);

  const id = computeNotificationId(occ.eventKey, "parent1", "email");
  const afterFirst = await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get();
  check('a retryable failure under the attempt cap is "failed", not "dead"', "failed", afterFirst.data().status);

  // Drive it through the remaining attempts until exhausted.
  let last;
  for (let i = 0; i < 10; i++) {
    last = await dispatchOne(db, id, { email: failingProvider });
    if (last.result === "dead") break;
  }
  check("a persistently-retryable failure eventually gives up as dead, not retried forever", "dead", last.result);

  const finalDoc = await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get();
  check("a dead record still carries the last error for diagnosis", "rate_limit_exceeded", finalDoc.data().errorCode);
}

{
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
  });
  const occ = {
    checkinId: "checkin_c1_s1_20260903",
    eventType: "check-in",
    childId: "child1",
    eventKey: "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z",
    payload: { childName: "Kid", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  };
  const permanentFailure = { channel: "email", async send() { return { ok: false, retryable: false, errorCode: "validation_error", errorMessage: "bad address" }; } };
  await notifyCheckins(db, "churchA", [occ], { email: permanentFailure });

  const id = computeNotificationId(occ.eventKey, "parent1", "email");
  const doc = await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get();
  check("a non-retryable failure goes straight to dead on the first attempt", "dead", doc.data().status);
}

{
  // A provider that throws (SDK-level, not a {data,error} rejection) must
  // not crash the batch or leave the record stuck in "sending".
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
  });
  const occ = {
    checkinId: "checkin_c1_s1_20260903",
    eventType: "check-in",
    childId: "child1",
    eventKey: "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z",
    payload: { childName: "Kid", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  };
  const throwingProvider = { channel: "email", async send() { throw new Error("ECONNRESET"); } };

  let threw = false;
  let result;
  try {
    result = await notifyCheckins(db, "churchA", [occ], { email: throwingProvider });
  } catch {
    threw = true;
  }
  check("a provider throw does not propagate out of notifyCheckins", false, threw);
  check("...and is instead counted as a failure", { enqueued: 1, sent: 0, failed: 1 }, result);

  const id = computeNotificationId(occ.eventKey, "parent1", "email");
  const doc = await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get();
  check('a provider throw is treated as retryable ("failed", not stuck "sending")', "failed", doc.data().status);
}

// --- No raw contact info is ever stored ----------------------------------

console.log("\nNo raw email/phone stored on the notification record\n");

{
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "very.specific.address@example.com" } },
  });
  const occ = {
    checkinId: "checkin_c1_s1_20260903",
    eventType: "check-in",
    childId: "child1",
    eventKey: "check-in:checkin_c1_s1_20260903:2026-09-03T09:00:00.000Z",
    payload: { childName: "Kid", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  };
  await notifyCheckins(db, "churchA", [occ], { email: fakeProvider({ parent1: { ok: true, retryable: false } }) });

  const id = computeNotificationId(occ.eventKey, "parent1", "email");
  const stored = (await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get()).data();
  const raw = JSON.stringify(stored);

  check("the stored record has a recipientMasked field", maskEmail("very.specific.address@example.com"), stored.recipientMasked);
  check("the full email address does not appear anywhere in the stored record", false, raw.includes("very.specific.address@example.com"));
  check("no `email` or `phone` key exists on the record at all", true, !("email" in stored) && !("phone" in stored) && !("whatsapp" in stored));
}

{
  check('maskEmail keeps the domain and only masks the local part', "pa****@example.com", maskEmail("parent@example.com"));
}

// --- resolveRecipients: MVP is account-holder parent only, flag-gated guardians ---

console.log("\nresolveRecipients: MVP scope\n");

{
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
    guardians: { g1: { churchId: "churchA", childIds: ["child1"], active: true, email: "guardian@example.com" } },
  });

  delete process.env.NOTIFY_GUARDIANS;
  const withoutFlag = await resolveRecipients(db, "churchA", "child1");
  check("with the flag unset, only the account-holder parent is a recipient (MVP scope)", [{ userId: "parent1", email: "parent@example.com" }], withoutFlag);

  process.env.NOTIFY_GUARDIANS = "true";
  const withFlag = await resolveRecipients(db, "churchA", "child1");
  delete process.env.NOTIFY_GUARDIANS;
  check("with the flag on, the guardian is included too (future model)", 2, withFlag.length);
  check("the guardian recipient uses a synthetic guardian: userId, not a real uid", true, withFlag.some((r) => r.userId === "guardian:g1"));
}

{
  const db = makeFakeDb({ children: { child1: { parentId: null } } });
  const recipients = await resolveRecipients(db, "churchA", "child1");
  check("no parentId, no email on file -> no recipients (not an error)", [], recipients);
}

// --- Reconciliation sweep -------------------------------------------------

console.log("\nReconciliation sweep\n");

{
  // A checkin that happened but whose notify step never ran -- the crash
  // window the durable-intent invariant exists to close.
  const db = makeFakeDb({
    children: { child1: { parentId: "parent1" } },
    users: { parent1: { email: "parent@example.com" } },
    church_public: { churchA: { name: "Church A" } },
    checkins: {
      checkin_c1_s1_20260903: {
        churchId: "churchA", childId: "child1", childName: "Kid", roomName: "Room 1",
        status: "checked-in", checkInTime: "2026-09-03T09:00:00.000Z",
        updatedAt: "2026-09-03T09:00:00.000Z", serviceName: "Sunday Service",
      },
    },
  });
  const provider = fakeProvider({ parent1: { ok: true, providerMessageId: "msg_reconciled", retryable: false } });

  const summary = await runNotificationSweep(db, { email: provider });
  check("the sweep finds and sends the missing notification", { retried: 0, reconciled: 1, dispatched: 1, sent: 1, failed: 0 }, summary);

  const eventKey = buildEventKey("check-in", "checkin_c1_s1_20260903", "2026-09-03T09:00:00.000Z");
  const id = computeNotificationId(eventKey, "parent1", "email");
  const doc = await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get();
  check("the reconciled record is marked sent", "sent", doc.exists && doc.data().status);

  // Running it again must not re-send -- the record already exists.
  const second = await runNotificationSweep(db, { email: provider });
  check("running the sweep again does not re-enqueue the same event", 0, second.reconciled);
}

// --- Source guards (server.ts) ------------------------------------------
// The behavior above is proven against the notifications module directly.
// These pin the server.ts wiring: that the old serial per-child loops are
// gone, the deleted cooldown map stays deleted, and the cron route is
// protected and registered where the rate limiter can see it.

console.log("\nSource guards (server.ts)\n");

const serverSrc = readFileSync(path.join(ROOT, "server.ts"), "utf8");

check(
  "emailService.sendNotification is no longer called anywhere (replaced by notifyCheckins)",
  false,
  /emailService\.sendNotification/.test(serverSrc),
);
check(
  "emailService.sendEmergencyAlert is no longer called anywhere",
  false,
  /emailService\.sendEmergencyAlert/.test(serverSrc),
);
check(
  "notifyCheckins is wired in",
  true,
  /notifyCheckins\(/.test(serverSrc),
);
check(
  "the notification cron route is registered inside startServer(), after generalLimiter mounts",
  true,
  (() => {
    const startServerBody = serverSrc.slice(serverSrc.indexOf("async function startServer()"));
    return startServerBody.indexOf('app.use("/api/", generalLimiter)') < startServerBody.indexOf("/api/cron/notifications-sweep");
  })(),
);
check(
  "the cron route checks a shared secret before doing anything",
  true,
  /\/api\/cron\/notifications-sweep[\s\S]{0,400}CRON_SECRET/.test(serverSrc),
);

const emailServiceSrc = readFileSync(path.join(ROOT, "emailService.ts"), "utf8");
check(
  "the per-child in-memory cooldown map is gone from emailService.ts (superseded by deterministic notification ids)",
  false,
  /cooldowns/.test(emailServiceSrc),
);
check(
  "generateTemplate moved out of emailService.ts (now notifications/templates.ts)",
  false,
  /generateTemplate/.test(emailServiceSrc),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
