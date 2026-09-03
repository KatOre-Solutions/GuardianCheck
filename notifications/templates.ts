import { format } from "date-fns";
import he from "he";
import type { NotificationEventType, NotificationPayload } from "./types.js";

/**
 * Moved from `emailService.ts`'s `generateTemplate`. That method rendered a
 * `NotificationData` object carrying `eventType` as one of its own fields;
 * here the two are separate parameters because a `NotificationRecord`
 * (types.ts) stores them as separate top-level fields -- `eventType` selects
 * behavior (subject, color, which detail rows appear), `payload` is data.
 */
export function renderEmailHtml(payload: NotificationPayload, eventType: NotificationEventType): string {
  const { childName, time, roomName, churchName, serviceName, volunteerName, guardianName, guardianQrToken } = payload;

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
    case "check-in":
      title = "Check-In Confirmation";
      message = `<strong>${escapedChildName}</strong> has been safely checked into <strong>${escapedRoomName}</strong>.`;
      break;
    case "check-out":
      title = "Check-Out Notification";
      message = `<strong>${escapedChildName}</strong> has been checked out from <strong>${escapedRoomName}</strong>.`;
      color = "#16a34a"; // green
      break;
    case "room_move":
      title = "Room Transfer Notification";
      message = `<strong>${escapedChildName}</strong> has been moved to <strong>${escapedRoomName}</strong>.`;
      break;
    case "emergency":
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

export function emailSubject(payload: NotificationPayload, eventType: NotificationEventType): string {
  const verb = eventType === "check-in" ? "Checked In"
    : eventType === "check-out" ? "Checked Out"
    : eventType === "room_move" ? "Moved Rooms"
    : "Emergency Alert";
  const subject = `${payload.churchName} - ${payload.childName} ${verb}`;
  return eventType === "emergency" ? `URGENT: ${subject}` : subject;
}

/** Strips header-injection characters from a display name headed into a `from` field. */
export function sanitizeSenderName(name: string): string {
  return name.replace(/[\r\n\t]/g, "").replace(/["\\]/g, "");
}

/**
 * What the `notifications` collection stores in place of a real address --
 * see `NotificationRecord.recipientMasked` in types.ts. Keeps enough for a
 * human to recognise "yes, that's the right inbox" without the collection
 * ever holding a harvestable address.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}
