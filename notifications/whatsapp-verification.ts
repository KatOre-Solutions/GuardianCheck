import crypto from "crypto";
import { sendWhatsAppTemplate, buildOtpTemplateComponents } from "./providers/whatsapp.js";
import { normalizeToE164 } from "../src/lib/phone.js";

/**
 * Phone-ownership verification: a 6-digit code sent via a WhatsApp
 * AUTHENTICATION template, confirmed against a server-only Firestore
 * record. `users.whatsappVerifiedAt` is what the (future, PR 5) eligibility
 * check reads before ever sending a real notification to a number -- this
 * module is the only thing that may set it, and it never does so from
 * anything a client could forge (see `preservesWhatsappVerification()` in
 * firestore.rules, the other half of that guarantee).
 *
 * Design notes worth knowing before touching this file:
 *
 *   - The code is never stored in the clear -- only an HMAC-SHA256 of it,
 *     keyed by WHATSAPP_OTP_PEPPER. A 6-digit code is only ~20 bits of
 *     entropy, cheap to brute-force offline against a plain hash; the
 *     pepper means a leaked Firestore document alone isn't enough, and
 *     `otp_challenges` is also server-only in firestore.rules so a client
 *     can never read the hash in the first place.
 *   - Comparison is constant-time (crypto.timingSafeEqual) so response
 *     timing can't leak how many leading digits matched.
 *   - `attempts` is a persisted counter, independent of and a backstop for
 *     the express-rate-limit window on POST /api/whatsapp/verify/confirm --
 *     the in-memory limiter resets on redeploy; this doesn't.
 *   - "Reset on number change": `whatsappVerifiedAt` is cleared the moment a
 *     *different* number starts a new challenge, not only on success. A
 *     verified flag must always describe the number currently on the
 *     account, never a number the family no longer holds.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const OTP_TEMPLATE_NAME = process.env.WHATSAPP_OTP_TEMPLATE_NAME || "otp_verification";
const OTP_LANGUAGE_CODE = process.env.WHATSAPP_OTP_LANGUAGE_CODE || "en_US";

export const OTP_CHALLENGES_COLLECTION = "otp_challenges";

function pepper(): string {
  const p = process.env.WHATSAPP_OTP_PEPPER;
  if (!p) throw new Error("WHATSAPP_OTP_PEPPER is not configured");
  return p;
}

function generateCode(): string {
  // crypto.randomInt is a CSPRNG, unlike Math.random -- this is a
  // short-lived credential, not a display id, and deserves the same care
  // as any other secret generator in this codebase.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(code: string): string {
  return crypto.createHmac("sha256", pepper()).update(code).digest("hex");
}

function constantTimeEqual(hexA: string, hexB: string): boolean {
  const bufA = Buffer.from(hexA, "hex");
  const bufB = Buffer.from(hexB, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface StartResult {
  ok: boolean;
  /** Only set on failure. Safe to show the caller -- see startWhatsappVerification's doc for what is and isn't surfaced. */
  errorMessage?: string;
}

export async function startWhatsappVerification(db: any, uid: string, rawNumber: string): Promise<StartResult> {
  const normalized = normalizeToE164(rawNumber);
  if (!normalized) {
    return { ok: false, errorMessage: "Please enter a valid WhatsApp number, e.g. 082 123 4567 or +27 82 123 4567" };
  }

  const code = generateCode();
  const now = Date.now();

  // set(), not create(): a repeat /start call (a "resend") legitimately
  // replaces whatever challenge was pending, same as EmailService's
  // sendVerificationEmail lets someone request another link.
  await db.collection(OTP_CHALLENGES_COLLECTION).doc(uid).set({
    codeHash: hashCode(code),
    phone: normalized,
    attempts: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OTP_TTL_MS).toISOString(),
  });

  const userDoc = await db.collection("users").doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const wasVerifiedForADifferentNumber = !!userData?.whatsappVerifiedAt && userData?.whatsappNumber !== normalized;
  if (wasVerifiedForADifferentNumber) {
    await db.collection("users").doc(uid).update({ whatsappVerifiedAt: null });
  }

  const sendResult = await sendWhatsAppTemplate({
    to: normalized,
    templateName: OTP_TEMPLATE_NAME,
    languageCode: OTP_LANGUAGE_CODE,
    components: buildOtpTemplateComponents(code),
  });

  if (!sendResult.ok) {
    console.error(`WhatsApp OTP send failed for uid ${uid}: [${sendResult.errorCode}] ${sendResult.errorMessage}`);
    // The challenge stays written -- a failed send just means the code
    // never arrived; the family can request another, which overwrites it.
    // The provider's actual error is logged server-side only: it can
    // reveal things (a malformed number Meta rejected outright vs a
    // transient outage) that don't need to reach the client.
    return { ok: false, errorMessage: "Couldn't send the verification code. Please try again in a moment." };
  }

  return { ok: true };
}

export type ConfirmOutcome = "verified" | "invalid" | "expired" | "no_pending_challenge" | "too_many_attempts";

export interface ConfirmResult {
  outcome: ConfirmOutcome;
}

/**
 * Every non-"verified" outcome is deliberately indistinguishable to a
 * caller of the HTTP endpoint wrapping this (server.ts maps them all to the
 * same generic message) -- "no_pending_challenge" and "invalid" must look
 * identical from outside, or the endpoint becomes an oracle for whether a
 * given account ever requested a code at all. The distinct enum values
 * exist for logging and for this module's own tests, not for the response.
 */
export async function confirmWhatsappVerification(db: any, uid: string, submittedCode: string): Promise<ConfirmResult> {
  const ref = db.collection(OTP_CHALLENGES_COLLECTION).doc(uid);
  const doc = await ref.get();

  if (!doc.exists) return { outcome: "no_pending_challenge" };

  const data = doc.data();

  if ((data.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    await ref.delete();
    return { outcome: "too_many_attempts" };
  }

  if (new Date(data.expiresAt).getTime() < Date.now()) {
    await ref.delete();
    return { outcome: "expired" };
  }

  const matches = constantTimeEqual(hashCode(submittedCode), data.codeHash);

  if (!matches) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 });
    return { outcome: "invalid" };
  }

  // set(..., {merge: true}), not update(): update() throws if the users
  // doc doesn't exist yet, and authenticateToken only guarantees a valid
  // Firebase Auth session, not that Firestore's users/{uid} doc has been
  // written -- signup writes it from the client in a separate step. A
  // merge-set never requires the doc to pre-exist and never clobbers other
  // fields either way.
  await db.collection("users").doc(uid).set({
    whatsappNumber: data.phone,
    whatsappVerifiedAt: new Date().toISOString(),
  }, { merge: true });
  await ref.delete();

  return { outcome: "verified" };
}
