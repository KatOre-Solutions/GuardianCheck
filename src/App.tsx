import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Shield, User, LogOut, LayoutDashboard, QrCode, ClipboardCheck, Users, Settings, Home as HomeIcon, Calendar, Menu, X } from "lucide-react";
import { auth } from "./lib/firebase";
import { useAuth } from "./hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import NetworkStatus from "./components/NetworkStatus";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./contexts/AuthContext";
import { TenantProvider, useTenant } from "./contexts/TenantContext";
import { ChurchLogo } from "./components/ChurchLogo";
import Footer from "./components/Footer";

import { SpeedInsights } from "@vercel/speed-insights/react";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import { PolicyGuard } from "./components/PolicyGuard";
import { ChurchAccessGate } from "./components/ChurchAccessGate";
import NotFound from "./pages/NotFound";
import { isKnownAppPath, RESERVED_SLUGS, routePatternFor } from "./constants/appRoutes";
import { resolveLandingPath } from "./lib/landing";
import { Seo } from "./components/Seo";
import { JsonLd } from "./components/JsonLd";
import { COMPANY } from "./constants/company";
import { SITE_NAME, SITE_URL, absoluteUrl } from "./constants/site";
import { PageLoading } from "./components/PageLoading";
import { AccessDenied } from "./components/AccessDenied";
import { useMarkWhen } from "./lib/perfMarks";
import { lazyWithReload } from "./lib/lazyWithReload";
import { SITE_MODE } from "./lib/siteMode";
import { CrossHostRedirect, SiteLink } from "./components/SiteLink";

/* Route-level code splitting (#43). This used to download and parse every
   dashboard, the charting library, the QR scanner, the whole authenticated
   app, before an anonymous visitor's landing page could paint. NotFound
   stays in the entry chunk because TenantLayout renders it as a fallback.
   Everything else, Home and ChurchLanding included, loads when its route is
   first rendered, behind the Suspense boundary in Layout: an /app user
   (parent, volunteer, admin) never renders either, so there is no reason for
   their bundle to include the marketing chunk any more than it includes
   AdminDashboard's (docs/marketing-redesign-plan.md §8). Home and
   ChurchLanding are still preloaded at startup, in parallel with auth, via
   ROUTE_CHUNKS below. They are simply no longer bundled in.

   The offline shell still works: scripts/generate-sw-precache.ts precaches
   every chunk in dist/assets, not only the ones index.html references, so a
   parent's cold offline launch can still load ParentDashboard's chunk. */
const Login = lazyWithReload(() => import("./pages/Login"));
const Home = lazyWithReload(() => import("./pages/Home"));
const ChurchLanding = lazyWithReload(() => import("./pages/ChurchLanding"));
const RegisterChurch = lazyWithReload(() => import("./pages/RegisterChurch"));
const AcceptInvite = lazyWithReload(() => import("./pages/AcceptInvite"));
const ProfileCompletion = lazyWithReload(() => import("./pages/ProfileCompletion"));
const PendingApproval = lazyWithReload(() => import("./pages/PendingApproval"));
const Rejected = lazyWithReload(() => import("./pages/Rejected"));
const Profile = lazyWithReload(() => import("./pages/Profile"));
const ParentDashboard = lazyWithReload(() => import("./pages/ParentDashboard"));
const VolunteerDashboard = lazyWithReload(() => import("./pages/VolunteerDashboard"));
const AdminDashboard = lazyWithReload(() => import("./pages/AdminDashboard"));
const EventsServices = lazyWithReload(() => import("./pages/EventsServices"));
const MasterAdminDashboard = lazyWithReload(() => import("./pages/MasterAdminDashboard"));
const MasterAdminLogs = lazyWithReload(() => import("./pages/MasterAdminLogs"));
const ChurchSettings = lazyWithReload(() => import("./pages/ChurchSettings"));
const PolicyAcceptancePage = lazyWithReload(() => import("./pages/PolicyAcceptancePage"));
const AboutPage = lazyWithReload(() => import("./pages/AboutPage"));
const ContactPage = lazyWithReload(() => import("./pages/ContactPage"));
const PrivacyPolicyPage = lazyWithReload(() => import("./pages/legal/PrivacyPolicyPage"));
const TermsOfServicePage = lazyWithReload(() => import("./pages/legal/TermsOfServicePage"));
const PopiaPage = lazyWithReload(() => import("./pages/legal/PopiaPage"));
const CookiePolicyPage = lazyWithReload(() => import("./pages/legal/CookiePolicyPage"));
const SecurityPage = lazyWithReload(() => import("./pages/legal/SecurityPage"));

