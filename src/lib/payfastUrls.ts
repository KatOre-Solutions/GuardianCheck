/**
 * The three URLs a PayFast checkout carries, built in one pure place.
 *
 * These decide where a payer comes back to and, for `notify_url`, where every
 * future recurring charge is reported for the life of the subscription. That
 * last one is the reason this is not inline in the button any more: a
 * `notify_url` is recorded by PayFast at signup and keeps being used after the
 * domain split (#14) moves the application, so it has to be something a test
 * can assert on rather than something assembled in a render.
 *
 * `appOrigin` is `VITE_APP_URL`, which vite.config.ts bakes in at build time,
 * falling back to the origin the page was served from. On the app host after
 * the split both give the same answer; before it, with the variable unset, a
 * preview deployment correctly points at itself.
 */

export interface PayFastUrlInput {
  /** `VITE_APP_URL`, or "" / undefined when it is not set. */
  appUrl?: string;
  /** The origin serving the page, used when `appUrl` is not set. */
  fallbackOrigin: string;
  /** `VITE_PAYFAST_NOTIFY_URL`: a full override for `notify_url`, rarely set. */
  notifyUrlOverride?: string;
  /** Plan tier, passed back so `/admin` can show what was bought. */
  plan: string;
}

export interface PayFastUrls {
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

/** Strips trailing slashes so `${origin}/admin` never becomes `//admin`. */
function normaliseOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function payFastUrls({ appUrl, fallbackOrigin, notifyUrlOverride, plan }: PayFastUrlInput): PayFastUrls {
  const origin = normaliseOrigin(appUrl || fallbackOrigin);

  return {
    returnUrl: `${origin}/admin?payment=success&plan=${encodeURIComponent(plan)}`,
    cancelUrl: `${origin}/admin?payment=cancel`,
    notifyUrl: notifyUrlOverride || `${origin}/api/payfast-itn`,
  };
}
