import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Shield, User, LogOut, LayoutDashboard, QrCode, ClipboardCheck, Users, Settings, Home as HomeIcon, Calendar, Menu, X } from "lucide-react";
import { auth } from "./lib/firebase";
import { useAuth } from "./hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import NetworkStatus from "./components/NetworkStatus";
import { Toaster } from "sonner";
import { TenantProvider, useTenant } from "./contexts/TenantContext";
import { ChurchLogo } from "./components/ChurchLogo";

import { SpeedInsights } from "@vercel/speed-insights/react";
import Home from "./pages/Home";
import Login from "./pages/Login";
import RegisterChurch from "./pages/RegisterChurch";
import AcceptInvite from "./pages/AcceptInvite";
import ProfileCompletion from "./pages/ProfileCompletion";
import PendingApproval from "./pages/PendingApproval";
import Rejected from "./pages/Rejected";
import Profile from "./pages/Profile";
import ParentDashboard from "./pages/ParentDashboard";
import VolunteerDashboard from "./pages/VolunteerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import EventsServices from "./pages/EventsServices";
import MasterAdminDashboard from "./pages/MasterAdminDashboard";
import MasterAdminLogs from "./pages/MasterAdminLogs";
import ChurchSettings from "./pages/ChurchSettings";
import PolicyAcceptancePage from "./pages/PolicyAcceptancePage";
import { PolicyGuard } from "./components/PolicyGuard";
import NotFound from "./pages/NotFound";
import { isKnownAppPath } from "./constants/appRoutes";
import { resolveLandingPath } from "./lib/landing";
import { Seo } from "./components/Seo";

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

    // `replace`, not push. This route only ever forwards, so a pushed entry
    // would make Back re-enter it and bounce straight forward again -- and an
    // installed app has no address bar to escape that with.
    navigate(target, { replace: true });
  }, [userData, loading, navigate, user]);

  // /app, /admin, /volunteer and /parent are authenticated-app entry points
  // that never reach ProtectedRoute, so they need their own noindex rather
  // than inheriting whatever head tags the previous route left behind.
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Seo title="Dashboard" noindex />
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

function Navigation() {
  const { user, roles, userData } = useAuth();
  const { church } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2">
          <div className="flex items-center min-w-0">
            <Link to={churchPrefix || "/"} className="flex items-center space-x-2 min-w-0">
              <span className="shrink-0 flex items-center">
                <ChurchLogo logoUrl={church?.branding?.logoUrl} name={church?.name} />
              </span>
              <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate min-w-0">
                {church?.name || "GuardianCheck"}
              </span>
            </Link>
          </div>

          {user ? (
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
      </div>

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
    </nav>
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

  if (loading || tenantLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasAccess = roles.some(r => allowedRoles.includes(r as any));
  const isEmailVerified = user?.emailVerified || user?.providerData.some(p => p.providerId === "google.com");

  // Every route behind auth is noindex by definition, so it is set here once
  // rather than in each dashboard. Pages rendered as `children` must not
  // render their own <Seo> — see the contract in components/Seo.tsx.
  return user && isEmailVerified && hasAccess ? (
    <>
      <Seo title="Dashboard" noindex />
      {children}
    </>
  ) : null;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </>
  );
}

function TenantLayout() {
  const { church, loading, error } = useTenant();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
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
          <Link to="/" className="inline-block text-primary font-bold hover:underline">
            Go to GuardianCheck Home
          </Link>
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

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <TenantProvider>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 transition-colors">
            <Routes>
              {/* Global Routes - These take precedence over dynamic :churchSlug */}
              <Route path="/" element={<Layout><Home /></Layout>} />
              <Route path="/login" element={<Layout><Login /></Layout>} />
              <Route path="/register-church" element={<Layout><RegisterChurch /></Layout>} />
              <Route path="/accept-invite" element={<Layout><AcceptInvite /></Layout>} />
              <Route path="/complete-profile" element={<Layout><ProfileCompletion /></Layout>} />
              <Route path="/pending-approval" element={<Layout><PendingApproval /></Layout>} />
              <Route path="/rejected" element={<Layout><Rejected /></Layout>} />
              <Route path="/policy-acceptance" element={<Layout><PolicyAcceptancePage /></Layout>} />
              
              {/* The installed app's start_url. Landing here rather than on the
                  marketing home page is what sends a parent to the parent
                  screen, a volunteer to theirs, and an admin to theirs when the
                  app is opened from the home screen. */}
              <Route path="/app" element={<DashboardRedirect />} />

              {/* Generic Role Redirects */}
              <Route path="/admin" element={<DashboardRedirect />} />
              <Route path="/volunteer" element={<DashboardRedirect />} />
              <Route path="/parent" element={<DashboardRedirect />} />

              <Route path="/profile" element={
                <ProtectedRoute allowedRoles={["master_admin", "admin", "volunteer", "parent"]}>
                  <PolicyGuard>
                    <Layout><Profile /></Layout>
                  </PolicyGuard>
                </ProtectedRoute>
              } />
              <Route path="/master-admin" element={
                <ProtectedRoute allowedRoles={["master_admin"]}>
                  <PolicyGuard>
                    <Layout><MasterAdminDashboard /></Layout>
                  </PolicyGuard>
                </ProtectedRoute>
              } />
              <Route path="/master-admin/logs" element={
                <ProtectedRoute allowedRoles={["master_admin"]}>
                  <PolicyGuard>
                    <Layout><MasterAdminLogs /></Layout>
                  </PolicyGuard>
                </ProtectedRoute>
              } />

              {/* Tenant Routes */}
              <Route path="/:churchSlug" element={<TenantLayout />}>
                <Route index element={<Home />} />
                <Route path="login" element={<Login />} />
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
                      <AdminDashboard />
                    </PolicyGuard>
                  </ProtectedRoute>
                } />
                <Route path="admin/settings" element={
                  <ProtectedRoute allowedRoles={["admin", "master_admin"]}>
                    <PolicyGuard>
                      <ChurchSettings />
                    </PolicyGuard>
                  </ProtectedRoute>
                } />
                <Route path="admin/events" element={
                  <ProtectedRoute allowedRoles={["admin", "master_admin"]}>
                    <PolicyGuard>
                      <EventsServices />
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
            <Toaster position="top-right" richColors />
            <NetworkStatus />
            <SpeedInsights />
          </div>
        </TenantProvider>
      </Router>
    </ErrorBoundary>
  );
}

// Remove the old TenantRoutes and GlobalRoutes functions
