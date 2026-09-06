import crypto from "crypto";
import type { NotifyContext } from "./types.js";

/**
 * Short-lived, opaque, single-purpose access tokens for the one deliberately
 * unauthenticated surface in this system: GET /api/qr/:token, which serves a
 * guardian's pickup QR as a PNG.
 *
 * Why an unauthenticated endpoint exists at all
 * ---------------------------------------------
 * WhatsApp template messages with an image header do not carry the image.
 * Meta's servers fetch it themselves, at send time, from a URL supplied in
 * the send payload. Meta cannot authenticate to this app, so the URL has to
 * be reachable without a session. That is the entire reason this exists --
 * the email channel embeds the same QR as an inline attachment and never
 * touches this endpoint (see providers/email.ts).
 *
 * What the token is, and what it is not
 * -------------------------------------
 * The value in the URL is NOT the guardian's pickup token. It is a separate
 * 256-bit random value minted per send, which the endpoint resolves to a
 * guardian id and then reads the live pickup token from that document. So the
 * QR's own payload and the URL that renders it are two different secrets, and
 * neither is derivable from the other. Only a SHA-256 of the URL token is
 * stored, so a leaked database dump does not yield working URLs.
 *
 * Combined with the volunteer photo-match step at checkout (added alongside
 * the guardian-token hardening; see server.ts's /api/check-out-guardian),
 * possession of a QR is not by itself sufficient to collect a child. That
 * property belongs to this branch's code, not to whatever is deployed --
 * docs/qr-endpoint-threat-model.md is explicit about the distinction.
 */

export const QR_ACCESS_TOKENS_COLLECTION = "qr_access_tokens";
export const QR_ACCESS_LOG_COLLECTION = "qr_access_log";

/**
 * How many times one token may be fetched before it is spent.
 *
 * Meta's documented behaviour for a `link` media asset is that the Cloud API
 * "internally caches the asset for 10 minutes", keyed on the exact link
 * string, and that appending a random query string makes it "treat this as a
 * new asset, fetch it from your server, and cache it for 10 minutes". That is
 * the whole of what the documentation says about fetching.
 *
 * What it does NOT say, anywhere -- checked across the Media reference, the
 * send-messages guides in both the current and legacy documentation trees,
 * the error-code reference (131052/131053 describe download and upload
 * failure but say nothing about re-fetching), and the image-message page:
 * how many requests a single send makes, whether a HEAD precedes the GET, or
 * whether a slow or non-200 response is retried and how often.
 *
 * So this number cannot be derived, only bounded. An earlier draft used 3,
 * which is a guess with no margin; 8 is a guess with margin. The asymmetry is
 * what decides it: allowing a few extra fetches of a hash-stored, minutes-long
 * token costs approximately nothing, while exhausting the budget midway
 * through Meta's own retries means a parent never receives their QR at all.
 *
 * LIVE VERIFICATION IS OUTSTANDING. No WhatsApp Business Account exists in
 * this project yet (blockers B2/B5 in docs/whatsapp-communication-plan.md),
 * so the real fetch count has never been observed. Before the pilot Sunday --
 * not before merge -- send one qr_delivery template from the real WABA and
 * read the fetchCount on its qr_access_log rows, then retune this constant
 * from the observed number. Tests import this constant rather than hardcoding
 * a literal, so changing it is a one-line edit.
 */
export const QR_ACCESS_MAX_FETCHES = 8;

