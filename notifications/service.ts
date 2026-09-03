import crypto from "crypto";
import { resolveRecipients, type Recipient } from "./recipients.js";
import { maskEmail } from "./templates.js";
import type {
  ChannelProvider,
  ChannelSendResult,
  NotificationEventType,
  NotificationPayload,
  NotificationRecord,
  NotifyContext,
} from "./types.js";

/**
 * Total attempts (the in-request send counts as attempt 1) before a
 * persistently-retryable failure is given up on as `dead`. The cron sweep
 * that supplies the retries beyond the first runs at most once a day (see
 * the `crons` entry in vercel.json -- this project is on Vercel's Hobby
 * plan, which does not offer finer-grained cron scheduling), so this is a
 * multi-day backstop for a transient provider condition, not a fast retry
 * loop. The in-request dispatch is what makes the common case fast; this
 * bounds the uncommon one.
 */
const MAX_ATTEMPTS = 5;

/** A "sending" record older than this survived a crash mid-dispatch (the function was killed after claiming it but before the provider call returned) and is eligible to be reclaimed. */
const STALE_SENDING_MS = 5 * 60 * 1000;

export const NOTIFICATIONS_COLLECTION = "notifications";

/**
 * The durable-intent invariant (plan section 3): every notification's id is
 * a pure function of the event it represents, who it's for, and which
 * channel -- never a random id. That's what lets `enqueueOne` below use
 * Firestore's `create()` (fails if the document exists) as an idempotency
 * check, and what lets the reconciliation sweep re-derive the exact same id
 * for an event it's seeing for the first time and safely no-op for one it's
 * already recorded.
 */
export function computeNotificationId(eventKey: string, recipientKey: string, channel: string): string {
  return crypto.createHash("sha256").update(`${eventKey}:${recipientKey}:${channel}`).digest("hex").slice(0, 32);
}

/** `${eventType}:${checkinId}:${occurredAt}` -- see the module doc below for why `occurredAt` has to be the value persisted on the `checkins` document, not a fresh timestamp taken at notify time. */
export function buildEventKey(eventType: NotificationEventType, checkinId: string, occurredAt: string): string {
  return `${eventType}:${checkinId}:${occurredAt}`;
}

interface EnqueueArgs {
  churchId: string;
  checkinId: string;
  eventKey: string;
  eventType: NotificationEventType;
  childId: string;
  recipient: Recipient;
  payload: NotificationPayload;
  traceId?: string | null;
}

/**
 * Writes one notification record via `create()`. A duplicate call for the
 * same event/recipient/channel (a retried request, an overlapping
 * reconciliation pass) lands on the same id and is treated as a no-op
 * success rather than an error -- that is the idempotency the deterministic
 * id exists for.
 */
async function enqueueOne(db: any, args: EnqueueArgs, ctx?: NotifyContext): Promise<string> {
  const channel = "email";
  const id = computeNotificationId(args.eventKey, args.recipient.userId, channel);
  const now = new Date().toISOString();

  try {
    await db.collection(NOTIFICATIONS_COLLECTION).doc(id).create({
      churchId: args.churchId,
      recipientUserId: args.recipient.userId,
      checkinId: args.checkinId,
      childIds: [args.childId],
      eventKey: args.eventKey,
      eventType: args.eventType,
      channel,
      template: args.eventType,
      status: "queued",
      attempt: 0,
      recipientMasked: maskEmail(args.recipient.email),
      payload: args.payload,
      providerMessageId: null,
      errorCode: null,
      errorMessage: null,
      traceId: args.traceId ?? null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
    });
    if (ctx?.firestoreOps) ctx.firestoreOps.writes++;
  } catch (err: any) {
    // gRPC code 6 = ALREADY_EXISTS. Anything else is a real failure.
    if (err?.code !== 6 && err?.code !== "already-exists") throw err;
  }

  return id;
}

/**
 * Claims a record for dispatch with a `queued`/stale-`sending`/retryable-
 * `failed` -> `sending` compare-and-set, inside a transaction so an
 * in-request dispatch racing the cron sweep's retry pass can't both send the
 * same message.
 */
export async function claimForDispatch(db: any, id: string, ctx?: NotifyContext): Promise<NotificationRecord | null> {
  const ref = db.collection(NOTIFICATIONS_COLLECTION).doc(id);

  return db.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
    if (!doc.exists) return null;

    const data = doc.data();
    const staleSending = data.status === "sending" && Date.now() - new Date(data.updatedAt).getTime() > STALE_SENDING_MS;
    const claimable = data.status === "queued" || staleSending || (data.status === "failed" && data.attempt < MAX_ATTEMPTS);
    if (!claimable) return null;

    const patch = { status: "sending", attempt: (data.attempt ?? 0) + 1, updatedAt: new Date().toISOString() };
    tx.update(ref, patch);
    if (ctx?.firestoreOps) ctx.firestoreOps.writes++;

    return { id: doc.id, ...data, ...patch } as NotificationRecord;
  });
}

