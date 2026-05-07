import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Church as ChurchIcon, MapPin, Mail, Trash2, Loader2, Shield, Users, Baby, ShieldCheck, X, AlertTriangle, TrendingUp, CreditCard, Calendar, Search, Filter, Terminal } from "lucide-react";
import { getChurches, addDocument, removeDocument, getCollection, updateDocument, subscribeToCollection } from "../lib/firestore";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { motion, AnimatePresence } from "motion/react";
import { format, isAfter, parseISO } from "date-fns";
import { where } from "firebase/firestore";
import WhatsAppSupport from "../components/WhatsAppSupport";

import { useAuth } from "../hooks/useAuth";

export default function MasterAdminDashboard() {
  const [churches, setChurches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [churchToDelete, setChurchToDelete] = useState<any>(null);
  const [newChurch, setNewChurch] = useState({ name: "", address: "", adminEmail: "", plan: "starter" });
  const [stats, setStats] = useState<Record<string, { users: number, children: number, guardians: number }>>({});
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { userData, user } = useAuth();

  useEffect(() => {
    const unsubChurches = subscribeToCollection("churches", [], (data) => {
      setChurches(data);
      setLoading(false);
    });
    loadData();
    syncMasterAdminRoles();
    return () => unsubChurches();
  }, []);

  async function syncMasterAdminRoles() {
    if (user && userData && user.email === "oreutlwilediutlwileng@gmail.com") {
      const requiredRoles = ["master_admin", "admin", "volunteer"];
      const hasAllRoles = requiredRoles.every(r => userData.roles?.includes(r));
      
      if (!hasAllRoles) {
        try {
          await updateDocument("users", user.uid, {
            roles: requiredRoles,
            role: "master_admin",
            updatedAt: new Date().toISOString()
          });
          showSuccessToast("Roles synchronized successfully!");
        } catch (error) {
          console.error("Failed to sync roles:", error);
        }
      }
    }
  }

  async function loadData() {
    // Keep loadData for other collections for now, but remove churches from it
    try {
      const [allUsers, allChildren, allGuardians, allRequests] = await Promise.all([
        getCollection("users"),
        getCollection("children"),
        getCollection("guardians"),
        getCollection("membershipRequests")
      ]);

      setPendingRequests((allRequests as any[]).filter(r => r.status === "pending"));
      
      const newStats: Record<string, { users: number, children: number, guardians: number }> = {};
      
      // We'll update stats when churches or other data changes
      // For simplicity, we'll recalculate stats here
      setStats(prev => {
        const updatedStats = { ...prev };
        churches.forEach(church => {
          updatedStats[church.id] = {
            users: (allUsers as any[]).filter(u => u.churchId === church.id).length,
            children: (allChildren as any[]).filter(c => c.churchId === church.id).length,
            guardians: (allGuardians as any[]).filter(g => g.churchId === church.id).length
          };
        });
        return updatedStats;
      });

    } catch (error) {
      console.error(error);
      showErrorToast("Failed to load dashboard data");
    }
  }

  // Recalculate stats when churches or data changes
  useEffect(() => {
    if (churches.length > 0) {
      loadData();
    }
  }, [churches.length]);

  const filteredChurches = churches.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         c.adminEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesStatus = true;
    if (filterStatus === "paid") {
      matchesStatus = c.status === "active" && !!c.lastPaymentDate;
    } else if (filterStatus === "unpaid") {
      matchesStatus = c.status === "active" && !c.lastPaymentDate;
    } else if (filterStatus !== "all") {
      matchesStatus = c.status === filterStatus;
    }
    
    return matchesSearch && matchesStatus;
  });

  const platformStats = {
    totalChurches: churches.length,
    totalUsers: Object.values(stats).reduce((acc, s) => acc + (s as any).users, 0),
    totalChildren: Object.values(stats).reduce((acc, s) => acc + (s as any).children, 0),
    activeTrials: churches.filter(c => c.status === "trialing").length,
    paidSubscriptions: churches.filter(c => c.status === "active" && c.lastPaymentDate).length,
    manualActivations: churches.filter(c => c.status === "active" && !c.lastPaymentDate).length,
  };

  const handleApproveRequest = async (request: any, role: string = "admin") => {
    try {
      await updateDocument("membershipRequests", request.id, { status: "approved", updatedAt: new Date().toISOString() });
      await updateDocument("users", request.userId, { 
        churchId: request.churchId, 
        role, 
        status: "approved",
        updatedAt: new Date().toISOString()
      });
      showSuccessToast(`Approved ${request.userName} as ${role}`);
      loadData();
    } catch (error) {
      showErrorToast("Failed to approve request");
    }
  };

  const handleRejectRequest = async (request: any) => {
    try {
      await updateDocument("membershipRequests", request.id, { status: "rejected", updatedAt: new Date().toISOString() });
      await updateDocument("users", request.userId, { status: "rejected", updatedAt: new Date().toISOString() });
      showSuccessToast(`Rejected ${request.userName}`);
      loadData();
    } catch (error) {
      showErrorToast("Failed to reject request");
    }
  };

  const handleAddChurch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDocument("churches", {
        ...newChurch,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      showSuccessToast("Church added successfully!");
      setShowAddModal(false);
      setNewChurch({ name: "", address: "", adminEmail: "", plan: "starter" });
      loadData();
    } catch (error) {
      showErrorToast("Failed to add church");
    }
  };

  const handleDeleteChurch = async () => {
    if (!churchToDelete) return;
    try {
      await removeDocument("churches", churchToDelete.id);
      showSuccessToast("Church deleted");
      setChurchToDelete(null);
      loadData();
    } catch (error) {
      showErrorToast("Failed to delete church");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Platform Overview</h1>
          <p className="text-gray-500 dark:text-gray-400">Global management for GuardianCheck SaaS</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/master-admin/logs"
            className="p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl hover:bg-gray-50 flex items-center space-x-2 transition-all shadow-sm"
          >
            <Terminal className="h-5 w-5 text-gray-500" />
            <span className="font-bold text-gray-700 dark:text-gray-300">System Logs</span>
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-primary text-white px-8 py-4 rounded-2xl font-bold flex items-center space-x-2 hover:bg-primary/90 transition-all shadow-xl shadow-primary/10 dark:shadow-none"
          >
            <Plus className="h-5 w-5" />
            <span>Provision New Church</span>
          </button>
          <WhatsAppSupport 
            phoneNumber="+27796251393" 
            message={`Bug Report from Master Admin (${user?.email}): `}
            label="Log Bug"
            position="static"
            className="!px-8 !py-4 !rounded-2xl !shadow-none ring-1 ring-inset ring-gray-100 dark:ring-gray-700 font-bold"
          />
        </div>
      </header>

      {/* Platform Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {[
          { label: "Total Churches", value: platformStats.totalChurches, icon: <ChurchIcon className="h-6 w-6 text-primary" />, color: "bg-primary/10" },
          { label: "Total Users", value: platformStats.totalUsers, icon: <Users className="h-6 w-6 text-purple-600" />, color: "bg-purple-50" },
          { label: "Total Children", value: platformStats.totalChildren, icon: <Baby className="h-6 w-6 text-green-600" />, color: "bg-green-50" },
          { label: "Active Trials", value: platformStats.activeTrials, icon: <TrendingUp className="h-6 w-6 text-orange-600" />, color: "bg-orange-50" },
          { label: "Paid Subs", value: platformStats.paidSubscriptions, icon: <CreditCard className="h-6 w-6 text-green-600" />, color: "bg-green-50" },
          { label: "Manual Active", value: platformStats.manualActivations, icon: <ShieldCheck className="h-6 w-6 text-purple-600" />, color: "bg-purple-50" },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800"
          >
            <div className={`h-12 w-12 ${stat.color} dark:bg-opacity-10 rounded-2xl flex items-center justify-center mb-4`}>
              {stat.icon}
            </div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Pending Approvals Section */}
      {pendingRequests.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <Users className="h-6 w-6 text-primary" />
            <span>Pending Platform Access Requests</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingRequests.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{request.userName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{request.userEmail}</p>
                    <p className="text-xs text-primary dark:text-primary/70 mt-1 font-medium">
                      Target Church: {churches.find(c => c.id === request.churchId)?.name || "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleApproveRequest(request, "admin")}
                    className="flex-1 bg-primary text-white py-2 px-3 rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
                  >
                    Approve Admin
                  </button>
                  <button
                    onClick={() => handleApproveRequest(request, "volunteer")}
                    className="flex-1 bg-purple-600 text-white py-2 px-3 rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors"
                  >
                    Approve Volunteer
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Church Management Section */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Church Directory</h2>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search churches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active (All)</option>
              <option value="paid">Paid Only</option>
              <option value="unpaid">Unpaid/Manual</option>
              <option value="delinquent">Delinquent</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredChurches.map((church) => {
            const isTrialing = church.status === "trialing";
            const trialExpired = isTrialing && church.trialEndsAt && !isAfter(parseISO(church.trialEndsAt), new Date());

            return (
              <motion.div
                key={church.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-gray-900 rounded-[2rem] p-8 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-xl transition-all group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="h-14 w-14 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ChurchIcon className="h-7 w-7 text-primary dark:text-primary/70" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      church.status === "active" ? "bg-green-100 text-green-600" :
                      church.status === "trialing" ? (trialExpired ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600") :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {church.status === "trialing" && trialExpired ? "Trial Expired" : church.status}
                    </span>
                    <button
                      onClick={() => setChurchToDelete(church)}
                      className="text-gray-300 hover:text-red-600 transition-colors p-2"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{church.name}</h3>
                <div className="space-y-3 text-sm text-gray-500 dark:text-gray-400 mb-8">
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{church.address}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{church.adminEmail}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>Plan: <span className="font-bold text-primary uppercase">{church.plan || "Starter"}</span></span>
                  </div>
                  {church.lastPaymentDate && (
                    <div className="flex items-center space-x-2 text-xs text-green-600 font-medium">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>Last Paid: {format(parseISO(church.lastPaymentDate), "MMM dd, yyyy")}</span>
                    </div>
                  )}
                  {church.nextBillingDate && (
                    <div className="flex items-center space-x-2 text-xs text-primary dark:text-primary/70 font-medium">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>Next Bill: {format(parseISO(church.nextBillingDate), "MMM dd, yyyy")}</span>
                    </div>
                  )}
                  {church.status === "active" && !church.lastPaymentDate && (
                    <div className="flex items-center space-x-2 text-xs text-orange-600 font-medium">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Manual Activation (No Payment)</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-50 dark:border-gray-800">
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats[church.id]?.users || 0}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Users</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats[church.id]?.children || 0}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Kids</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats[church.id]?.guardians || 0}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Guardians</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Add Church Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Provision New Church</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleAddChurch} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Church Name</label>
                  <input
                    required
                    type="text"
                    value={newChurch.name}
                    onChange={e => setNewChurch({ ...newChurch, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="Grace Community Church"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Address</label>
                  <input
                    required
                    type="text"
                    value={newChurch.address}
                    onChange={e => setNewChurch({ ...newChurch, address: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="123 Faith St, City"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Admin Email</label>
                  <input
                    required
                    type="email"
                    value={newChurch.adminEmail}
                    onChange={e => setNewChurch({ ...newChurch, adminEmail: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                    placeholder="admin@church.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Plan</label>
                  <select
                    value={newChurch.plan}
                    onChange={e => setNewChurch({ ...newChurch, plan: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  >
                    <option value="starter">Starter (R249)</option>
                    <option value="growth">Growth (R499)</option>
                    <option value="professional">Professional (R999)</option>
                  </select>
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none"
                  >
                    Create Church
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {churchToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-800 text-center"
            >
              <div className="mx-auto h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Delete Church?</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-white">{churchToDelete.name}</span>? This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setChurchToDelete(null)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteChurch}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
