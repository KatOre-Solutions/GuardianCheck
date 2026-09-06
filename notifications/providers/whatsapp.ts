import axios from "axios";
import { whatsappSummaryText } from "../templates.js";
import { mintQrAccessToken } from "../qr-access.js";
import type { ChannelProvider, ChannelSendResult, NotificationEventType, NotificationRecord } from "../types.js";

/**
 * The WhatsApp Cloud API sender: raw `axios` calls to Meta's Graph API, no
 * SDK or BSP (per the plan's PR 4 architecture decision -- one fewer vendor
 * dependency, and the Graph API surface used here is small).
 *
 * Two callers use this: the OTP verification flow (server.ts,
 * `/api/whatsapp/verify/start`) sends an AUTHENTICATION template; the
 * business-event notification pipeline (`WhatsAppProvider` below, PR 5)
 * sends UTILITY templates, registered into `notifyCheckins`' provider map
 * only when `WHATSAPP_ENABLED` and a church's pilot membership both say so
 * -- see notifications/eligibility.ts.
 *
 * Mock mode (no WHATSAPP_ACCESS_TOKEN) mirrors notifications/providers/email.ts:
 * logs and reports success without calling the API, so local dev and CI
 * never need real WhatsApp credentials.
 */

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

// Confirmed by Meta's official docs (docs.whatsapp-communication-plan.md
// section 5): 130429 is the general rate-limit code and is worth retrying
// later; 131026 (recipient not on WhatsApp / invalid), 131047 (outside the
// 24h customer-service window -- irrelevant to a template send, which is
// exactly what templates are for, but Meta returns it for malformed
// session-vs-template mismatches) and 132015 (template paused by Meta) are
// all permanent for a given send -- retrying the identical request will
// fail the identical way. Anything not in this set defaults to
// non-retryable: a silent infinite-retry loop on a mis-configured template
// name or a permissions error is worse than surfacing it once.
const RETRYABLE_WHATSAPP_ERROR_CODES = new Set<number>([130429]);

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "url" | "copy_code" | "quick_reply";
  index?: string;
  parameters: Array<Record<string, any>>;
}

export interface SendTemplateArgs {
  /** E.164, with or without the leading "+" -- normalized here. */
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
}

function isMockMode(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  return !token || token === "your_whatsapp_access_token";
}

/**
 * The one place the Graph API is called. Never throws for an API-level
 * rejection (mirrors emailService.ts's sendViaResend) -- axios throwing on a
 * non-2xx is caught here and turned into the same ChannelSendResult shape a
 * successful-but-rejected call would produce, so every caller has exactly
 * one error shape to handle.
 */
export async function sendWhatsAppTemplate(args: SendTemplateArgs): Promise<ChannelSendResult> {
  const to = args.to.replace(/^\+/, "");

  if (isMockMode()) {
    console.log(`[MOCK WHATSAPP] To: ${to} | Template: ${args.templateName}`);
    return { ok: true, retryable: false };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    return { ok: false, retryable: false, errorMessage: "WHATSAPP_PHONE_NUMBER_ID is not configured" };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.languageCode },
      ...(args.components ? { components: args.components } : {}),
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const providerMessageId: string | undefined = response.data?.messages?.[0]?.id;
    return { ok: true, providerMessageId, retryable: false };
  } catch (err: any) {
    const apiError = err?.response?.data?.error;
    const code: number | undefined = apiError?.code;
    return {
      ok: false,
      errorCode: code != null ? String(code) : undefined,
      errorMessage: apiError?.message || err?.message || String(err),
      retryable: code != null ? RETRYABLE_WHATSAPP_ERROR_CODES.has(code) : false,
    };
  }
}

/**
 * Builds the `components` array for a COPY_CODE authentication template.
 * Meta requires the OTP value to appear twice: once as the body's text
 * parameter, once as the button's `coupon_code` parameter
 * (`sub_type: "copy_code"`) -- this is the shape a COPY_CODE-button
 * authentication template's send payload takes across every independent
 * source consulted while building this (Meta's own template-creation docs
 * plus several BSPs' technical documentation), not something verified
 * against a real approved template yet, since no WABA exists in this
 * project to submit one to. **Re-verify this exact shape against the real
 * template once it's created in Meta Business Manager (PR 4/5 rollout) --
 * template creation is what fixes the button's parameter contract, and a
 * mismatch here is a send-time 4xx, not a silent failure, so it will be
 * loud if wrong.**
 */
export function buildOtpTemplateComponents(code: string): WhatsAppTemplateComponent[] {
  return [
    { type: "body", parameters: [{ type: "text", text: code }] },
    { type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: code }] },
  ];
}

/**
 * Which approved UTILITY template name to use for a given event type, read
 * fresh from the environment on every call (not cached at module load) so
 * it stays testable and picks up a changed env var without a restart being
 * load-bearing for correctness. Undefined for an eventType with nothing
 * configured -- `WhatsAppProvider.send` treats that as "this event type
 * doesn't go out on WhatsApp," a safe default rather than a guess. Only 3
 * of the 4 event types are expected to ever have a template here
 * (docs/whatsapp-communication-plan.md PR 5: "3 UTILITY templates
 * approved") -- emergency alerts are not in MVP scope for WhatsApp.
 */
function utilityTemplateNameFor(eventType: NotificationEventType): string | undefined {
  switch (eventType) {
    case "check-in": return process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN || undefined;
    case "check-out": return process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKOUT || undefined;
    case "room_move": return process.env.WHATSAPP_UTILITY_TEMPLATE_ROOMMOVE || undefined;
    case "emergency": return undefined;
    // A separate approved template from the three above: it carries an IMAGE
    // header, which the others do not, so Meta reviews it on its own terms.
    case "qr-delivery": return process.env.WHATSAPP_UTILITY_TEMPLATE_QR_DELIVERY || undefined;
  }
}

