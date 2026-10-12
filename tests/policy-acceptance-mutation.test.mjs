/** Run inside the Firestore emulator to prove the creation guard is tested. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../src/lib/policyAcceptance.ts", import.meta.url));
const suitePath = fileURLToPath(new URL("./firestore-policy-acceptance.test.mjs", import.meta.url));
const original = readFileSync(sourcePath, "utf8");
const guard = "if (!snapshot.exists()) transaction.set(reference, data);";
assert.equal(original.split(guard).length - 1, 1, "expected exactly one create-only guard");

function runSuite() {
  const result = spawnSync(process.execPath, ["--import", "tsx", suitePath], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

try {
  writeFileSync(sourcePath, original.replace(guard, "if (snapshot.exists()) transaction.set(reference, data);"));
  const mutated = runSuite();
  assert.equal(mutated.status, 1, "inverting the creation guard must fail the regression suite");
  assert.match(mutated.stdout, /FAIL  \[ALLOW\] parent first acceptance creates full history and summary/,
    "the mutation must fail a history behaviour assertion, not just emulator setup");
  console.log("PASS: reversed history creation guard fails the first-acceptance behaviour test");
} finally {
  writeFileSync(sourcePath, original);
}

const restored = runSuite();
process.stdout.write(restored.stdout);
process.stderr.write(restored.stderr);
assert.equal(restored.status, 0, "restoring the guard must pass the regression suite");
console.log("PASS: restored creation guard passes all policy acceptance tests");
