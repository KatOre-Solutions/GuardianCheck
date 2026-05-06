import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { subscribeToDocument } from "../lib/firestore";
import { 
  Building2, Palette, Globe, Save, Loader2, 
  Image as ImageIcon, Layout, Upload, X,
  CreditCard, Calendar, AlertCircle, XCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { uploadFile, getPathFromUrl, deleteFile } from "../lib/storage";
import { updateDocument } from "../lib/firestore";

type Tab = "branding" | "subscription";

export default function ChurchSettings() {
  const { userData, token } = useAuth();
  const [church, setChurch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("branding");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  
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

  useEffect(() => {
    if (activeTab === "subscription" && userData?.churchId && token) {
      fetchTransactions();
    }
  }, [activeTab, userData?.churchId, token]);

  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const response = await fetch("/api/transactions", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showErrorToast("Please upload an image file (PNG, JPG, etc.)");
      return;
    }

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

  const handleCancelSubscription = async () => {
    if (!window.confirm("Are you sure you want to cancel your subscription? Your church will remain active until the end of the current billing period.")) {
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to cancel subscription");

      showSuccessToast(result.message);
    } catch (err: any) {
      console.error(err);
      showErrorToast(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.churchId) return;

    setSaving(true);
    try {
      let finalLogoUrl = formData.logoUrl;

      if (logoFile) {
        if (formData.logoUrl && formData.logoUrl.includes("firebasestorage")) {
          const oldPath = getPathFromUrl(formData.logoUrl);
          if (oldPath) {
            try { await deleteFile(oldPath); } catch (err) { console.warn("Failed to delete old logo:", err); }
          }
        }

        const extension = logoFile.name.split(".").pop();
        const path = `churches/${userData.churchId}/logo_${Date.now()}.${extension}`;
        finalLogoUrl = await uploadFile(path, logoFile);
      }

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

  const subscription = church?.subscription;
  const isTrial = church?.status === "trialing";
  const isCancelled = subscription?.status === "cancelled" || subscription?.cancel_at_period_end;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Settings</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your church's identity and billing.</p>
        </div>
        
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab("branding")}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "branding" ? "bg-white dark:bg-gray-700 shadow-sm text-primary" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
          >
            Branding
          </button>
          <button 
            onClick={() => setActiveTab("subscription")}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "subscription" ? "bg-white dark:bg-gray-700 shadow-sm text-primary" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
          >
            Subscription
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === "branding" ? (
          <motion.div
            key="branding"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Form */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="p-8 space-y-8">
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
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                            className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-r-xl outline-none focus:ring-2 focus:ring-primary dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

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
                            className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm"
                            readOnly
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
                            className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-sm"
                            readOnly
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Church Logo</label>
                      <div className="flex items-start space-x-4">
                        <div className="h-24 w-24 rounded-2xl bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                          {logoPreview || formData.logoUrl ? (
                            <img src={logoPreview || formData.logoUrl} alt="Logo" className="h-full w-full object-contain p-2" referrerPolicy="no-referrer" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all flex items-center space-x-2 w-fit">
                            <Upload className="h-4 w-4" />
                            <span>Upload Logo</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                          </label>
                          <p className="text-xs text-gray-500">Square PNG or JPG, max 2MB.</p>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="p-8 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                  <button type="submit" disabled={saving} className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all flex items-center space-x-2 disabled:opacity-50">
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    <span>{saving ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Preview */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 h-fit sticky top-24">
              <h3 className="font-bold mb-4 flex items-center space-x-2 text-gray-900 dark:text-white">
                <Layout className="h-5 w-5 text-primary" />
                <span>Branding Preview</span>
              </h3>
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  {logoPreview || formData.logoUrl ? (
                    <img src={logoPreview || formData.logoUrl} alt="Logo" className="h-8 w-8 object-contain" referrerPolicy="no-referrer" />
                  ) : <div className="h-8 w-8 bg-gray-100 rounded" />}
                  <span className="font-bold text-sm dark:text-white">{formData.name || "Church Name"}</span>
                </div>
                <button className="w-full py-3 rounded-xl text-white font-bold text-sm" style={{ backgroundColor: formData.primaryColor }}>
                  Primary Button
                </button>
                <div className="h-12 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: formData.secondaryColor }}>
                  Secondary Accent
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="subscription"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Plan Card */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm space-y-6 h-fit">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Current Plan</p>
                  <h3 className="text-2xl font-bold text-primary capitalize">{church?.plan || "Free Trial"}</h3>
                </div>
                
                <div className="flex items-baseline space-x-1">
                  <span className="text-3xl font-bold">
                    R{church?.plan?.toLowerCase() === "growth" || church?.subscription?.tier?.toLowerCase() === "growth" ? "499" : 
                      church?.plan?.toLowerCase() === "professional" || church?.subscription?.tier?.toLowerCase() === "professional" ? "999" : "249"}
                  </span>
                  <span className="text-gray-500">/ month</span>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-bold px-3 py-1 rounded-full text-xs capitalize ${
                      church?.status === "active" ? "bg-green-100 text-green-700" : 
                      church?.status === "trialing" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    }`}>
                      {church?.status}
                    </span>
                  </div>
                  {isCancelled && (
                    <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded-xl flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                      <p className="text-xs text-orange-700 dark:text-orange-400">
                        Your subscription has been cancelled and will expire at the end of the current period.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Billing Info Card */}
              <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
                <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-primary/10 rounded-2xl">
                      <CreditCard className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-gray-900 dark:text-white">Billing Details</h4>
                      <p className="text-sm text-gray-500">Manage your payment schedule and method.</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-gray-400 mb-1">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {isTrial ? "Trial Ends" : "Next Billing Date"}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {church?.nextBillingDate 
                        ? new Date(church.nextBillingDate).toLocaleDateString("en-ZA", { dateStyle: "long" })
                        : isTrial 
                        ? (subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString("en-ZA", { dateStyle: "long" }) : "May 30, 2026")
                        : "N/A"
                      }
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-gray-400 mb-1">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Payment Method</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {subscription?.payfast_token ? "PayFast Secure Token" : "None linked"}
                    </p>
                  </div>
                </div>

                <div className="p-8 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Cancellation</p>
                    <p className="text-xs text-gray-500">Stop your subscription at any time.</p>
                  </div>
                  
                  {!isCancelled && church?.status !== "free" && subscription?.payfast_token && (
                    <button 
                      onClick={handleCancelSubscription}
                      disabled={cancelling}
                      className="flex items-center space-x-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950/20 transition-all disabled:opacity-50"
                    >
                      {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      <span>{cancelling ? "Processing..." : "Cancel Subscription"}</span>
                    </button>
                  )}
                  {isCancelled && (
                    <span className="text-sm font-bold text-orange-600 flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>Pending Cancellation</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Invoices Placeholder */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 space-y-6">
              <h4 className="font-bold text-gray-900 dark:text-white">Recent Transactions</h4>
              
              {loadingTransactions ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-800">
                        <th className="pb-4">Date</th>
                        <th className="pb-4">Plan</th>
                        <th className="pb-4">Amount</th>
                        <th className="pb-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="text-sm">
                          <td className="py-4 text-gray-600 dark:text-gray-400">
                            {new Date(tx.createdAt).toLocaleDateString("en-ZA", { dateStyle: "medium" })}
                          </td>
                          <td className="py-4 font-bold capitalize text-gray-900 dark:text-white">
                            {tx.plan}
                          </td>
                          <td className="py-4 font-bold text-gray-900 dark:text-white">
                            R{tx.amount}
                          </td>
                          <td className="py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 space-y-2">
                  <div className="inline-flex p-4 bg-gray-50 dark:bg-gray-800 rounded-full mb-2">
                    <CreditCard className="h-6 w-6 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No recent transactions found.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
