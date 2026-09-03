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

  private async logEmail(data: any) {
    if (!this.db) return;
    try {
      await this.db.collection("email_logs").add({
        ...data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log email:", error);
    }
  }

  private sanitizeSenderName(name: string): string {
    // Remove characters that could be used for header injection
    return name.replace(/[\r\n\t]/g, "").replace(/["\\]/g, "");
  }

  async sendInvitation(email: string, data: { firstName: string; lastName: string; role: string; churchName: string; inviteLink: string }) {
    if (!this.db) {
      console.error("Cannot send invitation: Database not initialized.");
      return;
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

      if (this.resend) {
        await this.resend.emails.send({
          from: `${senderName} <${this.fromEmail}>`,
          to: email,
          subject: subject,
          html: html,
        });
      } else {
        console.log(`[MOCK INVITATION] To: ${email} | Subject: ${subject}`);
      }

      await this.logEmail({
        churchId: "system",
        recipientEmail: email,
        eventType: "invitation",
        status: "success",
        metadata: {
          role: data.role,
          churchName: data.churchName
        }
      });

      logger.log(`Invitation email sent to ${email}`);
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
      });
      throw error;
    }
  }

  async sendVerificationEmail(email: string, firstName: string, churchName: string, verificationLink: string) {
    if (!this.db) {
      logger.error("Cannot send verification email: Database not initialized.");
      return;
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

      if (this.resend) {
        await this.resend.emails.send({
          from: `${senderName} <${this.fromEmail}>`,
          to: email,
          subject: subject,
          html: html,
        });
      } else {
        console.log(`[MOCK VERIFICATION] To: ${email} | Subject: ${subject}`);
      }

      await this.logEmail({
        churchId: "system",
        recipientEmail: email,
        eventType: "verification",
        status: "success"
      });

      logger.log(`Verification email sent to ${email}`);
    } catch (error: any) {
      console.error(`CRITICAL: Failed to send verification email to ${email}:`, error.message);
      await this.logEmail({
        churchId: "system",
        recipientEmail: email,
        eventType: "verification",
        status: "failed",
        errorMessage: error.message
      });
      throw error;
    }
  }
}
