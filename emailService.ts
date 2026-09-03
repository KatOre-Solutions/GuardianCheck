import { Resend } from "resend";
import he from "he";

// Global Server-side Logger for EmailService
const isDev = String(process.env.VITE_DEV_MODE).toLowerCase() === "true";
const logger = {
  log: (...args: any[]) => isDev && console.log(...args),
  info: (...args: any[]) => isDev && console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => isDev && console.debug(...args),
};

/**
 * What actually happened when we asked Resend to send something.
 *
 * Resend's `emails.send()` does not throw on a rejected send -- it returns
 * `{ data, error }`. Every send method in this file used to discard that
 * return value and log `status: "success"` regardless, which meant
 * `email_logs` recorded that the HTTP call completed, not that the email was
 * accepted. `sendViaResend()` below is the one place that return value is
 * read; every caller in this class now gets an honest result instead.
 */
interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** True for a transient provider condition worth trying again later. */
  retryable: boolean;
  /** True when RESEND_API_KEY is absent and nothing was actually sent. */
  mocked?: boolean;
}

/**
 * Lets a caller thread the request's trace id and Firestore op counters into
 * this class without changing the constructor. `EmailService` is a module-
 * scope singleton (`server.ts`), so per-request context has to travel through
 * the method call, not through `this`.
 *
 * Before this, every read and write this class performed -- the child doc,
 * the parent doc, the guardians query, the email_logs write -- was invisible
 * to `req.firestoreOps` and to the `[API_LOG]`/`[COST_WARNING]` lines in
 * server.ts. A three-child guardian checkout was doing roughly a dozen
 * uncounted reads.
 */
interface SendContext {
  traceId?: string;
  firestoreOps?: { reads: number; writes: number };
}

