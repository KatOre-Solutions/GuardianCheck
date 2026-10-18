import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ChurchAccessBoundary } from "../src/components/ChurchAccessBoundary";

let mounts = 0;
function ProtectedPage() {
  mounts++;
  return <div>Protected dashboard</div>;
}

for (const [status, hasChurch] of [
  ["loading", false], ["loading", true], ["error", false], ["error", true], ["ready", false],
] as const) {
  const html = renderToStaticMarkup(
    <ChurchAccessBoundary status={status} hasChurch={hasChurch}><ProtectedPage /></ChurchAccessBoundary>,
  );
  assert.equal(mounts, 0, `${status}/${hasChurch} must not mount the dashboard or start its effects`);
  assert.ok(!html.includes("Protected dashboard"));
  assert.ok(html.includes(status === "loading" ? 'role="status"' : 'role="alert"'));
  if (status !== "loading") assert.ok(html.includes("Try again"));
}

const ready = renderToStaticMarkup(
  <ChurchAccessBoundary status="ready" hasChurch><ProtectedPage /></ChurchAccessBoundary>,
);
assert.equal(mounts, 1);
assert.ok(ready.includes("Protected dashboard"));
console.log("PASS: pending, failed and missing access lookups never mount protected content; successful lookup renders it.");
