/**
 * Unit tests for guardian-tokens.ts.
 *
 * Run with `npm run test:guardian-tokens`. No emulator, no network.
 *
 * What matters here: the token is the value that, when scanned, names the
 * children a person may collect. These tests pin the properties that make it
 * unguessable and make legacy tokens identifiable so the rotation script can
 * report on them.
 */

import { mintGuardianQrToken, isServerMintedToken, isLegacyGuardianToken } from "../guardian-tokens.ts";

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

console.log("\nguardian-tokens: minting and classification\n");

// --- Minting --------------------------------------------------------------

const SAMPLE = 1000;
const minted = Array.from({ length: SAMPLE }, () => mintGuardianQrToken());

check(`${SAMPLE} mints are all distinct`, SAMPLE, new Set(minted).size);

check(
  "every mint carries the server prefix",
  true,
  minted.every((t) => t.startsWith("gq_")),
);

// base64url of 24 bytes is exactly 32 chars, no padding. 35 with the prefix.
check("every mint is 35 characters", true, minted.every((t) => t.length === 35));

check(
  "every mint is base64url after the prefix (no +, /, or =)",
  true,
  minted.every((t) => /^gq_[A-Za-z0-9_-]{32}$/.test(t)),
);

// Fits the 8..64 bound GuardianLookupSchema and GuardianCheckOutSchema
// already enforce, so no schema change was needed and none can be minted that
// the endpoints would reject.
check(
  "every mint fits the 8..64 length the checkout schemas accept",
  true,
  minted.every((t) => t.length >= 8 && t.length <= 64),
);

// A crude but real check on the CSPRNG: 1000 tokens x 32 chars is 32k
// characters over a 64-symbol alphabet. Anything with a badly skewed
// distribution (a broken PRNG, a constant) fails this comfortably, and a
// healthy one is nowhere near it.
{
  const body = minted.map((t) => t.slice(3)).join("");
  const freq = new Map();
  for (const ch of body) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const counts = [...freq.values()];
  const expectedPer = body.length / 64;
  const worstRatio = Math.max(...counts.map((c) => c / expectedPer));
  check("no character dominates the alphabet (< 2x expected frequency)", true, worstRatio < 2);
  check("most of the 64-symbol alphabet is used", true, freq.size >= 60);
}

check("a minted token classifies as server-minted", true, isServerMintedToken(minted[0]));
check("a minted token is not classified as legacy", false, isLegacyGuardianToken(minted[0]));

// --- Legacy classification ------------------------------------------------
//
// The shape the browser used to produce:
//   `guardian_${Math.random().toString(36).substr(2, 12)}`
// substr(2, 12) yields 1..12 lowercase alphanumerics -- fewer when the
// random float's base-36 tail is short, which is why the matcher is loose at
// the low end.

check("recognises a typical legacy token", true, isLegacyGuardianToken("guardian_k3j4h5g6f7d8"));
check("recognises a short legacy token", true, isLegacyGuardianToken("guardian_k3j4"));
check("recognises the demo-seeded variant", true, isLegacyGuardianToken("demo_guardian_abc123"));

check("does not classify a server token as legacy", false, isLegacyGuardianToken("gq_" + "A".repeat(32)));
check("does not classify an unrelated string as legacy", false, isLegacyGuardianToken("some-other-token"));
check("does not classify an empty string as legacy", false, isLegacyGuardianToken(""));
check("rejects uppercase in the legacy body", false, isLegacyGuardianToken("guardian_ABC123"));
check("rejects an over-long legacy body", false, isLegacyGuardianToken("guardian_" + "a".repeat(13)));

// Non-strings must not throw -- these run against whatever is in Firestore,
// including documents written before any of this existed.
check("handles undefined without throwing", false, isLegacyGuardianToken(undefined));
check("handles null without throwing", false, isLegacyGuardianToken(null));
check("handles a number without throwing", false, isServerMintedToken(12345));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
