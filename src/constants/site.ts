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
 * The domain split (#14): the application keeps guardiancheck.co.za and the
 * marketing site moves to www.guardiancheck.co.za.
 *
 * That direction is deliberate, and it is the opposite of the usual
 * convention. A saved sign-in, an installed app, a volunteer's camera
 * permission and, most importantly, the offline copy of a parent's QR codes
 * all belong to the exact address they were created on. Whichever site keeps
 * guardiancheck.co.za keeps all of it. Moving the *marketing* site instead
 * costs nine pages a few weeks of settling in search results and costs users
 * nothing, on a system people depend on at a check-in desk on a Sunday
 * morning. Church URLs (`/<slug>`, printed on posters) never change either.
 *
 * One constant drives it, so the browser bundle, the server and the build
 * scripts can never disagree:
 *
 *   - `"off"`: guardiancheck.co.za serves everything, exactly as today. If
 *     www.guardiancheck.co.za is attached to the Vercel project it already
 *     serves the marketing site, so it can be checked before the switch.
 *   - `"live"`: guardiancheck.co.za is the application, and its marketing
 *     paths (including `/`) redirect to www, which is the indexable site.
 *
 * Before switching to "live": attach www.guardiancheck.co.za to the Vercel
 * project (removing any domain-level redirect of www to the apex). Nothing
 * changes in Firebase, PayFast, APP_URL or DNS beyond that, because the
 * application's address is not moving.
 */
export type DomainSplitPhase = "off" | "live";
export const DOMAIN_SPLIT_PHASE = "off" as DomainSplitPhase;

/** Production origin of the application. No trailing slash. This does not change. */
export const APP_SITE_URL = "https://guardiancheck.co.za";
export const APP_HOSTNAME = "guardiancheck.co.za";

/** Where the marketing site lives once the split is live. */
export const MARKETING_HOSTNAME = "www.guardiancheck.co.za";

/** Origin of the marketing site: the apex until the split is live, www after. */
export const MARKETING_URL =
  DOMAIN_SPLIT_PHASE === "live" ? `https://${MARKETING_HOSTNAME}` : APP_SITE_URL;

/**
 * Production origin of the public, indexable site. No trailing slash.
 *
 * Canonicals, the sitemap, llms.txt and JSON-LD all use this, and they move to
 * www together with the marketing pages themselves, never before: a canonical
 * pointing at a host that is not serving yet is worse than no split at all.
 */
export const SITE_URL = MARKETING_URL;

/**
 * Where church URLs (`/<slug>`) live, as shown to church admins. Host only, no
 * scheme. The application keeps the apex, so this is the same before and after.
 */
export function churchUrlHost(): string {
  return APP_HOSTNAME;
}

/** The origin new links into the application should use, for code with no request to go on. */
export function defaultAppOrigin(): string {
  return APP_SITE_URL;
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
