/**
 * Service worker registration.
 *
 * Registered only in production builds. In dev the Vite middleware serves
 * modules the worker would sit in front of, and a stale worker there is a
 * confusing failure to debug — see public/sw.js for what it actually does
 * (precaches this build's app shell so an installed app can boot offline).
 */

import { logger } from "./logger";
import { SITE_MODE } from "./siteMode";

/**
 * The marketing host after the domain split (#14) is not an app: nothing to
 * install, nothing to boot offline.
 *
 * The worker retires itself, in public/sw.js, because this code only runs for
 * someone who actually loads a marketing page: an application path on this
 * host is redirected away before any bundle downloads, so a user whose entry
 * point is /app or a church slug would never reach it. What is left here is
 * the part a worker cannot do, removing the install link, plus the same
 * cleanup for anyone who does land on a marketing page and whose browser has
 * not re-fetched the worker yet.
 */
function retireServiceWorker(): void {
  document.querySelector('link[rel="manifest"]')?.remove();
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => caches.keys())
    .then((names) =>
      Promise.all(names.filter((name) => name.startsWith("guardiancheck-shell-")).map((name) => caches.delete(name))),
    )
    .catch((error: unknown) => {
      logger.warn("Service worker retirement failed", { reason: String(error) });
    });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (SITE_MODE === "marketing") {
    retireServiceWorker();
    return;
  }

  // After `load`, so registration never competes with the first render for
  // bandwidth on a slow connection.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        logger.info("Service worker registered", { scope: registration.scope });
      })
      .catch((error: unknown) => {
        // A failed registration costs the install prompt and offline launch.
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
