/**
 * Security-rules tests for the guardian pickup QR token.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs
 * a JDK -- see the README section "Security rules tests" for the Java
 * version caveat.
 *
 * Why this exists
 * ----------------
 * `guardians.qrToken` is what a volunteer scans at pickup; it resolves to a
 * guardian and the children they may collect. It used to be generated in the
 * browser -- `guardian_${Math.random().toString(36).substr(2, 12)}` -- and
 * written straight into the document, which meant the client both chose the
 * value and could change it at will.
 *
 * POST /api/guardians/:id/qr-token now mints it with a CSPRNG through the
 * Admin SDK (which bypasses these rules). These tests pin the other half:
 * that no client, at any privilege level below master admin, can supply a
 * token on create or change one on update. The rest of the guardian document
 * stays client-writable exactly as before -- a parent must still be able to
 * rename a guardian or link a child.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
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

const SERVER_TOKEN = "gq_" + "A".repeat(32);
const ATTACKER_TOKEN = "gq_" + "B".repeat(32);

const users = {
  parentA: { uid: "parentA", email: "p@x.com", role: "parent", roles: ["parent"], churchId: CHURCH_A, status: "approved" },
  parentA2: { uid: "parentA2", email: "p2@x.com", role: "parent", roles: ["parent"], churchId: CHURCH_A, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com", role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
  adminA: { uid: "adminA", email: "a@x.com", role: "admin", roles: ["admin"], churchId: CHURCH_A, status: "approved" },
  masterAdmin: { uid: "masterAdmin", email: "m@x.com", role: "master_admin", roles: ["master_admin"], churchId: CHURCH_A, status: "approved" },
};

const guardianDoc = (over = {}) => ({
  firstName: "Naledi",
  lastName: "Mokoena",
  phone: "+27821234567",
  relationship: "Parent",
  childIds: ["childA"],
  parentId: "parentA",
  churchId: CHURCH_A,
  qrToken: SERVER_TOKEN,
  active: true,
  deleted: false,
  ...over,
});

/** The shape the client now writes: no qrToken key at all. The Firestore SDK rejects an explicit `undefined`, so the key has to be removed, not overridden. */
const guardianDocWithoutToken = (over = {}) => {
  const { qrToken, ...rest } = guardianDoc(over);
  return rest;
};

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

async function reseed() {
  await clearFirestoreWithRetry();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, data] of Object.entries(users)) {
      await setDoc(doc(db, "users", id), data);
    }
    // Written with rules disabled, standing in for the Admin SDK write the
    // real token-minting endpoint performs.
    await setDoc(doc(db, "guardians", "g_mom"), guardianDoc());
  });
}

await reseed();

const as = (uid) => env.authenticatedContext(uid, { email: users[uid]?.email }).firestore();

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

console.log("\nguardians.qrToken: server-minted, never client-chosen\n");

// ---------------------------------------------------------------- DENY ----

// The original hole: choose your own pickup credential at creation time.
await check("a parent cannot create a guardian carrying a qrToken", "deny", () =>
  setDoc(doc(as("parentA"), "guardians", "g_new"), guardianDoc({ parentId: "parentA" })));

await check("a volunteer cannot create a guardian carrying a qrToken", "deny", () =>
  setDoc(doc(as("volunteerA"), "guardians", "g_new2"), guardianDoc({ parentId: "parentA" })));

await check("an admin cannot create a guardian carrying a qrToken", "deny", () =>
  setDoc(doc(as("adminA"), "guardians", "g_new3"), guardianDoc({ parentId: "parentA" })));

// ...and the same hole via update: overwrite an existing token with a chosen one.
await check("the owning parent cannot change an existing qrToken", "deny", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { qrToken: ATTACKER_TOKEN }));

await check("a volunteer cannot change a qrToken", "deny", () =>
  updateDoc(doc(as("volunteerA"), "guardians", "g_mom"), { qrToken: ATTACKER_TOKEN }));

