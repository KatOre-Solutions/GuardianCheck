import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate, useLocation, useMatch } from "react-router-dom";
import { where, limit, query, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";

interface ChurchBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface Church {
  id: string;
  name: string;
  slug: string;
  branding?: ChurchBranding;
  status?: string;
}

interface TenantContextType {
  church: Church | null;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const match = useMatch("/:churchSlug/*");
  const urlChurchSlug = match?.params.churchSlug;
  const { userData, loading: authLoading } = useAuth();
  
  const reservedKeywords = ["login", "register-church", "accept-invite", "complete-profile", "pending-approval", "rejected", "profile", "master-admin", "admin", "volunteer", "parent", "api", "assets", "static", "policy-acceptance"];
  const isReserved = !!urlChurchSlug && reservedKeywords.includes(urlChurchSlug);
  
  // Use slug from URL if it's not a reserved keyword, otherwise fallback to user's church slug
  const churchSlug = isReserved ? userData?.churchSlug : (urlChurchSlug || userData?.churchSlug);
  
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function fetchChurch() {
      // If we're still loading auth and don't have a valid URL slug, wait
      if (authLoading && (!urlChurchSlug || isReserved)) return;

      if (!churchSlug) {
        setChurch(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, "churches"),
          where("slug", "==", churchSlug),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          setError("Church not found");
          setChurch(null);
        } else {
          const doc = querySnapshot.docs[0];
          const churchData = { id: doc.id, ...doc.data() } as Church;
          setChurch(churchData);
          
          // Apply branding if available
          if (churchData.branding?.primaryColor) {
            document.documentElement.style.setProperty('--primary-color', churchData.branding.primaryColor);
          } else {
            document.documentElement.style.removeProperty('--primary-color');
          }
          
          if (churchData.branding?.secondaryColor) {
            document.documentElement.style.setProperty('--secondary-color', churchData.branding.secondaryColor);
          } else {
            document.documentElement.style.removeProperty('--secondary-color');
          }
        }
      } catch (err) {
        console.error("Error fetching church:", err);
        setError("Failed to load church details");
      } finally {
        setLoading(false);
      }
    }

    fetchChurch();
  }, [churchSlug, authLoading]);

  return (
    <TenantContext.Provider value={{ church, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
