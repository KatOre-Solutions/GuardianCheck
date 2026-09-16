/**
 * Where a signed-in user belongs.
 *
 * Three places used to answer this question with three near-copies of the same
 * if-chain: the `/admin|/volunteer|/parent` redirect, ProtectedRoute's
 * wrong-role fallback, and Login's post-authentication navigation. They had
 * already drifted — Login read the legacy single `role` field, so an account
 * carrying only the newer `roles` array landed on the marketing home page
 * instead of its dashboard.
 *
 * The PWA start_url (`/app`) is a fourth caller, and the one that made a single
 * source of truth worth extracting: an installed app that opens on the wrong
 * screen has no address bar to correct it with.
 */

/** Most-privileged first — the first match wins, mirroring the old if-chains. */
const ROLE_PRIORITY = ["master_admin", "admin", "volunteer", "parent"] as const;

export type LandingUserDoc = {
  status?: string | null;
  /** Current shape. */
  roles?: string[] | null;
  /** Legacy shape, still present on older accounts. */
  role?: string | null;
  churchSlug?: string | null;
} | null | undefined;

/**
 * Roles for a user document, tolerating both the array and the legacy scalar.
 * Same normalisation `useAuth` applies, kept here so callers holding only a raw
 * Firestore document (Login) agree with callers holding hook state.
 */
export function resolveRoles(userDoc: LandingUserDoc): string[] {
  if (!userDoc) return [];
  if (Array.isArray(userDoc.roles) && userDoc.roles.length > 0) return userDoc.roles.filter(Boolean) as string[];
  return userDoc.role ? [userDoc.role] : [];
}

/**
 * The path this user should be looking at right now.
 *
 * `search` is preserved verbatim because payment returns come back as
 * `?payment=success` on whatever route the redirect lands on, and the
 * dashboards read it.
 *
 * Onboarding states outrank roles: an incomplete profile has to be finished
 * before any dashboard is meaningful.
 */
export function resolveLandingPath(userDoc: LandingUserDoc, search = ""): string {
  if (!userDoc) return `/login${search}`;
  if (userDoc.status === "incomplete_profile") return `/complete-profile${search}`;
  if (userDoc.status === "rejected") return `/rejected${search}`;

  const roles = resolveRoles(userDoc);
  const prefix = userDoc.churchSlug ? `/${userDoc.churchSlug}` : "";

  for (const role of ROLE_PRIORITY) {
    if (!roles.includes(role)) continue;
    // The platform admin dashboard is global; it has no church prefix.
    if (role === "master_admin") return `/master-admin${search}`;
    if (prefix) return `${prefix}/${role}${search}`;
    // A church-scoped role without a slug has nowhere to go but home.
    break;
  }

  return `${prefix || "/"}${search}`;
}
