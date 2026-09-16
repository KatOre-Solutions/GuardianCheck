/**
 * Which role the page's host plays in the domain split (#14).
 *
 * The same build serves guardiancheck.co.za (the application) and
 * www.guardiancheck.co.za (the marketing site), so the difference is decided
 * here, at runtime, from the hostname and `DOMAIN_SPLIT_PHASE` (see
 * src/constants/site.ts, which explains why the marketing site is the one
 * that moves):
 *
 *   - `"marketing"`: www.guardiancheck.co.za. The marketing pages only;
 *     everything else goes to the application. A new host, so it behaves this
 *     way as soon as it is attached, before the switch, and can be checked.
 *   - `"app"`: guardiancheck.co.za once the phase is "live". The application
 *     only; its marketing paths, `/` included, go to www, and nothing is
 *     indexed.
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
  MARKETING_HOSTNAME,
  MARKETING_URL,
  type DomainSplitPhase,
} from "../constants/site";
import { isMarketingPath } from "../constants/appRoutes";

export type SiteMode = "combined" | "app" | "marketing";
export type SiteHost = "app" | "marketing";

export function siteModeFor(hostname: string, phase: DomainSplitPhase): SiteMode {
  // www is new, so it is the marketing site from the moment it is attached.
  if (hostname === MARKETING_HOSTNAME) return "marketing";
  // The apex is serving real users, so it only changes at the switch.
  if (hostname === APP_HOSTNAME && phase === "live") return "app";
  return "combined";
}

/**
 * The origin a link to `host` must be prefixed with from a page in `mode`, or
 * `""` when the target is served right here and a router link will do.
 */
export function originFor(host: SiteHost, mode: SiteMode): string {
  if (host === "marketing") return mode === "app" ? MARKETING_URL : "";
  return mode === "marketing" ? APP_SITE_URL : "";
}

/**
 * Where a page load of `pathname` on this host belongs instead, or null when it
 * belongs here. Only app and marketing mode ever redirect.
 *
 * `/` on the application host counts: someone typing the bare domain wants the
 * marketing home page, and the application's own entry point is `/app`, which
 * is what the installed app opens and where the launch redirect lives.
 */
export function crossHostRedirectFor(mode: SiteMode, pathname: string): SiteHost | null {
  if (mode === "app" && isMarketingPath(pathname)) return "marketing";
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
  return `${originFor(host, SITE_MODE)}${path}`;
}

/** True when a link to `host` leaves this page's origin. */
export function isCrossHost(host: SiteHost): boolean {
  return originFor(host, SITE_MODE) !== "";
}
