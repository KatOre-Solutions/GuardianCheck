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

/** Production origin. No trailing slash. */
export const SITE_URL = "https://guardiancheck.co.za";

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
export const OG_IMAGE_ALT = "GuardianCheck — secure child check-in for churches";

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
