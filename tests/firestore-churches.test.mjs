/**
 * Security-rules tests for `churches/{churchId}`.
 *
 * Run with `npm run test:rules`. See the README section "Security rules tests".
 *
 * These exist because of #65. The old rule granted update by role alone:
 *
 *   allow update: if isMasterAdmin() || (isAdmin() && getUserData().churchId == churchId);
 *
 * The role check was right; the missing part was *which fields*. Any church
 * admin could write `plan`, `status` and `subscription` on their own church
 * straight from the browser, which is a billing bypass, and could set `slug` to
 * a value another church already held -- `TenantContext` resolves slugs with
 * `.limit(1)`, so one church would silently shadow the other.
 *
 * Identity and commercial state are now server-only, via POST /api/church/settings.
 * Two client writes remain, and both are covered below.
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
const admin1 = { uid: "admin1", email: "d@x.com", role: "admin", roles: ["admin"], churchId: CHURCH, status: "approved" };

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "users", "admin1"), admin1);
  await setDoc(doc(db, "churches", CHURCH), {
    name: "Real Church Name",
    slug: "real-church",
    status: "trialing",
    plan: "starter",
    subscription: { tier: "starter", status: "active" },
    setupCompleted: false,
    // Legacy copies that AdminDashboard scrubs; see the null-only branch below.
    adminOverridePinHash: "legacyhash",
    adminOverridePin: "xx12",
    pinLastUpdatedAt: "2020-01-01",
  });
});

const as = (uid) => env.authenticatedContext(uid, { email: admin1.email }).firestore();

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

console.log("\nMUST DENY - identity and commercial state are server-only (#65)");

await check("admin writes name", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { name: "Hijacked" }));

await check("admin writes slug", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { slug: "someone-elses" }));

await check("admin writes plan (billing bypass)", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { plan: "professional" }));

await check("admin writes subscription", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { subscription: { tier: "professional", status: "active" } }));

await check("admin writes status", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { status: "active" }));

await check("admin writes branding directly", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { branding: { primaryColor: "#000000" } }));

await check("admin sets a CHOSEN adminOverridePinHash", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { adminOverridePinHash: "attacker-known-hash" }));

await check("admin smuggles plan alongside an allowed key", "deny", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { setupCompleted: true, plan: "growth" }));

console.log("\nMUST ALLOW - the two client writes that remain");

await check("SetupWizard marks setup complete", "allow", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), { setupCompleted: true, updatedAt: new Date().toISOString() }));

await check("AdminDashboard scrubs legacy PIN fields to null", "allow", () =>
  updateDoc(doc(as("admin1"), "churches", CHURCH), {
    adminOverridePinHash: null, adminOverridePin: null, pinLastUpdatedAt: null,
  }));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
