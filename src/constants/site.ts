/**
 * Site identity — the one place the brand name and public origin are written.
 *
 * Shared by the browser bundle (`<Seo>` canonicals) and the Node build scripts
 * (`scripts/generate-sitemap.ts`). A sitemap and a canonical that disagree on
 * the origin is a silent, self-inflicted duplicate-content bug, so they read
 * the same constant rather than each holding their own copy.
 *
 * Deliberately free of `import.meta.env`: `tsx` runs the sitemap generator
 * outside Vite, where `import.meta.env` is undefined and would throw at import
 * time. Anything environment-dependent belongs in the consumer, not here.
 */

export const SITE_NAME = "GuardianCheck";

/**
 * Production origin of the public, indexable site. No trailing slash.
 *
 * Canonicals, the sitemap, llms.txt and JSON-LD all use this, whichever host
 * serves the page: after the domain split (#14) it is still the marketing
 * site's address.
 */
export const SITE_URL = "https://guardiancheck.co.za";

/** Alias of {@link SITE_URL} for code that links *to* the marketing site. */
export const MARKETING_URL = SITE_URL;

/** Production origin of the application after the domain split. No trailing slash. */
export const APP_SITE_URL = "https://app.guardiancheck.co.za";

export const APP_HOSTNAME = "app.guardiancheck.co.za";
export const MARKETING_HOSTNAMES: readonly string[] = ["guardiancheck.co.za", "www.guardiancheck.co.za"];

/**
 * How far the move of the application to {@link APP_SITE_URL} has gone (#14).
 * One constant, so the browser bundle, the server and the build scripts can
 * never disagree about it.
 *
 *   - `"off"`: guardiancheck.co.za serves everything, exactly as before the
 *     split. If app.guardiancheck.co.za is attached to the Vercel project it
 *     already works as the app host (noindex, marketing pages sent to the
 *     apex), so it can be tested without affecting anyone.
 *   - `"announce"`: guardiancheck.co.za still serves everything, but signed-in
 *     users there see a notice pointing them to the app host, and "Start free
 *     trial" sends new churches to the app host.
 *   - `"live"`: guardiancheck.co.za is the marketing site only. Every other
 *     path is sent to the same path on the app host, query string included.
 *
 * Before moving past "off": attach app.guardiancheck.co.za to the Vercel
 * project, add it to Firebase Auth's authorized domains and to the reCAPTCHA
 * Enterprise key's domains, and set APP_URL and VITE_APP_URL to
 * {@link APP_SITE_URL} in Vercel's production environment.
 *
 * Both hosts are served by the same deployment, so /api (and PayFast's
 * payment notifications, which keep arriving at the address a subscription
 * started on) answers on either.
 */
export type DomainSplitPhase = "off" | "announce" | "live";
export const DOMAIN_SPLIT_PHASE = "off" as DomainSplitPhase;

/**
 * Where church URLs (`/<slug>`) live right now, as shown to church admins.
 * Host only, no scheme.
 */
export function churchUrlHost(phase: DomainSplitPhase = DOMAIN_SPLIT_PHASE): string {
  return (phase === "off" ? SITE_URL : APP_SITE_URL).replace(/^https?:\/\//, "");
}

/** The origin new links into the application should use, for code with no request to go on. */
export function defaultAppOrigin(phase: DomainSplitPhase = DOMAIN_SPLIT_PHASE): string {
  return phase === "off" ? SITE_URL : APP_SITE_URL;
}

/**
 * Default social-card image, 1200x630, served from `public/`.
 *
 * Self-hosted on purpose: the previous card hot-linked an Unsplash photo, which
 * put the brand's first impression on a third party who can rotate or remove it
 * without notice.
 *
 * Root-relative here and resolved against {@link SITE_URL} at use, because
 * `og:image` must be absolute — relative values are simply dropped by most
 * unfurlers.
 */
export const OG_IMAGE_PATH = "/og-image.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = "GuardianCheck, QR-code child check-in for churches";

/** Locale for `og:locale` and `<html lang>`. */
export const SITE_LOCALE = "en_ZA";

/** Absolute form of a root-relative asset path; passes absolute URLs through. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/**
 * Absolute, canonical form of a root-relative path.
 *
 * Always built on {@link SITE_URL} rather than the origin actually serving the
 * page. A canonical names the *one* URL a piece of content should be indexed
 * under, which is a fixed property of the site — not of whichever host handled
 * the request. Deriving it from `window.location.origin` or `VITE_APP_URL`
 * would make every Vercel preview deployment emit self-canonicals pointing at
 * its own throwaway hostname, which is the standard way preview builds end up
 * in the index competing with production.
 *
 * Normalises so that `/register-church`, `/register-church/` and
 * `/register-church?utm_source=x` all resolve to one canonical URL: query
 * strings and fragments are dropped, and the trailing slash is stripped from
 * everything except the root.
 */
export function canonicalUrl(pathname: string): string {
  const path = pathname.split(/[?#]/)[0];
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;

  return `${SITE_URL}${trimmed === "/" ? "/" : trimmed}`;
}
