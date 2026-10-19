import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTenant } from "../contexts/TenantContext";
import { resolveLandingPath } from "../lib/landing";
import { useMarkWhen } from "../lib/perfMarks";
import { PageLoading } from "./PageLoading";
import { AccessDenied } from "./AccessDenied";
import { Seo } from "./Seo";

export function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, role, roles, status, loading, userData } = useAuth();
  const { church, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !tenantLoading) {
      if (!user) {
        navigate(church ? `/${church.slug}/login` : "/login");
      } else if (!user.emailVerified && user.providerData.some(p => p.providerId === "password")) {
        // Force verification for password users
        navigate(church ? `/${church.slug}/login` : "/login");
      } else if (status === "incomplete_profile") {
        // Force profile completion
        navigate("/complete-profile");
      } else if (status === "rejected") {
        navigate("/rejected");
      } else if (church && userData?.churchId !== church.id && !roles.includes("master_admin")) {
        // Cross-tenant access prevention
        const userChurchSlug = userData?.churchSlug || "dashboard";
        navigate(`/${userChurchSlug}`);
      } else if (roles.length > 0 && allowedRoles && !allowedRoles.some(r => roles.includes(r as any))) {
        // Same resolver the launch route uses, so "the screen this user owns"
        // has one definition. The tenant in the URL stands in when the account
        // itself carries no slug.
        navigate(resolveLandingPath({ ...userData, roles: roles as string[], churchSlug: userData?.churchSlug || church?.slug }), {
          replace: true,
        });
      }
    }
  }, [user, role, roles, status, loading, tenantLoading, navigate, allowedRoles, church, userData]);

  const hasAccess = !allowedRoles || roles.some(r => allowedRoles.includes(r as any));
  const isEmailVerified = user?.emailVerified || user?.providerData.some(p => p.providerId === "google.com");

  // Declared above the early return below: it is a hook.
  useMarkWhen("protected-route-released", !loading && !tenantLoading && !!user && !!isEmailVerified && hasAccess, {
    route: window.location.pathname,
  });

  if (loading || tenantLoading) {
    return <PageLoading />;
  }

  // The one case the effect above does not redirect: a signed-in, verified
  // account holding no roles at all. Its role-mismatch branch is guarded on
  // `roles.length > 0`, and the cross-tenant branch only fires under a church,
  // so on a role-restricted route nothing navigates. A placeholder here
  // would be a skeleton that never resolves, so say what is actually true.
  //
  // Onboarding statuses are excluded: those *do* redirect, and a role-less
  // account mid-signup would otherwise be told it lacks permission for one
  // frame on its way to /complete-profile -- the flash this change removes
  // everywhere else.
  const onboarding = status === "incomplete_profile" || status === "rejected";
  if (user && isEmailVerified && !hasAccess && roles.length === 0 && !onboarding) {
    return <AccessDenied requirement={allowedRoles?.join(" or ") || "a supported role"} />;
  }

  // Every route behind auth is noindex by definition, so it is set here once
  // rather than in each dashboard. Pages rendered as `children` must not
  // render their own <Seo> — see the contract in components/Seo.tsx.
  const sameTenant = !church || userData?.churchId === church.id || roles.includes("master_admin");
  return user && isEmailVerified && hasAccess && !onboarding && sameTenant ? (
    <>
      <Seo title="Dashboard" noindex />
      {children}
    </>
  ) : (
    // Not a dead end: the effect above is redirecting. Returning null here
    // blanked the page for the length of that navigation, which is the empty
    // frame at the start of the load.
    <PageLoading />
  );
}