async function markResult(db: any, record: NotificationRecord, result: ChannelSendResult, ctx?: NotifyContext): Promise<"sent" | "failed" | "dead"> {
  const now = new Date().toISOString();
  const ref = db.collection(NOTIFICATIONS_COLLECTION).doc(record.id);
  let patch: any;
  let outcome: "sent" | "failed" | "dead";

  if (result.ok) {
    outcome = "sent";
    patch = { status: "sent", sentAt: now, updatedAt: now, providerMessageId: result.providerMessageId ?? null, errorCode: null, errorMessage: null };
  } else if (result.retryable && record.attempt < MAX_ATTEMPTS) {
    outcome = "failed";
    patch = { status: "failed", updatedAt: now, errorCode: result.errorCode ?? null, errorMessage: result.errorMessage ?? null };
  } else {
    outcome = "dead";
    patch = { status: "dead", failedAt: now, updatedAt: now, errorCode: result.errorCode ?? null, errorMessage: result.errorMessage ?? null };
  }

  await ref.update(patch);
  if (ctx?.firestoreOps) ctx.firestoreOps.writes++;
  return outcome;
}

export interface DispatchOutcome {
  id: string;
  result: "sent" | "failed" | "dead" | "skipped";
}

/**
 * Claims and sends one record. Never throws -- a provider exception (a
 * network error the SDK itself raised, not a `{data,error}` rejection) is
 * caught and treated as a retryable failure, the same way a rejected send
 * is, so one bad send in a batch can't take the others down via
 * `Promise.all` and never leaves a record stuck in `sending` until the
 * 5-minute stale window closes it out.
 */
export async function dispatchOne(db: any, id: string, providers: Partial<Record<string, ChannelProvider>>, ctx?: NotifyContext): Promise<DispatchOutcome> {
  const record = await claimForDispatch(db, id, ctx);
  if (!record) return { id, result: "skipped" };

  const provider = providers[record.channel];
  let sendResult: ChannelSendResult;
  if (!provider) {
    sendResult = { ok: false, retryable: false, errorMessage: `no provider registered for channel "${record.channel}"` };
  } else {
    try {
      sendResult = await provider.send(record, { db, firestoreOps: ctx?.firestoreOps });
    } catch (err: any) {
      sendResult = { ok: false, retryable: true, errorMessage: err?.message ?? String(err) };
    }
  }

  const outcome = await markResult(db, record, sendResult, ctx);
  return { id, result: outcome };
}

export async function dispatchMany(db: any, ids: string[], providers: Partial<Record<string, ChannelProvider>>, ctx?: NotifyContext): Promise<DispatchOutcome[]> {
  return Promise.all(ids.map((id) => dispatchOne(db, id, providers, ctx)));
}

export interface Occurrence {
  checkinId: string;
  eventType: NotificationEventType;
  childId: string;
  eventKey: string;
  payload: NotificationPayload;
}

export interface NotifySummary {
  enqueued: number;
  sent: number;
  failed: number;
}

/**
 * The single orchestration entry point every call site in server.ts uses:
 * resolve recipients and enqueue for every occurrence in parallel (fast --
 * Firestore writes only, no network), then dispatch everything that was
 * enqueued in parallel. This is what replaces the old serial
 * `for (...) await emailService.sendNotification(...)` loops in the
 * guardian-checkout and emergency-alert handlers -- up to 20 awaited network
 * calls in a row, one per child, on a request a volunteer is standing at a
 * kiosk waiting on.
 */
export async function notifyCheckins(
  db: any,
  churchId: string,
  occurrences: Occurrence[],
  providers: Partial<Record<string, ChannelProvider>>,
  ctx?: NotifyContext,
): Promise<NotifySummary> {
  const idBatches = await Promise.all(
    occurrences.map(async (occ) => {
      const recipients = await resolveRecipients(db, churchId, occ.childId, ctx);
      return Promise.all(
        recipients.map((recipient) =>
          enqueueOne(db, {
            churchId,
            checkinId: occ.checkinId,
            eventKey: occ.eventKey,
            eventType: occ.eventType,
            childId: occ.childId,
            recipient,
            payload: occ.payload,
            traceId: ctx?.traceId,
          }, ctx),
        ),
      );
    }),
  );

  const allIds = idBatches.flat();
  const results = await dispatchMany(db, allIds, providers, ctx);

  return {
    enqueued: allIds.length,
    sent: results.filter((r) => r.result === "sent").length,
    failed: results.filter((r) => r.result === "failed" || r.result === "dead").length,
  };
}

// --- Cron sweep -------------------------------------------------------
//
// Two independent jobs, run together because this repo's Vercel plan only
// grants one cron invocation a day and both need to happen somewhere:
//
//   1. Retry: anything `queued` (enqueued but never dispatched -- the
//      request crashed between the two), retryable-`failed` under the
//      attempt cap, or stuck `sending` past the stale window (the function
//      was killed mid-send).
//   2. Reconcile: `checkins` updated recently whose current status has no
//      matching notification record at all -- the request crashed before
//      `notifyCheckins` ever got called. Scoped to check-in/check-out only,
//      matching the plan: room-move and emergency are one-off actions an
//      admin can just retry, not safeguarding events with the same durable-
//      intent obligation as a check-in/check-out record.
//
// Every query here is a single equality (or, for the checkins scan, a single
// range) filter with any further narrowing done in application code, so none
// of it needs a composite index provisioned before it can run in production.

