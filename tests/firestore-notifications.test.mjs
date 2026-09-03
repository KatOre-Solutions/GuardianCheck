/**
 * Security-rules tests for `notifications`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs
 * a JDK -- see the README section "Security rules tests" for the Java
 * version caveat.
 *
 * Why this exists
 * ----------------
 * `notifications` (notifications/service.ts) records who was told about a
 * check-in, check-out, room move or emergency alert, and whether it actually
 * sent. That's information about a child's whereabouts and pickup pattern --
 * scoped the same way `checkins` is: an admin sees their own church, a parent
 * sees only their own notifications, a volunteer sees none of it (this
 * collection exists to tell an admin whether a family was notified, not to
 * help a volunteer run check-in).
 *
 * The whole collection is server (Admin SDK) -only for writes: `create`,
 * `update`, `delete` all resolve `false` for every client identity tested
 * below, admins and master admin included, because the document id is a
 * deterministic hash the client has no legitimate way to construct, and any
 * client-side write here is either a forged delivery record or a way to
 * interfere with a real one.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const env = await initializeTestEnvironment({
  projectId: "gc-rules-test",
  firestore: {
    rules: readFileSync(path.join(ROOT, "firestore.rules"), "utf8"),
    host: "127.0.0.1",
    port: 8571,
  },
});

const CHURCH_A = "churchA";
const CHURCH_B = "churchB";

const users = {
  adminA:     { uid: "adminA",     email: "a@x.com",  role: "admin",     roles: ["admin"],     churchId: CHURCH_A, status: "approved" },
  adminB:     { uid: "adminB",     email: "b@x.com",  role: "admin",     roles: ["admin"],     churchId: CHURCH_B, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com",  role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
  parentA:    { uid: "parentA",    email: "p@x.com",  role: "parent",    roles: ["parent"],    churchId: null,     status: "approved" },
  otherParentA: { uid: "otherParentA", email: "op@x.com", role: "parent", roles: ["parent"],   churchId: null,     status: "approved" },
};

const notification = (over = {}) => ({
  churchId: CHURCH_A,
  recipientUserId: "parentA",
  checkinId: "checkin_child1_svc1_20260903",
  childIds: ["child1"],
  eventKey: "check-in:checkin_child1_svc1_20260903:2026-09-03T09:00:00.000Z",
  eventType: "check-in",
  channel: "email",
  template: "check-in",
  status: "sent",
  attempt: 1,
  recipientMasked: "pa***@x.com",
  payload: { childName: "Child One", time: "2026-09-03T09:00:00.000Z", roomName: "Room 1", churchName: "Church A" },
  providerMessageId: "msg_1",
  errorCode: null,
  errorMessage: null,
  traceId: "trace-1",
  createdAt: "2026-09-03T09:00:00.000Z",
  updatedAt: "2026-09-03T09:00:01.000Z",
  sentAt: "2026-09-03T09:00:01.000Z",
  deliveredAt: null,
  readAt: null,
  failedAt: null,
  ...over,
});

async function clearFirestoreWithRetry(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await env.clearFirestore();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * i));
    }
  }
}

await clearFirestoreWithRetry();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [id, data] of Object.entries(users)) {
    await setDoc(doc(db, "users", id), data);
  }
  await setDoc(doc(db, "notifications", "notifA"), notification());
  await setDoc(doc(db, "notifications", "notifB"), notification({
    churchId: CHURCH_B, recipientUserId: "someoneElse", checkinId: "checkin_child2_svc1_20260903",
    childIds: ["child2"], eventKey: "check-in:checkin_child2_svc1_20260903:2026-09-03T09:05:00.000Z",
  }));
});

const as = (uid) => env.authenticatedContext(uid, { email: users[uid]?.email }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

let pass = 0;
let fail = 0;

async function check(label, mode, fn) {
  try {
    await (mode === "deny" ? assertFails(fn()) : assertSucceeds(fn()));
    console.log(`  PASS  [${mode.toUpperCase()}] ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  [${mode.toUpperCase()}] ${label}\n        ${String(e.message).split("\n")[0]}`);
    fail++;
  }
}

console.log("\nNotification tenant scoping\n");

// ---------------------------------------------------------------- DENY ----

await check("an admin cannot read another church's notification by id", "deny", () =>
  getDoc(doc(as("adminA"), "notifications", "notifB")));

await check("an admin cannot list another church's notifications", "deny", () =>
  getDocs(query(collection(as("adminA"), "notifications"), where("churchId", "==", CHURCH_B))));

await check("a volunteer cannot read a notification in their own church", "deny", () =>
  getDoc(doc(as("volunteerA"), "notifications", "notifA")));

await check("a volunteer cannot list notifications at all", "deny", () =>
  getDocs(query(collection(as("volunteerA"), "notifications"), where("churchId", "==", CHURCH_A))));

await check("a parent cannot read another parent's notification", "deny", () =>
  getDoc(doc(as("otherParentA"), "notifications", "notifA")));

await check("a parent cannot list the whole church's notifications", "deny", () =>
  getDocs(query(collection(as("parentA"), "notifications"), where("churchId", "==", CHURCH_A))));

await check("an unauthenticated caller cannot read a notification", "deny", () =>
  getDoc(doc(anon(), "notifications", "notifA")));

await check("a client cannot create a notification, even a well-formed one", "deny", () =>
  setDoc(doc(as("adminA"), "notifications", "forged"), notification({ recipientUserId: "adminA" })));

await check("an admin cannot update a notification (e.g. to forge a 'sent' status)", "deny", () =>
  setDoc(doc(as("adminA"), "notifications", "notifA"), notification({ status: "sent", providerMessageId: "forged" })));

// --------------------------------------------------------------- ALLOW ----

await check("an admin reads their own church's notification by id", "allow", () =>
  getDoc(doc(as("adminA"), "notifications", "notifA")));

await check("an admin lists their own church's notifications", "allow", () =>
  getDocs(query(collection(as("adminA"), "notifications"), where("churchId", "==", CHURCH_A))));

await check("a parent reads their own notification", "allow", () =>
  getDoc(doc(as("parentA"), "notifications", "notifA")));

await check("a parent lists their own notifications", "allow", () =>
  getDocs(query(collection(as("parentA"), "notifications"), where("recipientUserId", "==", "parentA"))));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
