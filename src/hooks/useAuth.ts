import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { subscribeToDocument } from "../lib/firestore";

export type UserRole = "master_admin" | "admin" | "volunteer" | "parent" | null;
export type UserStatus = "incomplete_profile" | "pending" | "approved" | "rejected" | null;

export function useAuth() {
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
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (user) {
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

  return { user, userData, role, roles, status, darkMode, loading };
}
