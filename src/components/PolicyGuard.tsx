import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc, getDocFromCache } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { CURRENT_POLICY_VERSION } from "../constants/legalContent";
import { PageLoading } from "./PageLoading";
import { markOnce } from "../lib/perfMarks";

interface PolicyGuardProps {
  children: React.ReactNode;
}

export function PolicyGuard({ children }: PolicyGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Two reads now resolve at different times; a run superseded by a newer
    // path or account must not act on either of them.
    let cancelled = false;

    async function checkPolicy() {
      if (authLoading) return;
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Skip check for the policy page itself to avoid infinite loops
      if (location.pathname === "/policy-acceptance") {
        setLoading(false);
        return;
      }

      setFailed(false);

      const acceptanceRef = doc(db, "policy_acceptance", user.uid);
      const isCompliant = (snapshot: Awaited<ReturnType<typeof getDoc>>) => {
        const data = snapshot.exists() ? (snapshot.data() as { lastAcceptedVersion?: string; status?: string }) : null;
        return !!data && data.lastAcceptedVersion === CURRENT_POLICY_VERSION && data.status === "compliant";
      };

      // Cache first. `getDoc` waits for a Firestore server round trip, which
      // measured ~3-4s on a warm dashboard load, and every protected page sat
      // behind it. An acceptance this device already holds for the *current*
      // policy version releases the page now; the server read below still
      // runs and still redirects if the answer has changed. The version
      // constant ships in the bundle, so a policy bump invalidates a cached
      // acceptance on the next deploy without waiting for the server.
      let acceptedFromCache = false;
      try {
        acceptedFromCache = isCompliant(await getDocFromCache(acceptanceRef));
        markOnce("policy-cache-resolved", { hit: true, compliant: acceptedFromCache });
      } catch {
        // Not in the local cache -- first visit on this device, or evicted.
        markOnce("policy-cache-resolved", { hit: false });
      }
      if (cancelled) return;
      if (acceptedFromCache) {
        setAccepted(true);
        setLoading(false);
      }

      try {
        const acceptanceDoc = await getDoc(acceptanceRef);
        const compliant = isCompliant(acceptanceDoc);
        markOnce("policy-server-resolved", { compliant, fromCache: acceptanceDoc.metadata.fromCache });
        if (cancelled) return;

        if (compliant) {
          setAccepted(true);
        } else {
          setAccepted(false);
          // Include the full path to preserve church context
          navigate("/policy-acceptance", { state: { from: location.pathname + location.search } });
        }
      } catch (error) {
        markOnce("policy-server-resolved", { error: true });
        if (cancelled) return;
        if (acceptedFromCache) {
          // Already released on this device's acceptance of the current
          // version. `getDoc` itself answers from that same cache when the
          // client is offline, so failing closed here would be stricter than
          // the offline path -- keep the page and say why in the console.
          console.warn("Policy acceptance revalidation failed; using cached acceptance:", error);
          return;
        }
        console.error("Error checking policy acceptance:", error);
        // For security we still block. But the block has to *say* so: a read
        // that failed will never answer and nothing navigates away from it, so
        // rendering the loading placeholder here left the page pulsing forever.
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkPolicy();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate, location.pathname]);

  if (authLoading || loading) {
    return <PageLoading />;
  }

  // If on policy page, or user is not logged in (AuthGuard handles that), or accepted
  if (location.pathname === "/policy-acceptance" || !user || accepted) {
    return <>{children}</>;
  }

  // The read failed. Nothing is in flight and nothing will navigate, so a
  // placeholder here is a permanent lie -- say what happened instead.
  if (failed) {
    return (
      <div className="p-12 text-center space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Couldn't check your policy acceptance</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          We couldn't confirm that you've accepted the current policies, so this page is blocked.
          Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-block text-primary font-bold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Redirecting to /policy-acceptance: the user is on their way somewhere, so
  // returning null showed a blank page for the length of that navigation.
  return <PageLoading />;
}
