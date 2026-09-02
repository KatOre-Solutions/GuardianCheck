/**
 * Security-rules tests for `checkins` and `guardians`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs a
 * JDK — see the README section "Security rules tests" for the Java version
 * caveat.
 *
 * These are the two collections that carry the safeguarding boundary — who is
 * in the building, and who is allowed to collect them — and until now neither
 * had a single rules test. A regression in either block would have shipped
 * silently.
 *
 * Read this suite as a description of what the rules allow *today*, not of what
 * is ideal. Two of the ALLOW cases below are deliberately uncomfortable:
 *
 *   - a volunteer may flip a checkin to `checked-out` straight from the browser
 *     with any guardian name they like, and
 *   - a volunteer may create and edit `guardians` documents in their church.
 *
 * Both are recorded here because the app currently depends on the first (the
 * offline fallback writes the transition directly when the network is down) and
 * because pinning current behaviour is what makes a later tightening a
 * deliberate, reviewable change rather than an accident. When those rules are
 * hardened, these two cases are expected to flip to DENY and the follow-up
 * should say so.
 *
 * Keep the two halves. A rules change that denied everything would pass the
 * DENY block and quietly break check-in; the ALLOW block is what catches that.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
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

// None of these uids or emails may match the hard-coded master admin in
// `isMasterAdmin()`, or every test would pass for the wrong reason.
const users = {
  adminA:     { uid: "adminA",     email: "a@x.com",  role: "admin",     roles: ["admin"],     churchId: CHURCH_A, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com",  role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
  volunteerB: { uid: "volunteerB", email: "vb@x.com", role: "volunteer", roles: ["volunteer"], churchId: CHURCH_B, status: "approved" },
  parentA:    { uid: "parentA",    email: "p@x.com",  role: "parent",    roles: ["parent"],    churchId: CHURCH_A, status: "approved" },
  parentA2:   { uid: "parentA2",   email: "p2@x.com", role: "parent",    roles: ["parent"],    churchId: CHURCH_A, status: "approved" },
};

/** A checkin document that satisfies isValidCheckin(). */
const checkin = (over = {}) => ({
  childId: "childA",
  childName: "Ayanda Dube",
  roomId: "roomA",
  roomName: "Elephants",
  checkInTime: "2026-09-02T09:05:00.000Z",
  status: "checked-in",
  churchId: CHURCH_A,
  serviceId: "svcA",
  parentId: "parentA",
  createdAt: "2026-09-02T09:05:00.000Z",
  updatedAt: "2026-09-02T09:05:00.000Z",
  ...over,
});

// Chained after the other suites in `npm run test:rules`. The emulator can
// still be tearing down the previous suite's connection when this one starts,
// which surfaces as a CANCELLED error rather than a real failure, so give it a
// few attempts before treating it as one.
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

  await setDoc(doc(db, "children", "childA"), {
    firstName: "Ayanda", lastName: "Dube", age: 7,
    allergies: "Peanuts", churchId: CHURCH_A, parentId: "parentA", deleted: false,
  });

  await setDoc(doc(db, "guardians", "guardianA"), {
    firstName: "Thandi", lastName: "Dube", phone: "0700000000",
    relationship: "Mother", childIds: ["childA"], qrToken: "guardian_aaaaaaaaaaaa",
    churchId: CHURCH_A, parentId: "parentA", active: true, deleted: false,
  });
  await setDoc(doc(db, "guardians", "guardianB"), {
    firstName: "Nomsa", lastName: "Ncube", phone: "0711111111",
    relationship: "Mother", childIds: ["childB"], qrToken: "guardian_bbbbbbbbbbbb",
    churchId: CHURCH_B, parentId: "parentB", active: true, deleted: false,
  });

  // Church A: one open attendance record, one already closed.
  await setDoc(doc(db, "checkins", "ciA"), checkin());
  await setDoc(doc(db, "checkins", "ciClosed"), checkin({ status: "checked-out", childId: "childC" }));
  // Church B: the tenant that must stay invisible to church A.
  await setDoc(doc(db, "checkins", "ciB"), checkin({ churchId: CHURCH_B, childId: "childB", parentId: "parentB" }));
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

console.log("\nAttendance and guardian rules\n");

// ---------------------------------------------------------------- DENY ----

await check("volunteer B cannot read church A's checkin", "deny", () =>
  getDoc(doc(as("volunteerB"), "checkins", "ciA")));

await check("volunteer B cannot list church A's checkins", "deny", () =>
  getDocs(query(collection(as("volunteerB"), "checkins"), where("churchId", "==", CHURCH_A))));

// The client-side churchId constraint is an optimisation, not a control, so the
// unconstrained query an attacker would actually run has to be denied too.
await check("volunteer B cannot list all checkins unconstrained", "deny", () =>
  getDocs(collection(as("volunteerB"), "checkins")));

