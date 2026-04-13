import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { getDocument, updateDocument, subscribeToDocument } from "../lib/firestore";
import { Building2, Palette, Globe, Save, Loader2, Image as ImageIcon, Layout, Upload, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { uploadFile, getPathFromUrl, deleteFile } from "../lib/storage";

export default function ChurchSettings() {
  const { userData } = useAuth();
  const [church, setChurch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    logoUrl: ""
  });

  useEffect(() => {
    if (userData?.churchId) {
      const unsub = subscribeToDocument("churches", userData.churchId, (data) => {
        if (data) {
          setChurch(data);
          setFormData({
            name: data.name || "",
            slug: data.slug || "",
            primaryColor: data.branding?.primaryColor || "#2563eb",
            secondaryColor: data.branding?.secondaryColor || "#1e40af",
            logoUrl: data.branding?.logoUrl || ""
          });
        }
        setLoading(false);
      });
      return () => unsub();
    }
  }, [userData?.churchId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showErrorToast("Please upload an image file (PNG, JPG, etc.)");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showErrorToast("File size must be less than 2MB");
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.churchId) return;

    setSaving(true);
    try {
      let finalLogoUrl = formData.logoUrl;

      // 1. Upload new logo if selected
      if (logoFile) {
        // Delete old logo if it exists in storage
        if (formData.logoUrl && formData.logoUrl.includes("firebasestorage")) {
          const oldPath = getPathFromUrl(formData.logoUrl);
          if (oldPath) {
            try {
              await deleteFile(oldPath);
            } catch (err) {
              console.warn("Failed to delete old logo:", err);
            }
          }
        }

        const extension = logoFile.name.split(".").pop();
        const path = `churches/${userData.churchId}/logo_${Date.now()}.${extension}`;
        finalLogoUrl = await uploadFile(path, logoFile);
      }

      // 2. Update Firestore
      await updateDocument("churches", userData.churchId, {
        name: formData.name,
        slug: formData.slug,
        branding: {
          primaryColor: formData.primaryColor,
          secondaryColor: formData.secondaryColor,
          logoUrl: finalLogoUrl
        },
        updatedAt: new Date().toISOString()
      });

      setLogoFile(null);
      showSuccessToast("Settings updated successfully!");
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Church Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">Configure your church's identity and branding.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8 space-y-8">
              {/* Basic Info */}
              <section className="space-y-4">
                <div className="flex items-center space-x-2 text-primary">
                  <Building2 className="h-5 w-5" />
                  <h3 className="font-bold uppercase tracking-wider text-xs">Basic Information</h3>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Church Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">URL Slug</label>
                    <div className="flex items-center">
                      <span className="px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-100 dark:border-gray-700 rounded-l-xl text-gray-500 text-sm">
                        guardiancheck.app/
                      </span>
                      <input 
                        type="text" 
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                        className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-r-xl focus:ring-2 focus:ring-primary outline-none dark:text-white"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">This is your unique address on the platform.</p>
                  </div>
                </div>
              </section>

              {/* Branding */}
              <section className="space-y-4">
                <div className="flex items-center space-x-2 text-primary">
                  <Palette className="h-5 w-5" />
                  <h3 className="font-bold uppercase tracking-wider text-xs">Branding & Colors</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Primary Color</label>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="color" 
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        className="h-10 w-10 rounded-lg cursor-pointer border-none"
                      />
                      <input 
                        type="text" 
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Secondary Color</label>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="color" 
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        className="h-10 w-10 rounded-lg cursor-pointer border-none"
                      />
                      <input 
                        type="text" 
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm dark:text-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Church Logo</label>
                  <div className="flex items-start space-x-4">
                    <div className="relative group">
                      <div className="h-24 w-24 rounded-2xl bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary/50">
                        {logoPreview || formData.logoUrl ? (
                          <img 
                            src={logoPreview || formData.logoUrl} 
                            alt="Preview" 
                            className="h-full w-full object-contain p-2"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-gray-300" />
                        )}
                      </div>
                      {(logoPreview || formData.logoUrl) && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoPreview(null);
                            setFormData({ ...formData, logoUrl: "" });
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center space-x-2">
                        <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all flex items-center space-x-2">
                          <Upload className="h-4 w-4" />
                          <span>Upload Logo</span>
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            onChange={handleFileChange}
                          />
                        </label>
                        {logoFile && (
                          <span className="text-xs text-green-600 font-medium">New logo selected</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Recommended: Square PNG or JPG, max 2MB. Transparent backgrounds work best.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="p-8 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button 
                type="submit"
                disabled={saving}
                className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Preview */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Layout className="h-5 w-5 text-primary" />
              <span>Live Preview</span>
            </h3>
            
            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Navigation Bar</p>
              <div className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {logoPreview || formData.logoUrl ? (
                    <img src={logoPreview || formData.logoUrl} alt="Logo" className="h-8 w-8 object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                  <span className="font-bold text-sm dark:text-white">{formData.name || "Church Name"}</span>
                </div>
                <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800" />
              </div>

              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Primary Button</p>
              <button 
                className="w-full py-3 rounded-xl text-white font-bold text-sm shadow-lg"
                style={{ backgroundColor: formData.primaryColor }}
              >
                Action Button
              </button>

              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Secondary Accent</p>
              <div 
                className="h-12 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: formData.secondaryColor }}
              >
                Secondary Accent
              </div>
            </div>
          </div>

          <div className="p-6 bg-primary/10 dark:bg-primary/20 rounded-3xl border border-primary/20 dark:border-primary/30 space-y-3">
            <div className="flex items-center space-x-2 text-primary">
              <Globe className="h-5 w-5" />
              <h4 className="font-bold">Public Profile</h4>
            </div>
            <p className="text-sm text-primary/80 dark:text-primary/70">
              Your church will be accessible at:
            </p>
            <div className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-primary/20 dark:border-primary/30 text-xs font-mono text-primary break-all">
              {window.location.origin}/{formData.slug}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
