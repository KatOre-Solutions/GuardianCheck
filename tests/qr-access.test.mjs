/**
 * Unit tests for notifications/qr-access.ts.
 *
 * Run with `npm run test:qr-access`. No emulator -- a fake Firestore models
 * the small surface these functions use.
 *
 * What matters here: the token in the URL is the only thing standing between
 * an unauthenticated request and a child's pickup QR. These pin the
 * properties that makes it safe to expose -- unguessable, never stored in a
 * usable form, short-lived, spendable a bounded number of times, and logged
 * every time it is presented including when it is refused.
 */

import {
  mintQrAccessToken,
  resolveQrAccessToken,
  logQrFetch,
  hashQrToken,
  QR_ACCESS_MAX_FETCHES,
  QR_ACCESS_TOKENS_COLLECTION,
  QR_ACCESS_LOG_COLLECTION,
  QR_TOKEN_PATTERN,
} from "../notifications/qr-access.ts";

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

// --- Fake Firestore ---------------------------------------------------

function makeFakeDb() {
  const store = new Map();
  const added = [];
  let txLock = Promise.resolve();

  const docRef = (collectionName, id) => ({
    id,
    key: () => `${collectionName}/${id}`,
    async get() {
      const data = store.get(`${collectionName}/${id}`);
      return { exists: data !== undefined, id, data: () => (data ? { ...data } : undefined) };
    },
    async set(data) {
      store.set(`${collectionName}/${id}`, { ...data });
    },
    async update(patch) {
      const key = `${collectionName}/${id}`;
      if (!store.has(key)) throw new Error("NOT_FOUND");
      store.set(key, { ...store.get(key), ...patch });
    },
  });

  return {
    store,
    added,
    collection(name) {
      return {
        doc: (id) => docRef(name, id),
        add: async (data) => {
          added.push({ collection: name, data });
          return { id: `${name}_${added.length}` };
        },
      };
    },
    // Serialised, matching the guarantee a real transaction provides for the
    // read-then-write in resolveQrAccessToken.
    async runTransaction(fn) {
      const previous = txLock;
      let release;
      txLock = new Promise((r) => { release = r; });
      await previous;
      try {
        return await fn({
          get: async (ref) => ref.get(),
          update: (ref, patch) => ref.update(patch),
          set: (ref, data) => ref.set(data),
        });
      } finally {
        release();
      }
    },
  };
}

const MINT = { guardianId: "g_mom", churchId: "churchA", notificationId: "notif_1" };

console.log("\nqr-access: minting\n");

{
  const db = makeFakeDb();
  const SAMPLE = 500;
  const raws = [];
  for (let i = 0; i < SAMPLE; i++) raws.push((await mintQrAccessToken(db, MINT)).raw);

  check(`${SAMPLE} minted tokens are all distinct`, SAMPLE, new Set(raws).size);
  check("every token matches the shape the route pre-filters on", true, raws.every((t) => QR_TOKEN_PATTERN.test(t)));
  // 32 random bytes -> 43 base64url chars, no padding.
  check("every token is 43 characters", true, raws.every((t) => t.length === 43));

  // The decisive property: a dump of this collection must not yield working
  // URLs. Document ids are hashes and no field anywhere holds the raw value.
  const serialised = JSON.stringify([...db.store.entries()]);
  check("no raw token appears anywhere in stored data", false, raws.some((t) => serialised.includes(t)));
  check("the document id is the SHA-256 of the token", true, db.store.has(`${QR_ACCESS_TOKENS_COLLECTION}/${hashQrToken(raws[0])}`));
}

{
  const db = makeFakeDb();
  const { raw, tokenId } = await mintQrAccessToken(db, MINT, { firestoreOps: { reads: 0, writes: 0 } });
  const stored = db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`);

  check("mint records the guardian it resolves to", "g_mom", stored.guardianId);
  check("...the church, so the endpoint can re-check tenancy", "churchA", stored.churchId);
  check("...and the notification that caused it", "notif_1", stored.notificationId);
  check("a fresh token has spent no fetches", 0, stored.fetchCount);
  check("...and is not consumed", null, stored.consumedAt);
  check("tokenId is the hash of raw", hashQrToken(raw), tokenId);
}

console.log("\nqr-access: resolving\n");

{
  const db = makeFakeDb();
  const { raw, tokenId } = await mintQrAccessToken(db, MINT);

  const first = await resolveQrAccessToken(db, raw);
  check("a fresh token resolves", "ok", first.outcome);
  check("...to its guardian", "g_mom", first.guardianId);
  check("...and its church", "churchA", first.churchId);
  check("...reporting the tokenId", tokenId, first.tokenId);
  check("one fetch is spent", 1, db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`).fetchCount);
}

