import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Shield, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { motion } from "motion/react";

export default function PendingApproval() {
  const { status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "approved") {
      navigate("/");
    } else if (status === "incomplete_profile") {
      navigate("/complete-profile");
    } else if (status === "rejected") {
      navigate("/rejected");
    }
  }, [status, navigate]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl p-8 text-center space-y-8 border border-gray-100 dark:border-gray-800"
      >
        <div className="mx-auto h-20 w-20 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center">
          <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400 animate-pulse" />
        </div>
        
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Pending Approval</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Your membership request has been sent to the church administrator. 
            Please wait for them to approve your access.
          </p>
        </div>

        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-sm text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 flex items-start space-x-3 text-left">
          <Shield className="h-5 w-5 shrink-0 mt-0.5" />
          <p>Once approved, you will be assigned your role and granted access to the church dashboard.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center justify-center space-x-2 p-4 rounded-xl font-bold bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
          >
            <RefreshCw className="h-5 w-5" />
            <span>Refresh</span>
          </button>
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center space-x-2 p-4 rounded-xl font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
