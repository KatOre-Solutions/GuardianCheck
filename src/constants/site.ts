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