// Resend's own classification of what it rejected. The ones here are
// transient conditions -- rate limits, quota, an internal error -- where
// sending the same email again later might succeed. Everything else
// (a malformed address, a bad API key, a validation failure) will fail again
// immediately, so retrying it is just a slower way to fail.
const RETRYABLE_RESEND_ERROR_CODES = new Set<string>([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);

export class EmailService {
  private resend: Resend | null = null;
  private db: any;
  private fromEmail: string = process.env.RESEND_FROM_EMAIL || "notifications@guardiancheck.co.za";

  constructor(db: any) {
    this.db = db;
    if (!db) {
      logger.warn("EmailService initialized without database. Logging will be disabled.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && apiKey !== "re_...") {
      this.resend = new Resend(apiKey);
      console.log("EmailService: Resend initialized successfully.");
    } else {
      console.warn("EmailService: RESEND_API_KEY not found or is placeholder. MOCK MODE ACTIVE.");
      if (this.db) {
        this.db.collection("logs").add({
            level: "warn",
            message: "EmailService initialized in MOCK MODE (missing RESEND_API_KEY)",
            timestamp: new Date().toISOString()
        }).catch(console.error);
      }
    }
  }

  async verify(): Promise<boolean> {
    if (!this.resend) return false;
    try {
      // Resend doesn't have a direct 'verify' like Nodemailer, but we can check if the client exists
      return true;
    } catch (error) {
      logger.error("Resend verification failed:", error);
      return false;
    }
  }

  private async logEmail(data: any, ctx?: SendContext) {
    if (!this.db) return;
    try {
      await this.db.collection("email_logs").add({
        ...data,
        traceId: ctx?.traceId ?? null,
        timestamp: new Date().toISOString(),
      });
      if (ctx?.firestoreOps) ctx.firestoreOps.writes++;
    } catch (error) {
      console.error("Failed to log email:", error);
    }
  }

  /**
   * The one place `this.resend.emails.send()` is called. Reads the
   * `{ data, error }` Resend actually returns -- see `SendResult` above --
   * instead of assuming success because nothing threw.
   *
   * Mock mode (no RESEND_API_KEY) is reported as `mocked: true`, not folded
   * into `ok`. The constructor used to log mock sends to `email_logs` as
   * `status: "success"`, so a misconfigured deploy looked healthy in the
   * logs; callers now log `status: "mock"` instead, which is the difference
   * between "we believe this was delivered" and "we believe nothing left the
   * building."
   */
  private async sendViaResend(payload: { from: string; to: string; subject: string; html: string }): Promise<SendResult> {
    if (!this.resend) {
      console.log(`[MOCK EMAIL] To: ${payload.to} | Subject: ${payload.subject}`);
      return { ok: true, mocked: true, retryable: false };
    }

    const { data, error } = await this.resend.emails.send(payload);

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

  private sanitizeSenderName(name: string): string {
    // Remove characters that could be used for header injection
    return name.replace(/[\r\n\t]/g, "").replace(/["\\]/g, "");
  }

  /**
   * Never throws. The caller (`POST /api/invite-user`, server.ts) already
   * treats a failed send as non-fatal -- the invitation exists in Firestore
   * either way, and the admin can copy the link manually -- so the contract
   * here is made explicit rather than relying on a try/catch the call site
   * happens to have.
   */
  async sendInvitation(email: string, data: { firstName: string; lastName: string; role: string; churchName: string; inviteLink: string }, ctx?: SendContext): Promise<SendResult> {
    if (!this.db) {
      console.error("Cannot send invitation: Database not initialized.");
      return { ok: false, retryable: false, errorMessage: "Database not initialized" };
    }

    try {
      const escapedFirstName = he.escape(data.firstName);
      const escapedChurchName = he.escape(data.churchName);
      const escapedRole = he.escape(data.role);

      const subject = `Invitation to join ${escapedChurchName} on GuardianCheck`;
      const senderName = this.sanitizeSenderName(`${data.churchName} via GuardianCheck`);
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
            .footer { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to GuardianCheck</h1>
            </div>
            <div class="content">
              <p>Hello ${escapedFirstName},</p>
              <p>You have been invited to join <strong>${escapedChurchName}</strong> as a <strong>${escapedRole}</strong> on GuardianCheck, our secure child check-in platform.</p>
              <p>Click the button below to accept your invitation and set up your account:</p>
              <div style="text-align: center;">
                <a href="${data.inviteLink}" class="button">Accept Invitation</a>
              </div>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-size: 12px; color: #666;">${data.inviteLink}</p>
              <p>This invitation will expire in 7 days.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} GuardianCheck. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const result = await this.sendViaResend({
        from: `${senderName} <${this.fromEmail}>`,
        to: email,
        subject: subject,
        html: html,
      });

      const metadata = { role: data.role, churchName: data.churchName };

      if (result.ok) {
        await this.logEmail({
          churchId: "system",
          recipientEmail: email,
          eventType: "invitation",
          status: result.mocked ? "mock" : "success",
          providerMessageId: result.providerMessageId ?? null,
          metadata,
        }, ctx);
        logger.log(`Invitation email sent to ${email}`);
      } else {
        console.error(`Failed to send invitation email to ${email}: [${result.errorCode}] ${result.errorMessage}`);
        await this.logEmail({
          churchId: "system",
          recipientEmail: email,
          eventType: "invitation",
          status: "failed",
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage,
          retryable: result.retryable,
          metadata,
        }, ctx);
      }

      return result;
    } catch (error: any) {
      console.error(`CRITICAL: Failed to send invitation email to ${email}:`, error.message);
      await this.logEmail({
        churchId: "system",
        recipientEmail: email,
        eventType: "invitation",
        status: "failed",
        errorMessage: error.message,
        metadata: {
          role: data.role,
          churchName: data.churchName
        }
      }, ctx);
      return { ok: false, retryable: false, errorMessage: error.message };
    }
  }

  /**
   * Never throws. It used to, and both callers (church registration and
   * invite acceptance in server.ts) let that exception propagate into
   * destructive failure handling: registration rolled back the church, the
   * public projection and deleted the customer's Firebase Auth account;
   * accept-invite returned a 500 after the single-use invitation had already
   * been marked accepted, stranding the account. Neither failure mode should
   * exist because a transactional email provider had a bad moment. Callers
   * now get a `SendResult` and decide for themselves how to degrade --
   * mirroring how `sendInvitation`'s caller already treats a failed send as
   * "the important thing (the account/invitation) still exists."
   */
  async sendVerificationEmail(email: string, firstName: string, churchName: string, verificationLink: string, ctx?: SendContext): Promise<SendResult> {
    if (!this.db) {
      logger.error("Cannot send verification email: Database not initialized.");
      return { ok: false, retryable: false, errorMessage: "Database not initialized" };
    }

    try {
      const escapedFirstName = he.escape(firstName);
      const escapedChurchName = he.escape(churchName);
      const subject = `Verify your email for ${escapedChurchName}`;
      const senderName = this.sanitizeSenderName(`${churchName} via GuardianCheck`);
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
            .footer { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Email Verification</h1>
            </div>
            <div class="content">
              <p>Hello ${escapedFirstName},</p>
              <p>Thank you for joining <strong>${escapedChurchName}</strong> on GuardianCheck. Please verify your email address to access your account features.</p>
              <div style="text-align: center;">
                <a href="${verificationLink}" class="button">Verify Email Address</a>
              </div>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-size: 12px; color: #666;">${verificationLink}</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} GuardianCheck. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const result = await this.sendViaResend({
        from: `${senderName} <${this.fromEmail}>`,
        to: email,
        subject: subject,
        html: html,
      });

      if (result.ok) {
        await this.logEmail({
          churchId: "system",
          recipientEmail: email,
          eventType: "verification",
          status: result.mocked ? "mock" : "success",
          providerMessageId: result.providerMessageId ?? null,
        }, ctx);
        logger.log(`Verification email sent to ${email}`);
      } else {
        console.error(`Failed to send verification email to ${email}: [${result.errorCode}] ${result.errorMessage}`);
        await this.logEmail({
          churchId: "system",
          recipientEmail: email,
          eventType: "verification",
          status: "failed",
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage,
          retryable: result.retryable,
        }, ctx);
      }

      return result;
    } catch (error: any) {
      console.error(`CRITICAL: Failed to send verification email to ${email}:`, error.message);
      await this.logEmail({
        churchId: "system",
        recipientEmail: email,
        eventType: "verification",
        status: "failed",
        errorMessage: error.message
      }, ctx);
      return { ok: false, retryable: false, errorMessage: error.message };
    }
  }
}
