/**
 * The canonical list of publicly indexable routes.
 *
 * Single source of truth for the sitemap (`scripts/generate-sitemap.ts`) so the
 * two cannot drift. Adding a public page is a one-line change here.
 *
 * A route belongs in this list only if it is genuinely indexable — it must not
 * render `<Seo noindex />` and must not be disallowed in `public/robots.txt`.
 * The generator enforces the robots.txt half of that automatically and fails
 * the build on a contradiction.
 *
 * Deliberately excluded:
 *   - `/login` and every authenticated route — noindex, and robots-disallowed.
 *   - Utility routes (`/accept-invite`, `/pending-approval`, …) — noindex.
 *   - Per-tenant URLs (`/:churchSlug`) — out of scope for #20. They are real
 *     public pages, but enumerating them means reading the church collection at
 *     build time, which is a separate decision about exposing the tenant list.
 */

/** Production origin. No trailing slash. */
export const SITE_URL = "https://guardiancheck.co.za";

export interface PublicRoute {
  /** Root-relative path, always starting with "/". */
  path: string;
  /** Why this page exists — documentation only, not emitted. */
  description: string;
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "/", description: "Marketing home page" },
  { path: "/register-church", description: "Church signup" },
];
