import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { CURRENT_POLICY_VERSION } from "../constants/legalContent";

interface PolicyGuardProps {
  children: React.ReactNode;
}

export function PolicyGuard({ children }: PolicyGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
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
        // On error, we might want to allow access or show an error page
        // For security, we'll block and show error
      } finally {
        setLoading(false);
      }
    }

    checkPolicy();
  }, [user, authLoading, navigate, location.pathname]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If on policy page, or user is not logged in (AuthGuard handles that), or accepted
  if (location.pathname === "/policy-acceptance" || !user || accepted) {
    return <>{children}</>;
  }

  return null;
}
