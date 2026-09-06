/**
 * Security-rules tests for qr_access_tokens and qr_access_log.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs
 * a JDK -- see the README section "Security rules tests" for the Java
 * version caveat.
 *
 * Why this exists
 * ----------------
 * These two collections back GET /api/qr/:token, the only route in the app
 * that answers without a session.
 *
 * `qr_access_tokens` document ids ARE the SHA-256 hashes of live access
 * tokens, and each document names the guardian its token resolves to. So
 * `list` access alone would hand an attacker the set of valid hashes to
 * confirm guesses against, and `get` would map one to a guardian. Nothing in
 * the app reads these from a browser -- the endpoint runs through the Admin
 * SDK, which bypasses rules entirely -- so the correct client access is none,
 * with no exception for master admin.
 *
 * `qr_access_log` holds requester IP and user-agent for every request,
 * including refused ones. That is personal information about whoever fetched
 * the image, so it is master-admin-only rather than church-admin-readable: a
 * church has no operational need for it.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, limit } from "firebase/firestore";
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

const users = {
  parentA: { uid: "parentA", email: "p@x.com", role: "parent", roles: ["parent"], churchId: CHURCH_A, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com", role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
  adminA: { uid: "adminA", email: "a@x.com", role: "admin", roles: ["admin"], churchId: CHURCH_A, status: "approved" },
  masterAdmin: { uid: "masterAdmin", email: "m@x.com", role: "master_admin", roles: ["master_admin"], churchId: CHURCH_A, status: "approved" },
};

const TOKEN_ID = "a".repeat(64); // a plausible sha256 hex digest
const LOG_ID = "log1";

const tokenDoc = () => ({
  guardianId: "g_mom",
  churchId: CHURCH_A,
  notificationId: "notif_1",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  fetchCount: 0,
  consumedAt: null,
});

const logDoc = () => ({
  tokenId: TOKEN_ID,
  outcome: "ok",
  status: 200,
  ip: "203.0.113.7",
  userAgent: "facebookexternalhit/1.1",
  traceId: "trace-1",
  at: new Date().toISOString(),
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
  for (const [id, data] of Object.entries(users)) await setDoc(doc(db, "users", id), data);
  // Written with rules disabled, standing in for the Admin SDK writes the
  // endpoint performs.
  await setDoc(doc(db, "qr_access_tokens", TOKEN_ID), tokenDoc());
  await setDoc(doc(db, "qr_access_log", LOG_ID), logDoc());
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

console.log("\nqr_access_tokens: no client access at all\n");

// ---------------------------------------------------------------- DENY ----

await check("an unauthenticated caller cannot read a token document", "deny", () =>
  getDoc(doc(anon(), "qr_access_tokens", TOKEN_ID)));

await check("a parent cannot read a token document", "deny", () =>
  getDoc(doc(as("parentA"), "qr_access_tokens", TOKEN_ID)));

await check("a volunteer cannot read a token document", "deny", () =>
  getDoc(doc(as("volunteerA"), "qr_access_tokens", TOKEN_ID)));

await check("a church admin cannot read a token document", "deny", () =>
  getDoc(doc(as("adminA"), "qr_access_tokens", TOKEN_ID)));

// The one that matters most: document ids are hashes of live tokens, so
// enumerating the collection is enumerating the credential space.
await check("a church admin cannot list the token collection", "deny", () =>
  getDocs(query(collection(as("adminA"), "qr_access_tokens"), limit(10))));

await check("an unauthenticated caller cannot list the token collection", "deny", () =>
  getDocs(query(collection(anon(), "qr_access_tokens"), limit(10))));

// No exception for master admin either -- unlike almost every other rule in
// this file. There is no legitimate client read of a live credential store.
await check("even master admin cannot read a token document", "deny", () =>
  getDoc(doc(as("masterAdmin"), "qr_access_tokens", TOKEN_ID)));

await check("even master admin cannot list the token collection", "deny", () =>
  getDocs(query(collection(as("masterAdmin"), "qr_access_tokens"), limit(10))));

// Writes: a client minting its own token would mint its own pickup URL.
await check("a parent cannot create a token document", "deny", () =>
  setDoc(doc(as("parentA"), "qr_access_tokens", "b".repeat(64)), tokenDoc()));

await check("an admin cannot create a token document", "deny", () =>
  setDoc(doc(as("adminA"), "qr_access_tokens", "c".repeat(64)), tokenDoc()));

// Resetting fetchCount would make a spent token live again.
await check("an admin cannot reset a token's fetch count", "deny", () =>
  updateDoc(doc(as("adminA"), "qr_access_tokens", TOKEN_ID), { fetchCount: 0, consumedAt: null }));

// Extending expiry is the same attack by a different field.
await check("an admin cannot extend a token's expiry", "deny", () =>
  updateDoc(doc(as("adminA"), "qr_access_tokens", TOKEN_ID), { expiresAt: new Date(Date.now() + 999_999_999).toISOString() }));

await check("even master admin cannot write a token document", "deny", () =>
  updateDoc(doc(as("masterAdmin"), "qr_access_tokens", TOKEN_ID), { fetchCount: 0 }));

await check("an admin cannot delete a token document", "deny", () =>
  deleteDoc(doc(as("adminA"), "qr_access_tokens", TOKEN_ID)));

console.log("\nqr_access_log: master admin reads, nobody writes\n");

await check("an unauthenticated caller cannot read the fetch log", "deny", () =>
  getDoc(doc(anon(), "qr_access_log", LOG_ID)));

await check("a parent cannot read the fetch log", "deny", () =>
  getDoc(doc(as("parentA"), "qr_access_log", LOG_ID)));

await check("a volunteer cannot read the fetch log", "deny", () =>
  getDoc(doc(as("volunteerA"), "qr_access_log", LOG_ID)));

// Deliberately stricter than church_usage, which church admins can read:
// these rows carry requester IP and user-agent.
await check("a church admin cannot read the fetch log (it holds requester IPs)", "deny", () =>
  getDoc(doc(as("adminA"), "qr_access_log", LOG_ID)));

await check("a church admin cannot list the fetch log", "deny", () =>
  getDocs(query(collection(as("adminA"), "qr_access_log"), limit(10))));

// Append-only from the server: a client able to write here could forge or
// bury evidence of its own probing.
await check("a client cannot write a fetch log entry", "deny", () =>
  setDoc(doc(as("adminA"), "qr_access_log", "forged"), logDoc()));

await check("master admin cannot write a fetch log entry either", "deny", () =>
  setDoc(doc(as("masterAdmin"), "qr_access_log", "forged2"), logDoc()));

await check("a client cannot delete a fetch log entry", "deny", () =>
  deleteDoc(doc(as("adminA"), "qr_access_log", LOG_ID)));

await check("master admin cannot delete a fetch log entry", "deny", () =>
  deleteDoc(doc(as("masterAdmin"), "qr_access_log", LOG_ID)));

// --------------------------------------------------------------- ALLOW ----

await check("master admin reads the fetch log (the audit trail's whole purpose)", "allow", () =>
  getDoc(doc(as("masterAdmin"), "qr_access_log", LOG_ID)));

await check("master admin lists the fetch log", "allow", () =>
  getDocs(query(collection(as("masterAdmin"), "qr_access_log"), limit(10))));

// -------------------------------------------- proof of vulnerability ------
//
// A guard never observed failing is a guard nobody has checked. These re-run
// two decisive DENY cases against deliberately weakened rules and assert they
// turn into ALLOWs -- if they don't, the DENYs above prove nothing.

console.log("\nProof of vulnerability: the same reads against weakened rules\n");

const realRules = readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
// Regex rather than exact strings: line endings differ between checkouts
// (CRLF on Windows), and a silently non-matching replace would make this
// whole section a no-op that always "passes".
const weakenedRules = realRules
  .replace(
    /match \/qr_access_tokens\/\{tokenId\} \{[\s\S]*?\n    \}/,
    "match /qr_access_tokens/{tokenId} {\n      allow read: if true;\n      allow write: if false;\n    }",
  )
  .replace(
    /match \/qr_access_log\/\{entryId\} \{[\s\S]*?\n    \}/,
    "match /qr_access_log/{entryId} {\n      allow read: if true;\n      allow create, update, delete: if false;\n    }",
  );

if (weakenedRules === realRules) {
  console.log("  FAIL  could not weaken the rules -- the collection blocks did not match the expected source");
  fail++;
} else {
  const weakEnv = await initializeTestEnvironment({
    projectId: "gc-rules-test-qr-weak",
    firestore: { rules: weakenedRules, host: "127.0.0.1", port: 8571 },
  });

  await weakEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, data] of Object.entries(users)) await setDoc(doc(db, "users", id), data);
    await setDoc(doc(db, "qr_access_tokens", TOKEN_ID), tokenDoc());
    await setDoc(doc(db, "qr_access_log", LOG_ID), logDoc());
  });

  const weakAs = (uid) => weakEnv.authenticatedContext(uid, { email: users[uid]?.email }).firestore();

  await check("WITHOUT the guard, an admin CAN read a live token document", "allow", () =>
    getDoc(doc(weakAs("adminA"), "qr_access_tokens", TOKEN_ID)));

  await check("WITHOUT the guard, an admin CAN read requester IPs from the fetch log", "allow", () =>
    getDoc(doc(weakAs("adminA"), "qr_access_log", LOG_ID)));

  await weakEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
