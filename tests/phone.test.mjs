/**
 * Unit tests for the shared phone normalization/classification module
 * (src/lib/phone.ts), used by both the client-side guardian/profile forms
 * and scripts/report-phone-numbers.ts.
 *
 * Run with `npm run test:phone`. Pure functions, no Firebase, no emulator.
 */

import { classifyPhone, isSentinelPhone, isValidE164, normalizeToE164 } from "../src/lib/phone.ts";

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

console.log("\nclassifyPhone\n");

check("already-E.164 SA number is valid, unchanged", { category: "valid", e164: "+27821234567" }, classifyPhone("+27821234567"));
check("a foreign E.164 number is valid too (real intl support, not SA-only)", { category: "valid", e164: "+14155552671" }, classifyPhone("+14155552671"));
check("local SA number is normalizable to +27...", { category: "normalizable", e164: "+27821234567" }, classifyPhone("0821234567"));
check("local SA number with spaces/formatting is still normalizable", { category: "normalizable", e164: "+27821234567" }, classifyPhone("082 123 4567"));
check("local SA number with dashes is still normalizable", { category: "normalizable", e164: "+27821234567" }, classifyPhone("082-123-4567"));

check('"Account Holder" (a real production value) is a sentinel', { category: "sentinel" }, classifyPhone("Account Holder"));
check('"account holder" is a sentinel case-insensitively', { category: "sentinel" }, classifyPhone("account holder"));
check('"0000000000" (SetupWizard demo data) is a sentinel', { category: "sentinel" }, classifyPhone("0000000000"));
check('"1111111111" (repeated-digit placeholder shape) is a sentinel', { category: "sentinel" }, classifyPhone("1111111111"));
check('"N/A" is a sentinel', { category: "sentinel" }, classifyPhone("N/A"));

check("empty string is invalid, not a sentinel", { category: "invalid" }, classifyPhone(""));
check("whitespace-only is invalid", { category: "invalid" }, classifyPhone("   "));
check("null is invalid", { category: "invalid" }, classifyPhone(null));
check("undefined is invalid", { category: "invalid" }, classifyPhone(undefined));
check("non-numeric garbage is invalid", { category: "invalid" }, classifyPhone("abc"));
check("too-short digits is invalid, not needs-user-action", { category: "invalid" }, classifyPhone("123"));

check(
  "a plausible-length number that doesn't parse under the default country needs a human",
  "needs-user-action",
  classifyPhone("0711234567890123").category, // too long to be a valid SA number, but still phone-shaped
);

console.log("\nnormalizeToE164 (live input validation)\n");

check("normalizes a local SA number", "+27821234567", normalizeToE164("0821234567"));
check("passes through an already-E.164 number", "+27821234567", normalizeToE164("+27821234567"));
check("returns null for an invalid number, not throwing", null, normalizeToE164("abc"));
check("returns null for empty input, not throwing", null, normalizeToE164(""));
check("returns null for partial input while typing", null, normalizeToE164("08"));

console.log("\nisValidE164\n");

check("a real E.164 number is valid", true, isValidE164("+27821234567"));
check("missing the leading + is not valid E.164", false, isValidE164("27821234567"));
check("a leading zero after + is not valid E.164 (no calling code starts with 0)", false, isValidE164("+0821234567"));
check("plain local format is not valid E.164", false, isValidE164("0821234567"));

console.log("\nisSentinelPhone\n");

check("known sentinel strings are detected", true, isSentinelPhone("Account Holder"));
check("a real phone number is never flagged as a sentinel", false, isSentinelPhone("+27821234567"));
check("empty string is not a sentinel (it's invalid, a different bucket)", false, isSentinelPhone(""));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
