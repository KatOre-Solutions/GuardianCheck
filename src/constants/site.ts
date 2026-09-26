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
 * The domain split (#14): guardiancheck.co.za becomes the marketing site and
 * the application moves to app.guardiancheck.co.za.
 *
 * Accounts and data are untouched by this: they live in Firebase, which does
 * not care which address serves the app. What does belong to an address is the
 * browser's own state, so on their first visit to the app host people sign in
 * once more, a parent's offline copy of their QR codes is rebuilt on the first
 * online visit, and anyone who added the app to a home screen adds it again.
 * Old links keep working: the marketing host hands every application path to
 * the same path on the app host, query string and all.
 *
 * One constant drives it, so the browser bundle, the server and the build
 * scripts can never disagree:
 *
 *   - `"off"`: guardiancheck.co.za serves everything, exactly as today. If
 *     app.guardiancheck.co.za is attached to the Vercel project it already
 *     behaves as the app host, so the whole thing can be checked before
 *     anybody is sent there.
 *   - `"live"`: guardiancheck.co.za is the marketing site, and every other
 *     path there is handed to the app host.
 *
 * Before switching to "live", in this order:
 *
 *   1. Attach app.guardiancheck.co.za to the *same* Vercel project that serves
 *      the apex. One deployment serving both hosts is what keeps /api
 *      answering on either, and that is what keeps PayFast's recurring
 *      payment notifications working: they keep arriving at the address a
 *      subscription was started on, with no proxy in between. On a second
 *      project none of that holds.
 *   2. Add the host to Firebase Auth's authorized domains and to the
 *      reCAPTCHA Enterprise key's allowed domains.
 *   3. Set APP_URL and VITE_APP_URL to {@link APP_SITE_URL} in Vercel's
 *      production environment. VITE_APP_URL is compiled into the bundle, so
 *      it takes a rebuild, not just a save.
 *   4. Check the PayFast merchant console for a configured default ITN or
 *      return URL, and point it at the app host if one is set.
 *
 * Steps 3 and 4 are enforced: scripts/check-domain-split.ts fails the build
 * when the phase is "live" and the environment disagrees. Steps 1 and 2 are
 * outside the repository and cannot be, so they are the ones to check twice.
 *
 * Flipping the phase also changes generated output, so regenerate and commit:
 * `npm run generate:vercel-routes` writes the 308s that hand each host's
 * paths to the other, and `npm run build` bakes the phase into the redirect
 * script in index.html and into the service worker's self-retirement.
 */
export type DomainSplitPhase = "off" | "live";
export const DOMAIN_SPLIT_PHASE = "off" as DomainSplitPhase;

/**
 * Production origin of the public, indexable site. No trailing slash.
 *
 * Canonicals, the sitemap, llms.txt and JSON-LD all use this. The marketing
 * site keeps this address through the split, so none of them ever move.
 */
export const SITE_URL = "https://guardiancheck.co.za";

/** Alias of {@link SITE_URL} for code that links *to* the marketing site. */
export const MARKETING_URL = SITE_URL;
export const MARKETING_HOSTNAMES: readonly string[] = ["guardiancheck.co.za", "www.guardiancheck.co.za"];

/** Production origin of the application after the split. No trailing slash. */
export const APP_SITE_URL = "https://app.guardiancheck.co.za";
export const APP_HOSTNAME = "app.guardiancheck.co.za";

/**
 * Where church URLs (`/<slug>`) live, as shown to church admins. Host only, no
 * scheme. They move to the app host with the rest of the application, and the
 * links already printed on posters are redirected there.
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