/* A lazy route renders only once its gates open -- ProtectedRoute waits on auth,
   PolicyGuard on the acceptance check -- so left alone its chunk request would
   start after them, adding the download to the end of a waterfall #124 just
   shortened. The route being opened is known from the URL before anything
   renders, so start that one chunk now, in parallel with auth. */
const ROUTE_CHUNKS: Record<string, { preload: () => void }> = {
  "/": Home,
  "/login": Login,
  "/register-church": RegisterChurch,
  "/accept-invite": AcceptInvite,
  "/complete-profile": ProfileCompletion,
  "/pending-approval": PendingApproval,
  "/rejected": Rejected,
  "/policy-acceptance": PolicyAcceptancePage,
  "/profile": Profile,
  "/master-admin": MasterAdminDashboard,
  "/master-admin/logs": MasterAdminLogs,
  "/[churchSlug]": ChurchLanding,
  "/[churchSlug]/login": Login,
  "/[churchSlug]/parent": ParentDashboard,
  "/[churchSlug]/volunteer": VolunteerDashboard,
  "/[churchSlug]/admin": AdminDashboard,
  "/[churchSlug]/admin/settings": ChurchSettings,
  "/[churchSlug]/admin/events": EventsServices,
};
function preloadRouteChunk(pathname: string) {
  const pattern = routePatternFor(pathname);
  // The marketing home page stays on the apex (#14), so the app host never
  // renders it and its chunk would be a wasted download.
  if (SITE_MODE === "app" && pattern === "/") return;
  ROUTE_CHUNKS[pattern]?.preload();
}

/* /app (the installed app's start_url) and the bare role paths render
   DashboardRedirect, which names no page: where it goes depends on the account,
   known only once auth resolves. The page's gates then release within tens of
   ms, too soon for its chunk and the shared chunks it imports, so it suspends --
   measured at 450ms-1s from release to render, against ~100-240ms on the
   dashboard's own URL. The screen an account lands on rarely changes, so
   remember it and start that chunk at startup instead. A stale guess costs one
   unused download; DashboardRedirect still preloads the real target. */
const REDIRECT_PATHS = new Set(["/app", "/admin", "/volunteer", "/parent"]);
// On the app host `/` is a launch route too: the marketing home page stays on
// the apex, so opening app.guardiancheck.co.za goes straight to a dashboard.
if (SITE_MODE === "app") REDIRECT_PATHS.add("/");
const LAST_LANDING_KEY = "gc.lastLandingPath";

function rememberLanding(pathname: string) {
  try {
    localStorage.setItem(LAST_LANDING_KEY, pathname);
  } catch {
    // Best-effort: without storage the redirect preloads the target late.
  }
}

if (typeof window !== "undefined") {
  let startPath = window.location.pathname;
  if (REDIRECT_PATHS.has(routePatternFor(startPath))) {
    try {
      startPath = localStorage.getItem(LAST_LANDING_KEY) ?? startPath;
    } catch {
      // Unavailable storage: nothing remembered, nothing to preload.
    }
  }
  preloadRouteChunk(startPath);
}