/**
 * The business-notification `ChannelProvider` -- check-in/check-out/room-move,
 * registered into `notifyCheckins`' provider map (server.ts) only when
 * eligibility (notifications/eligibility.ts) says WhatsApp is switched on
 * for the church. Deliberately re-reads the recipient's live
 * whatsappNumber/whatsappVerifiedAt at send time rather than trusting
 * anything captured at enqueue -- the same principle EmailProvider follows,
 * and more load-bearing here: a retry from the once-daily cron sweep could
 * run many hours after the family changed or un-verified their number.
 */
export class WhatsAppProvider implements ChannelProvider {
  readonly channel = "whatsapp" as const;

  async send(record: NotificationRecord, deps: { db: any; firestoreOps?: { reads: number; writes: number } }): Promise<ChannelSendResult> {
    if (record.recipientUserId.startsWith("guardian:")) {
      return { ok: false, retryable: false, errorMessage: "WhatsApp is not supported for guardian recipients" };
    }

    const templateName = utilityTemplateNameFor(record.eventType);
    if (!templateName) {
      return { ok: false, retryable: false, errorMessage: `no approved UTILITY template configured for eventType "${record.eventType}"` };
    }

    const userDoc = await deps.db.collection("users").doc(record.recipientUserId).get();
    if (deps.firestoreOps) deps.firestoreOps.reads++;
    const userData = userDoc.exists ? userDoc.data() : null;

    if (!userData?.whatsappVerifiedAt || !userData?.whatsappNumber) {
      // Eligible when enqueued, no longer eligible now (un-verified, or
      // changed number, between enqueue and this retry) -- not worth
      // retrying again, the condition won't fix itself.
      return { ok: false, retryable: false, errorMessage: "recipient is no longer WhatsApp-verified" };
    }

    const languageCode = process.env.WHATSAPP_UTILITY_LANGUAGE_CODE || "en_US";

    if (record.eventType === "qr-delivery") {
      return this.sendQrDelivery(record, deps, { to: userData.whatsappNumber, templateName, languageCode });
    }

    return sendWhatsAppTemplate({
      to: userData.whatsappNumber,
      templateName,
      languageCode,
      components: [{ type: "body", parameters: [{ type: "text", text: whatsappSummaryText(record.payload, record.eventType) }] }],
    });
  }

  /**
   * The pickup-QR send. Differs from the other utility templates in one way
   * that matters: the message carries an image, and Meta fetches that image
   * itself rather than us uploading it.
   *
   * So a fresh access token is minted here, at send time, not at enqueue --
   * which also means a cron retry mints its own rather than reusing a token
   * that has since expired or been spent. The token's hash comes back on the
   * result so markResult can persist it (see service.ts), giving a join from
   * this notification to the qr_access_log rows recording Meta's fetches.
   */
  private async sendQrDelivery(
    record: NotificationRecord,
    deps: { db: any; firestoreOps?: { reads: number; writes: number } },
    args: { to: string; templateName: string; languageCode: string },
  ): Promise<ChannelSendResult> {
    const guardianId = record.payload.guardianId;
    if (!guardianId) {
      return { ok: false, retryable: false, errorMessage: "qr-delivery record has no guardianId in its payload" };
    }

    // Meta fetches over the public internet, so a relative path or a
    // localhost origin cannot work. Failing loudly beats sending a template
    // whose image silently 404s for the recipient.
    const appUrl = process.env.APP_URL;
    if (!appUrl || !/^https:\/\//.test(appUrl)) {
      return { ok: false, retryable: false, errorMessage: "APP_URL must be set to an https origin for QR delivery" };
    }

    const guardianDoc = await deps.db.collection("guardians").doc(guardianId).get();
    if (deps.firestoreOps) deps.firestoreOps.reads++;
    const guardian = guardianDoc.exists ? guardianDoc.data() : null;

    if (!guardian || guardian.churchId !== record.churchId || guardian.deleted === true || guardian.active !== true || !guardian.qrToken) {
      // The endpoint re-checks this too. Checking here as well avoids minting
      // a token and sending a message whose image is already certain to 410.
      return { ok: false, retryable: false, errorMessage: "guardian is not available for QR delivery" };
    }

    const { raw, tokenId } = await mintQrAccessToken(
      deps.db,
      { guardianId, churchId: record.churchId, notificationId: record.id },
      { firestoreOps: deps.firestoreOps },
    );

    const result = await sendWhatsAppTemplate({
      to: args.to,
      templateName: args.templateName,
      languageCode: args.languageCode,
      components: [
        // Header image. Meta's documented contract for a `link` asset: PNG or
        // JPEG, 5 MB max, fetched from a public URL at send time and cached
        // for 10 minutes against that exact URL string. Our URLs are unique
        // per send, so that cache never serves one record's image for
        // another's. The exact component shape still needs verifying against
        // the real approved template once a WABA exists -- same caveat as
        // buildOtpTemplateComponents above; a mismatch is a loud 4xx, not a
        // silent failure.
        { type: "header", parameters: [{ type: "image", image: { link: `${appUrl.replace(/\/$/, "")}/api/qr/${raw}` } }] },
        { type: "body", parameters: [{ type: "text", text: whatsappSummaryText(record.payload, record.eventType) }] },
      ],
    });

    // Returned whether or not the send succeeded: a minted-then-unused token
    // is still a token that exists, and the audit trail should say so.
    return { ...result, meta: { qrTokenId: tokenId } };
  }
}
