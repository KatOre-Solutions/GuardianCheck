import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { getDocument, updateDocument, deactivateUser } from "../lib/firestore";
import { auth } from "../lib/firebase";
import { User, Mail, Phone, MapPin, CreditCard, Camera, Trash2, Moon, Sun, Save, LogOut, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

export default function Profile() {
  const { user, darkMode: globalDarkMode } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  useEffect(() => {
    setDarkMode(globalDarkMode);
  }, [globalDarkMode]);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const data = await getDocument("users", user.uid) as any;
      if (data) {
        setProfile(data);
      } else {
        // Fallback if document is missing
        const [fName, ...sNameParts] = (user.displayName || "").split(" ");
        setProfile({
          firstName: fName || user.email?.split('@')[0] || "User",
          surname: sNameParts.join(" ") || "User",
          email: user.email,
          photoUrl: user.photoURL,
          role: "parent" // Default role
        });
      }
    } catch (error) {
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDocument("users", user!.uid, {
        ...profile,
        updatedAt: new Date().toISOString()
      });
      toast.success("Profile updated successfully!");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile({ ...profile, photoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleDarkMode = async () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    try {
      await updateDocument("users", user!.uid, { darkMode: newMode });
    } catch (error) {
      console.error("Failed to save theme preference");
    }
  };

  const handleDeactivate = async () => {
    if (window.confirm("Are you sure you want to deactivate your account? You will be logged out and unable to sign back in.")) {
      try {
        await deactivateUser(user!.uid);
        await auth.signOut();
        toast.success("Account deactivated successfully");
      } catch (error) {
        toast.error("Failed to deactivate account");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your personal information and preferences</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleDarkMode}
            className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          >
            {darkMode ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-blue-600" />}
          </button>
          <button
            onClick={() => auth.signOut()}
            className="flex items-center space-x-2 px-4 py-2 text-red-600 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="relative inline-block">
              <div className="h-32 w-32 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border-4 border-white dark:border-gray-800 shadow-lg mx-auto">
                {profile?.photoUrl || auth.currentUser?.photoURL ? (
                  <img src={profile?.photoUrl || auth.currentUser?.photoURL || ""} alt="Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <User className="h-16 w-16" />
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-all shadow-lg border-2 border-white dark:border-gray-800">
                <Camera className="h-5 w-5" />
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
              </label>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {profile?.firstName} {profile?.surname}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{profile?.email}</p>
              <div className="mt-2 inline-block px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full uppercase tracking-wider">
                {profile?.role}
              </div>
            </div>
          </div>

          <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-3xl border border-red-100 dark:border-red-900/30">
            <h4 className="text-red-800 dark:text-red-400 font-bold flex items-center space-x-2">
              <AlertCircle className="h-5 w-5" />
              <span>Danger Zone</span>
            </h4>
            <p className="text-red-600 dark:text-red-400/70 text-sm mt-2">
              Deactivating your account will prevent you from logging in. Your data will be kept for audit purposes.
            </p>
            <button
              onClick={handleDeactivate}
              className="mt-4 w-full flex items-center justify-center space-x-2 bg-red-600 text-white p-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none"
            >
              <Trash2 className="h-5 w-5" />
              <span>Deactivate Account</span>
            </button>
          </div>
        </div>

        <div className="md:col-span-2">
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type="text"
                    value={profile?.firstName || ""}
                    onChange={e => setProfile({ ...profile, firstName: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Surname</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type="text"
                    value={profile?.surname || ""}
                    onChange={e => setProfile({ ...profile, surname: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">ID Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={profile?.idNumber || ""}
                    onChange={e => setProfile({ ...profile, idNumber: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cell Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="tel"
                    value={profile?.cellNumber || ""}
                    onChange={e => setProfile({ ...profile, cellNumber: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Home Address</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={profile?.homeAddress || ""}
                    onChange={e => setProfile({ ...profile, homeAddress: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Gender</label>
                <select
                  value={profile?.gender || ""}
                  onChange={e => setProfile({ ...profile, gender: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                disabled={saving}
                className="flex items-center space-x-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none disabled:opacity-50"
              >
                <Save className="h-5 w-5" />
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
