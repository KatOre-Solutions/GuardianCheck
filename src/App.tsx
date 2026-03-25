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
import Profile from "./pages/Profile";

function Navigation() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/");
  };

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
                {role === "admin" && (
                  <Link to="/admin" className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Link>
                )}
                {(role === "admin" || role === "volunteer") && (
                  <Link to="/volunteer" className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    <ClipboardCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Volunteer</span>
                  </Link>
                )}
                {(role === "admin" || role === "parent") && (
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
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    } else if (!loading && user && role && !allowedRoles.includes(role)) {
      // Redirect to their appropriate dashboard if they try to access a forbidden one
      if (role === "admin") navigate("/admin");
      else if (role === "volunteer") navigate("/volunteer");
      else if (role === "parent") navigate("/parent");
      else navigate("/");
    }
  }, [user, role, loading, navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return user && role && allowedRoles.includes(role) ? <>{children}</> : null;
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
              <Route 
                path="/profile" 
                element={
                  <ProtectedRoute allowedRoles={["admin", "volunteer", "parent"]}>
                    <Profile />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/parent" 
                element={
                  <ProtectedRoute allowedRoles={["admin", "parent"]}>
                    <ParentDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/volunteer" 
                element={
                  <ProtectedRoute allowedRoles={["admin", "volunteer"]}>
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
            </Routes>
          </main>
          <Toaster position="top-right" richColors />
        </div>
      </Router>
    </ErrorBoundary>
  );
}
