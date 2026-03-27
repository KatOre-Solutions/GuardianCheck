import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from "react-router-dom";
import { Shield, User, LogOut, LayoutDashboard, QrCode, ClipboardCheck, Users, Settings, Home as HomeIcon } from "lucide-react";
import { auth } from "./lib/firebase";
import { useAuth } from "./hooks/useAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "sonner";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ParentDashboard from "./pages/ParentDashboard";
import VolunteerDashboard from "./pages/VolunteerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProfileCompletion from "./pages/ProfileCompletion";
import PendingApproval from "./pages/PendingApproval";
import Rejected from "./pages/Rejected";
import MasterAdminDashboard from "./pages/MasterAdminDashboard";
import AcceptInvite from "./pages/AcceptInvite";
import Profile from "./pages/Profile";

function Navigation() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/");
  };

  const hasRole = (role: string) => roles.includes(role as any);

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">GuardianCheck</span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {hasRole("master_admin") && (
                  <Link to="/master-admin" className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Master Admin</span>
                  </Link>
                )}
                {hasRole("admin") && (
                  <Link to="/admin" className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Link>
                )}
                {(hasRole("admin") || hasRole("volunteer") || hasRole("master_admin")) && (
                  <Link to="/volunteer" className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    <ClipboardCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Volunteer</span>
                  </Link>
                )}
                {(hasRole("admin") || hasRole("parent") || hasRole("master_admin")) && (
                  <Link to="/parent" className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    <HomeIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Parent</span>
                  </Link>
                )}
                <Link
                  to="/profile"
                  className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Profile</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user, role, roles, status, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/login");
      } else if (status === "incomplete_profile" || !status) {
        navigate("/complete-profile");
      } else if (status === "pending") {
        navigate("/pending-approval");
      } else if (status === "rejected") {
        navigate("/rejected");
      } else if (roles.length > 0 && !allowedRoles.some(r => roles.includes(r as any))) {
        // Redirect to their appropriate dashboard if they try to access a forbidden one
        if (roles.includes("master_admin")) navigate("/master-admin");
        else if (roles.includes("admin")) navigate("/admin");
        else if (roles.includes("volunteer")) navigate("/volunteer");
        else if (roles.includes("parent")) navigate("/parent");
        else navigate("/");
      }
    }
  }, [user, role, roles, status, loading, navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const hasAccess = roles.some(r => allowedRoles.includes(r as any));
  return user && hasAccess ? <>{children}</> : null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 transition-colors">
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/complete-profile" element={<ProfileCompletion />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/rejected" element={<Rejected />} />
              <Route 
                path="/profile" 
                element={
                  <ProtectedRoute allowedRoles={["master_admin", "admin", "volunteer", "parent"]}>
                    <Profile />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/parent" 
                element={
                  <ProtectedRoute allowedRoles={["master_admin", "admin", "parent"]}>
                    <ParentDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/volunteer" 
                element={
                  <ProtectedRoute allowedRoles={["master_admin", "admin", "volunteer"]}>
                    <VolunteerDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/master-admin" 
                element={
                  <ProtectedRoute allowedRoles={["master_admin"]}>
                    <MasterAdminDashboard />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </main>
          <Toaster position="top-right" richColors />
        </div>
      </Router>
    </ErrorBoundary>
  );
}