const RECONCILE_LOOKBACK_HOURS = 26; // > 24h, so a once-daily cron with any jitter still has full overlap with the previous run's window

async function findRetryCandidates(db: any, ctx?: NotifyContext): Promise<string[]> {
  const ids: string[] = [];

  const queuedSnap = await db.collection(NOTIFICATIONS_COLLECTION).where("status", "==", "queued").limit(500).get();
  if (ctx?.firestoreOps) ctx.firestoreOps.reads += queuedSnap.size;
  queuedSnap.forEach((d: any) => ids.push(d.id));

  const failedSnap = await db.collection(NOTIFICATIONS_COLLECTION).where("status", "==", "failed").limit(500).get();
  if (ctx?.firestoreOps) ctx.firestoreOps.reads += failedSnap.size;
  failedSnap.forEach((d: any) => {
    if ((d.data().attempt ?? 0) < MAX_ATTEMPTS) ids.push(d.id);
  });

  const staleCutoff = Date.now() - STALE_SENDING_MS;
  const sendingSnap = await db.collection(NOTIFICATIONS_COLLECTION).where("status", "==", "sending").limit(500).get();
  if (ctx?.firestoreOps) ctx.firestoreOps.reads += sendingSnap.size;
  sendingSnap.forEach((d: any) => {
    if (new Date(d.data().updatedAt).getTime() < staleCutoff) ids.push(d.id);
  });

  return ids;
}

function payloadFromCheckin(c: any, eventType: NotificationEventType, occurredAt: string, churchName: string): NotificationPayload {
  return {
    childName: c.childName,
    time: occurredAt,
    roomName: c.roomName,
    churchName,
    serviceName: c.serviceName,
    volunteerName: eventType === "check-out" ? c.checkOutVolunteerName : c.volunteerName,
    guardianName: c.guardianName,
    // guardianQrToken is intentionally not reconstructed here -- it's a
    // convenience the in-request path had at hand and this crash-recovery
    // path doesn't; the template already treats it as optional.
  };
}

async function reconcileRecentCheckins(db: any, ctx?: NotifyContext): Promise<string[]> {
  const cutoff = new Date(Date.now() - RECONCILE_LOOKBACK_HOURS * 3600 * 1000).toISOString();
  const snap = await db.collection("checkins").where("updatedAt", ">=", cutoff).limit(500).get();
  if (ctx?.firestoreOps) ctx.firestoreOps.reads += snap.size;

  const churchNameCache = new Map<string, string>();
  const newIds: string[] = [];

  await Promise.all(
    snap.docs.map(async (doc: any) => {
      const c = doc.data();
      const eventType: NotificationEventType | null =
        c.status === "checked-in" ? "check-in" : c.status === "checked-out" ? "check-out" : null;
      if (!eventType) return;

      const occurredAt = eventType === "check-in" ? c.checkInTime : c.checkOutTime;
      if (!occurredAt) return;

      const eventKey = buildEventKey(eventType, doc.id, occurredAt);
      const recipients = await resolveRecipients(db, c.churchId, c.childId, ctx);
      if (recipients.length === 0) return;

      let churchName = churchNameCache.get(c.churchId);
      if (churchName === undefined) {
        const churchDoc = await db.collection("church_public").doc(c.churchId).get();
        if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
        churchName = churchDoc.exists ? churchDoc.data().name : "Church";
        churchNameCache.set(c.churchId, churchName);
      }

      const payload = payloadFromCheckin(c, eventType, occurredAt, churchName);

      for (const recipient of recipients) {
        const id = computeNotificationId(eventKey, recipient.userId, "email");
        const existing = await db.collection(NOTIFICATIONS_COLLECTION).doc(id).get();
        if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
        if (existing.exists) continue; // already recorded by the in-request path -- not this sweep's job

        await enqueueOne(db, {
          churchId: c.churchId,
          checkinId: doc.id,
          eventKey,
          eventType,
          childId: c.childId,
          recipient,
          payload,
        }, ctx);
        newIds.push(id);
      }
    }),
  );

  return newIds;
}

export interface SweepSummary {
  retried: number;
  reconciled: number;
  dispatched: number;
  sent: number;
  failed: number;
}

export async function runNotificationSweep(db: any, providers: Partial<Record<string, ChannelProvider>>, ctx?: NotifyContext): Promise<SweepSummary> {
  const retryIds = await findRetryCandidates(db, ctx);
  const reconciledIds = await reconcileRecentCheckins(db, ctx);

  const allIds = Array.from(new Set([...retryIds, ...reconciledIds]));
  const results = await dispatchMany(db, allIds, providers, ctx);

  return {
    retried: retryIds.length,
    reconciled: reconciledIds.length,
    dispatched: results.length,
    sent: results.filter((r) => r.result === "sent").length,
    failed: results.filter((r) => r.result === "failed" || r.result === "dead").length,
  };
}
