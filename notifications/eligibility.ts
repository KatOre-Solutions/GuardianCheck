import type { Recipient } from "./recipients.js";

/**
 * Whether WhatsApp sending is even switched on at all, before asking
 * anything about a specific church or recipient. Both flags default to
 * "off" -- no env vars set means no behavior change from before this PR,
 * which is the kill switch the plan calls for: WHATSAPP_ENABLED=false (or
 * unset) reverts to email-only instantly, no code change, no redeploy.
 */
export function isWhatsAppEnabledForChurch(churchId: string): boolean {
  if (process.env.WHATSAPP_ENABLED !== "true") return false;

  const pilotList = (process.env.WHATSAPP_PILOT_CHURCH_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return pilotList.includes(churchId);
}

/**
 * Per-recipient eligibility. Deliberately does not check a separate
 * "channel consent" record -- the plan's full design calls for one
 * (docs/whatsapp-communication-plan.md section 3), but that's a
 * Communications_Consent policy-acceptance type gated on legal review
 * (blocker B3), which remains open. For this PR, completing OTP
 * verification (PR 4) *is* the consent signal: nobody verifies a WhatsApp
 * number they don't want notifications sent to, and the flow that gets a
 * number to whatsappVerifiedAt is itself opt-in (Profile.tsx, self-service,
 * nothing pre-checked). Revisit this the moment B3 resolves and a real
 * consent record exists to check instead.
 */
export function isWhatsAppEligibleRecipient(recipient: Recipient): boolean {
  return !!recipient.whatsappVerifiedAt && !!recipient.whatsappNumber;
}
