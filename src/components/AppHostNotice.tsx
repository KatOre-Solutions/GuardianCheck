import React from "react";
import { ArrowRight, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { APP_SITE_URL, APP_HOSTNAME } from "../constants/site";
import { IS_ANNOUNCING_APP_HOST } from "../lib/siteMode";

const DISMISS_KEY = "gc.appHostNoticeDismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Tells signed-in users on guardiancheck.co.za that the app is moving to
 * app.guardiancheck.co.za (#14), while the phase is "announce".
 *
 * Signing in, the offline cache and an installed app all belong to one web
 * address, so none of them follow the user to the new one. The notice says
 * what that means in practice: sign in once there, open it once while online,
 * and reinstall if the app was installed. Dismissal lasts for the browser
 * session only, so it comes back until they have actually moved.
 */
export function AppHostNotice() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = React.useState(readDismissed);

  if (!IS_ANNOUNCING_APP_HOST || loading || !user || dismissed) return null;

  const installed =
    typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  const { pathname, search, hash } = window.location;
  const target = `${APP_SITE_URL}${pathname}${search}${hash}`;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Unavailable storage: it simply shows again on the next page load.
    }
  };

  return (
    <div role="region" aria-label="GuardianCheck is moving" className="bg-primary text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start gap-3 text-sm">
        <p className="flex-1">
          <strong>GuardianCheck is moving to {APP_HOSTNAME}.</strong>{" "}
          {installed
            ? "Open it there, sign in once, then install the app again from the new address and remove this one."
            : "Open it there and sign in once. Do it before Sunday so your QR codes are ready offline."}{" "}
          <a href={target} className="inline-flex items-center gap-1 font-bold underline hover:no-underline">
            Open the new address
            <ArrowRight className="h-4 w-4" />
          </a>
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
