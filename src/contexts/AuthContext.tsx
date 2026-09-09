/**
 * The app's single authentication subscription.
 *
 * This is the body of what used to be `hooks/useAuth.ts`, moved behind a
 * provider without changing a line of its logic. The hook stays as the public
 * entry point and every one of its call sites is untouched — only the number of
 * subscriptions changes, from one per calling component to one for the app.
 *
 * ## Why
 *
 * `useAuth` was a plain hook, so each component that called it opened its own
 * `onAuthStateChanged` listener and its own `users/{uid}` snapshot, and each got
 * a `loading` flag that flipped on its own clock. On `/:churchSlug/admin` that
 * was five instances — TenantContext, Navigation, ProtectedRoute, PolicyGuard,
 * AdminDashboard (and a sixth via useActiveService) — so the route's gates
 * resolved one after another instead of together. The user saw that as a
 * sequence of spinners, a nav bar that vanished and came back, and an "Access
 * denied" line rendered by one instance while a *different* instance had
 * already authorised the page.
 *
 * One subscription means every consumer settles on the same tick, which is what
 * lets the route gates render a single continuous placeholder. It also removes
 * four redundant Firestore listeners from every authenticated page, and
 * `darkMode` stops being per-instance — the admin dashboard's chart palette
 * could previously settle on the light theme while the page was already dark,
 * then re-render.
 */

import React, { createContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { subscribeToDocument } from "../lib/firestore";

export type UserRole = "master_admin" | "admin" | "volunteer" | "parent" | null;
export type UserStatus = "incomplete_profile" | "pending" | "approved" | "rejected" | null;

export interface AuthState {
  user: User | null;
  userData: any;
  /** First role in the array. Kept for callers that predate `roles`; new code
   *  should test membership, since an account can hold several. */
  role: UserRole;
  roles: UserRole[];
  status: UserStatus;
  darkMode: boolean;
  loading: boolean;
  token: string | null;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [status, setStatus] = useState<UserStatus>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Derived primary role for backward compatibility
  const role = roles.length > 0 ? roles[0] : null;

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      // Only update if user is not logged in or doesn't have a preference
      if (!auth.currentUser) {
        setDarkMode(e.matches);
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        // Fetch ID token
        user.getIdToken().then(setToken).catch(err => console.error("Error getting token", err));

        unsubscribeDoc = subscribeToDocument("users", user.uid, (userDoc) => {
          if (userDoc) {
            setUserData(userDoc);

            // Handle both legacy single role and new roles array
            const userRoles = userDoc.roles || (userDoc.role ? [userDoc.role] : []);
            setRoles(userRoles as UserRole[]);

            setStatus(userDoc.status as UserStatus);

            // If user has a preference, use it. Otherwise, use system preference.
            const userPreference = userDoc.darkMode;
            const finalDarkMode = userPreference !== undefined ? userPreference : window.matchMedia('(prefers-color-scheme: dark)').matches;

            setDarkMode(finalDarkMode);
            if (finalDarkMode) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          } else {
            setUserData(null);
            setRoles([]);
            setStatus(null);
            // Default to system preference if no document
            const systemPref = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setDarkMode(systemPref);
            if (systemPref) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
          setLoading(false);
        }, (error) => {
          console.error("User document subscription error:", error);
          setLoading(false); // Ensure loading is false even on error
        });
      } else {
        setToken(null);
        setRoles([]);
        setStatus(null);
        setUserData(null);
        // Follow system preference when logged out
        const systemPref = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDarkMode(systemPref);
        if (systemPref) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  // Without this the value is a fresh object on every provider render, and this
  // provider now sits above the entire app — every consumer would re-render on
  // each one.
  const value = useMemo<AuthState>(
    () => ({ user, userData, role, roles, status, darkMode, loading, token }),
    [user, userData, role, roles, status, darkMode, loading, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
