import { MARKETING_HOSTNAMES } from "../constants/site";
import { SITE_MODE } from "../lib/siteMode";

/**
 * Explains the one thing the domain split (#14) asks of an existing user.
 *
 * The application moved to app.guardiancheck.co.za, and old links redirect
 * here, but "keep me signed in" is stored by the browser against one exact
 * address, so it does not travel with the redirect. Arriving at a sign-in form
 * you did not ask for reads as "my account is gone", which is exactly what has
 * not happened, so say so.
 *
 * Shown only to someone who actually came from the old address: on the app
 * host, when the previous page was the marketing site. It therefore disappears
 * by itself once people use the new address directly, with nothing to remove
 * later.
 */
export function MovedHereNotice() {
  if (SITE_MODE !== "app" || typeof document === "undefined") return null;

  let cameFromMarketing = false;
  try {
    cameFromMarketing =
      !!document.referrer && MARKETING_HOSTNAMES.includes(new URL(document.referrer).hostname);
  } catch {
    // An unparseable referrer is simply not a match.
  }

  if (!cameFromMarketing) return null;

  return (
    <div className="p-4 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl text-sm text-gray-700 dark:text-gray-300">
      <p>
        <strong className="text-gray-900 dark:text-white">GuardianCheck now lives here.</strong> Your
        account, your children and your history are unchanged. Please sign in once on this address.
      </p>
    </div>
  );
}
