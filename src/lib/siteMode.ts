/**
 * Which role the page's host plays in the domain split (#14).
 *
 * The same build serves guardiancheck.co.za and app.guardiancheck.co.za, so
 * the difference is decided here, at runtime, from the hostname and
 * `DOMAIN_SPLIT_PHASE` (see src/constants/site.ts for the phases):
 *
 *   - `"app"`: app.guardiancheck.co.za. The application only. `/` opens the
 *     dashboard, marketing pages live on the apex, nothing is indexed.
 *   - `"marketing"`: guardiancheck.co.za once the phase is "live". The
 *     marketing pages only; everything else goes to the app host.
 *   - `"combined"`: everything else. The apex before "live", Vercel previews
 *     and localhost. Behaves exactly as the site did before the split.
 *
 * The functions taking explicit arguments are pure so they can be tested
 * without a browser; the constants below them read `window.location` once.
 */

import {
  APP_HOSTNAME,
  APP_SITE_URL,
  DOMAIN_SPLIT_PHASE,
  MARKETING_HOSTNAMES,
  MARKETING_URL,
  type DomainSplitPhase,
} from "../constants/site";
import { isMarketingPath } from "../constants/appRoutes";

export type SiteMode = "combined" | "app" | "marketing";
export type SiteHost = "app" | "marketing";

export function siteModeFor(hostname: string, phase: DomainSplitPhase): SiteMode {
  if (hostname === APP_HOSTNAME) return "app";
  if (phase === "live" && MARKETING_HOSTNAMES.includes(hostname)) return "marketing";
  return "combined";
}

/**
 * The origin a link to `host` must be prefixed with from a page in `mode`, or
 * `""` when the target is served right here and a router link will do.
 */
export function originFor(
  host: SiteHost,
  mode: SiteMode,
  hostname: string,
  phase: DomainSplitPhase,
): string {
  if (host === "marketing") return mode === "app" ? MARKETING_URL : "";
  if (mode === "marketing") return APP_SITE_URL;
  // While announcing, the apex still serves the app, but new churches should
  // start on the host they will stay on, so signups cross over early.
  if (mode === "combined" && phase === "announce" && MARKETING_HOSTNAMES.includes(hostname)) {
    return APP_SITE_URL;
  }
  return "";
}

/**
 * Where a page load of `pathname` on this host belongs instead, or null when it
 * belongs here. Only app and marketing mode ever redirect.
 */
export function crossHostRedirectFor(mode: SiteMode, pathname: string): SiteHost | null {
  if (mode === "app" && pathname !== "/" && isMarketingPath(pathname)) return "marketing";
  if (mode === "marketing" && !isMarketingPath(pathname)) return "app";
  return null;
}

const currentHostname = typeof window === "undefined" ? "" : window.location.hostname;

/**
 * Local override for trying app or marketing mode on localhost or a preview:
 * `VITE_SITE_MODE=app npm run dev`. Links to the other host then point at
 * production, which is expected.
 */
function overrideMode(): SiteMode | null {
  const value = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SITE_MODE : undefined;
  return value === "app" || value === "marketing" || value === "combined" ? value : null;
}

export const SITE_MODE: SiteMode = overrideMode() ?? siteModeFor(currentHostname, DOMAIN_SPLIT_PHASE);

/** Absolute URL on `host` when it is another host, otherwise `path` unchanged. */
export function hrefOn(host: SiteHost, path: string): string {
  return `${originFor(host, SITE_MODE, currentHostname, DOMAIN_SPLIT_PHASE)}${path}`;
}

/** True when a link to `host` leaves this page's origin. */
export function isCrossHost(host: SiteHost): boolean {
  return originFor(host, SITE_MODE, currentHostname, DOMAIN_SPLIT_PHASE) !== "";
}

/** True on the apex while it still serves the app but users are being moved. */
export const IS_ANNOUNCING_APP_HOST =
  SITE_MODE === "combined" && DOMAIN_SPLIT_PHASE === "announce" && MARKETING_HOSTNAMES.includes(currentHostname);
