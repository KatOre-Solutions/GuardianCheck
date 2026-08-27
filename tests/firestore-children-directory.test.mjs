/**
 * Security-rules tests for the Children Directory reads.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs a
 * JDK — see the README section "Security rules tests" for the Java version
 * caveat.
 *
 * The Children Directory adds no API and no rules of its own: it reads
 * `children`, `guardians` and `users` with `where("churchId", "==", churchId)`
 * and joins them in the browser. That makes `firestore.rules` the only thing
 * standing between one church's admin and another church's children, so these
 * tests exist to prove that boundary holds for exactly the queries the
 * directory issues.
 *
 * The client-side `where` constraint is an optimisation, not a control. Every
 * DENY case below is written as the query an attacker would actually run —
 * dropping the constraint, or pointing it at someone else's churchId — rather
 * than the query the UI happens to send.
 *
 * Keep the two halves. A rules change that denied everything would pass the
 * DENY block and quietly break the feature; the ALLOW block is what catches
 * that.
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

// None of these uids or emails may match the hard-coded master admin in
// `isMasterAdmin()`, or every test would pass for the wrong reason.
const users = {
  adminA:     { uid: "adminA",     email: "a@x.com", role: "admin",     roles: ["admin"],     churchId: CHURCH_A, status: "approved" },
  adminB:     { uid: "adminB",     email: "b@x.com", role: "admin",     roles: ["admin"],     churchId: CHURCH_B, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com", role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
  parentA:    { uid: "parentA",    email: "p@x.com", role: "parent",    roles: ["parent"],    churchId: CHURCH_A, status: "approved" },
};

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();

  for (const [id, data] of Object.entries(users)) {
    await setDoc(doc(db, "users", id), data);
  }

  // Church A: one child of parentA, plus a guardian covering that child.
  await setDoc(doc(db, "children", "childA"), {
    firstName: "Ayanda", lastName: "Dube", age: 7,
    allergies: "Peanuts", churchId: CHURCH_A, parentId: "parentA", deleted: false,
  });
  await setDoc(doc(db, "guardians", "guardianA"), {
    firstName: "Thandi", lastName: "Dube", phone: "0700000000",
    relationship: "Mother", childIds: ["childA"],
    churchId: CHURCH_A, parentId: "parentA", active: true, deleted: false,
  });

  // Church B: the tenant that must stay invisible to church A.
  await setDoc(doc(db, "children", "childB"), {
    firstName: "Sipho", lastName: "Ncube", age: 9,
    allergies: "", churchId: CHURCH_B, parentId: "parentB", deleted: false,
  });
  await setDoc(doc(db, "guardians", "guardianB"), {
    firstName: "Nomsa", lastName: "Ncube", phone: "0711111111",
    relationship: "Mother", childIds: ["childB"],
    churchId: CHURCH_B, parentId: "parentB", active: true, deleted: false,
  });
  await setDoc(doc(db, "child_medical", "childA"), {
    notes: "Confidential clinical note", churchId: CHURCH_A, parentId: "parentA",
  });
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

console.log("\nMUST DENY - one church's admin must never reach another's children");

await check("admin A reads a child of church B directly", "deny", () =>
  getDoc(doc(as("adminA"), "children", "childB")));

await check("admin A lists children of church B", "deny", () =>
  getDocs(query(collection(as("adminA"), "children"), where("churchId", "==", CHURCH_B))));

await check("admin A lists ALL children unconstrained", "deny", () =>
  getDocs(collection(as("adminA"), "children")));

await check("admin A reads a guardian of church B", "deny", () =>
  getDoc(doc(as("adminA"), "guardians", "guardianB")));

await check("admin A lists guardians of church B", "deny", () =>
  getDocs(query(collection(as("adminA"), "guardians"), where("churchId", "==", CHURCH_B))));

await check("admin A lists ALL guardians unconstrained", "deny", () =>
  getDocs(collection(as("adminA"), "guardians")));

await check("admin A lists users of church B (parent contact details)", "deny", () =>
  getDocs(query(collection(as("adminA"), "users"), where("churchId", "==", CHURCH_B))));

console.log("\nMUST DENY - the directory must not widen access for other roles");

await check("parent lists every child in their own church", "deny", () =>
  getDocs(query(collection(as("parentA"), "children"), where("churchId", "==", CHURCH_A))));

await check("unauthenticated lists children", "deny", () =>
  getDocs(query(collection(anon(), "children"), where("churchId", "==", CHURCH_A))));

await check("unauthenticated reads a guardian", "deny", () =>
  getDoc(doc(anon(), "guardians", "guardianA")));

console.log("\nMUST ALLOW - the exact queries the directory issues");

await check("admin A lists children of their own church", "allow", () =>
  getDocs(query(collection(as("adminA"), "children"), where("churchId", "==", CHURCH_A))));

await check("admin A lists guardians of their own church", "allow", () =>
  getDocs(query(collection(as("adminA"), "guardians"), where("churchId", "==", CHURCH_A))));

await check("admin A lists users of their own church (parent email/phone)", "allow", () =>
  getDocs(query(collection(as("adminA"), "users"), where("churchId", "==", CHURCH_A))));

await check("admin A opens a child of their own church", "allow", () =>
  getDoc(doc(as("adminA"), "children", "childA")));

// The directory does not read child_medical, but ChildDetailsModal does, and a
// regression there would expose clinical notes through a row click.
await check("admin A reads child_medical for their own church", "allow", () =>
  getDoc(doc(as("adminA"), "child_medical", "childA")));

await check("volunteer keeps existing per-child read for check-in", "allow", () =>
  getDoc(doc(as("volunteerA"), "children", "childA")));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
