import nodemailer from "nodemailer";
import { format } from "date-fns";
import he from "he";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface NotificationData {
  childName: string;
  time: string;
  roomName: string;
  churchName: string;
  serviceName?: string;
  eventType: 'check-in' | 'check-out' | 'duplicate_blocked' | 'room_move' | 'emergency';
  volunteerName?: string;
  guardianName?: string;
  guardianQrToken?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private db: any;
  private cooldowns: Map<string, number> = new Map();

  constructor(db: any) {
    this.db = db;
    if (!db) {
      console.warn("EmailService initialized without database. Logging will be disabled.");
    }
    
    // Configure transporter
    // In a real app, these would come from process.env
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.ethereal.email",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "mock_user",
        pass: process.env.SMTP_PASS || "mock_pass",
      },
    });
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("SMTP Verification failed:", error);
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

  private getCooldownKey(childId: string, eventType: string): string {
    return `${childId}_${eventType}`;
  }

  private isRateLimited(childId: string, eventType: string): boolean {
    const key = this.getCooldownKey(childId, eventType);
    const lastSent = this.cooldowns.get(key);
    const now = Date.now();
    
    // 2 minute cooldown for identical events
    if (lastSent && now - lastSent < 120000) {
      return true;
    }
    
    this.cooldowns.set(key, now);
    return false;
  }

  private generateTemplate(data: NotificationData): string {
    const { childName, time, roomName, churchName, serviceName, eventType, volunteerName, guardianName, guardianQrToken } = data;
    
    // Escape user-provided strings
    const escapedChildName = he.escape(childName);
    const escapedRoomName = he.escape(roomName);
    const escapedChurchName = he.escape(churchName);
    const escapedServiceName = serviceName ? he.escape(serviceName) : "";
    const escapedVolunteerName = volunteerName ? he.escape(volunteerName) : "";
    const escapedGuardianName = guardianName ? he.escape(guardianName) : "";

    let title = "";
    let message = "";
    let color = "#2563eb"; // blue

    switch (eventType) {
      case 'check-in':
        title = "Check-In Confirmation";
        message = `<strong>${escapedChildName}</strong> has been safely checked into <strong>${escapedRoomName}</strong>.`;
        break;
      case 'check-out':
        title = "Check-Out Notification";
        message = `<strong>${escapedChildName}</strong> has been checked out from <strong>${escapedRoomName}</strong>.`;
        color = "#16a34a"; // green
        break;
      case 'duplicate_blocked':
        title = "Security Alert: Duplicate Check-In";
        message = `A duplicate check-in attempt was blocked for <strong>${escapedChildName}</strong>.`;
        color = "#dc2626"; // red
        break;
      case 'room_move':
        title = "Room Transfer Notification";
        message = `<strong>${escapedChildName}</strong> has been moved to <strong>${escapedRoomName}</strong>.`;
        break;
      case 'emergency':
        title = "EMERGENCY ALERT";
        message = `An emergency alert has been triggered for <strong>${escapedChurchName}</strong>. Please follow safety protocols.`;
        color = "#dc2626"; // red
        break;
    }

    const qrCodeUrl = guardianQrToken 
      ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(guardianQrToken)}`
      : null;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; }
          .header { background-color: ${color}; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 20px; }
          .footer { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
          .details { background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-top: 15px; }
          .detail-item { margin-bottom: 10px; }
          .detail-label { font-weight: bold; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
          .detail-value { font-size: 14px; color: #111827; font-weight: 500; }
          .qr-section { text-align: center; margin-top: 20px; padding: 20px; border: 2px dashed #e5e7eb; border-radius: 12px; }
          .qr-hint { font-size: 11px; color: #6b7280; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0; font-size: 24px;">${title}</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px;">${message}</p>
            
            <div class="details">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="detail-item">
                  <div class="detail-label">Church</div>
                  <div class="detail-value">${escapedChurchName}</div>
                </div>
                <div class="detail-item">
                  <div class="detail-label">Time</div>
                  <div class="detail-value">${format(new Date(time), "h:mm a")}</div>
                </div>
                <div class="detail-item">
                  <div class="detail-label">Room</div>
                  <div class="detail-value">${escapedRoomName}</div>
                </div>
                ${serviceName ? `
                <div class="detail-item">
                  <div class="detail-label">Service</div>
                  <div class="detail-value">${escapedServiceName}</div>
                </div>` : ''}
                
                ${volunteerName ? `
                <div class="detail-item">
                  <div class="detail-label">Volunteer</div>
                  <div class="detail-value">${escapedVolunteerName}</div>
                </div>` : ''}
                
                ${guardianName ? `
                <div class="detail-item">
                  <div class="detail-label">${eventType === 'check-in' ? 'Dropped Off By' : 'Picked Up By'}</div>
                  <div class="detail-value">${escapedGuardianName}</div>
                </div>` : ''}
              </div>
            </div>

            ${qrCodeUrl ? `
            <div class="qr-section">
              <div class="detail-label" style="margin-bottom: 10px;">Pickup QR Code</div>
              <img src="${qrCodeUrl}" alt="Pickup QR Code" width="150" height="150" style="display: block; margin: 0 auto;" />
              <p class="qr-hint">Show this QR code to the volunteer when picking up your child.</p>
            </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>This is an automated notification from ${escapedChurchName} Check-In System.</p>
            <p>&copy; ${new Date().getFullYear()} GuardianCheck</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private sanitizeSenderName(name: string): string {
    // Remove characters that could be used for header injection
    return name.replace(/[\r\n\t]/g, "").replace(/["\\]/g, "");
  }

  async sendNotification(churchId: string, childId: string, data: NotificationData) {
    if (!this.db) {
      console.error("Cannot send notification: Database not initialized.");
      return;
    }
    if (this.isRateLimited(childId, data.eventType)) {
      console.log(`Rate limited: Skipping email for ${childId} - ${data.eventType}`);
      return;
    }

    try {
      // 1. Find the parent/guardians
      const recipients: string[] = [];
      
      // Get the child to find parentId
      const childDoc = await this.db.collection("children").doc(childId).get();
      if (childDoc.exists) {
        const parentId = childDoc.data().parentId;
        if (parentId) {
          const parentDoc = await this.db.collection("users").doc(parentId).get();
          if (parentDoc.exists && parentDoc.data().email) {
            recipients.push(parentDoc.data().email);
          }
        }
      }

      // Get guardians linked to this child
      const guardiansSnapshot = await this.db.collection("guardians")
        .where("churchId", "==", churchId)
        .where("childIds", "array-contains", childId)
        .where("active", "==", true)
        .get();
      
      guardiansSnapshot.forEach((doc: any) => {
        const gData = doc.data();
        if (gData.email) {
          recipients.push(gData.email);
        }
      });

      // Remove duplicates
      const uniqueRecipients = [...new Set(recipients)];

      if (uniqueRecipients.length === 0) {
        console.log("No recipients found for child:", childId);
        return;
      }

      const html = this.generateTemplate(data);
      const subject = `${data.churchName} - ${data.childName} ${data.eventType === 'check-in' ? 'Checked In' : 'Checked Out'}`;
      const senderName = this.sanitizeSenderName(`${data.churchName} via GuardianCheck`);

      // 2. Send emails
      for (const email of uniqueRecipients) {
        try {
          await this.transporter.sendMail({
            from: `"${senderName}" <${process.env.SMTP_FROM || "noreply@guardiancheck.com"}>`,
            to: email,
            subject: data.eventType === 'emergency' ? `URGENT: ${subject}` : subject,
            html: html,
          });

          await this.logEmail({
            churchId,
            recipientEmail: email,
            childId,
            childName: data.childName,
            eventType: data.eventType,
            status: "success",
            metadata: {
              roomName: data.roomName,
              serviceName: data.serviceName || "N/A",
            }
          });
        } catch (sendError: any) {
          console.error(`Failed to send email to ${email}:`, sendError.message);
          await this.logEmail({
            churchId,
            recipientEmail: email,
            childId,
            childName: data.childName,
            eventType: data.eventType,
            status: "failed",
            errorMessage: sendError.message,
            metadata: {
              roomName: data.roomName,
              serviceName: data.serviceName || "N/A",
            }
          });
        }
      }
    } catch (error: any) {
      console.error("Error in sendNotification:", error.message);
    }
  }

  async sendEmergencyAlert(churchId: string, churchName: string) {
    try {
      // For emergency, we might want to notify ALL active parents/guardians in the church
      // Or just those currently checked in. The requirement says "Emergency alert triggered by Admin".
      // Let's notify all parents/guardians of children currently checked in.
      
      const activeCheckins = await this.db.collection("checkins")
        .where("churchId", "==", churchId)
        .where("status", "==", "checked-in")
        .get();
      
      const processedChildren = new Set<string>();

      for (const doc of activeCheckins.docs) {
        const checkin = doc.data();
        if (!processedChildren.has(checkin.childId)) {
          processedChildren.add(checkin.childId);
          await this.sendNotification(churchId, checkin.childId, {
            childName: checkin.childName,
            time: new Date().toISOString(),
            roomName: checkin.roomName,
            churchName: churchName,
            serviceName: checkin.serviceName,
            eventType: 'emergency'
          });
        }
      }
    } catch (error: any) {
      console.error("Error sending emergency alert:", error.message);
    }
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

      await this.transporter.sendMail({
        from: `"${senderName}" <${process.env.SMTP_FROM || "noreply@guardiancheck.com"}>`,
        to: email,
        subject: subject,
        html: html,
      });

      await this.logEmail({
        churchId: "system", // Or pass churchId if available
        recipientEmail: email,
        eventType: "invitation",
        status: "success",
        metadata: {
          role: data.role,
          churchName: data.churchName
        }
      });

      console.log(`Invitation email sent to ${email}`);
    } catch (error: any) {
      console.error(`Failed to send invitation email to ${email}:`, error.message);
      throw error;
    }
  }

  async sendVerificationEmail(email: string, firstName: string, churchName: string, verificationLink: string) {
    if (!this.db) {
      console.error("Cannot send verification email: Database not initialized.");
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

      await this.transporter.sendMail({
        from: `"${senderName}" <${process.env.SMTP_FROM || "noreply@guardiancheck.com"}>`,
        to: email,
        subject: subject,
        html: html,
      });

      await this.logEmail({
        churchId: "system",
        recipientEmail: email,
        eventType: "verification",
        status: "success"
      });

      console.log(`Verification email sent to ${email}`);
    } catch (error: any) {
      console.error(`Failed to send verification email to ${email}:`, error.message);
      throw error;
    }
  }
}