function DashboardRedirect() {
  const { user, userData, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (loading) return;

    // Password accounts must verify before a dashboard means anything, and the
    // resend-verification flow lives on the login page.
    const unverifiedPassword =
      !!user && !user.emailVerified && user.providerData.some(p => p.providerId === "password");

    // Query params such as ?payment=success are carried through on every
    // branch, the login bounce included: the screen this lands on is what
    // reads them, and dropping them here loses the only copy.
    const search = window.location.search;
    const target = unverifiedPassword ? `/login${search}` : resolveLandingPath(userData, search);

    // See REDIRECT_PATHS: covers a first launch, or a landing that changed.
    const targetPath = target.split("?")[0];
    preloadRouteChunk(targetPath);
    if (user && !unverifiedPassword) rememberLanding(targetPath);

    // `replace`, not push. This route only ever forwards, so a pushed entry
    // would make Back re-enter it and bounce straight forward again -- and an
    // installed app has no address bar to escape that with.
    navigate(target, { replace: true });
  }, [userData, loading, navigate, user]);

  // /app, /admin, /volunteer and /parent are authenticated-app entry points
  // that never reach ProtectedRoute, so they need their own noindex rather
  // than inheriting whatever head tags the previous route left behind.
  return (
    <>
      <Seo title="Dashboard" noindex />
      <PageLoading />
    </>
  );
}