/** Minutes a token stays valid. Meta fetches at send time, so this only has to outlive one send plus its retries -- not the church service, and emphatically not the life of the QR itself, which the email attachment covers permanently. */
function ttlMinutes(): number {
  const raw = Number(process.env.QR_ACCESS_TTL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

/** URL-safe, fixed length, and the shape the route matches on before touching Firestore. 32 bytes = 256 bits -> 43 base64url characters. */
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashQrToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface MintArgs {
  guardianId: string;
  churchId: string;
  /** The notification record this token was minted for, so a fetch can be traced back to the message that caused it. */
  notificationId: string;
}

export interface MintResult {
  /** Goes in the URL handed to Meta. Never stored, never logged. */
  raw: string;
  /** SHA-256 of `raw`; the document id, and the only form that is persisted. */
  tokenId: string;
}

export async function mintQrAccessToken(db: any, args: MintArgs, ctx?: NotifyContext): Promise<MintResult> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenId = hashQrToken(raw);
  const now = new Date();

  await db.collection(QR_ACCESS_TOKENS_COLLECTION).doc(tokenId).set({
    guardianId: args.guardianId,
    churchId: args.churchId,
    notificationId: args.notificationId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMinutes() * 60_000).toISOString(),
    fetchCount: 0,
    consumedAt: null,
  });
  if (ctx?.firestoreOps) ctx.firestoreOps.writes++;

  return { raw, tokenId };
}

export type QrResolveOutcome = "ok" | "not_found" | "expired" | "consumed";

export interface QrResolveResult {
  outcome: QrResolveOutcome;
  /** Present only when outcome is "ok". */
  guardianId?: string;
  churchId?: string;
  /** Always present, including for a token that does not exist -- it is the hash of whatever was presented, which is what makes probing visible in the log without recording the probe itself. */
  tokenId: string;
}

/**
 * Resolves a presented token and spends one fetch against it, in a
 * transaction so concurrent fetches cannot both slip past the cap.
 *
 * Expiry is checked before the count: an expired token is expired regardless
 * of how much budget it had left.
 */
export async function resolveQrAccessToken(db: any, raw: string, ctx?: NotifyContext): Promise<QrResolveResult> {
  const tokenId = hashQrToken(raw);
  const ref = db.collection(QR_ACCESS_TOKENS_COLLECTION).doc(tokenId);

  return db.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
    if (!doc.exists) return { outcome: "not_found" as const, tokenId };

    const data = doc.data();
    if (new Date(data.expiresAt).getTime() <= Date.now()) {
      return { outcome: "expired" as const, tokenId };
    }

    const fetchCount = data.fetchCount ?? 0;
    if (data.consumedAt || fetchCount >= QR_ACCESS_MAX_FETCHES) {
      return { outcome: "consumed" as const, tokenId };
    }

    const next = fetchCount + 1;
    tx.update(ref, {
      fetchCount: next,
      // Spent on the fetch that reaches the cap, so the next request is
      // refused rather than being the one that discovers the limit.
      consumedAt: next >= QR_ACCESS_MAX_FETCHES ? new Date().toISOString() : null,
    });
    if (ctx?.firestoreOps) ctx.firestoreOps.writes++;

    return { outcome: "ok" as const, guardianId: data.guardianId, churchId: data.churchId, tokenId };
  });
}

export interface QrFetchLogEntry {
  tokenId: string;
  outcome: QrResolveOutcome | "malformed" | "guardian_unavailable" | "error";
  status: number;
  ip: string | null;
  userAgent: string | null;
  traceId?: string | null;
}

/**
 * Records every request to the QR endpoint, including refused ones.
 *
 * This is the audit trail for the only surface in the system that answers
 * without a session, which is the whole reason it needs one. Refusals are
 * logged precisely because a burst of them is what enumeration looks like.
 *
 * The raw token is never written -- `tokenId` is its hash, so a probe is
 * visible as an event without the probed value being retained. IP and
 * user-agent are personal information; see the retention note in
 * docs/qr-endpoint-threat-model.md.
 */
export async function logQrFetch(db: any, entry: QrFetchLogEntry, ctx?: NotifyContext): Promise<void> {
  try {
    await db.collection(QR_ACCESS_LOG_COLLECTION).add({
      ...entry,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
      traceId: entry.traceId ?? null,
      at: new Date().toISOString(),
    });
    if (ctx?.firestoreOps) ctx.firestoreOps.writes++;
  } catch (err: any) {
    // A failed audit write must not turn into a failed image fetch -- the
    // parent's QR matters more than the log line, and the alternative is a
    // Firestore blip becoming a delivery outage.
    console.error("QR fetch log write failed:", err?.message ?? err);
  }
}
