/**
 * Service worker registration.
 *
 * Registered only in production builds. In dev the Vite middleware serves
 * modules the worker would sit in front of, and a stale worker there is a
 * confusing failure to debug — see public/sw.js for what it actually does
 * (offline navigations, and nothing else).
 */

import { logger } from "./logger";

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // After `load`, so registration never competes with the first render for
  // bandwidth on a slow connection.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        logger.info("Service worker registered", { scope: registration.scope });
      })
      .catch((error: unknown) => {
        // A failed registration costs the install prompt and the offline page.
        // Everything else keeps working, so this must never throw upward.
        //
        // `warn`, not `error`: registration legitimately rejects in Firefox and
        // Safari private windows and under enterprise policy, and `logger.error`
        // beacons to /api/log-client-error — that would file a server-side error
        // for every page load of every such visitor, for a non-failure.
        //
        // Stringified because logger redacts objects and an Error's own fields
        // are non-enumerable — it would otherwise log an empty `{}`.
        logger.warn("Service worker registration failed", { reason: String(error) });
      });
  });
}
