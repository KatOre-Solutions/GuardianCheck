import { useEffect, useState } from "react";

/**
 * Browser network state only -- `navigator.onLine` plus the `online`/
 * `offline` window events. It says nothing about whether Firestore or any
 * other backend is actually reachable (a captive portal is a common false
 * positive), and it is not meant to: this hook decides which UI to render
 * (interactive vs. read-only offline), while whether there's anything cached
 * to show is a separate question answered by what Firestore's own
 * `persistentLocalCache` already has for the caller's listeners.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleChange);
    window.addEventListener("offline", handleChange);
    return () => {
      window.removeEventListener("online", handleChange);
      window.removeEventListener("offline", handleChange);
    };
  }, []);

  return isOnline;
}
