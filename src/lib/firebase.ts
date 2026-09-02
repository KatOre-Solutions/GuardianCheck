import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  terminate,
  clearIndexedDbPersistence
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize App Check immediately after app init
if (typeof window !== "undefined") {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
  }
}

export const auth = getAuth(app);

// Modern Firestore initialization with persistent cache and multi-tab support
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

export const storage = getStorage(app);

// A connectivity probe used to read `test/connection` on every page load. The
// `test` collection was world-readable -- `allow read: if true` -- which is the
// only reason the probe worked, and that rule is gone. The probe swallowed
// every error except a specific offline string, so it never surfaced anything
// either; keeping it would just mean a permission-denied on every load.
