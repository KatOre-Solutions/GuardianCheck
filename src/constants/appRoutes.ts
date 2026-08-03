/**
 * The shape of every URL this app answers to.
 *
 * Distinct from `publicRoutes.ts`, which lists the handful of pages that belong
 * in the sitemap. This is the wider set: everything the router will render,
 * including authenticated and utility routes. Its job is to let the edge decide
 * whether a path is a real page or a 404, without asking Firestore.
 *
 * Two consumers, and they must agree:
 *
 *   - `server.ts` — local dev and self-hosted, via {@link isKnownAppPath}
 *   - `vercel.json` — production, via `scripts/generate-vercel-routes.ts`
 *
 * Production traffic never reaches Express: `vercel.json` serves non-API paths
 * straight from static hosting. So a fix applied only to `server.ts` would look
 * right locally and change nothing for real users. The generator exists to stop
 * that class of mistake — run it after editing this file, and the build fails
 * if `vercel.json` is stale.
 *
 * ## What this can and cannot decide
 *
 * It matches on *shape*, not existence. `/some-church` is a valid shape, so it
 * returns 200 even when no church owns that slug — proving otherwise means
 * reading the church collection per request, which is out of scope for #63.
 * That case is handled client-side: `TenantLayout` renders a not-found state
 * carrying `noindex`, so it never gets indexed even though the status is 200.
 * `/some/deep/nonsense` matches no shape at all and is a real 404.
 */

/** Exact top-level paths, each declared by a `<Route path=…>` in `App.tsx`. */
export const EXACT_ROUTES = [
  "/",
  "/login",
  "/register-church",
  "/accept-invite",
  "/complete-profile",
  "/pending-approval",
  "/rejected",
  "/policy-acceptance",
  "/admin",
  "/volunteer",
  "/parent",
  "/profile",
  "/master-admin",
  "/master-admin/logs",
] as const;

/** Second segment under `/:churchSlug`. */
export const TENANT_CHILD_ROUTES = ["login", "parent", "volunteer", "admin"] as const;

/** Third segment under `/:churchSlug/admin`. */
export const TENANT_ADMIN_CHILD_ROUTES = ["settings", "events"] as const;

/** Path prefixes owned by something other than the router. */
export const NON_ROUTE_PREFIXES = ["/api", "/assets"] as const;

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/**
 * True when `pathname` matches a route the app can render.
 *
 * A `false` result means the URL corresponds to nothing and deserves a 404. A
 * `true` result means the shape is real — the page may still be a client-side
 * not-found if, say, the slug names no church.
 */
export function isKnownAppPath(pathname: string): boolean {
  // Normalise a trailing slash so `/login/` is not a 404. Anything with a file
  // extension is an asset request that fell through static hosting.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (NON_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  if ((EXACT_ROUTES as readonly string[]).includes(path)) return true;

  const parts = segments(path);

  // /:churchSlug
  if (parts.length === 1) return true;

  // /:churchSlug/{login,parent,volunteer,admin}
  if (parts.length === 2) {
    return (TENANT_CHILD_ROUTES as readonly string[]).includes(parts[1]);
  }

  // /:churchSlug/admin/{settings,events}
  if (parts.length === 3) {
    return parts[1] === "admin" && (TENANT_ADMIN_CHILD_ROUTES as readonly string[]).includes(parts[2]);
  }

  return false;
}

/**
 * The same knowledge as regex sources for `vercel.json`'s `routes`, ordered
 * most-specific first. Everything not matched here falls through to the
 * catch-all the generator appends, which serves the shell with a 404 status.
 */
export function knownPathPatterns(): string[] {
  const exact = EXACT_ROUTES.filter((r) => r !== "/")
    .map((r) => r.slice(1))
    .join("|");

  return [
    "^/$",
    `^/(?:${exact})/?$`,
    `^/[^/]+/(?:${TENANT_CHILD_ROUTES.join("|")})/?$`,
    `^/[^/]+/admin/(?:${TENANT_ADMIN_CHILD_ROUTES.join("|")})/?$`,
    // Least specific: any single segment is a candidate church slug.
    "^/[^/]+/?$",
  ];
}
