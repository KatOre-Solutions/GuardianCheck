import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useMatch } from "react-router-dom";
import { where, limit, query, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { RESERVED_SLUGS } from "../constants/appRoutes";

interface ChurchBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

/**
 * A church as the public landing page knows it. Mirrors `church_public`
 * exactly -- if you add a field here, add it to CHURCH_PUBLIC_FIELDS in
 * server.ts and understand that you are publishing it to anonymous visitors.
 *
 * `status` used to be declared here and was never read through this context;
 * billing state belongs to the authenticated `churches` subscription that
 * ChurchSettings holds.
 */
interface Church {
  id: string;
  name: string;
  slug: string;
  branding?: ChurchBranding;
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
  
  // Derived from the route manifest, not a second hand-maintained copy of it.
  // The copy had already fallen behind: /app was absent, so launching the
  // installed app looked up a church called "app", found none, and raised a
  // not-found error that outlived the redirect that followed.
  const isReserved = !!urlChurchSlug && RESERVED_SLUGS.includes(urlChurchSlug);
  
  // Use slug from URL if it's not a reserved keyword, otherwise fallback to user's church slug
  const churchSlug = isReserved ? userData?.churchSlug : (urlChurchSlug || userData?.churchSlug);
  
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* The slug this context has asked for. It answers both questions the effect
     needs, which is why it is one ref rather than two guards:

     - Should this run start a lookup? Only if the slug differs from the one
       already asked for. The effect also depends on `authLoading`, so on a
       tenant URL it runs twice -- once while auth is pending and again when it
       settles -- and without this the second run repeats the query and its
       `setLoading(true)` re-shows the placeholder after the page has painted.

     - Should this response be applied? Only if the slug is still the one
       wanted. A slow answer for a church the user has already navigated away
       from must not land on top of the current one, or the header renders the
       church that resolved while the body renders the not-found state left
       behind by the stale request.

     Judging staleness by slug rather than by which effect run issued the
     request matters: a re-run for the *same* slug must not cancel the lookup
     already in flight for it, or nothing ever resolves and the page sits in a
     placeholder forever. */
  const requestedSlug = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    /** True once the slug this run asked for is no longer the one wanted. */
    const stale = () => requestedSlug.current !== churchSlug;

    async function fetchChurch() {
      // If we're still loading auth and don't have a valid URL slug, wait
      if (authLoading && (!urlChurchSlug || isReserved)) return;

      if (!churchSlug) {
        requestedSlug.current = null;
        setChurch(null);
        setLoading(false);
        return;
      }

      if (requestedSlug.current === churchSlug) return;
      requestedSlug.current = churchSlug;

      setLoading(true);
      setError(null);
      try {
        // Reads `church_public`, never `churches`. This lookup runs before
        // anyone has logged in, and the `churches` document carries
        // adminEmail, plan, the subscription map and the PayFast subscription
        // token -- none of which an anonymous visitor should be able to pull
        // down. `church_public` holds only name, slug and branding, written
        // server-side from a fixed field list.
        const q = query(
          collection(db, "church_public"),
          where("slug", "==", churchSlug),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (stale()) return;

        if (querySnapshot.empty) {
          setError("Church not found");
          setChurch(null);
        } else {
          const doc = querySnapshot.docs[0];
          const data = doc.data();
          // Named fields rather than a spread. The spread is what put the
          // PayFast token into browser state in the first place: the Church
          // type only declares five fields, but a spread carries every field
          // the document happens to have, and TypeScript never sees it.
          const churchData: Church = {
            id: data.churchId || doc.id,
            name: data.name,
            slug: data.slug,
            branding: data.branding ?? undefined,
          };
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
        if (stale()) return;
        console.error("Error fetching church:", err);
        setError("Failed to load church details");
        // Dropped alongside the error. Leaving the previous church in place
        // would render one tenant's branding and pages under another tenant's
        // URL -- the failure this whole context exists to prevent.
        setChurch(null);
        // Cleared *after* `loading`, and `loading` cleared here rather than in
        // `finally`: `stale()` reads this ref, so resetting it first makes the
        // `finally` below skip `setLoading(false)` and the page sits in its
        // placeholder forever instead of showing the error.
        setLoading(false);
        // Let a later run try again -- the guard above is there to stop
        // duplicate work, not to make a failure permanent.
        requestedSlug.current = null;
      } finally {
        if (!stale()) setLoading(false);
      }
    }

    fetchChurch();
    // `churchSlug` is the only input to the query, so navigating between two
    // reserved paths that resolve to the same church must not refetch it.
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
