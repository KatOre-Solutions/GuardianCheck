import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { updateProfile } from "firebase/auth";
import { Shield, User, Church as ChurchIcon, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTenant } from "../contexts/TenantContext";
import { getPublicChurches, updateDocument, createMembershipRequest } from "../lib/firestore";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { normalizeToE164 } from "../lib/phone";
import { motion } from "motion/react";
import { Seo } from "../components/Seo";

export default function ProfileCompletion() {
  const { user, userData, roles, status, loading: authLoading } = useAuth();
  const { church: tenantChurch } = useTenant();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [dob, setDob] = useState("");
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
        // The picker needs a name and a slug, nothing more. Reading the full
        // church documents here would mean every user completing a profile
        // could pull every church's billing state.
        const data = await getPublicChurches();
        setChurches(data);
      } catch (error) {
        console.error("Failed to load churches", error);
        showErrorToast(error);
      } finally {
        setFetchingChurches(false);
      }
    }
    if (!authLoading) {
      loadChurches();
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (tenantChurch && churches.length > 0 && !selectedChurch) {
      const found = churches.find(c => c.slug === tenantChurch.slug || c.id === tenantChurch.id);
      if (found) {
        setSelectedChurch(found.id);
      }
    }
  }, [tenantChurch, churches, selectedChurch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedChurch) {
      showErrorToast("Please select a church");
      return;
    }
    if (!cellNumber) {
      showErrorToast("Please enter your cell number");
      return;
    }
    
    // Was a South-Africa-only regex that validated a local "0..." or
    // "+27..." string but stored whichever form was typed -- normalizeToE164
    // both validates (any country, not just SA) and stores one consistent
    // format, which is what makes the number dialable by a programmatic
    // channel later.
    const cleanPhone = normalizeToE164(cellNumber);
    if (!cleanPhone) {
      showErrorToast("Please enter a valid cell number, e.g. 0821234567 or +27821234567");
      return;
    }

    if (!dob) {
      showErrorToast("Please enter your date of birth");
      return;
    }

    setLoading(true);
    try {
      const church = churches.find(c => c.id === selectedChurch);
      // Auto-approve anyone completing their profile since they were either invited or signed up as a parent
      const newStatus = "approved";
      
      // 1. Update user profile
      await updateDocument("users", user.uid, {
        firstName,
        lastName,
        cellNumber: cleanPhone,
        dob,
        churchId: selectedChurch,
        churchSlug: church?.slug,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // 2. Update Firebase Auth profile
      await updateProfile(user, {
        displayName: `${firstName} ${lastName}`
      });

      showSuccessToast(
        "Profile completed!",
        "Account setup successful."
      );
      
      // Navigate to the appropriate dashboard based on role
      const slug = church?.slug;
      if (roles.includes("master_admin")) {
        navigate("/master-admin");
      } else if (slug) {
        if (roles.includes("admin")) navigate(`/${slug}/admin`);
        else if (roles.includes("volunteer")) navigate(`/${slug}/volunteer`);
        else if (roles.includes("parent")) navigate(`/${slug}/parent`);
        else navigate(`/${slug}`);
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error("Failed to complete profile", error);
      showErrorToast(error);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingChurches) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Seo title="Complete your profile" noindex />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl p-8 border border-gray-100 dark:border-gray-800"
      >
        <div className="text-center space-y-4 mb-8">
          <div className="mx-auto h-16 w-16 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center">
            <Shield className="h-10 w-10 text-primary dark:text-primary/70" />
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
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white appearance-none"
                >
                  <option value="">Select a church...</option>
                  {churches.map(church => (
                    <option key={church.id} value={church.id}>{church.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cell Number</label>
                <input
                  required
                  type="tel"
                  value={cellNumber}
                  onChange={e => setCellNumber(e.target.value)}
                  placeholder="082 123 4567"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date of Birth</label>
                <input
                  required
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                />
              </div>
            </div>
          </div>

          <button 
            disabled={loading}
            className="w-full bg-primary text-white p-4 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/10 dark:shadow-none"
          >
            <span>{loading ? "Processing..." : "Complete Profile"}</span>
            {!loading && <ArrowRight className="h-5 w-5" />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
