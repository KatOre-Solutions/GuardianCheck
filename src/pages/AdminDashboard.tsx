import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getCollection, addDocument, updateDocument, removeDocument, subscribeToCollection, getDocument, subscribeToDocument, setDocument } from "../lib/firestore";
import { where } from "firebase/firestore";
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  Plus, 
  Trash2, 
  Edit2, 
  TrendingUp, 
  Calendar, 
  Clock, 
  ChevronRight,
  Shield,
  UserPlus,
  CheckCircle2,
  Search,
  X,
  AlertCircle,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Lock,
  CreditCard,
  Zap,
  AlertTriangle
} from "lucide-react";
import PayFastButton from "../components/PayFastButton";
import { hashPin, generatePin, obfuscatePin, deobfuscatePin } from "../lib/security";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import { motion } from "motion/react";

export default function AdminDashboard() {
  const { user, role, userData } = useAuth();
  const [searchParams] = useSearchParams();
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [membershipRequests, setMembershipRequests] = useState<any[]>([]);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: "", capacity: "", minAge: "", maxAge: "" });
  const [loading, setLoading] = useState(false);
  const [reportRange, setReportRange] = useState({ start: format(subDays(new Date(), 30), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") });
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<any>(null);
  const [showDeleteRoomModal, setShowDeleteRoomModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [churchData, setChurchData] = useState<any>(null);
  const [churchSecurity, setChurchSecurity] = useState<any>(null);
  const [showPin, setShowPin] = useState(false);
  const [regeneratingPin, setRegeneratingPin] = useState(false);

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      toast.success("Payment successful! Your subscription is being processed.", {
        description: "It may take a few minutes for your status to update.",
        duration: 6000
      });
    } else if (paymentStatus === "cancel") {
      toast.error("Payment cancelled.", {
        description: "Your subscription was not updated."
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (role === "admin" && userData?.churchId) {
      const unsubChurch = subscribeToDocument("churches", userData.churchId, setChurchData);
      const unsubSecurity = subscribeToDocument("church_security", userData.churchId, setChurchSecurity);
      return () => {
        unsubChurch();
        unsubSecurity();
      };
    }
  }, [role, userData?.churchId]);

  useEffect(() => {
    if (role === "admin" && userData?.churchId) {
      const constraints = [where("churchId", "==", userData.churchId)];
      const unsubRooms = subscribeToCollection("rooms", constraints, setRooms);
      const unsubUsers = subscribeToCollection("users", constraints, setUsers);
      const unsubCheckins = subscribeToCollection("checkins", constraints, setCheckins);
      const unsubChildren = subscribeToCollection("children", constraints, setChildren);
      const unsubGuardians = subscribeToCollection("guardians", constraints, setGuardians);
      const unsubInvitations = subscribeToCollection("invitations", constraints, setInvitations);
      const unsubRequests = subscribeToCollection("membershipRequests", constraints, setMembershipRequests);

      return () => {
        unsubRooms();
        unsubUsers();
        unsubCheckins();
        unsubChildren();
        unsubGuardians();
        unsubInvitations();
        unsubRequests();
      };
    }
  }, [role, userData?.churchId]);

  const handleApproveRequest = async (request: any, role: string = "parent") => {
    try {
      const roles = [role];
      if (role === "admin") roles.push("volunteer");
      if (role === "master_admin") {
        if (!roles.includes("admin")) roles.push("admin");
        if (!roles.includes("volunteer")) roles.push("volunteer");
      }

      await updateDocument("membershipRequests", request.id, { status: "approved", updatedAt: new Date().toISOString() });
      await updateDocument("users", request.userId, { 
        churchId: userData.churchId, 
        role, 
        roles,
        status: "approved",
        updatedAt: new Date().toISOString()
      });
      toast.success(`Approved ${request.userName} as ${role}`);
    } catch (error) {
      console.error("Approve Request Error:", error);
      toast.error("Failed to approve request");
    }
  };

  const handleRejectRequest = async (request: any) => {
    try {
      await updateDocument("membershipRequests", request.id, { status: "rejected", updatedAt: new Date().toISOString() });
      await updateDocument("users", request.userId, { status: "rejected", updatedAt: new Date().toISOString() });
      toast.success(`Rejected ${request.userName}`);
    } catch (error) {
      console.error("Reject Request Error:", error);
      toast.error("Failed to reject request");
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDocument("rooms", {
        ...newRoom,
        churchId: userData.churchId,
        capacity: Number(newRoom.capacity),
        minAge: Number(newRoom.minAge),
        maxAge: Number(newRoom.maxAge),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast.success("Room created successfully!");
      setShowRoomModal(false);
      setNewRoom({ name: "", capacity: "", minAge: "", maxAge: "" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const [invitations, setInvitations] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", email: "", role: "parent", gender: "", cellNumber: "" });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.churchId) {
      toast.error("Church ID missing. Please contact support.");
      return;
    }
    setLoading(true);
    try {
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const roles = [newUser.role];
      if (newUser.role === "admin") roles.push("volunteer");
      if (newUser.role === "master_admin") {
        if (!roles.includes("admin")) roles.push("admin");
        if (!roles.includes("volunteer")) roles.push("volunteer");
      }

      await addDocument("invitations", {
        email: newUser.email.toLowerCase().trim(),
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        roles,
        churchId: userData.churchId,
        status: "pending",
        token,
        expiresAt: expiresAt.toISOString(),
        invitedBy: user?.uid
      });
      
      const inviteLink = `${window.location.origin}/accept-invite?token=${token}`;
      console.log("Invitation Link:", inviteLink);
      
      toast.success(`Invitation created! Link: ${inviteLink}`, {
        duration: 10000,
      });
      setShowUserModal(false);
      setNewUser({ firstName: "", lastName: "", email: "", role: "parent", gender: "", cellNumber: "" });
    } catch (err) {
      toast.error("Failed to create invitation");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDeactivation = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDocument("users", userId, { deactivated: !currentStatus });
      toast.success(currentStatus ? "User activated!" : "User deactivated!");
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteRoom = (room: any) => {
    setRoomToDelete(room);
    setShowDeleteRoomModal(true);
  };

  const confirmDeleteRoom = async () => {
    if (!roomToDelete) return;
    setLoading(true);
    try {
      await removeDocument("rooms", roomToDelete.id);
      toast.success("Room deleted successfully!");
      setShowDeleteRoomModal(false);
      setRoomToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete room");
    } finally {
      setLoading(false);
    }
  };

  const handleEditRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    setLoading(true);
    try {
      await updateDocument("rooms", editingRoom.id, {
        ...editingRoom,
        churchId: userData.churchId,
        capacity: Number(editingRoom.capacity),
        minAge: Number(editingRoom.minAge),
        maxAge: Number(editingRoom.maxAge),
        updatedAt: new Date().toISOString()
      });
      toast.success("Room updated successfully!");
      setShowEditRoomModal(false);
      setEditingRoom(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update room");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
    setShowDeleteUserModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setLoading(true);
    try {
      await removeDocument("users", userToDelete.id);
      toast.success("User deleted successfully!");
      setShowDeleteUserModal(false);
      setUserToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    try {
      // Ensure roles array is consistent with the primary role
      const roles = [editingUser.role];
      if (editingUser.role === "admin") roles.push("volunteer");
      if (editingUser.role === "master_admin") {
        if (!roles.includes("admin")) roles.push("admin");
        if (!roles.includes("volunteer")) roles.push("volunteer");
      }

      await updateDocument("users", editingUser.id, {
        ...editingUser,
        roles,
        updatedAt: new Date().toISOString()
      });
      toast.success("User updated successfully!");
      setShowEditUserModal(false);
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  const handleRegeneratePin = async () => {
    if (!userData?.churchId) return;
    setRegeneratingPin(true);
    try {
      const newPin = generatePin();
      const hash = await hashPin(newPin);
      const obfuscated = obfuscatePin(newPin);
      
      await setDocument("church_security", userData.churchId, {
        adminOverridePinHash: hash,
        adminOverridePin: obfuscated, // Obfuscated for "Show PIN"
        pinLastUpdatedAt: new Date().toISOString()
      });

      // Clear sensitive data from public church document
      await updateDocument("churches", userData.churchId, {
        adminOverridePinHash: null,
        adminOverridePin: null,
        pinLastUpdatedAt: null
      });
      
      toast.success("New Admin Override PIN generated!");
      setShowPin(true); // Show it once generated
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate new PIN");
    } finally {
      setRegeneratingPin(false);
    }
  };

  const generateReport = () => {
    const start = startOfDay(new Date(reportRange.start));
    const end = endOfDay(new Date(reportRange.end));

    const filteredCheckins = checkins.filter(c => {
      const time = new Date(c.checkInTime);
      return time >= start && time <= end;
    });

    if (filteredCheckins.length === 0) {
      toast.error("No data found for the selected range");
      return;
    }

    const headers = ["Child Name", "Room", "Check-In Time", "Check-Out Time", "Status", "Guardian", "Volunteer"];
    const rows = filteredCheckins.map(c => [
      c.childName,
      c.roomName,
      c.checkInTime ? format(new Date(c.checkInTime), "yyyy-MM-dd HH:mm") : "",
      c.checkOutTime ? format(new Date(c.checkOutTime), "yyyy-MM-dd HH:mm") : "",
      c.status,
      c.guardianName || "",
      c.volunteerName || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_report_${reportRange.start}_to_${reportRange.end}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Report generated successfully!");
  };

  // Analytics Data
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const date = subDays(new Date(), i);
    const dayStr = format(date, "MMM d");
    const count = checkins?.filter(c => {
      const checkinDate = new Date(c.checkInTime);
      return format(checkinDate, "MMM d") === dayStr;
    })?.length || 0;
    return { name: dayStr, count };
  }).reverse();

  const roomAttendance = rooms?.map(room => ({
    name: room.name,
    count: checkins?.filter(c => c.roomId === room.id && c.status === "checked-in")?.length || 0,
    capacity: room.capacity
  })) || [];

  if (role !== "admin") {
    return <div className="text-center py-12">Access denied. Admin permissions required.</div>;
  }

  return (
    <div className="space-y-12 pb-24">
      {/* Subscription Status Banner */}
      {churchData?.status === "trialing" && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-orange-500 to-amber-600 p-4 rounded-2xl text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold">Free Trial Active</p>
              <p className="text-sm text-orange-50/80">
                Your trial ends on {churchData.trialEndsAt ? format(new Date(churchData.trialEndsAt), "MMMM d, yyyy") : "N/A"}. 
                Upgrade now to ensure uninterrupted service.
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              const subSection = document.getElementById('subscription-section');
              subSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white text-orange-600 px-6 py-2 rounded-xl font-bold text-sm hover:bg-orange-50 transition-colors"
          >
            Upgrade Plan
          </button>
        </motion.div>
      )}

      {churchData?.status === "delinquent" && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-red-600 to-pink-700 p-4 rounded-2xl text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold">Subscription Overdue</p>
              <p className="text-sm text-red-50/80">
                Your account is currently restricted due to a payment issue. Please update your subscription.
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              const subSection = document.getElementById('subscription-section');
              subSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white text-red-600 px-6 py-2 rounded-xl font-bold text-sm hover:bg-red-50 transition-colors"
          >
            Pay Now
          </button>
        </motion.div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Control Center</h1>
          <p className="text-gray-500 dark:text-gray-400">System-wide management and analytics</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center space-x-2">
            <Shield className="h-4 w-4" />
            <span>Admin Mode Active</span>
          </div>
        </div>
      </header>

      {/* Membership Requests Section */}
      {membershipRequests.filter(r => r.status === "pending").length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-amber-100 dark:border-amber-900/30 overflow-hidden">
          <div className="p-6 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/30 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Pending Membership Requests</h3>
            </div>
            <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-bold">
              {membershipRequests.filter(r => r.status === "pending").length} New
            </span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {membershipRequests.filter(r => r.status === "pending").map((request) => (
              <div key={request.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-lg">{request.userName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{request.userEmail}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Requested {format(new Date(request.createdAt), "MMM d, yyyy HH:mm")}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <button
                      onClick={() => handleApproveRequest(request, "parent")}
                      className="px-3 py-2 text-xs font-bold rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all"
                    >
                      As Parent
                    </button>
                    <button
                      onClick={() => handleApproveRequest(request, "volunteer")}
                      className="px-3 py-2 text-xs font-bold rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all"
                    >
                      As Volunteer
                    </button>
                    <button
                      onClick={() => handleApproveRequest(request, "admin")}
                      className="px-3 py-2 text-xs font-bold rounded-lg hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all"
                    >
                      As Admin
                    </button>
                  </div>
                  <button
                    onClick={() => handleRejectRequest(request)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Reject Request"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { label: "Total Parents", value: users?.filter(u => u.role === "parent")?.length || 0, icon: <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />, color: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Total Children", value: children?.length || 0, icon: <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />, color: "bg-green-50 dark:bg-green-900/20" },
          { label: "Active Guardians", value: guardians?.filter(g => g.active)?.length || 0, icon: <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />, color: "bg-purple-50 dark:bg-purple-900/20" },
          { label: "Inactive Guardians", value: guardians?.filter(g => !g.active)?.length || 0, icon: <Shield className="h-6 w-6 text-gray-600 dark:text-gray-400" />, color: "bg-gray-50 dark:bg-gray-800" },
          { label: "Total Rooms", value: rooms?.length || 0, icon: <LayoutDashboard className="h-6 w-6 text-orange-600 dark:text-orange-400" />, color: "bg-orange-50 dark:bg-orange-900/20" },
          { label: "Staff/Volunteers", value: users?.filter(u => u.role !== "parent")?.length || 0, icon: <Shield className="h-6 w-6 text-red-600 dark:text-red-400" />, color: "bg-red-50 dark:bg-red-900/20" }
        ].map((stat, idx) => (
          <div key={idx} className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center space-x-4">
            <div className={`h-12 w-12 ${stat.color} rounded-2xl flex items-center justify-center`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Report Generation Section */}
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Generate Attendance Report</h3>
          <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Start Date</label>
            <input 
              type="date" 
              value={reportRange.start}
              onChange={(e) => setReportRange({ ...reportRange, start: e.target.value })}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">End Date</label>
            <input 
              type="date" 
              value={reportRange.end}
              onChange={(e) => setReportRange({ ...reportRange, end: e.target.value })}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>
          <button 
            onClick={generateReport}
            className="bg-blue-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none"
          >
            Generate CSV Report
          </button>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Attendance History (Last 7 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Days}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-gray-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Current Room Occupancy</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomAttendance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-gray-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#1f2937', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Subscription Management Section */}
      <div id="subscription-section" className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Subscription & Billing</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage your plan and payments</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              churchData?.status === "active" ? "bg-green-100 text-green-600" :
              churchData?.status === "trialing" ? "bg-orange-100 text-orange-600" :
              "bg-red-100 text-red-600"
            }`}>
              {churchData?.status || "Unknown"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Current Plan</p>
                  <h4 className="text-3xl font-bold text-gray-900 dark:text-white uppercase">{churchData?.plan || "Starter"}</h4>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Price</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {churchData?.plan === "professional" ? "R999" : churchData?.plan === "growth" ? "R499" : "R249"}
                    <span className="text-sm text-gray-500 font-normal">/mo</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>Next billing date: <span className="font-bold text-gray-900 dark:text-white">
                  {churchData?.nextBillingDate ? format(new Date(churchData.nextBillingDate), "MMMM d, yyyy") : "N/A"}
                </span></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Users Limit</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {users.length} / {churchData?.plan === "professional" ? "Unlimited" : churchData?.plan === "growth" ? "50" : "20"}
                </p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Children Limit</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {children.length} / {churchData?.plan === "professional" ? "Unlimited" : churchData?.plan === "growth" ? "200" : "50"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-4">Payment Method</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Secure payments processed via PayFast. Local South African payment gateway.
              </p>
              <PayFastButton 
                churchId={userData?.churchId || ""} 
                plan={churchData?.plan || "starter"} 
                amount={churchData?.plan === "professional" ? 999 : churchData?.plan === "growth" ? 499 : 249}
                itemName={`GuardianCheck ${churchData?.plan || "Starter"} Subscription`}
                mPaymentId={`SUB-${userData?.churchId}-${Date.now()}`}
              />
              <p className="text-[10px] text-center text-gray-400 mt-4">
                By clicking "Pay Now", you agree to our terms of service and subscription policy.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center">
              <Lock className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Security Settings</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage admin override authorization</p>
            </div>
          </div>
          <Shield className="h-6 w-6 text-gray-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div className="space-y-4">
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Admin Override PIN</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowPin(!showPin)}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    title={showPin ? "Hide PIN" : "Show PIN"}
                  >
                    {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={handleRegeneratePin}
                    disabled={regeneratingPin}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Regenerate PIN"
                  >
                    <RefreshCw className={`h-5 w-5 ${regeneratingPin ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center">
                {churchSecurity?.adminOverridePin ? (
                  <div className="text-4xl font-mono font-bold tracking-[0.5em] text-gray-900 dark:text-white">
                    {showPin ? deobfuscatePin(churchSecurity.adminOverridePin) : "****"}
                  </div>
                ) : (
                  <div className="text-gray-400 dark:text-gray-500 italic">No PIN generated yet</div>
                )}
              </div>
              {churchSecurity?.pinLastUpdatedAt && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                  Last updated: {format(new Date(churchSecurity.pinLastUpdatedAt), "MMM d, yyyy HH:mm")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-gray-900 dark:text-white">About Admin Override</h4>
            <ul className="space-y-3">
              {[
                "Used for manual checkout when QR codes are unavailable",
                "Requires a 4-digit numeric PIN for authorization",
                "Every override is logged for audit purposes",
                "Only admins can view or regenerate this PIN",
                "Volunteers can use the PIN but cannot see it here"
              ].map((text, i) => (
                <li key={i} className="flex items-start space-x-3 text-sm text-gray-600 dark:text-gray-400">
                  <div className="h-1.5 w-1.5 bg-blue-600 rounded-full mt-1.5 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Room Management */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Room Management</h3>
            <button
              onClick={() => setShowRoomModal(true)}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {rooms?.map((room) => (
              <div key={room.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{room.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Ages: {room.minAge}-{room.maxAge} • Capacity: {room.capacity}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => {
                      setEditingRoom(room);
                      setShowEditRoomModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRoom(room)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Management */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Management</h3>
              <button
                onClick={() => setShowUserModal(true)}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <UserPlus className="h-5 w-5" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users by name, email or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[600px] overflow-y-auto">
            {users?.filter(u => {
              const search = searchTerm.toLowerCase();
              const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
              const name = (u.name || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              const idNumber = (u.idNumber || '').toLowerCase();
              return fullName.includes(search) || name.includes(search) || email.includes(search) || idNumber.includes(search);
            }).map((u) => (
              <div key={u.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center overflow-hidden">
                    {u.photoUrl || u.photoURL ? (
                      <img src={u.photoUrl || u.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Users className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {u.firstName ? `${u.firstName} ${u.lastName}` : (u.name || u.email)}
                    </p>
                    <div className="flex flex-col space-y-1">
                      {u.idNumber && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">ID: {u.idNumber}</p>
                      )}
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${u.deactivated ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'}`}>
                          {u.deactivated ? 'Deactivated' : 'Active'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">{u.role}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      setEditingUser(u);
                      setShowEditUserModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit User"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggleDeactivation(u.id, u.deactivated)}
                    className={`p-2 rounded-lg transition-colors ${u.deactivated ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
                    title={u.deactivated ? "Activate User" : "Deactivate User"}
                  >
                    {u.deactivated ? <CheckCircle2 className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete User"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUserModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add New User</h2>
            <form onSubmit={handleAddUser} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                  <input
                    required
                    type="text"
                    value={newUser.firstName}
                    onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                  <input
                    required
                    type="text"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">ID Number</label>
                <input
                  type="text"
                  value={(newUser as any).idNumber || ""}
                  onChange={(e) => setNewUser({ ...newUser, idNumber: e.target.value } as any)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Email Address</label>
                <input
                  required
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  >
                    <option value="parent">Parent</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Gender</label>
                  <select
                    value={newUser.gender}
                    onChange={(e) => setNewUser({ ...newUser, gender: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none"
              >
                {loading ? "Creating..." : "Create User"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEditUserModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit User</h2>
            <form onSubmit={handleUpdateUser} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</label>
                  <input
                    required
                    type="text"
                    value={editingUser.firstName || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                  <input
                    required
                    type="text"
                    value={editingUser.lastName || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">ID Number</label>
                <input
                  type="text"
                  value={editingUser.idNumber || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, idNumber: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Role</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  >
                    <option value="parent">Parent</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Gender</label>
                  <select
                    value={editingUser.gender || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, gender: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none"
              >
                {loading ? "Updating..." : "Update User"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {showEditRoomModal && editingRoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEditRoomModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Room</h2>
            <form onSubmit={handleEditRoom} className="space-y-6">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Room Name</label>
                <input
                  required
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Capacity</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingRoom.capacity}
                    onChange={(e) => setEditingRoom({ ...editingRoom, capacity: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Min Age</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingRoom.minAge}
                    onChange={(e) => setEditingRoom({ ...editingRoom, minAge: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Max Age</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingRoom.maxAge}
                    onChange={(e) => setEditingRoom({ ...editingRoom, maxAge: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none"
              >
                {loading ? "Updating..." : "Update Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRoomModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add New Room</h2>
            <form onSubmit={handleAddRoom} className="space-y-6">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Room Name</label>
                <input
                  required
                  type="text"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                  placeholder="e.g. Nursery, Pre-K"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Capacity</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
                    placeholder="20"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Min Age</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newRoom.minAge}
                    onChange={(e) => setNewRoom({ ...newRoom, minAge: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Max Age</label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newRoom.maxAge}
                    onChange={(e) => setNewRoom({ ...newRoom, maxAge: e.target.value })}
                    placeholder="2"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 dark:shadow-none"
              >
                {loading ? "Creating..." : "Create Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Room Confirmation Modal */}
      {showDeleteRoomModal && roomToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteRoomModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center space-y-6">
            <div className="mx-auto h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Delete Room?</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-white">{roomToDelete.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteRoomModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteRoom}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {showDeleteUserModal && userToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteUserModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center space-y-6">
            <div className="mx-auto h-16 w-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Delete User?</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Are you sure you want to permanently delete <span className="font-bold text-gray-900 dark:text-white">{userToDelete.firstName} {userToDelete.lastName}</span>? This action is irreversible.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteUserModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteUser}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Delete User" : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
