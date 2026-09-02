/**
 * Security-rules tests for `invitations`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs a
 * JDK — see the README section "Security rules tests" for the Java version
 * caveat.
 *
 * Why this exists
 * ---------------
 * The list rule read:
 *
 *   allow list: if isMasterAdmin() || (isAdmin() && getUserData().churchId != null);
 *
 * which checks that the caller is an admin of *some* church, never that the
 * invitation belongs to it. Any church admin could list every invitation in the
 * system, and an invitation carries a 64-character `token` that
 * /api/accept-invite exchanges for a user account with that invitation's role
 * and churchId. An admin of one church could therefore mint themselves an admin
 * account in another.
 *
 * The `get` rule was already correct, and the recipient path is deliberately
 * kept: someone who was invited must be able to read their own invitation by
 * email, because that is how they accept it.
 *
 * Keep the two halves. A rule that denied everything would pass the DENY block
 * and quietly break the invite flow; the ALLOW block is what catches that.
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
  adminA:     { uid: "adminA",     email: "a@x.com",  role: "admin",     roles: ["admin"],     churchId: CHURCH_A, status: "approved" },
  adminB:     { uid: "adminB",     email: "b@x.com",  role: "admin",     roles: ["admin"],     churchId: CHURCH_B, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com",  role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
  // The person church B invited. They must be able to read their own invite.
  inviteeB:   { uid: "inviteeB",   email: "new@b.com", role: "parent",   roles: ["parent"],    churchId: null,     status: "incomplete_profile" },
};

const invitation = (over = {}) => ({
  email: "new@b.com",
  firstName: "New",
  lastName: "Person",
  role: "volunteer",
  churchId: CHURCH_B,
  status: "pending",
  token: "b".repeat(64),
  expiresAt: "2030-01-01T00:00:00.000Z",
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
  // Church B's invitation — an admin-role invite, the worst thing to leak.
  await setDoc(doc(db, "invitations", "inviteB"), invitation({ role: "admin" }));
  await setDoc(doc(db, "invitations", "inviteA"), invitation({
    email: "new@a.com", churchId: CHURCH_A, token: "a".repeat(64),
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

console.log("\nInvitation tenant scoping\n");

// ---------------------------------------------------------------- DENY ----

// The exact query the old rule allowed. Returns every invitation token in the
// system, each redeemable for the role it names.
await check("an admin cannot list every invitation in the system", "deny", () =>
  getDocs(collection(as("adminA"), "invitations")));

await check("an admin cannot list another church's invitations", "deny", () =>
  getDocs(query(collection(as("adminA"), "invitations"), where("churchId", "==", CHURCH_B))));

await check("an admin cannot read another church's invitation by id", "deny", () =>
  getDoc(doc(as("adminA"), "invitations", "inviteB")));

await check("a volunteer cannot list invitations at all", "deny", () =>
  getDocs(query(collection(as("volunteerA"), "invitations"), where("churchId", "==", CHURCH_A))));

await check("an unauthenticated caller cannot list invitations", "deny", () =>
  getDocs(collection(anon(), "invitations")));

await check("an unauthenticated caller cannot read an invitation by id", "deny", () =>
  getDoc(doc(anon(), "invitations", "inviteB")));

// A token is a bearer credential; an admin must not be able to mint one for
// another church.
await check("an admin cannot create an invitation for another church", "deny", () =>
  setDoc(doc(as("adminA"), "invitations", "forged"), invitation({ churchId: CHURCH_B })));

// --------------------------------------------------------------- ALLOW ----

await check("an admin lists their own church's invitations", "allow", () =>
  getDocs(query(collection(as("adminA"), "invitations"), where("churchId", "==", CHURCH_A))));

await check("an admin reads their own church's invitation by id", "allow", () =>
  getDoc(doc(as("adminA"), "invitations", "inviteA")));

// The recipient path. Without this, nobody can accept an invitation.
await check("the invited person reads their own invitation", "allow", () =>
  getDoc(doc(as("inviteeB"), "invitations", "inviteB")));

await check("an admin creates an invitation for their own church", "allow", () =>
  setDoc(doc(as("adminA"), "invitations", "newA"), invitation({
    email: "another@a.com", churchId: CHURCH_A, token: "c".repeat(64),
  })));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
