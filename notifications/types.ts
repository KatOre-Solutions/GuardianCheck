/**
 * Shared types for the notification pipeline.
 *
 * See docs/whatsapp-communication-plan.md section 3 for the architecture this
 * implements: business transaction commits -> enqueue (Firestore write, no
 * network) -> in-request dispatch, backstopped by a daily cron sweep that
 * retries failures and reconciles anything an in-request dispatch never got
 * to. `channel` only has one live member right now -- `whatsapp` is added in
 * PR 4, once a `WhatsAppProvider` exists to register against it.
 */

export type NotificationChannel = "email";

export type NotificationEventType = "check-in" | "check-out" | "room_move" | "emergency";

export type NotificationStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "dead"
  | "skipped_allowance"
  | "skipped_optout";

/**
 * Everything a channel provider needs to render a message. Deliberately not
 * "recipient contact info" -- see `NotificationRecord` below for why that is
 * kept out of Firestore.
 */
export interface NotificationPayload {
  childName: string;
  time: string;
  roomName: string;
  churchName: string;
  serviceName?: string;
  volunteerName?: string;
  guardianName?: string;
  guardianQrToken?: string;
}

export interface ChannelSendResult {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** True for a transient provider condition worth trying again later. */
  retryable: boolean;
}

/**
 * A single channel/recipient/event notification. One `checkins` event with
 * two eligible channels for one recipient produces two of these, sharing
 * everything but `channel` (and therefore a different deterministic id --
 * see `computeNotificationId` in `service.ts`).
 *
 * Deliberately excludes the recipient's actual email/phone: `recipientMasked`
 * is what a human reviewing this collection sees, and every provider re-reads
 * the live contact address from `users`/`guardians` at send time, so a stale
 * or since-changed address in this record can never cause a misdelivery.
 */
export interface NotificationRecord {
  id: string;
  churchId: string;
  recipientUserId: string;
  checkinId: string;
  childIds: string[];
  eventKey: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  template: string;
  status: NotificationStatus;
  attempt: number;
  recipientMasked: string;
  payload: NotificationPayload;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
}

/** Threaded through from the request so notification-pipeline ops count against the same guardrail as everything else -- see server.ts's [COST_WARNING]. */
export interface NotifyContext {
  traceId?: string;
  firestoreOps?: { reads: number; writes: number };
}

export interface ChannelProvider {
  channel: NotificationChannel;
  send(record: NotificationRecord, deps: { db: any; firestoreOps?: { reads: number; writes: number } }): Promise<ChannelSendResult>;
}