{
  // An unknown token must be indistinguishable from a malformed one to the
  // caller, and must still report a tokenId so the probe is loggable.
  const db = makeFakeDb();
  const unknown = "A".repeat(43);
  const res = await resolveQrAccessToken(db, unknown);
  check("an unknown token does not resolve", "not_found", res.outcome);
  check("...but still yields a tokenId for the audit log", hashQrToken(unknown), res.tokenId);
  check("...and reveals no guardian", undefined, res.guardianId);
}

{
  // Expiry is checked before the fetch budget: an expired token is expired
  // however much budget it had left.
  const db = makeFakeDb();
  const { raw, tokenId } = await mintQrAccessToken(db, MINT);
  const doc = db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`);
  db.store.set(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`, {
    ...doc,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });

  const res = await resolveQrAccessToken(db, raw);
  check("an expired token is refused", "expired", res.outcome);
  check("...even with its full fetch budget unspent", 0, db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`).fetchCount);
}

{
  // The budget. Deliberately asserted against the exported constant rather
  // than a literal, so retuning it after live verification against a real
  // WABA does not require editing this test.
  const db = makeFakeDb();
  const { raw, tokenId } = await mintQrAccessToken(db, MINT);

  const outcomes = [];
  for (let i = 0; i < QR_ACCESS_MAX_FETCHES; i++) {
    outcomes.push((await resolveQrAccessToken(db, raw)).outcome);
  }
  check(`all ${QR_ACCESS_MAX_FETCHES} permitted fetches succeed`, true, outcomes.every((o) => o === "ok"));

  const overflow = await resolveQrAccessToken(db, raw);
  check("the fetch after the cap is refused", "consumed", overflow.outcome);
  check("the token is marked consumed on the fetch that reaches the cap", true,
    !!db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`).consumedAt);
  check("...and the count does not exceed the cap", QR_ACCESS_MAX_FETCHES,
    db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`).fetchCount);
}

{
  // Concurrency: the transaction is what stops parallel fetches both slipping
  // past the cap. Without it, N simultaneous requests all read the same count.
  const db = makeFakeDb();
  const { raw, tokenId } = await mintQrAccessToken(db, MINT);

  const results = await Promise.all(
    Array.from({ length: QR_ACCESS_MAX_FETCHES + 5 }, () => resolveQrAccessToken(db, raw)),
  );
  check("concurrent fetches admit exactly the cap, no more",
    QR_ACCESS_MAX_FETCHES, results.filter((r) => r.outcome === "ok").length);
  check("...and the rest are refused", 5, results.filter((r) => r.outcome === "consumed").length);
  check("...leaving the stored count exactly at the cap",
    QR_ACCESS_MAX_FETCHES, db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`).fetchCount);
}

console.log("\nqr-access: fetch logging\n");

{
  const db = makeFakeDb();
  const raw = (await mintQrAccessToken(db, MINT)).raw;
  const tokenId = hashQrToken(raw);

  await logQrFetch(db, { tokenId, outcome: "ok", status: 200, ip: "203.0.113.7", userAgent: "facebookexternalhit/1.1" });
  await logQrFetch(db, { tokenId, outcome: "not_found", status: 404, ip: "198.51.100.9", userAgent: null });

  const rows = db.added.filter((a) => a.collection === QR_ACCESS_LOG_COLLECTION);
  check("every request is logged, including refusals", 2, rows.length);
  check("the successful fetch records its outcome", "ok", rows[0].data.outcome);
  check("the refusal records its own", "not_found", rows[1].data.outcome);
  check("the requester IP is captured", "203.0.113.7", rows[0].data.ip);

  // The reason refusals are loggable at all: the hash identifies the attempt
  // without retaining what was attempted.
  const serialised = JSON.stringify(db.added);
  check("no raw token reaches the log", false, serialised.includes(raw));
  check("the log identifies the attempt by hash", true, serialised.includes(tokenId));
}

{
  // A failed audit write must not become a failed image fetch.
  const throwingDb = {
    collection: () => ({ add: async () => { throw new Error("firestore unavailable"); } }),
  };
  let threw = false;
  try {
    await logQrFetch(throwingDb, { tokenId: "x", outcome: "ok", status: 200, ip: null, userAgent: null });
  } catch {
    threw = true;
  }
  check("a log write failure is swallowed rather than failing the request", false, threw);
}

{
  // Long user-agent strings are truncated -- these rows are written by
  // unauthenticated callers, so their size is attacker-controlled.
  const db = makeFakeDb();
  await logQrFetch(db, { tokenId: "x", outcome: "ok", status: 200, ip: null, userAgent: "U".repeat(5000) });
  check("an oversized user-agent is truncated", 300, db.added[0].data.userAgent.length);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
