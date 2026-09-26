/**
 * Whether a church may use GuardianCheck right now.
 *
 * One field decides it: `churches/{id}.accessUntil`, a Firestore Timestamp
 * written only by the server. A church is locked once that instant has passed.
 *
 *   - Registration sets it to the end of the free trial.
 *   - A verified PayFast payment moves it to the next billing date plus
 *     PAYMENT_GRACE_DAYS.
 *   - `scripts/extend-church-trial.ts` moves it by hand.
 *
 * A date rather than a status flag, so nothing has to run for a church to lock.
 * A failed or cancelled PayFast subscription sends no ITN, the date is never
 * pushed forward, and the church locks on its own. No cron, no drift between a
 * flag and the dates it was meant to summarise.
 *
 * A church with no `accessUntil` is unmetered and never locks. That covers
 * churches created before this field existed (until the backfill script runs)
 * and manual activations from the master admin dashboard.
 *
 * `firestore.rules` enforces the same comparison (`accessUntil > request.time`)
 * in `churchAccessOpen()`. Keep the two in step: a church this module calls
 * open must be one the rules let write.
 *
 * Imports no Firebase SDK. Both the Admin SDK and the web SDK hand back
 * Timestamps with a `toDate()` method, so it is duck-typed and the same module
 * serves server.ts, the browser and the scripts.
 */

import { addDays } from "date-fns";

/** Days of access past a billing date, for a charge or its ITN that lands late. */
export const PAYMENT_GRACE_DAYS = 5;

/** Show the "access ends soon" warning this many days before the lock. */
export const LOCK_WARNING_DAYS = 7;

/** Error code the API returns, with HTTP 402, for a locked church. */
export const CHURCH_ACCESS_LOCKED = "CHURCH_ACCESS_LOCKED";

/** South Africa Standard Time. No daylight saving, so a fixed offset is exact. */
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ChurchAccessState = "open" | "locked" | "unmetered";

export interface ChurchAccess {
  state: ChurchAccessState;
  accessUntil: Date | null;
  /** Whole days left before the lock, 0 on the final day. Null unless open. */
  daysLeft: number | null;
}

/** A Firestore Timestamp (either SDK), Date or ISO string as a Date, or null. */
export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const v = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof v.toDate === "function") return v.toDate();
    const seconds = v.seconds ?? v._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
  }
  return null;
}

/**
 * The last millisecond of `date`'s calendar day in South Africa.
 *
 * Access ends at midnight rather than at the time of day the trial happened to
 * start. A lock that fires mid-morning can land in the middle of a Sunday
 * service, with children still checked in.
 */
export function endOfDaySast(date: Date): Date {
  const local = new Date(date.getTime() + SAST_OFFSET_MS);
  local.setUTCHours(23, 59, 59, 999);
  return new Date(local.getTime() - SAST_OFFSET_MS);
}

/** When access should end for a subscription whose next charge is `billingDate`. */
export function accessUntilForBillingDate(billingDate: Date): Date {
  return endOfDaySast(addDays(billingDate, PAYMENT_GRACE_DAYS));
}

/** The later of two instants, treating null as "no date". */
export function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function getChurchAccess(
  church: { accessUntil?: unknown } | null | undefined,
  now: Date = new Date(),
): ChurchAccess {
  const accessUntil = toDate(church?.accessUntil);
  if (!accessUntil) return { state: "unmetered", accessUntil: null, daysLeft: null };
  const remaining = accessUntil.getTime() - now.getTime();
  // `<=` matches the rules' strict `accessUntil > request.time`.
  if (remaining <= 0) return { state: "locked", accessUntil, daysLeft: null };
  return { state: "open", accessUntil, daysLeft: Math.floor(remaining / DAY_MS) };
}
