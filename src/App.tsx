import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Shield, User, LogOut, LayoutDashboard, QrCode, ClipboardCheck, Users, Settings, Home as HomeIcon, Calendar } from "lucide-react";
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
import { Seo } from "./components/Seo";

function DashboardRedirect() {
  const { user, userData, roles, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading) {
      if (!userData) {
        navigate("/login");
      } else {
        // 1. Force verification for password users
        if (!user?.emailVerified && user?.providerData.some(p => p.providerId === "password")) {
          navigate("/login");
          return;
        }

        // 2. Force profile completion
        if (userData.status === "incomplete_profile") {
          navigate("/complete-profile");
          return;
        }

        const slug = userData.churchSlug;
        const search = window.location.search; // Preserve query params like ?payment=success

        if (roles.includes("master_admin")) {
          navigate(`/master-admin${search}`);
        } else if (slug) {
          if (roles.includes("admin")) navigate(`/${slug}/admin${search}`);
          else if (roles.includes("volunteer")) navigate(`/${slug}/volunteer${search}`);
          else if (roles.includes("parent")) navigate(`/${slug}/parent${search}`);
          else navigate(`/${slug}${search}`);
        } else {
          navigate(`/${search}`);
        }
      }
    }
  }, [userData, roles, loading, navigate, user]);

  // /admin, /volunteer and /parent are authenticated-app entry points that
  // never reach ProtectedRoute, so they need their own noindex rather than
  // inheriting whatever head tags the previous route left behind.
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

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to={churchPrefix || "/"} className="flex items-center space-x-2">
              <ChurchLogo logoUrl={church?.branding?.logoUrl} name={church?.name} />
              <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                {church?.name || "GuardianCheck"}
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {isEmailVerified && !isAuthPage && (
                  <>
                    {hasRole("master_admin") && (
                      <Link to="/master-admin" className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                        <LayoutDashboard className="h-4 w-4" />
                        <span className="hidden sm:inline">Platform Admin</span>
                      </Link>
                    )}
                    {church && (
                      <>
                        {(hasRole("admin") || hasRole("master_admin")) && (
                          <>
                            <Link to={`${churchPrefix}/admin`} className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                              <LayoutDashboard className="h-4 w-4" />
                              <span className="hidden sm:inline">Admin</span>
                            </Link>
                            <Link to={`${churchPrefix}/admin/settings`} className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                              <Settings className="h-4 w-4" />
                              <span className="hidden sm:inline">Settings</span>
                            </Link>
                            <Link to={`${churchPrefix}/admin/events`} className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                              <Calendar className="h-4 w-4" />
                              <span className="hidden sm:inline">Events</span>
                            </Link>
                          </>
                        )}
                        {(hasRole("admin") || hasRole("volunteer") || hasRole("master_admin")) && (
                          <Link to={`${churchPrefix}/volunteer`} className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                            <ClipboardCheck className="h-4 w-4" />
                            <span className="hidden sm:inline">Volunteer</span>
                          </Link>
                        )}
                        {(hasRole("admin") || hasRole("parent") || hasRole("master_admin")) && (
                          <Link to={`${churchPrefix}/parent`} className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                            <HomeIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Parent</span>
                          </Link>
                        )}
                      </>
                    )}
                    <Link
                      to="/profile"
                      className="text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      <User className="h-4 w-4" />
                      <span className="hidden sm:inline">Profile</span>
                    </Link>
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to={church ? `${churchPrefix}/login?mode=signup` : "/login?mode=signup"}
                  className="border border-gray-300 dark:border-gray-700 text-gray-750 dark:text-gray-250 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Sign Up
                </Link>
                <Link
                  to={church ? `${churchPrefix}/login` : "/login"}
                  className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
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
        const churchPrefix = church ? `/${church.slug}` : "";
        if (roles.includes("master_admin")) navigate("/master-admin");
        else if (roles.includes("admin")) navigate(`${churchPrefix}/admin`);
        else if (roles.includes("volunteer")) navigate(`${churchPrefix}/volunteer`);
        else if (roles.includes("parent")) navigate(`${churchPrefix}/parent`);
        else navigate("/");
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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !church) {
    return (
      <Layout>
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
              </Route>
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
