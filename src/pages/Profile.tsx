import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { updateProfile } from "firebase/auth";
import { getDocument, updateDocument, deactivateUser } from "../lib/firestore";
import { auth, storage } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { User, Mail, Phone, MapPin, Camera, Trash2, Moon, Sun, Save, LogOut, AlertCircle, Loader2, ArrowLeft, Calendar } from "lucide-react";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { motion } from "motion/react";
import { useTenant } from "../contexts/TenantContext";
import { normalizeToE164 } from "../lib/phone";
import { startWhatsAppVerification, confirmWhatsAppVerification } from "../lib/api";
import { ChurchLogo } from "../components/ChurchLogo";

export default function Profile() {
  const { user, userData, roles, darkMode: globalDarkMode } = useAuth();
  const { church } = useTenant();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [whatsappNumberInput, setWhatsappNumberInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [whatsappVerifying, setWhatsappVerifying] = useState(false);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
        setProfile({
          ...data,
          photoUrl: data.photoUrl || data.photoURL || user.photoURL
        });
      } else {
        // Fallback if document is missing
        const [fName, ...sNameParts] = (user.displayName || "").split(" ");
        setProfile({
          firstName: fName || user.email?.split('@')[0] || "User",
          lastName: sNameParts.join(" ") || "User",
          email: user.email,
          photoUrl: user.photoURL,
          role: "parent" // Default role
        });
      }
    } catch (error) {
      showErrorToast("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // This field previously had no validation at all -- any free text
    // saved straight to cellNumber. Optional here (unlike the required
    // field on signup/ProfileCompletion), so an empty value is left as-is;
    // a non-empty one must normalize.
    let cellNumber = profile?.cellNumber || "";
    if (cellNumber.trim() !== "") {
      const normalized = normalizeToE164(cellNumber);
      if (!normalized) {
        showErrorToast("Please enter a valid cell number, e.g. 0821234567 or +27821234567");
        return;
      }
      cellNumber = normalized;
    }

    setSaving(true);
    try {
      await updateDocument("users", user!.uid, {
        ...profile,
        cellNumber,
        updatedAt: new Date().toISOString()
      });
      showSuccessToast("Profile updated successfully!");
    } catch (error) {
      showErrorToast("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSendWhatsAppCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setWhatsappSending(true);
    try {
      const token = await user.getIdToken();
      await startWhatsAppVerification(token, whatsappNumberInput);
      setOtpSent(true);
      showSuccessToast("Verification code sent via WhatsApp");
    } catch (err: any) {
      showErrorToast(err.message || "Failed to send verification code");
    } finally {
      setWhatsappSending(false);
    }
  };

  const handleConfirmWhatsAppCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setWhatsappVerifying(true);
    try {
      const token = await user.getIdToken();
      await confirmWhatsAppVerification(token, otpCode);
      showSuccessToast("WhatsApp number verified!");
      setOtpSent(false);
      setOtpCode("");
      setWhatsappNumberInput("");
      await loadProfile();
    } catch (err: any) {
      showErrorToast(err.message || "Verification failed");
    } finally {
      setWhatsappVerifying(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > MAX_FILE_SIZE) {
      showErrorToast("File size exceeds 5MB limit");
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `profiles/${user.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      setProfile({ ...profile, photoUrl: downloadURL });
      
      // Also update Firestore immediately to persist the photo change
      await updateDocument("users", user.uid, { 
        photoUrl: downloadURL,
        photoURL: downloadURL,
        updatedAt: new Date().toISOString()
      });

      // Update Firebase Auth profile as well
      await updateProfile(user, { photoURL: downloadURL });
      
      showSuccessToast("Profile picture uploaded!");
    } catch (error) {
      console.error("Upload failed:", error);
      showErrorToast("Failed to upload profile picture");
    } finally {
      setUploading(false);
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
    setDeactivating(true);
    try {
      await deactivateUser(user!.uid);
      await auth.signOut();
      showSuccessToast("Account deactivated successfully");
    } catch (error) {
      showErrorToast("Failed to deactivate account");
    } finally {
      setDeactivating(false);
      setShowDeactivateModal(false);
    }
  };

  const handleBack = () => {
    const slug = church?.slug || userData?.churchSlug;
    if (slug) {
      if (roles.includes("admin")) navigate(`/${slug}/admin`);
      else if (roles.includes("volunteer")) navigate(`/${slug}/volunteer`);
      else if (roles.includes("parent")) navigate(`/${slug}/parent`);
      else navigate(`/${slug}`);
    } else {
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-6 w-6 text-gray-500 dark:text-gray-400" />
          </button>
          <div className="flex items-center space-x-3">
            <ChurchLogo logoUrl={church?.branding?.logoUrl} name={church?.name} className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Account Settings</h1>
              <p className="text-gray-500 dark:text-gray-400">Manage your personal information and preferences</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4 ml-12 md:ml-0">
          <button
            onClick={toggleDarkMode}
            className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          >
            {darkMode ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-primary" />}
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
              <div className="h-32 w-32 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border-4 border-white dark:border-gray-800 shadow-lg mx-auto relative group">
                {profile?.photoUrl || auth.currentUser?.photoURL ? (
                  <img src={profile?.photoUrl || auth.currentUser?.photoURL || ""} alt="Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-400">
                    <User className="h-16 w-16" />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              <label className={`absolute bottom-0 right-0 h-10 w-10 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-all shadow-lg border-2 border-white dark:border-gray-800 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Camera className="h-5 w-5" />
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
            </div>
            <div className="mt-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {profile?.firstName} {profile?.lastName}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{profile?.email}</p>
              <div className="mt-2 inline-block px-3 py-1 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80 text-xs font-bold rounded-full uppercase tracking-wider">
                {profile?.role}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
            <h4 className="text-gray-900 dark:text-white font-bold flex items-center space-x-2">
              <Phone className="h-5 w-5 text-primary" />
              <span>WhatsApp Notifications</span>
            </h4>

            {profile?.whatsappVerifiedAt ? (
              <div className="flex items-center space-x-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-gray-600 dark:text-gray-300">Verified: {profile.whatsappNumber}</span>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Verify a WhatsApp number to receive check-in and check-out notifications there too, once available.
              </p>
            )}

            {!otpSent ? (
              <form onSubmit={handleSendWhatsAppCode} className="space-y-3">
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  placeholder="e.g. 082 123 4567 or +27 82 123 4567"
                  value={whatsappNumberInput}
                  onChange={e => setWhatsappNumberInput(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm"
                />
                <button
                  type="submit"
                  disabled={whatsappSending}
                  className="w-full bg-primary/10 text-primary font-bold py-2 rounded-xl hover:bg-primary/20 transition-all disabled:opacity-50 text-sm"
                >
                  {whatsappSending ? "Sending..." : profile?.whatsappVerifiedAt ? "Verify a different number" : "Send verification code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirmWhatsAppCode} className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Enter the 6-digit code sent to {whatsappNumberInput}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm text-center tracking-[0.5em] font-bold"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtpCode(""); }}
                    className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold py-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={whatsappVerifying || otpCode.length !== 6}
                    className="flex-1 bg-primary text-white font-bold py-2 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 text-sm"
                  >
                    {whatsappVerifying ? "Verifying..." : "Verify"}
                  </button>
                </div>
              </form>
            )}
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
              onClick={() => setShowDeactivateModal(true)}
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
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type="text"
                    value={profile?.lastName || ""}
                    onChange={e => setProfile({ ...profile, lastName: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date of Birth</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="date"
                    value={profile?.dob || ""}
                    onChange={e => setProfile({ ...profile, dob: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                disabled={saving}
                className="flex items-center space-x-2 bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none disabled:opacity-50"
              >
                <Save className="h-5 w-5" />
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Deactivation Confirmation Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeactivateModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center space-y-6">
            <div className="mx-auto h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Deactivate Account?</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Are you sure you want to deactivate your account? You will be logged out and unable to sign back in.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeactivateModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deactivating ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
