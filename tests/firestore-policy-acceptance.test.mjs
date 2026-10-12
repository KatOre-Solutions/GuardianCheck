/**
 * Exercises the production acceptance function against the Firestore rules.
 * Run with npm run test:rules. The emulator requires a JDK. See the README.
 */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { clearFirestoreWithRetry, createRulesReporter } from "./helpers/rules-env.mjs";
import { acceptPolicyVersion } from "../src/lib/policyAcceptance.ts";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = await initializeTestEnvironment({
  projectId: "gc-rules-test",
  firestore: { rules: readFileSync(path.join(ROOT, "firestore.rules"), "utf8"), host: "127.0.0.1", port: 8571 },
});
const CHURCH = "123TestChurch";
const users = {
  parent: { email: "parent@x.com", role: "parent", roles: ["parent"], churchId: CHURCH, status: "approved" },
  admin: { email: "admin@x.com", role: "admin", roles: ["admin"], churchId: CHURCH, status: "approved" },
  admin2: { email: "admin2@x.com", role: "admin", roles: ["admin"], churchId: CHURCH, status: "approved" },
};
const reporter = createRulesReporter();
const { check } = reporter;
const as = (uid) => env.authenticatedContext(uid, { email: users[uid].email }).firestore();
const summaryRef = (db, uid) => doc(db, "policy_acceptance", uid);
const historyRef = (db, uid, version) => doc(summaryRef(db, uid), "history", version);
const churchRef = (db) => doc(db, "church_policy_acceptance", CHURCH);
const read = async (ref) => (await getDoc(ref)).data();
const FIRST_TIME = "2026-10-12T08:00:00.000Z";
const RETRY_TIME = "2026-10-12T09:00:00.000Z";
const options = (uid, version = "v1", acceptedAtIso = FIRST_TIME) => ({
  uid, version, ...users[uid], acceptedAtIso,
  userAgent: "GuardianCheck rules test", traceId: `test_${uid}_${version}`,
});
function assertHistory(history, uid, version) {
  assert.ok(history, "history must exist");
  assert.equal(history.version, version);
  assert.ok(Number.isFinite(history.acceptedAt.toMillis()), "history must have a committed timestamp");
  assert.equal(history.churchId, CHURCH);
  assert.equal(history.roleAtTime, users[uid].role);
  assert.deepEqual(history.legalContext, {
    policyHash: "sha256:placeholder_hash_v1",
    agreementType: users[uid].role === "admin" ? "Operator_Agreement" : "Privacy_Notice",
  });
  assert.deepEqual(history.forensicData, {
    userAgent: "GuardianCheck rules test", ipMasked: "0.0.0.0", traceId: `test_${uid}_${version}`,
  });
  assert.equal(history.acceptanceMethod, "explicit_checkbox_click");
}
function assertSummary(summary, version, time) {
  assert.deepEqual(summary, { lastAcceptedVersion: version, lastAcceptedAt: time, status: "compliant" });
}
try {
  await clearFirestoreWithRetry(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [uid, data] of Object.entries(users)) {
      await setDoc(doc(ctx.firestore(), "users", uid), { uid, ...data });
    }
  });
  console.log("\nPolicy acceptance production behaviour\n");
  const parentDb = as("parent");
  const adminDb = as("admin");
  const admin2Db = as("admin2");
  await check("parent first acceptance creates full history and summary", "allow", async () => {
    await acceptPolicyVersion(parentDb, options("parent"));
    assertHistory(await read(historyRef(parentDb, "parent", "v1")), "parent", "v1");
    assertSummary(await read(summaryRef(parentDb, "parent")), "v1", FIRST_TIME);
    assert.equal(await read(churchRef(parentDb)), undefined, "parent must not create a church acceptance");
  });
  await check("parent retry preserves all history and summary fields and timestamps", "allow", async () => {
    const historyBefore = await read(historyRef(parentDb, "parent", "v1"));
    const summaryBefore = await read(summaryRef(parentDb, "parent"));
    await acceptPolicyVersion(parentDb, { ...options("parent", "v1", RETRY_TIME), traceId: "retry" });
    assert.deepEqual(await read(historyRef(parentDb, "parent", "v1")), historyBefore);
    assert.deepEqual(await read(summaryRef(parentDb, "parent")), summaryBefore);
  });
  await check("admin first acceptance creates history, summary and church record", "allow", async () => {
    await acceptPolicyVersion(adminDb, options("admin"));
    assertHistory(await read(historyRef(adminDb, "admin", "v1")), "admin", "v1");
    assertSummary(await read(summaryRef(adminDb, "admin")), "v1", FIRST_TIME);
    const church = await read(churchRef(adminDb));
    assert.equal(church.acceptedBy, "admin");
    assert.equal(church.policyVersion, "v1");
    assert.ok(Number.isFinite(church.acceptedAt.toMillis()));
  });
  await check("admin retry preserves history, summary and immutable church record", "allow", async () => {
    const refs = [historyRef(adminDb, "admin", "v1"), summaryRef(adminDb, "admin"), churchRef(adminDb)];
    const before = await Promise.all(refs.map(read));
    await acceptPolicyVersion(adminDb, options("admin", "v1", RETRY_TIME));
    assert.deepEqual(await Promise.all(refs.map(read)), before);
  });
  await check("another admin accepts without changing the existing church record", "allow", async () => {
    const before = await read(churchRef(adminDb));
    await acceptPolicyVersion(admin2Db, options("admin2"));
    assertHistory(await read(historyRef(admin2Db, "admin2", "v1")), "admin2", "v1");
    assertSummary(await read(summaryRef(admin2Db, "admin2")), "v1", FIRST_TIME);
    assert.deepEqual(await read(churchRef(adminDb)), before);
  });
  await check("new policy version creates new history and advances summary", "allow", async () => {
    for (const uid of ["parent", "admin"]) {
      const db = as(uid);
      const previousHistory = await read(historyRef(db, uid, "v1"));
      const previousChurch = await read(churchRef(db));
      await acceptPolicyVersion(db, options(uid, "v2", RETRY_TIME));
      assertHistory(await read(historyRef(db, uid, "v2")), uid, "v2");
      assertSummary(await read(summaryRef(db, uid)), "v2", RETRY_TIME);
      assert.deepEqual(await read(historyRef(db, uid, "v1")), previousHistory);
      assert.deepEqual(await read(churchRef(db)), previousChurch);
    }
  });
  await check("missing summary is reconstructed using immutable history time", "allow", async () => {
    const history = await read(historyRef(parentDb, "parent", "v2"));
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(summaryRef(ctx.firestore(), "parent")));
    await acceptPolicyVersion(parentDb, options("parent", "v2", FIRST_TIME));
    assertSummary(await read(summaryRef(parentDb, "parent")), "v2", history.acceptedAt.toDate().toISOString());
    assert.deepEqual(await read(historyRef(parentDb, "parent", "v2")), history);
  });
  await check("older summary is repaired using newer history time", "allow", async () => {
    const history = await read(historyRef(parentDb, "parent", "v2"));
    await setDoc(summaryRef(parentDb, "parent"), { lastAcceptedVersion: "v1", lastAcceptedAt: FIRST_TIME, status: "compliant" });
    await acceptPolicyVersion(parentDb, options("parent", "v2", RETRY_TIME));
    assertSummary(await read(summaryRef(parentDb, "parent")), "v2", history.acceptedAt.toDate().toISOString());
    assert.deepEqual(await read(historyRef(parentDb, "parent", "v2")), history);
  });
  await check("same version marked outdated is repaired and subsequent retry is unchanged", "allow", async () => {
    const history = await read(historyRef(parentDb, "parent", "v2"));
    await setDoc(summaryRef(parentDb, "parent"), { lastAcceptedVersion: "v2", lastAcceptedAt: FIRST_TIME, status: "outdated" });
    await acceptPolicyVersion(parentDb, options("parent", "v2"));
    const repaired = await read(summaryRef(parentDb, "parent"));
    assertSummary(repaired, "v2", history.acceptedAt.toDate().toISOString());
    await acceptPolicyVersion(parentDb, options("parent", "v2", RETRY_TIME));
    assert.deepEqual(await read(summaryRef(parentDb, "parent")), repaired);
  });
  await check("direct history overwrite remains denied", "deny", async () => {
    const history = await read(historyRef(parentDb, "parent", "v1"));
    await setDoc(historyRef(parentDb, "parent", "v1"), { ...history, acceptedAt: serverTimestamp() });
  });
  await check("direct church acceptance overwrite remains denied", "deny", () =>
    setDoc(churchRef(adminDb), { acceptedBy: "admin", acceptedAt: serverTimestamp(), policyVersion: "v2" }));
  reporter.report();
} finally {
  await env.cleanup();
}
process.exitCode = reporter.exitCode;
