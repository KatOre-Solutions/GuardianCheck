import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { useMatch } from "react-router-dom";
import { where, limit, query, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { RESERVED_SLUGS } from "../constants/appRoutes";
import { markOnce } from "../lib/perfMarks";

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

/** Where the last successfully resolved church for a slug is mirrored. It does
 * two jobs: a previously-visited church renders immediately while the live
 * lookup revalidates it (that lookup waits on a Firestore server round trip,
 * which measured ~3-4s on a warm dashboard load and held every route behind
 * `ProtectedRoute`), and it still resolves on a cold offline launch. This is
 * exactly this one public document, not a general persistence layer -- app
 * data (children, guardians, checkins) stays Firestore's own
 * `persistentLocalCache` responsibility. */
const churchCacheKey = (slug: string) => `gc.church.${slug}`;

function readCachedChurch(slug: string): Church | null {
  try {
    const raw = localStorage.getItem(churchCacheKey(slug));
    return raw ? (JSON.parse(raw) as Church) : null;
  } catch {
    return null;
  }
}

function writeCachedChurch(slug: string, churchData: Church) {
  try {
    localStorage.setItem(churchCacheKey(slug), JSON.stringify(churchData));
  } catch {
    // Best-effort -- a full/unavailable localStorage just means no offline
    // fallback for this slug, not a reason to fail the (successful) fetch.
  }
}

function removeCachedChurch(slug: string) {
  try {
    localStorage.removeItem(churchCacheKey(slug));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function applyBranding(branding: ChurchBranding | undefined) {
  if (branding?.primaryColor) {
    document.documentElement.style.setProperty("--primary-color", branding.primaryColor);
  } else {
    document.documentElement.style.removeProperty("--primary-color");
  }

  if (branding?.secondaryColor) {
    document.documentElement.style.setProperty("--secondary-color", branding.secondaryColor);
  } else {
    document.documentElement.style.removeProperty("--secondary-color");
  }
}

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

      // Stale-while-revalidate. A church this device has resolved before is
      // rendered now, and the lookup below still runs and corrects it. Only
      // the public fields are mirrored, keyed by slug, so this can show a
      // stale name or colour for a moment but never another tenant's church;
      // data access is still decided by Firestore rules, not by this value.
      const mirrored = readCachedChurch(churchSlug);
      markOnce("tenant-cache-resolved", { hit: !!mirrored });
      setError(null);
      if (mirrored) {
        setChurch(mirrored);
        applyBranding(mirrored.branding);
        setLoading(false);
      } else {
        setLoading(true);
      }

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
        markOnce("tenant-server-start");
        const querySnapshot = await getDocs(q);
        markOnce("tenant-server-resolved", { empty: querySnapshot.empty, fromCache: querySnapshot.metadata.fromCache });
        if (stale()) return;

        if (!querySnapshot.empty) {
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
          writeCachedChurch(churchSlug, churchData);
          applyBranding(churchData.branding);
        } else if (querySnapshot.metadata.fromCache && mirrored) {
          // Offline, `getDocs` does not throw -- it resolves from Firestore's
          // local cache, and a slug that cache doesn't hold comes back as an
          // empty snapshot marked `fromCache`. That means "not on this
          // device", not "no such church": keep the mirrored church showing.
        } else {
          // Only a server answer is authoritative enough to forget the
          // mirror. An empty cache answer with no mirror is still not found
          // for this device, but says nothing about the church itself.
          if (!querySnapshot.metadata.fromCache) removeCachedChurch(churchSlug);
          setError("Church not found");
          setChurch(null);
        }
      } catch (err) {
        if (stale()) return;
        markOnce("tenant-server-resolved", { error: true });
        console.error("Error fetching church:", err);

        if (mirrored) {
          // Already rendering this slug's own mirrored church. A failed
          // revalidation is not evidence the church is gone, so don't tear the
          // page down over it; clearing the ref lets a later run retry.
          requestedSlug.current = null;
          return;
        }

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

  // Memoised because this provider re-renders whenever auth state changes and
  // it sits above the whole app; a fresh object would re-render every
  // `useTenant` consumer for nothing.
  const value = useMemo(() => ({ church, loading, error }), [church, loading, error]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
