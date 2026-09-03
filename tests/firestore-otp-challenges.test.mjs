/**
 * Security-rules tests for `otp_challenges`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs
 * a JDK -- see the README section "Security rules tests" for the Java
 * version caveat.
 *
 * Why this exists
 * ----------------
 * `otp_challenges/{uid}` holds a peppered HMAC of the pending WhatsApp
 * verification code for that user (notifications/whatsapp-verification.ts).
 * Even though the code itself is never stored in the clear, this collection
 * must still be completely unreadable by any client identity -- a client
 * that could read its own challenge could read the hash and brute-force a
 * 6-digit code offline, at its own pace, without the rate limiter on
 * POST /api/whatsapp/verify/confirm ever seeing a request. There is no
 * legitimate client read or write path here at all: everything goes through
 * the two verify endpoints, which use the Admin SDK and so bypass these
 * rules entirely.
 */

import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
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

const users = {
  someone: { uid: "someone", email: "s@x.com", role: "parent", roles: ["parent"], churchId: null, status: "approved" },
  masterAdmin: { uid: "masterAdmin", email: "master-admin-test@x.com", role: "master_admin", roles: ["master_admin"], churchId: null, status: "approved" },
};

const challenge = () => ({
  codeHash: "a".repeat(64),
  phone: "+27821234567",
  attempts: 0,
  createdAt: "2026-09-03T09:00:00.000Z",
  expiresAt: "2026-09-03T09:10:00.000Z",
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
  await setDoc(doc(db, "otp_challenges", "someone"), challenge());
});

const as = (uid) => env.authenticatedContext(uid, { email: users[uid]?.email }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

let pass = 0;
let fail = 0;

async function check(label, mode, fn) {
  try {
    await (mode === "deny" ? assertFails(fn()) : fn());
    console.log(`  PASS  [${mode.toUpperCase()}] ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  [${mode.toUpperCase()}] ${label}\n        ${String(e.message).split("\n")[0]}`);
    fail++;
  }
}

console.log("\nOTP challenges: no client access at all\n");

await check("a user cannot read their own pending challenge", "deny", () =>
  getDoc(doc(as("someone"), "otp_challenges", "someone")));

await check("a user cannot write their own challenge (e.g. to reset attempts)", "deny", () =>
  setDoc(doc(as("someone"), "otp_challenges", "someone"), challenge()));

await check("a user cannot delete their own challenge (e.g. to escape the attempt cap)", "deny", () =>
  deleteDoc(doc(as("someone"), "otp_challenges", "someone")));

await check("master admin has no special-cased access -- this collection has no exceptions", "deny", () =>
  getDoc(doc(as("masterAdmin"), "otp_challenges", "someone")));

await check("an unauthenticated caller cannot read a challenge", "deny", () =>
  getDoc(doc(anon(), "otp_challenges", "someone")));

await check("a client cannot create a challenge for another uid", "deny", () =>
  setDoc(doc(as("someone"), "otp_challenges", "somebody-else"), challenge()));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
