/**
 * What a PayFast payment has to cover before it extends a church's access.
 *
 * The PayFast form is built in the browser, so the amount and the plan in an
 * ITN are whatever the payer chose to send. The signature and the ping-back
 * prove PayFast took the money, not that it was the right amount, so the ITN
 * handler checks the amount against a price of its own before unlocking a
 * church. This module is that price.
 *
 * ## Why the current list price is the wrong thing to check against
 *
 * A PayFast recurring subscription charges a fixed amount for as long as it
 * runs. Raising a tier's price does not change what an existing subscriber is
 * charged, and it should not: the terms promise 30 days' notice before a price
 * change applies to a church. But a check against the live price table would
 * fail on that church's very next renewal, and the ITN handler would then skip
 * `status`, `lastPaymentDate` and `accessUntil` alike, locking out a church
 * that paid in full and on time.
 *
 * So the amount is checked against the price the church actually agreed to:
 *
 *   1. `subscription.priceZar`, recorded on the church when its subscription
 *      was set up, from the server's own table at that moment. Never taken
 *      from the request, and church admins cannot write the `subscription` map
 *      (see the `churches` update rule), so it cannot be talked down.
 *   2. For a subscription that predates that recording, the price in effect
 *      when recording shipped. Those churches have a `payfast_token` and no
 *      recorded price, and cannot have agreed to more than the prices below.
 *   3. Otherwise the current list price, which is what a new subscriber agrees
 *      to today.
 *
 * The required amount is the lower of the current price and the agreed one, so
 * a price cut is honoured immediately and a price rise never locks anyone out.
 * The recorded price is written once per tier and never raised afterwards:
 * re-recording at the new price on each accepted renewal would walk a
 * grandfathered church straight into the lockout this exists to prevent.
 */

import { PLAN_LIMITS } from "../constants/plans";

/**
 * Prices in effect when the ITN began recording what a church agreed to pay.
 *
 * A frozen snapshot, not a mirror of the live table: it is the ceiling on what
 * a subscription created before recording can have agreed to. Leave it alone
 * when prices change. It stops mattering once every subscription started
 * before that date has renewed once, since each renewal records its own price.
 */
export const PRICES_BEFORE_RECORDING: Record<string, number> = {
  starter: 249,
  growth: 499,
  professional: 999,
};

/** Cent rounding, as PayFast reports `amount_gross` to two decimals. */
const TOLERANCE = 0.005;

/** The current list price of a tier, from the one table the app and the site read. */
export function currentPlanPrice(tier: string): number | undefined {
  const plan = (PLAN_LIMITS as Record<string, { priceZar?: number }>)[tier];
  return typeof plan?.priceZar === "number" ? plan.priceZar : undefined;
}

type ChurchPricingFields = {
  subscription?: {
    priceZar?: unknown;
    priceTier?: unknown;
    payfast_token?: unknown;
  } | null;
} | null | undefined;

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The price this church agreed to for `tier`, or null when it has never agreed
 * to one and the current price applies.
 */
export function agreedPlanPrice(church: ChurchPricingFields, tier: string): number | null {
  const subscription = church?.subscription ?? null;
  const recordedTier = typeof subscription?.priceTier === "string" ? subscription.priceTier : null;

  if (recordedTier === tier) return positiveNumber(subscription?.priceZar);

  // A tier it has never been recorded on. Changing tier is agreeing to the new
  // tier's price today, so only a subscription from before recording existed
  // falls back -- a church with a recorded price for another tier does not.
  if (recordedTier === null && subscription?.payfast_token) {
    return positiveNumber(PRICES_BEFORE_RECORDING[tier]);
  }

  return null;
}

export type PaymentPricing = {
  /** What this payment had to reach, or null when the tier is unknown. */
  requiredAmount: number | null;
  /** Whether it did. Always false for an unknown tier. */
  covers: boolean;
  /**
   * The price to write to `subscription.priceZar` if this payment is accepted,
   * or null when one is already recorded for this tier and must not move.
   */
  priceToRecord: number | null;
};

/** The whole decision for one ITN: what was required, whether it was paid, what to record. */
export function pricingForPayment(
  church: ChurchPricingFields,
  tier: string,
  amount: number,
): PaymentPricing {
  const current = currentPlanPrice(tier);
  const agreed = agreedPlanPrice(church, tier);

  if (current === undefined) {
    return { requiredAmount: null, covers: false, priceToRecord: null };
  }

  const requiredAmount = agreed === null ? current : Math.min(current, agreed);
  const alreadyRecorded =
    typeof church?.subscription?.priceTier === "string" &&
    church.subscription.priceTier === tier &&
    positiveNumber(church?.subscription?.priceZar) !== null;

  return {
    requiredAmount,
    covers: amount + TOLERANCE >= requiredAmount,
    // What was accepted, not today's list price: recording the higher current
    // price for a grandfathered church would lock it out on the next renewal.
    priceToRecord: alreadyRecorded ? null : requiredAmount,
  };
}
