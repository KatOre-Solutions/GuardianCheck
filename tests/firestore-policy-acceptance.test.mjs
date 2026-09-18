/**
 * Security-rules tests for `policy_acceptance/{uid}/history/{versionId}`.
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator, which needs a
 * JDK -- see the README section "Security rules tests" for the Java version
 * caveat.
 *
 * `history/{versionId}` is create-only ("allow update, delete: if false"),
 * which is what issue #148 ran into: `PolicyAcceptancePage.tsx`'s Accept
 * transaction commits this doc, and if the client never sees the response
 * (a dropped connection right after the write lands), the user retries. A
 * naive retry writes the same doc id again, which Firestore evaluates as an
 * update against an existing doc, denied by this rule, so the whole
 * transaction rolls back forever for that policy version.
 *
 * The DENY case below pins that invariant: the rule itself is correct and is
 * not what changed. The fix is client-side (read the doc first, skip the
 * write once it exists, mirroring the identical guard already applied to
 * `church_policy_acceptance` in commit 979144a); `acceptPolicy()` below
 * mirrors that fixed transaction, and the ALLOW cases prove a retry now
 * succeeds without rewriting the record.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
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
const VERSION = "v1";

const users = {
  parentA:  { uid: "parentA",  email: "p@x.com",  role: "parent", roles: ["parent"], churchId: CHURCH_A, status: "approved" },
  parentA2: { uid: "parentA2", email: "p2@x.com",  role: "parent", roles: ["parent"], churchId: CHURCH_A, status: "approved" },
};

/** A history payload that satisfies isValidPolicyHistory(). */
const historyPayload = () => ({
  version: VERSION,
  acceptedAt: serverTimestamp(),
  churchId: CHURCH_A,
  roleAtTime: "parent",
  legalContext: {
    policyHash: "sha256:placeholder_hash_v1",
    agreementType: "Privacy_Notice",
  },
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
  // parentA already has a history record for VERSION, as if a first Accept
  // committed it but the client never saw the response.
  await setDoc(doc(db, "policy_acceptance", "parentA", "history", VERSION), historyPayload());
});

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

function checkEqual(label, expected, actual) {
  const ok = expected === actual;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  PASS " : "  FAIL "} ${label}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
}

/**
 * Mirrors the fixed transaction in PolicyAcceptancePage.tsx's handleAccept:
 * read the create-only history doc first, and only create it if it doesn't
 * already exist. The summary doc (`policy_acceptance/{uid}`) is always
 * `allow write`, so it is written unconditionally on every call, same as the
 * real handler.
 */
async function acceptPolicy(db, uid, version) {
  const acceptanceRef = doc(db, "policy_acceptance", uid);
  const historyRef = doc(db, "policy_acceptance", uid, "history", version);
  return runTransaction(db, async (transaction) => {
    const historySnap = await transaction.get(historyRef);
    if (!historySnap.exists()) {
      transaction.set(historyRef, {
        version,
        acceptedAt: serverTimestamp(),
        churchId: CHURCH_A,
        roleAtTime: "parent",
        legalContext: {
          policyHash: "sha256:placeholder_hash_v1",
          agreementType: "Privacy_Notice",
        },
      });
    }
    transaction.set(acceptanceRef, {
      lastAcceptedVersion: version,
      lastAcceptedAt: new Date().toISOString(),
      status: "compliant",
    });
  });
}

console.log("\nPolicy acceptance history\n");

// ---------------------------------------------------------------- DENY ----

// Pins the invariant the fix depends on: a second, naive write to an
// already-existing history doc is still denied as an update. If this ever
// starts passing, the create-only rule was loosened and the guard in
// PolicyAcceptancePage.tsx is no longer load-bearing.
await check("a second raw write to an existing history record is denied as an update", "deny", () =>
  setDoc(doc(as("parentA"), "policy_acceptance", "parentA", "history", VERSION), historyPayload()));

// --------------------------------------------------------------- ALLOW ----

await check("a first accept creates the history record", "allow", () =>
  acceptPolicy(as("parentA2"), "parentA2", VERSION));

const firstSnap = await getDoc(doc(as("parentA2"), "policy_acceptance", "parentA2", "history", VERSION));
const firstAcceptedAt = firstSnap.data()?.acceptedAt?.toMillis();

// The retry case from #148: the transaction already committed once (client
// never saw the response), and the user clicks Accept again.
await check("retrying after an already-successful accept still succeeds", "allow", () =>
  acceptPolicy(as("parentA2"), "parentA2", VERSION));

const secondSnap = await getDoc(doc(as("parentA2"), "policy_acceptance", "parentA2", "history", VERSION));
const secondAcceptedAt = secondSnap.data()?.acceptedAt?.toMillis();

// Not just "didn't throw": prove the retry skipped the write rather than
// silently recreating the immutable record with a new timestamp.
checkEqual("the retry did not rewrite the history record", firstAcceptedAt, secondAcceptedAt);

// --------------------------------------------------------------- SOURCE ---
// acceptPolicy() above is a model of the real handler. If PolicyAcceptancePage.tsx
// drifts away from it, this test stops meaning anything, so assert the guard
// it depends on is still there.

const pageSrc = readFileSync(path.join(ROOT, "src/pages/PolicyAcceptancePage.tsx"), "utf8");

checkEqual("PolicyAcceptancePage reads the history doc before writing it", true,
  pageSrc.includes("transaction.get(historyRef)"));
checkEqual("PolicyAcceptancePage skips the history write once it already exists", true,
  pageSrc.includes("historySnap.exists()"));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
