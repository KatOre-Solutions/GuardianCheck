import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { subscribeToDocument } from "../lib/firestore";

export type UserRole = "admin" | "volunteer" | "parent" | null;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (user) {
        unsubscribeDoc = subscribeToDocument("users", user.uid, (userDoc) => {
          if (userDoc) {
            setUserData(userDoc);
            if (userDoc.deactivated) {
              auth.signOut();
              setRole(null);
              setUser(null);
              setUserData(null);
              setLoading(false);
              return;
            }
            setRole(userDoc.role as UserRole);
            setDarkMode(userDoc.darkMode || false);
            if (userDoc.darkMode) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          } else {
            setUserData(null);
            // For the bootstrap admin, we can optimistically set the role
            // while the document is being created in Login.tsx
            if (user.email === "oreutlwilediutlwileng@gmail.com") {
              setRole("admin");
            } else {
              setRole("parent");
            }
          }
          setLoading(false);
        });
      } else {
        setRole(null);
        setUserData(null);
        setDarkMode(false);
        document.documentElement.classList.remove('dark');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return { user, userData, role, darkMode, loading };
}
