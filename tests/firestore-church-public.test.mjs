/**
 * Security-rules tests for `church_public`, and for what `churches` must not
 * expose.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs a
 * JDK — see the README section "Security rules tests" for the Java version
 * caveat.
 *
 * Background
 * ----------
 * `churches` was readable by any authenticated user of any tenant, and listable
 * by an anonymous visitor through a `limit(1)` clause added so the landing page
 * could resolve a slug. That document carries `adminEmail`, `plan`, the whole
 * `subscription` map and the PayFast subscription token, and TenantContext
 * spread the entire thing into browser state.
 *
 * `church_public` is the fix: name, slug and branding, written server-side from
 * a fixed field list, world-readable by design. `churches` becomes private in
 * the follow-up change.
 *
 * The DENY block below is written as the queries an attacker would actually
 * run — dropping the client's `where` constraint, or pointing it at another
 * tenant — not the queries the app happens to send. The ALLOW block is the half
 * that catches a rule which denies everything: the anonymous slug lookup is the
 * public landing page, and it has to keep working.
 *
 * The churches DENY block below is the audit's proof-of-vulnerability turned
 * into a regression test: every one of those queries succeeded before the
 * lockdown.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
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
  parentA:    { uid: "parentA",    email: "p@x.com",  role: "parent",    roles: ["parent"],    churchId: CHURCH_A, status: "approved" },
  adminB:     { uid: "adminB",     email: "b@x.com",  role: "admin",     roles: ["admin"],     churchId: CHURCH_B, status: "approved" },
  // A self-signed-up account that has not been attached to any church. The
  // cheapest identity an attacker can obtain.
  drifter:    { uid: "drifter",    email: "d@x.com",  role: "parent",    roles: ["parent"],    churchId: null,     status: "incomplete_profile" },
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

await clearFirestoreWithRetry();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();

  for (const [id, data] of Object.entries(users)) {
    await setDoc(doc(db, "users", id), data);
  }

  // The sensitive document. Every field here is one an anonymous visitor must
  // never see.
  await setDoc(doc(db, "churches", CHURCH_A), {
    name: "St Mary's", slug: "st-marys", adminEmail: "admin@stmarys.example",
    status: "active", plan: "growth",
    subscription: { tier: "growth", status: "active", payfast_token: "pf-tok-AAAA-SECRET" },
    branding: { primaryColor: "#2563eb", secondaryColor: "#1e40af", logoUrl: "" },
  });
  await setDoc(doc(db, "churches", CHURCH_B), {
    name: "Grace Chapel", slug: "grace-chapel", adminEmail: "admin@grace.example",
    status: "active", plan: "starter",
    subscription: { tier: "starter", status: "active", payfast_token: "pf-tok-BBBB-SECRET" },
    branding: { primaryColor: "#16a34a", secondaryColor: "#15803d", logoUrl: "" },
  });

  // The public projection: three fields, no secrets.
  await setDoc(doc(db, "church_public", CHURCH_A), {
    churchId: CHURCH_A, name: "St Mary's", slug: "st-marys",
    branding: { primaryColor: "#2563eb", secondaryColor: "#1e40af", logoUrl: "" },
    updatedAt: "2026-09-02T00:00:00.000Z",
  });
  await setDoc(doc(db, "church_public", CHURCH_B), {
    churchId: CHURCH_B, name: "Grace Chapel", slug: "grace-chapel",
    branding: { primaryColor: "#16a34a", secondaryColor: "#15803d", logoUrl: "" },
    updatedAt: "2026-09-02T00:00:00.000Z",
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

console.log("\nPublic church projection and churches lockdown\n");

// ------------------------------------------------------- churches: DENY ----
// The PayFast subscription token lives on these documents. Nobody outside the
// owning church reads them, authenticated or not.

await check("anonymous cannot read a church document by id", "deny", () =>
  getDoc(doc(anon(), "churches", CHURCH_A)));

// This is the exact shape the old rule permitted: `request.query.limit == 1`
// was checked without ever consulting request.auth.
await check("anonymous cannot run the limit(1) slug lookup against churches", "deny", () =>
  getDocs(query(collection(anon(), "churches"), where("slug", "==", "st-marys"), limit(1))));

await check("anonymous cannot list churches at all", "deny", () =>
  getDocs(query(collection(anon(), "churches"), limit(1))));

await check("a church A admin cannot read church B's document", "deny", () =>
  getDoc(doc(as("adminA"), "churches", CHURCH_B)));

await check("a church A volunteer cannot read church B's document", "deny", () =>
  getDoc(doc(as("volunteerA"), "churches", CHURCH_B)));

await check("a parent cannot read another church's document", "deny", () =>
  getDoc(doc(as("parentA"), "churches", CHURCH_B)));

// The cheapest attack in the audit: sign up, read every church in the system.
await check("an unaffiliated signup cannot list every church", "deny", () =>
  getDocs(collection(as("drifter"), "churches")));

await check("an unaffiliated signup cannot read a church document", "deny", () =>
  getDoc(doc(as("drifter"), "churches", CHURCH_A)));

await check("an authenticated user cannot list all churches unconstrained", "deny", () =>
  getDocs(collection(as("adminA"), "churches")));

await check("an authenticated user cannot page churches with limit(1)", "deny", () =>
  getDocs(query(collection(as("volunteerA"), "churches"), limit(1))));

// -------------------------------------------------- church_public: DENY ----
// World-readable, but never client-writable: a forged public document would
// let an attacker repoint a slug at a church name of their choosing.

await check("anonymous cannot write a public church document", "deny", () =>
  setDoc(doc(anon(), "church_public", "forged"), { churchId: "forged", name: "Evil", slug: "st-marys" }));

await check("an admin cannot write their own church's public document", "deny", () =>
  setDoc(doc(as("adminA"), "church_public", CHURCH_A), { churchId: CHURCH_A, name: "Renamed", slug: "st-marys" }));

await check("an admin cannot overwrite another church's public document", "deny", () =>
  setDoc(doc(as("adminB"), "church_public", CHURCH_A), { churchId: CHURCH_A, name: "Hijacked", slug: "st-marys" }));

// ------------------------------------------------- church_public: ALLOW ----
// The landing page. If these fail the public site is down.

await check("anonymous resolves a church by slug (the landing page lookup)", "allow", () =>
  getDocs(query(collection(anon(), "church_public"), where("slug", "==", "st-marys"), limit(1))));

await check("anonymous reads a public church document by id", "allow", () =>
  getDoc(doc(anon(), "church_public", CHURCH_A)));

await check("an authenticated user resolves their own church by slug", "allow", () =>
  getDocs(query(collection(as("parentA"), "church_public"), where("slug", "==", "st-marys"), limit(1))));

// Cross-tenant reads of the public projection are fine by construction -- it
// is the same information the church prints on a poster.
await check("reading another church's public projection is harmless", "allow", () =>
  getDoc(doc(as("adminA"), "church_public", CHURCH_B)));

// ------------------------------------------------------- churches: ALLOW ---
// Own-church reads must survive the lockdown, or ChurchSettings, AdminDashboard
// and the volunteer branding subscription all break.

await check("a church A admin reads their own church document", "allow", () =>
  getDoc(doc(as("adminA"), "churches", CHURCH_A)));

await check("a church A volunteer reads their own church document", "allow", () =>
  getDoc(doc(as("volunteerA"), "churches", CHURCH_A)));

await check("a church A parent reads their own church document", "allow", () =>
  getDoc(doc(as("parentA"), "churches", CHURCH_A)));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
