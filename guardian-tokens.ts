import crypto from "crypto";

/**
 * Guardian pickup-QR tokens.
 *
 * Why this module exists
 * ----------------------
 * These tokens were minted in the browser, with `Math.random()`:
 *
 *   const qrToken = `guardian_${Math.random().toString(36).substr(2, 12)}`;
 *
 * Two separate problems in one line. `Math.random()` is not a CSPRNG -- V8
 * seeds an xorshift128+ state that is recoverable from a handful of outputs,
 * so tokens minted in one browser session are correlated, not independent.
 * And minting client-side means the value was chosen by the least trusted
 * party in the system: nothing stopped a caller writing whatever token it
 * liked into its own guardian document.
 *
 * What the token actually authorises is the reason that matters. A scanned
 * token resolves to a guardian and the children they may collect
 * (`resolveGuardianByToken` in server.ts). Paired with the volunteer
 * photo-match step added alongside this module, it is a lookup key checked by
 * a human. Without that step it was, in practice, a bearer credential for
 * collecting a child. It is treated here as the latter, because defence in
 * depth is the whole point and the human step can be rushed on a busy Sunday.
 *
 * Legacy tokens keep working. They are ~62 bits and the lookup endpoint is
 * rate-limited and church-scoped, so guessing one is not the practical risk
 * -- client-mintability was, and that is closed by firestore.rules from this
 * change on. `scripts/rotate-guardian-qr-tokens.ts` rotates the old ones on
 * demand, deliberately, rather than breaking every printed QR on deploy.
 */

/** Prefix for a server-minted token. Distinguishes new from legacy at a glance, in a log line, and in the rotation script's report. */
const SERVER_TOKEN_PREFIX = "gq_";

/**
 * 24 bytes = 192 bits of CSPRNG entropy, base64url-encoded to 32 characters,
 * 35 with the prefix -- comfortably inside the 8..64 bound
 * `GuardianLookupSchema` and `GuardianCheckOutSchema` already enforce, so no
 * schema change is needed and an over-long token can never be minted.
 */
export function mintGuardianQrToken(): string {
  return SERVER_TOKEN_PREFIX + crypto.randomBytes(24).toString("base64url");
}

/** True for a token this module minted. */
export function isServerMintedToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(SERVER_TOKEN_PREFIX);
}

/**
 * True for the client-minted shape described above, including the
 * `demo_guardian_` variant SetupWizard.tsx seeded demo churches with.
 *
 * Used only by the rotation script's report -- `resolveGuardianByToken` does
 * not consult this, because a legacy token must keep resolving until someone
 * deliberately rotates it. `substr(2, 12)` on a base-36 string yields 1..12
 * lowercase alphanumerics (fewer when the random float's tail is short), so
 * the bound is deliberately loose at the low end.
 */
export function isLegacyGuardianToken(token: string): boolean {
  return typeof token === "string" && /^(demo_)?guardian_[a-z0-9]{1,12}$/.test(token);
}