await check("a parent cannot read another family's checkin", "deny", () =>
  getDoc(doc(as("parentA2"), "checkins", "ciA")));

await check("a parent cannot list every checkin in their church", "deny", () =>
  getDocs(collection(as("parentA"), "checkins")));

// A parent forging their own child's release is the attack the override PIN
// and guardian QR exist to prevent; the rules must refuse it outright.
await check("a parent cannot check their own child out", "deny", () =>
  updateDoc(doc(as("parentA"), "checkins", "ciA"), { ...checkin(), status: "checked-out" }));

await check("volunteer B cannot check out church A's child", "deny", () =>
  updateDoc(doc(as("volunteerB"), "checkins", "ciA"), { ...checkin(), status: "checked-out" }));

// Reopening a closed record would erase the fact that a child already left.
await check("a closed checkin cannot be reopened", "deny", () =>
  updateDoc(doc(as("volunteerA"), "checkins", "ciClosed"), { ...checkin({ childId: "childC" }), status: "checked-in" }));

await check("a checkin cannot be moved to another church", "deny", () =>
  updateDoc(doc(as("volunteerA"), "checkins", "ciA"), { ...checkin({ churchId: CHURCH_B }), status: "checked-out" }));

await check("a checkin cannot be repointed at another child", "deny", () =>
  updateDoc(doc(as("volunteerA"), "checkins", "ciA"), { ...checkin({ childId: "childB" }), status: "checked-out" }));

await check("a volunteer cannot create a checkin for another church", "deny", () =>
  setDoc(doc(as("volunteerA"), "checkins", "ciForged"), checkin({ churchId: CHURCH_B })));

// Creating a record that is already closed would let someone manufacture a
// pickup that never happened.
await check("a volunteer cannot create an already-checked-out record", "deny", () =>
  setDoc(doc(as("volunteerA"), "checkins", "ciPreClosed"), checkin({ status: "checked-out" })));

await check("a volunteer cannot delete a checkin", "deny", () =>
  updateDoc(doc(as("volunteerA"), "checkins", "ciA"), { childId: null }));

await check("unauthenticated read of a checkin is denied", "deny", () =>
  getDoc(doc(anon(), "checkins", "ciA")));

await check("unauthenticated checkout is denied", "deny", () =>
  updateDoc(doc(anon(), "checkins", "ciA"), { ...checkin(), status: "checked-out" }));

await check("volunteer B cannot read church A's guardians", "deny", () =>
  getDoc(doc(as("volunteerB"), "guardians", "guardianA")));

// The guardian qrToken is the pickup credential; a cross-tenant list would hand
// over every child's collection credential in the other church.
await check("volunteer B cannot list church A's guardians", "deny", () =>
  getDocs(query(collection(as("volunteerB"), "guardians"), where("churchId", "==", CHURCH_A))));

await check("unauthenticated read of a guardian is denied", "deny", () =>
  getDoc(doc(anon(), "guardians", "guardianA")));

// --------------------------------------------------------------- ALLOW ----

await check("volunteer A reads a checkin in their own church", "allow", () =>
  getDoc(doc(as("volunteerA"), "checkins", "ciA")));

await check("volunteer A lists their church's active checkins (the roster query)", "allow", () =>
  getDocs(query(collection(as("volunteerA"), "checkins"),
    where("churchId", "==", CHURCH_A), where("status", "==", "checked-in"))));

await check("a parent reads their own child's checkin", "allow", () =>
  getDocs(query(collection(as("parentA"), "checkins"), where("parentId", "==", "parentA"))));

await check("volunteer A creates a check-in (the check-in fallback path)", "allow", () =>
  setDoc(doc(as("volunteerA"), "checkins", "ciNew"), checkin({ childId: "childA" })));

// Current behaviour, deliberately pinned: this is what the offline fallback
// relies on. It is also what lets a volunteer release a child without the
// server ever seeing it — see the register in the redesign plan.
await check("volunteer A checks a child out directly (offline fallback path)", "allow", () =>
  updateDoc(doc(as("volunteerA"), "checkins", "ciA"), { ...checkin(), status: "checked-out" }));

await check("volunteer A reads a guardian in their own church (scan matching)", "allow", () =>
  getDoc(doc(as("volunteerA"), "guardians", "guardianA")));

await check("volunteer A lists their church's guardians (warm cache)", "allow", () =>
  getDocs(query(collection(as("volunteerA"), "guardians"), where("churchId", "==", CHURCH_A))));

await check("a parent reads their own guardian records", "allow", () =>
  getDocs(query(collection(as("parentA"), "guardians"), where("parentId", "==", "parentA"))));

await check("admin A reads a checkin in their own church", "allow", () =>
  getDoc(doc(as("adminA"), "checkins", "ciA")));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
