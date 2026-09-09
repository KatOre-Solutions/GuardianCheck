/**
 * Access to the app's authentication state.
 *
 * The implementation lives in `contexts/AuthContext.tsx` — this stays the import
 * path every component already uses, and the returned shape is unchanged:
 * `{ user, userData, role, roles, status, darkMode, loading, token }`.
 *
 * Note for new code: `role` is `roles[0]`. An account can hold several roles, so
 * test membership (`roles.includes("admin")`) rather than comparing `role` —
 * comparing it is how a volunteer-then-admin account was permanently denied its
 * own admin dashboard.
 */

import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";

export type { UserRole, UserStatus, AuthState } from "../contexts/AuthContext";

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
