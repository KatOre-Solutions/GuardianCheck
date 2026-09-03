import axios from "axios";
import type { ChannelSendResult } from "../types.js";

/**
 * The WhatsApp Cloud API sender: raw `axios` calls to Meta's Graph API, no
 * SDK or BSP (per the plan's PR 4 architecture decision -- one fewer vendor
 * dependency, and the Graph API surface used here is small).
 *
 * Two callers use this: the OTP verification flow (server.ts,
 * `/api/whatsapp/verify/start`) sends an AUTHENTICATION template right now;
 * the business-event notification pipeline (`notifyCheckins`) will send
 * UTILITY templates once PR 5 wires a `WhatsAppProvider implements
 * ChannelProvider` on top of `sendWhatsAppTemplate` below -- deferred until
 * then because which UTILITY templates exist depends on what Meta actually
 * approves, which doesn't exist yet.
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
