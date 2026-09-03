/**
 * Shared types for the notification pipeline.
 *
 * See docs/whatsapp-communication-plan.md section 3 for the architecture this
 * implements: business transaction commits -> enqueue (Firestore write, no
 * network) -> in-request dispatch, backstopped by a daily cron sweep that
 * retries failures and reconciles anything an in-request dispatch never got
 * to.
 *
 * Reconciliation (service.ts's reconcileRecentCheckins) only ever backfills
 * `email` -- deliberately. Per the plan's product decisions, email is the
 * one permanent, always-guaranteed channel; WhatsApp is supplementary and
 * opportunistic (eligibility, allowance and consolidation all live only in
 * the in-request path). A WhatsApp send that never got enqueued because the
 * request crashed before notifyCheckins ran is not backfilled by the sweep
 * -- the family still hears about it by email, which the sweep does cover.
 */

export type NotificationChannel = "email" | "whatsapp";

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
  /**
   * Set only on a consolidated WhatsApp record covering more than one child
   * (e.g. a guardian collecting several siblings in one checkout batch) --
   * see buildConsolidatedPayload() in service.ts. `childName`/`roomName`
   * above still describe the first child for anything that doesn't know
   * about consolidation (the email template never sets this and keeps
   * rendering the single-child fields it always has).
   */
  children?: Array<{ childName: string; roomName: string }>;
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
