import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { CURRENT_POLICY_VERSION } from "../constants/legalContent";
import { PageLoading } from "./PageLoading";

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

      try {
        const acceptanceDoc = await getDoc(doc(db, "policy_acceptance", user.uid));
        
        if (acceptanceDoc.exists()) {
          const data = acceptanceDoc.data();
          if (data.lastAcceptedVersion === CURRENT_POLICY_VERSION && data.status === "compliant") {
            setAccepted(true);
          } else {
            // Include the full path to preserve church context
            navigate("/policy-acceptance", { state: { from: location.pathname + location.search } });
          }
        } else {
          navigate("/policy-acceptance", { state: { from: location.pathname + location.search } });
        }
      } catch (error) {
        console.error("Error checking policy acceptance:", error);
        // For security we still block. But the block has to *say* so: a read
        // that failed will never answer and nothing navigates away from it, so
        // rendering the loading placeholder here left the page pulsing forever.
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }

    checkPolicy();
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