function Navigation() {
  const { user, roles, userData, loading: authLoading } = useAuth();
  const { church, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  /* Whether this URL names a church at all. `/:churchSlug` is any single
     segment that is not one of the app's own paths -- the same test
     TenantProvider applies before it looks a slug up. */
  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  const expectingChurch = !!firstSegment && !RESERVED_SLUGS.includes(firstSegment);

  const handleLogout = async () => {
    await auth.signOut();
    navigate(church ? `/${church.slug}` : "/");
  };

  const hasRole = (role: string) => roles.includes(role as any);
  const churchPrefix = church ? `/${church.slug}` : "";
  const isEmailVerified = user?.emailVerified || user?.providerData.some(p => p.providerId === "google.com");

  // Hide role-based links on auth/onboarding pages to avoid confusion
  const isAuthPage = ["/login", "/accept-invite", "/register-church", "/complete-profile", "/pending-approval", "/rejected"].some(path =>
    location.pathname.includes(path)
  );

  // The links are built as data rather than JSX because they are rendered
  // twice -- inline on desktop, and inside the mobile sheet below.
  const isAdmin = hasRole("admin") || hasRole("master_admin");
  const navLinks: { to: string; label: string; icon: React.ReactNode }[] = [];

  if (isEmailVerified && !isAuthPage) {
    if (hasRole("master_admin")) {
      navLinks.push({ to: "/master-admin", label: "Platform Admin", icon: <LayoutDashboard className="h-4 w-4" /> });
    }
    if (church) {
      if (isAdmin) {
        navLinks.push({ to: `${churchPrefix}/admin`, label: "Admin", icon: <LayoutDashboard className="h-4 w-4" /> });
        navLinks.push({ to: `${churchPrefix}/admin/settings`, label: "Settings", icon: <Settings className="h-4 w-4" /> });
        navLinks.push({ to: `${churchPrefix}/admin/events`, label: "Events", icon: <Calendar className="h-4 w-4" /> });
      }
      if (isAdmin || hasRole("volunteer")) {
        navLinks.push({ to: `${churchPrefix}/volunteer`, label: "Volunteer", icon: <ClipboardCheck className="h-4 w-4" /> });
      }
      if (isAdmin || hasRole("parent")) {
        navLinks.push({ to: `${churchPrefix}/parent`, label: "Parent", icon: <HomeIcon className="h-4 w-4" /> });
      }
    }
    navLinks.push({ to: "/profile", label: "Profile", icon: <User className="h-4 w-4" /> });
  }

  // A left-open menu would otherwise survive the navigation it triggered.
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const linkClass = "text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors";

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50 transition-colors">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2">
          <div className="flex items-center min-w-0">
            <Link to={churchPrefix || "/"} className="flex items-center space-x-2 min-w-0">
              {/* A fixed slot. The fallback shield is 32px, the church logo a
                  padded box of ~45px, and the swap happens when the tenant
                  resolves -- a measured layout shift on every church page.
                  Sized for the larger of the two so neither moves the name. */}
              <span className="shrink-0 flex items-center justify-center h-12 w-10">
                <ChurchLogo logoUrl={church?.branding?.logoUrl} name={church?.name} />
              </span>
              <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate min-w-0">
                {/* On a tenant URL the church's name is coming; showing
                    "GuardianCheck" first and replacing it is a visible swap in
                    the header, so hold the space until we know.
                    Only on a tenant URL, though: everywhere else no church is
                    coming and the wordmark is the final answer. Holding space
                    there put a grey bar where "GuardianCheck" belongs on the
                    marketing home page, for the whole of auth initialisation,
                    for every first-time anonymous visitor. */}
                {expectingChurch && tenantLoading && !church ? (
                  <span className="inline-block h-5 w-40 align-middle rounded bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
                ) : (
                  church?.name || "GuardianCheck"
                )}
              </span>
            </Link>
          </div>

          {authLoading ? (
            /* Not signed out -- not yet known. Rendering the signed-out
               buttons here and replacing them a moment later is a guaranteed
               swap in the header; this holds the same space silently. */
            <div className="flex items-center space-x-2 sm:space-x-3 shrink-0" aria-hidden="true">
              <div className="h-9 w-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
              <div className="h-9 w-16 rounded-lg bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : user ? (
            <>
              {/* Every role link at once overflows anything narrower than a
                  laptop, so below `lg` they move into the sheet under this
                  bar rather than pushing the page sideways. */}
              <div className="hidden lg:flex items-center space-x-4 shrink-0">
                {navLinks.map(link => (
                  <Link key={link.to} to={link.to} title={link.label} className={linkClass}>
                    {link.icon}
                    <span className="hidden xl:inline">{link.label}</span>
                  </Link>
                ))}
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden xl:inline">Logout</span>
                </button>
              </div>

              <button
                onClick={() => setMobileMenuOpen(open => !open)}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav"
                className="lg:hidden shrink-0 p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </>
          ) : (
            <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
              <Link
                to={church ? `${churchPrefix}/login?mode=signup` : "/login?mode=signup"}
                className="border border-gray-300 dark:border-gray-700 text-gray-750 dark:text-gray-250 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Sign Up
              </Link>
              <Link
                to={church ? `${churchPrefix}/login` : "/login"}
                className="bg-primary text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Login
              </Link>
            </div>
          )}
        </div>
      </nav>

      {user && mobileMenuOpen && (
        <div id="mobile-nav" className="lg:hidden border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-1 bg-white dark:bg-gray-900 shadow-lg">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileMenuOpen(false)}
              className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center space-x-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors"
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="w-full text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center space-x-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </header>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
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
      } else if (roles.length > 0 && !allowedRoles.some(r => roles.includes(r as any))) {
        // Same resolver the launch route uses, so "the screen this user owns"
        // has one definition. The tenant in the URL stands in when the account
        // itself carries no slug.
        navigate(resolveLandingPath({ ...userData, roles: roles as string[], churchSlug: userData?.churchSlug || church?.slug }), {
          replace: true,
        });
      }
    }
  }, [user, role, roles, status, loading, tenantLoading, navigate, allowedRoles, church, userData]);

  const hasAccess = roles.some(r => allowedRoles.includes(r as any));
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
  // so on /profile or /master-admin nothing navigates. A placeholder here
  // would be a skeleton that never resolves, so say what is actually true.
  //
  // Onboarding statuses are excluded: those *do* redirect, and a role-less
  // account mid-signup would otherwise be told it lacks permission for one
  // frame on its way to /complete-profile -- the flash this change removes
  // everywhere else.
  const onboarding = status === "incomplete_profile" || status === "rejected";
  if (user && isEmailVerified && roles.length === 0 && !onboarding) {
    return <AccessDenied requirement={allowedRoles.join(" or ")} />;
  }

  // Every route behind auth is noindex by definition, so it is set here once
  // rather than in each dashboard. Pages rendered as `children` must not
  // render their own <Seo> — see the contract in components/Seo.tsx.
  return user && isEmailVerified && hasAccess ? (
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

/** Speed Insights with the route pattern attached -- see `routePatternFor`. */
function RoutedSpeedInsights() {
  const { pathname } = useLocation();
  return <SpeedInsights route={routePatternFor(pathname)} />;
}

/**
 * A client-side route change keeps whatever scroll position the previous
 * page was at. Unlike a full page load, the browser has no reason to reset
 * it. That reads as a bug on, say, a footer legal link clicked from partway
 * down the home page: Terms of Service opens already scrolled to wherever
 * Home happened to be.
 *
 * When the URL carries a hash instead, the browser's own scroll-to-anchor
 * does not apply here: that only fires for a full page load or a plain
 * `<a href="#id">` click, never for a react-router `<Link>` navigation
 * (pushState doesn't trigger it), which is exactly what the marketing
 * header's nav links and the footer's section links are. So this scrolls
 * to the target itself instead of assuming the browser will. It polls
 * rather than trying once, because the target can be inside a route that
 * is still loading its lazy chunk (footer link from /about to /#pricing,
 * say), the element genuinely doesn't exist in the DOM yet on the first
 * few frames after navigation.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  React.useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    const id = hash.slice(1);
    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      attempts += 1;
      // ~2s at 50ms apart. Generous for a lazy chunk fetch, short enough
      // that a genuinely missing id just gives up quietly.
      if (attempts < 40) window.setTimeout(tryScroll, 50);
    };

    tryScroll();
    return () => {
      cancelled = true;
    };
  }, [pathname, hash]);

  return null;
}

/**
 * "app" (default) is every authenticated and utility page: `Navigation`, and
 * a padded, width-capped `<main>`. "marketing" is `/`, `/about`, `/contact`
 * and the legal pages: `MarketingHeader`, and a full-bleed `<main>` so Home's
 * dark bands and sticky columns can run edge to edge. The pages that don't
 * need that (About, Contact, the legal pages) already carry their own
 * max-width wrapper, so they render correctly inside either.
 */
/**
 * Organization + WebSite JSON-LD, site-wide (#33): every route describes the
 * same entity, single-sourced from company.ts/site.ts so it can never drift
 * from what About/Contact say about themselves. Rendered once from Layout
 * rather than per-page, so a page must not also render its own Organization
 * block under the same id. See Home.tsx, which used to.
 */
function GlobalJsonLd() {
  // The app host is noindex throughout; the entity is described on the apex.
  if (SITE_MODE === "app") return null;

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: COMPANY.legalName,
    url: SITE_URL,
    logo: absoluteUrl("/icon.svg"),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: COMPANY.email,
      telephone: COMPANY.whatsapp,
      areaServed: "ZA",
    },
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };

  return (
    <>
      <JsonLd id="organization-jsonld" data={organizationJsonLd} />
      <JsonLd id="website-jsonld" data={websiteJsonLd} />
    </>
  );
}