await check("an admin cannot change a qrToken", "deny", () =>
  updateDoc(doc(as("adminA"), "guardians", "g_mom"), { qrToken: ATTACKER_TOKEN }));

// Removing the token is a change too -- it would strand the record, and the
// guard is written as "unchanged", not "not weakened".
await check("a parent cannot null out a qrToken", "deny", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { qrToken: null }));

// Smuggling the change alongside a legitimate edit must not work either.
await check("a parent cannot change a qrToken while also renaming the guardian", "deny", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { firstName: "Renamed", qrToken: ATTACKER_TOKEN }));

// --------------------------------------------------------------- ALLOW ----
//
// The guard must not break ordinary guardian management.

await check("a parent creates a guardian with no qrToken (the new client flow)", "allow", () =>
  setDoc(doc(as("parentA"), "guardians", "g_ok"), guardianDocWithoutToken({ parentId: "parentA" })));

await check("the owning parent renames a guardian, leaving the token untouched", "allow", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { firstName: "Naledi-Updated" }));

await check("the owning parent links another child, leaving the token untouched", "allow", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { childIds: ["childA", "childB"] }));

await check("the owning parent deactivates a guardian", "allow", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { active: false }));

// Explicitly resending the identical token is not a change, so it is allowed.
// This matters because clients routinely write back a whole document.
await check("writing back the identical token is not a change", "allow", () =>
  updateDoc(doc(as("parentA"), "guardians", "g_mom"), { firstName: "Naledi", qrToken: SERVER_TOKEN }));

// Master admin keeps its existing escape hatch, consistent with every other
// rule in this file.
await check("master admin can still set a qrToken directly", "allow", () =>
  updateDoc(doc(as("masterAdmin"), "guardians", "g_mom"), { qrToken: ATTACKER_TOKEN }));

// -------------------------------------------- proof of vulnerability ------
//
// A guard that is never observed failing is a guard nobody has checked. This
// re-runs the two decisive DENY cases against a deliberately weakened copy of
// the rules and asserts they turn into ALLOWs -- if they don't, the DENYs
// above were passing for some other reason and prove nothing.

console.log("\nProof of vulnerability: the same writes against weakened rules\n");

const realRules = readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
// Matched by regex rather than an exact string: the file's line endings differ
// between checkouts (CRLF on Windows), and a silently non-matching replace
// would turn this whole section into a no-op that always "passes".
// Deliberately replaces only each function's body, never the name -- see the
// note in this PR about `replace_all` on a name that appears in its own
// definition.
const weakenedRules = realRules
  .replace(
    /function omitsGuardianToken\(\) \{[\s\S]*?\}/,
    "function omitsGuardianToken() { return true; }",
  )
  .replace(
    /function preservesGuardianToken\(\) \{[\s\S]*?\}/,
    "function preservesGuardianToken() { return true; }",
  );

if (weakenedRules === realRules) {
  console.log("  FAIL  could not weaken the rules -- the guard functions did not match the expected source");
  fail++;
} else {
  const weakEnv = await initializeTestEnvironment({
    projectId: "gc-rules-test-weak",
    firestore: { rules: weakenedRules, host: "127.0.0.1", port: 8571 },
  });

  await weakEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, data] of Object.entries(users)) await setDoc(doc(db, "users", id), data);
    await setDoc(doc(db, "guardians", "g_mom"), guardianDoc());
  });

  const weakAs = (uid) => weakEnv.authenticatedContext(uid, { email: users[uid]?.email }).firestore();

  await check("WITHOUT the guard, a parent CAN mint their own token on create", "allow", () =>
    setDoc(doc(weakAs("parentA"), "guardians", "g_evil"), guardianDoc({ parentId: "parentA", qrToken: ATTACKER_TOKEN })));

  await check("WITHOUT the guard, a parent CAN overwrite an existing token", "allow", () =>
    updateDoc(doc(weakAs("parentA"), "guardians", "g_mom"), { qrToken: ATTACKER_TOKEN }));

  await weakEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
