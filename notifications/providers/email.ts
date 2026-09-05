import { Resend } from "resend";
import { renderEmailHtml, emailSubject, sanitizeSenderName } from "../templates.js";
import { renderGuardianQrPng } from "../qr-image.js";
import type { ChannelProvider, ChannelSendResult, NotificationRecord } from "../types.js";

/**
 * Resend's own classification of what it rejected. Duplicated from
 * `emailService.ts` rather than imported: the two are deliberately
 * independent send paths (this one is the notification pipeline's channel
 * provider; `emailService.ts` remains only for invite/verification
 * transactional mail), matching the "each channel provider self-contained,
 * swappable" shape the WhatsApp provider in PR 4 will also follow.
 */
const RETRYABLE_RESEND_ERROR_CODES = new Set<string>([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);

/** The `cid` the check-in template's <img> refers to. Arbitrary, but it must match on both sides. */
const QR_CONTENT_ID = "pickup-qr";

/**
 * The email `ChannelProvider`. Deliberately re-reads the recipient's live
 * address at send time (`users`/`guardians`, by `recipientUserId`) instead of
 * trusting anything stored on the notification record -- see
 * `NotificationRecord` in types.ts for why no address is ever persisted
 * there. This also means an address changed after enqueue is picked up
 * automatically, including by a retry hours later from the cron sweep.
 */
export class EmailProvider implements ChannelProvider {
  readonly channel = "email" as const;
  private resend: Resend | null = null;
  private fromEmail: string = process.env.RESEND_FROM_EMAIL || "notifications@guardiancheck.co.za";

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && apiKey !== "re_...") {
      this.resend = new Resend(apiKey);
    } else {
      console.warn("EmailProvider: RESEND_API_KEY not found or is placeholder. MOCK MODE ACTIVE.");
    }
  }

  private async resolveEmail(db: any, recipientUserId: string, firestoreOps?: { reads: number; writes: number }): Promise<string | null> {
    const isGuardian = recipientUserId.startsWith("guardian:");
    const doc = isGuardian
      ? await db.collection("guardians").doc(recipientUserId.slice("guardian:".length)).get()
      : await db.collection("users").doc(recipientUserId).get();
    if (firestoreOps) firestoreOps.reads++;
    return doc.exists ? (doc.data().email ?? null) : null;
  }

  /**
   * The pickup QR for a check-in email, as an inline attachment.
   *
   * Resolved here rather than carried on the record: the payload holds a
   * guardian id, and the live token is read at send time, so a token rotated
   * between enqueue and a cron retry still produces a QR that works. Returns
   * null whenever there is nothing safe to render -- the template treats the
   * QR block as optional and simply omits it.
   */
  private async resolveQrAttachment(
    record: NotificationRecord,
    deps: { db: any; firestoreOps?: { reads: number; writes: number } },
  ): Promise<{ filename: string; content: string; contentId: string } | null> {
    if (record.eventType !== "check-in") return null;

    const guardianId = record.payload.guardianId;
    if (!guardianId) {
      // A record enqueued before this field existed carries the old
      // `guardianQrToken` instead. Rendering without a QR is the right
      // fallback -- but it is a parent receiving a check-in email with no way
      // to collect their child, so it must not pass silently. Expected only
      // during the deploy window, from the cron sweep retrying records
      // enqueued by the previous version. The token is deliberately not
      // logged.
      if ((record.payload as any).guardianQrToken) {
        console.warn(
          `[QR_FALLBACK] check-in email sent without QR -- legacy payload shape ${JSON.stringify({
            notificationId: record.id,
            churchId: record.churchId,
          })}`,
        );
      }
      return null;
    }

    const doc = await deps.db.collection("guardians").doc(guardianId).get();
    if (deps.firestoreOps) deps.firestoreOps.reads++;
    const g = doc.exists ? doc.data() : null;

    // Same church, still active, not deleted. A deactivated guardian's QR
    // does not resolve at checkout (resolveGuardianByToken), so emailing one
    // would be handing out a code that cannot work.
    if (!g || g.churchId !== record.churchId || g.deleted === true || g.active !== true || !g.qrToken) {
      return null;
    }

    const png = await renderGuardianQrPng(g.qrToken);
    return { filename: "pickup-qr.png", content: png.toString("base64"), contentId: QR_CONTENT_ID };
  }

  async send(record: NotificationRecord, deps: { db: any; firestoreOps?: { reads: number; writes: number } }): Promise<ChannelSendResult> {
    const email = await this.resolveEmail(deps.db, record.recipientUserId, deps.firestoreOps);
    if (!email) {
      return { ok: false, retryable: false, errorMessage: "recipient has no email on file" };
    }

    const qrAttachment = await this.resolveQrAttachment(record, deps);
    const html = renderEmailHtml(record.payload, record.eventType, qrAttachment ? { qrCid: QR_CONTENT_ID } : undefined);
    const subject = emailSubject(record.payload, record.eventType);
    const senderName = sanitizeSenderName(`${record.payload.churchName} via GuardianCheck`);

    if (!this.resend) {
      console.log(`[MOCK NOTIFICATION EMAIL] To: ${email} | Subject: ${subject} | QR attached: ${qrAttachment ? "yes" : "no"}`);
      return { ok: true, retryable: false };
    }

    const { data, error } = await this.resend.emails.send({
      from: `${senderName} <${this.fromEmail}>`,
      to: email,
      subject,
      html,
      ...(qrAttachment ? { attachments: [qrAttachment] } : {}),
    });

    if (error) {
      return {
        ok: false,
        errorCode: error.name,
        errorMessage: error.message,
        retryable: RETRYABLE_RESEND_ERROR_CODES.has(error.name),
      };
    }

    return { ok: true, providerMessageId: data?.id, retryable: false };
  }

  /**
   * A plain send, bypassing the check-in/out template entirely -- for
   * operational notices that aren't tied to a `NotificationRecord` at all
   * (right now: the WhatsApp allowance-exhaustion notice to a church's
   * admins, service.ts). Reuses this instance's already-initialised client
   * and mock-mode behavior rather than standing up a second Resend client.
   */
  async sendRaw(to: string, subject: string, html: string): Promise<ChannelSendResult> {
    if (!this.resend) {
      console.log(`[MOCK NOTIFICATION EMAIL] To: ${to} | Subject: ${subject}`);
      return { ok: true, retryable: false };
    }

    const { data, error } = await this.resend.emails.send({
      from: `GuardianCheck <${this.fromEmail}>`,
      to,
      subject,
      html,
    });

    if (error) {
      return { ok: false, errorCode: error.name, errorMessage: error.message, retryable: RETRYABLE_RESEND_ERROR_CODES.has(error.name) };
    }

    return { ok: true, providerMessageId: data?.id, retryable: false };
  }
}