function Layout({ children, variant = "app" }: { children: React.ReactNode; variant?: "app" | "marketing" }) {
  return (
    <>
      <GlobalJsonLd />
      {variant === "marketing" ? <MarketingHeader /> : <Navigation />}
      <main id="main" className={variant === "marketing" ? "" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>
        {/* Inside <main>, so the header stays put while a route chunk loads,
            and the fallback is the same route-shaped skeleton the auth and
            tenant gates already show -- a chunk load reads as one continuous
            placeholder, not a second one. */}
        <React.Suspense fallback={<PageLoading />}>{children}</React.Suspense>
      </main>
      <Footer />
    </>
  );
}

function TenantLayout() {
  const { church, loading, error } = useTenant();
  const location = useLocation();

  if (loading) {
    // Inside <Layout>: this branch used to render bare, so the header vanished
    // at the start of every tenant navigation and reappeared a moment later.
    return (
      <Layout>
        <PageLoading />
      </Layout>
    );
  }

  if (error || !church) {
    // `/:churchSlug/*` is greedy, so it also swallows paths that were never
    // church URLs at all -- /a/b/c/d matches with churchSlug="a". Telling
    // someone their church wasn't found is misleading when they typed junk, so
    // defer to the real not-found page for anything the route manifest doesn't
    // recognise. Same function the server uses to pick the status code.
    if (!isKnownAppPath(location.pathname)) {
      return (
        <Layout>
          <NotFound />
        </Layout>
      );
    }

    return (
      <Layout>
        {/*
          The one case the edge cannot catch. `/:churchSlug` is a valid URL
          shape, so the server answers 200 without knowing whether a church owns
          that slug -- proving otherwise means a Firestore read per request.
          noindex is what keeps a mistyped slug out of the index anyway.
        */}
        <Seo title="Church not found" noindex />
        <div className="p-12 text-center space-y-4">
          <div className="h-20 w-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Church Not Found</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            The church you are looking for doesn't exist or the link is incorrect. 
            Please check the URL or contact your church administrator.
          </p>
          <SiteLink host="marketing" to="/" className="inline-block text-primary font-bold hover:underline">
            Go to GuardianCheck Home
          </SiteLink>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

/**
 * The marketing site's pages, other than home. Declared once because they are
 * rendered by two route tables: the full one, and the marketing host's own.
 * The paths must match MARKETING_ROUTES in constants/appRoutes.ts.
 */
const MARKETING_PAGES: ReadonlyArray<readonly [string, React.ReactNode]> = [
  ["/about", <AboutPage />],
  ["/contact", <ContactPage />],
  ["/privacy", <PrivacyPolicyPage />],
  ["/terms", <TermsOfServicePage />],
  ["/popia", <PopiaPage />],
  ["/cookies", <CookiePolicyPage />],
  ["/security", <SecurityPage />],
];

/** A marketing page, or on the app host a hand-off to the apex, where it lives. */
function marketingElement(page: React.ReactNode) {
  return SITE_MODE === "app" ? <CrossHostRedirect host="marketing" /> : <Layout variant="marketing">{page}</Layout>;
}

/**
 * guardiancheck.co.za once the split is live: only the marketing pages, and
 * every other path handed to the same path on the app host.
 */
function MarketingHostRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout variant="marketing"><Home /></Layout>} />
      {MARKETING_PAGES.map(([path, page]) => (
        <React.Fragment key={path}>
          <Route path={path} element={marketingElement(page)} />
        </React.Fragment>
      ))}
      <Route path="*" element={<CrossHostRedirect host="app" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* Outside the Router deliberately: the provider needs no router hooks,
          and keeping it here guarantees nothing routing does can tear down the
          auth listener. TenantProvider must stay inside both -- it calls
          useAuth as well as useMatch/useNavigate. */}
      {/* `reducedMotion="user"` makes every motion animation in the app respect
          the OS setting: transform and layout animations are dropped, opacity
          is kept, so things still fade in without sliding. Nothing here
          honoured the preference before. */}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <Router>
          <TenantProvider>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 transition-colors">
                {SITE_MODE === "marketing" ? <MarketingHostRoutes /> : (
                <Routes>
                  {/* Global Routes - These take precedence over dynamic :churchSlug */}
                  {/* On the app host `/` is a launch route, like /app: the
                      marketing home page stays on the apex (#14). */}
                  <Route
                    path="/"
                    element={
                      SITE_MODE === "app" ? (
                        <Layout><DashboardRedirect /></Layout>
                      ) : (
                        <Layout variant="marketing"><Home /></Layout>
                      )
                    }
                  />
                  <Route path="/login" element={<Layout><Login /></Layout>} />
                  <Route path="/register-church" element={<Layout><RegisterChurch /></Layout>} />
                  <Route path="/accept-invite" element={<Layout><AcceptInvite /></Layout>} />
                  <Route path="/complete-profile" element={<Layout><ProfileCompletion /></Layout>} />
                  <Route path="/pending-approval" element={<Layout><PendingApproval /></Layout>} />
                  <Route path="/rejected" element={<Layout><Rejected /></Layout>} />
                  <Route path="/policy-acceptance" element={<Layout><PolicyAcceptancePage /></Layout>} />
                  {MARKETING_PAGES.map(([path, page]) => (
                    <React.Fragment key={path}>
                      <Route path={path} element={marketingElement(page)} />
                    </React.Fragment>
                  ))}

                  {/* The installed app's start_url. Landing here rather than on the
                      marketing home page is what sends a parent to the parent
                      screen, a volunteer to theirs, and an admin to theirs when the
                      app is opened from the home screen. */}
                  <Route path="/app" element={<Layout><DashboardRedirect /></Layout>} />

                  {/* Generic Role Redirects. Wrapped in Layout so the header is
                      present while the redirect resolves, like every other
                      route -- these rendered bare before. */}
                  <Route path="/admin" element={<Layout><DashboardRedirect /></Layout>} />
                  <Route path="/volunteer" element={<Layout><DashboardRedirect /></Layout>} />
                  <Route path="/parent" element={<Layout><DashboardRedirect /></Layout>} />

                  <Route path="/profile" element={
                    <Layout>
                      <ProtectedRoute allowedRoles={["master_admin", "admin", "volunteer", "parent"]}>
                        <PolicyGuard>
                          <Profile />
                        </PolicyGuard>
                      </ProtectedRoute>
                    </Layout>
                  } />
                  <Route path="/master-admin" element={
                    <Layout>
                      <ProtectedRoute allowedRoles={["master_admin"]}>
                        <PolicyGuard>
                          <MasterAdminDashboard />
                        </PolicyGuard>
                      </ProtectedRoute>
                    </Layout>
                  } />
                  <Route path="/master-admin/logs" element={
                    <Layout>
                      <ProtectedRoute allowedRoles={["master_admin"]}>
                        <PolicyGuard>
                          <MasterAdminLogs />
                        </PolicyGuard>
                      </ProtectedRoute>
                    </Layout>
                  } />

                  {/* Tenant Routes */}
                  <Route path="/:churchSlug" element={<TenantLayout />}>
                    <Route index element={<ChurchLanding />} />
                    <Route path="login" element={<Login />} />
                    {/* No ChurchAccessGate on parent or volunteer: both pages
                        handle the lock themselves, so a child checked in before
                        it can still be collected (the parent shows a guardian
                        QR, the volunteer scans it). */}
                    <Route path="parent" element={
                      <ProtectedRoute allowedRoles={["master_admin", "admin", "parent"]}>
                        <PolicyGuard>
                          <ParentDashboard />
                        </PolicyGuard>
                      </ProtectedRoute>
                    } />
                    <Route path="volunteer" element={
                      <ProtectedRoute allowedRoles={["master_admin", "admin", "volunteer"]}>
                        <PolicyGuard>
                          <VolunteerDashboard />
                        </PolicyGuard>
                      </ProtectedRoute>
                    } />
                    <Route path="admin" element={
                      <ProtectedRoute allowedRoles={["admin", "master_admin"]}>
                        <PolicyGuard>
                          <ChurchAccessGate>
                            <AdminDashboard />
                          </ChurchAccessGate>
                        </PolicyGuard>
                      </ProtectedRoute>
                    } />
                    <Route path="admin/settings" element={
                      <ProtectedRoute allowedRoles={["admin", "master_admin"]}>
                        <PolicyGuard>
                          <ChurchAccessGate>
                            <ChurchSettings />
                          </ChurchAccessGate>
                        </PolicyGuard>
                      </ProtectedRoute>
                    } />
                    <Route path="admin/events" element={
                      <ProtectedRoute allowedRoles={["admin", "master_admin"]}>
                        <PolicyGuard>
                          <ChurchAccessGate>
                            <EventsServices />
                          </ChurchAccessGate>
                        </PolicyGuard>
                      </ProtectedRoute>
                    } />
                    {/* Unmatched child of a real church, e.g. /randmeth/nonsense.
                        Without this the Outlet renders nothing and the page is
                        simply blank. */}
                    <Route path="*" element={<NotFound />} />
                  </Route>

                  {/* Backstop. `/:churchSlug/*` above is greedy enough to swallow
                      every non-root path today, so this rarely fires -- TenantLayout
                      delegates here instead. It stays as the safety net for if that
                      route is ever narrowed. */}
                  <Route path="*" element={<Layout><NotFound /></Layout>} />
                </Routes>
                )}
                <Toaster position="top-right" richColors />
                <NetworkStatus />
                <ScrollToTop />
                <RoutedSpeedInsights />
              </div>
            </TenantProvider>
          </Router>
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

// Remove the old TenantRoutes and GlobalRoutes functions
