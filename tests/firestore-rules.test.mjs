/**
 * Security-rules tests for `users/{userId}`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs a
 * JDK — see the README section "Security rules tests" for the Java version
 * caveat.
 *
 * These exist because of #68: the `users` rules let any signed-up account grant
 * itself `master_admin`, and `isMasterAdmin()` trusts that field platform-wide.
 * The whole suite passed against the fixed rules and the nine DENY cases all
 * failed against the rules as they stood before the fix, which is what proved
 * both the hole and the fix. Keep that property: a test here should fail if the
 * guard it covers is removed.
 *
 * Privilege is conferred by BOTH `role` and the `roles` array. Every guard is
 * tested against both, because the original rules guarded only `role`.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
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

const CHURCH = "church1";

// Note: none of these uids or emails may match the hard-coded master admin in
// `isMasterAdmin()`, or the tests would pass for the wrong reason.
const seed = {
  newbie:   { uid: "newbie",   email: "n@x.com", role: "parent",    roles: ["parent"],             churchId: CHURCH, status: "incomplete_profile" },
  approved: { uid: "approved", email: "a@x.com", role: "parent",    roles: ["parent"],             churchId: CHURCH, status: "approved" },
  admin1:   { uid: "admin1",   email: "d@x.com", role: "admin",     roles: ["admin", "volunteer"], churchId: CHURCH, status: "approved" },
  victim:   { uid: "victim",   email: "v@x.com", role: "volunteer", roles: ["volunteer"],          churchId: CHURCH, status: "approved" },
};

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [id, data] of Object.entries(seed)) await setDoc(doc(db, "users", id), data);
  await setDoc(doc(db, "churches", CHURCH), { name: "Test Church", slug: "test-church" });
});

const as = (uid) => env.authenticatedContext(uid, { email: seed[uid]?.email }).firestore();

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

console.log("\nMUST DENY - self-granted privilege (#68)");

await check("incomplete_profile self-sets role=master_admin", "deny", () =>
  updateDoc(doc(as("newbie"), "users", "newbie"), { role: "master_admin", status: "approved" }));

await check("incomplete_profile self-sets roles=[master_admin]", "deny", () =>
  updateDoc(doc(as("newbie"), "users", "newbie"), { roles: ["master_admin"], status: "approved" }));

await check("incomplete_profile self-sets role=admin", "deny", () =>
  updateDoc(doc(as("newbie"), "users", "newbie"), { role: "admin" }));

await check("approved user self-sets roles=[master_admin]", "deny", () =>
  updateDoc(doc(as("approved"), "users", "approved"), { roles: ["master_admin"] }));

await check("approved user self-sets role=admin", "deny", () =>
  updateDoc(doc(as("approved"), "users", "approved"), { role: "admin" }));

await check("self-create with role=master_admin", "deny", () =>
  setDoc(doc(as("fresh"), "users", "fresh"), {
    uid: "fresh", email: "f@x.com", role: "master_admin", roles: ["master_admin"],
    churchId: null, status: "incomplete_profile",
  }));

await check("self-create with role=admin", "deny", () =>
  setDoc(doc(as("fresh2"), "users", "fresh2"), {
    uid: "fresh2", email: "f2@x.com", role: "admin", roles: ["admin"],
    churchId: null, status: "incomplete_profile",
  }));

await check("admin grants master_admin to another user via roles", "deny", () =>
  updateDoc(doc(as("admin1"), "users", "victim"), { roles: ["master_admin"] }));

await check("admin grants themselves master_admin via roles", "deny", () =>
  updateDoc(doc(as("admin1"), "users", "admin1"), { roles: ["master_admin", "admin"] }));

console.log("\nMUST ALLOW - real flows that must not regress");

await check("onboarding: complete profile, pick church, status->approved", "allow", () =>
  updateDoc(doc(as("newbie"), "users", "newbie"), {
    firstName: "Thabo", lastName: "M", cellNumber: "0821234567", dob: "1990-01-01",
    churchId: CHURCH, churchSlug: "test-church", status: "approved",
    updatedAt: new Date().toISOString(),
  }));

await check("approved user edits own profile fields", "allow", () =>
  updateDoc(doc(as("approved"), "users", "approved"), { firstName: "Lerato", updatedAt: new Date().toISOString() }));

await check("approved user toggles darkMode", "allow", () =>
  updateDoc(doc(as("approved"), "users", "approved"), { darkMode: true }));

// A `volunteer` in this product reads every child in a church -- names, ages,
// photos, allergies -- plus child_medical notes and the guardians collection,
// including the qrToken that authorises collecting a child. User documents are
// written from the browser at signup, and `churchId` is in that same payload,
// so anyone able to sign up could have minted themselves a volunteer in a
// church of their choosing. `volunteer` is an elevated role.
await check("signup cannot self-create as a volunteer", "deny", () =>
  setDoc(doc(as("signup2"), "users", "signup2"), {
    uid: "signup2", email: "s2@x.com", role: "volunteer", roles: ["volunteer"],
    churchId: CHURCH, churchSlug: null, status: "incomplete_profile",
  }));

// `role` and `roles` both drive the role helpers, so guarding one guards
// nothing.
await check("signup cannot smuggle volunteer through the roles array", "deny", () =>
  setDoc(doc(as("signup3"), "users", "signup3"), {
    uid: "signup3", email: "s3@x.com", role: "parent", roles: ["parent", "volunteer"],
    churchId: CHURCH, churchSlug: null, status: "incomplete_profile",
  }));

await check("signup cannot self-create as an admin", "deny", () =>
  setDoc(doc(as("signup4"), "users", "signup4"), {
    uid: "signup4", email: "s4@x.com", role: "admin", roles: ["admin"],
    churchId: CHURCH, churchSlug: null, status: "incomplete_profile",
  }));

// A parent may still attach themselves to a church -- that is the normal
// signup-on-a-church-page flow, and a parent only ever reads their own
// children. The role is what had to be constrained, not the churchId.
await check("signup may still attach a parent account to a church", "allow", () =>
  setDoc(doc(as("signup5"), "users", "signup5"), {
    uid: "signup5", email: "s5@x.com", role: "parent", roles: ["parent"],
    churchId: CHURCH, churchSlug: "church-1", status: "incomplete_profile",
  }));

await check("public signup creates own parent doc", "allow", () =>
  setDoc(doc(as("signup1"), "users", "signup1"), {
    uid: "signup1", email: "s@x.com", role: "parent", roles: ["parent"],
    churchId: null, churchSlug: null, status: "incomplete_profile",
  }));

await check("admin approves member: sets churchId + role + approved", "allow", () =>
  updateDoc(doc(as("admin1"), "users", "victim"), { churchId: CHURCH, role: "volunteer", status: "approved" }));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
