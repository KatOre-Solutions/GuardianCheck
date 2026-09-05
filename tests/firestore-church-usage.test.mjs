/**
 * Security-rules tests for `church_usage`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs
 * a JDK -- see the README section "Security rules tests" for the Java
 * version caveat.
 *
 * Why this exists
 * ----------------
 * `church_usage/{churchId}_{yyyyMM}` is the per-church monthly WhatsApp send
 * counter (notifications/allowance.ts). An admin should be able to see their
 * own church's usage, but nothing may write it client-side -- a client
 * incrementing or resetting its own count would defeat the entire point of
 * an allowance, and reserveWhatsAppAllowance's transactional read-increment
 * (the Admin SDK, which bypasses these rules) is the only legitimate writer.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
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
  adminA: { uid: "adminA", email: "a@x.com", role: "admin", roles: ["admin"], churchId: CHURCH_A, status: "approved" },
  volunteerA: { uid: "volunteerA", email: "v@x.com", role: "volunteer", roles: ["volunteer"], churchId: CHURCH_A, status: "approved" },
};

const usageDoc = (over = {}) => ({
  churchId: CHURCH_A,
  month: "202609",
  whatsappSent: 42,
  exhaustionNotifiedAt: null,
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
  await setDoc(doc(db, "church_usage", "churchA_202609"), usageDoc());
  await setDoc(doc(db, "church_usage", "churchB_202609"), usageDoc({ churchId: CHURCH_B }));
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

console.log("\nchurch_usage: admin-readable, server-write-only\n");

// ---------------------------------------------------------------- DENY ----

await check("an admin cannot read another church's usage", "deny", () =>
  getDoc(doc(as("adminA"), "church_usage", "churchB_202609")));

await check("a volunteer cannot read their own church's usage (admin-only)", "deny", () =>
  getDoc(doc(as("volunteerA"), "church_usage", "churchA_202609")));

await check("an unauthenticated caller cannot read usage", "deny", () =>
  getDoc(doc(anon(), "church_usage", "churchA_202609")));

await check("an admin cannot write their own church's usage (e.g. to reset the counter)", "deny", () =>
  setDoc(doc(as("adminA"), "church_usage", "churchA_202609"), usageDoc({ whatsappSent: 0 })));

await check("an admin cannot create a usage document at all", "deny", () =>
  setDoc(doc(as("adminA"), "church_usage", "churchA_202610"), usageDoc({ month: "202610", whatsappSent: 0 })));

// --------------------------------------------------------------- ALLOW ----

await check("an admin reads their own church's usage", "allow", () =>
  getDoc(doc(as("adminA"), "church_usage", "churchA_202609")));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
