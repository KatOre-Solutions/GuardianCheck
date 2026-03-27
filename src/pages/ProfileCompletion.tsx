import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, User, Church as ChurchIcon, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { getChurches, updateDocument, createMembershipRequest } from "../lib/firestore";
import { toast } from "sonner";
import { motion } from "motion/react";
import { getAuthErrorMessage } from "../lib/utils";

export default function ProfileCompletion() {
  const { user, userData, status, loading: authLoading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedChurch, setSelectedChurch] = useState("");
  const [churches, setChurches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingChurches, setFetchingChurches] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading) return;

    if (userData) {
      if (userData.firstName && !firstName) setFirstName(userData.firstName);
      if (userData.lastName && !lastName) setLastName(userData.lastName);
    } 
    
    // Fallback to user.displayName if userData fields are missing
    if (user?.displayName) {
      const parts = user.displayName.split(" ");
      if (parts.length > 0 && !firstName && (!userData || !userData.firstName)) {
        setFirstName(parts[0]);
      }
      if (parts.length > 1 && !lastName && (!userData || !userData.lastName)) {
        setLastName(parts.slice(1).join(" "));
      }
    }
  }, [userData, user, authLoading, firstName, lastName]);

  useEffect(() => {
    if (status === "pending") {
      navigate("/pending-approval");
    } else if (status === "approved") {
      navigate("/");
    } else if (status === "rejected") {
      navigate("/rejected");
    }
  }, [status, navigate]);

  useEffect(() => {
    async function loadChurches() {
      if (!user) return;
      try {
        const data = await getChurches();
        setChurches(data);
      } catch (error) {
        console.error("Failed to load churches", error);
        toast.error(getAuthErrorMessage(error));
      } finally {
        setFetchingChurches(false);
      }
    }
    if (!authLoading) {
      loadChurches();
    }
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedChurch) {
      toast.error("Please select a church");
      return;
    }

    setLoading(true);
    try {
      const church = churches.find(c => c.id === selectedChurch);
      
      // 1. Update user profile
      await updateDocument("users", user.uid, {
        firstName,
        lastName,
        churchId: selectedChurch,
        status: "pending",
        updatedAt: new Date().toISOString()
      });

      // 2. Create membership request
      await createMembershipRequest({
        userId: user.uid,
        userEmail: user.email,
        userName: `${firstName} ${lastName}`,
        churchId: selectedChurch,
        churchName: church?.name || "Unknown Church",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      toast.success("Profile updated and membership request sent!");
      navigate("/pending-approval");
    } catch (error) {
      console.error("Failed to complete profile", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (fetchingChurches) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl p-8 border border-gray-100 dark:border-gray-800"
      >
        <div className="text-center space-y-4 mb-8">
          <div className="mx-auto h-16 w-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
            <Shield className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Complete Your Profile</h2>
          <p className="text-gray-500 dark:text-gray-400">Tell us a bit more about yourself and select your church to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Select Your Church</label>
              <div className="relative">
                <ChurchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <select
                  required
                  value={selectedChurch}
                  onChange={e => setSelectedChurch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white appearance-none"
                >
                  <option value="">Select a church...</option>
                  {churches.map(church => (
                    <option key={church.id} value={church.id}>{church.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button 
            disabled={loading}
            className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-100 dark:shadow-none"
          >
            <span>{loading ? "Processing..." : "Submit Request"}</span>
            {!loading && <ArrowRight className="h-5 w-5" />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
