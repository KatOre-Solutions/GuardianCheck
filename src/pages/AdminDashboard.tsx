import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { getCollection, addDocument, updateDocument, removeDocument, subscribeToCollection } from "../lib/firestore";
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
  Search
} from "lucide-react";
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

export default function AdminDashboard() {
  const { user, role } = useAuth();
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: "", capacity: "", minAge: "", maxAge: "" });
  const [loading, setLoading] = useState(false);
  const [reportRange, setReportRange] = useState({ start: format(subDays(new Date(), 30), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") });
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);

  useEffect(() => {
    if (role === "admin") {
      const unsubRooms = subscribeToCollection("rooms", [], setRooms);
      const unsubUsers = subscribeToCollection("users", [], setUsers);
      const unsubCheckins = subscribeToCollection("checkins", [], setCheckins);
      const unsubChildren = subscribeToCollection("children", [], setChildren);
      const unsubGuardians = subscribeToCollection("guardians", [], setGuardians);

      return () => {
        unsubRooms();
        unsubUsers();
        unsubCheckins();
        unsubChildren();
        unsubGuardians();
      };
    }
  }, [role]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDocument("rooms", {
        ...newRoom,
        capacity: Number(newRoom.capacity),
        minAge: Number(newRoom.minAge),
        maxAge: Number(newRoom.maxAge)
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

  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ firstName: "", surname: "", email: "", role: "parent", gender: "", cellNumber: "" });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // In a real app, this would call a backend function to create the Auth user
      // For this demo, we'll create the Firestore document
      // The user would then need to use "Forgot Password" or the admin would provide a temp pass
      const tempPassword = Math.random().toString(36).slice(-8);
      
      await addDocument("users", {
        ...newUser,
        createdAt: new Date().toISOString(),
        deactivated: false,
        mustChangePassword: true,
        // We store the email so they can sign up/in
      });
      
      toast.success(`User created! Temporary password: ${tempPassword}`);
      setShowUserModal(false);
      setNewUser({ firstName: "", surname: "", email: "", role: "parent", gender: "", cellNumber: "" });
    } catch (err) {
      toast.error("Failed to create user");
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

  const handleDeleteRoom = async (roomId: string) => {
    if (window.confirm("Are you sure you want to delete this room?")) {
      try {
        await removeDocument("rooms", roomId);
        toast.success("Room deleted successfully!");
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete room");
      }
    }
  };

  const handleEditRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    setLoading(true);
    try {
      await updateDocument("rooms", editingRoom.id, {
        ...editingRoom,
        capacity: Number(editingRoom.capacity),
        minAge: Number(editingRoom.minAge),
        maxAge: Number(editingRoom.maxAge)
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

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this user? This action cannot be undone.")) {
      try {
        await removeDocument("users", userId);
        toast.success("User deleted successfully!");
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete user");
      }
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    try {
      await updateDocument("users", editingUser.id, {
        ...editingUser
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

      {/* Management Section */}
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
                    onClick={() => handleDeleteRoom(room.id)}
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
              const fullName = `${u.firstName || ''} ${u.surname || ''}`.toLowerCase();
              const name = (u.name || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              const idNumber = (u.idNumber || '').toLowerCase();
              return fullName.includes(search) || name.includes(search) || email.includes(search) || idNumber.includes(search);
            }).map((u) => (
              <div key={u.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center overflow-hidden">
                    {u.photoUrl ? <img src={u.photoUrl} alt="" className="h-full w-full object-cover" /> : <Users className="h-5 w-5 text-gray-400" />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {u.firstName ? `${u.firstName} ${u.surname}` : (u.name || u.email)}
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
                    onClick={() => handleDeleteUser(u.id)}
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
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Surname</label>
                  <input
                    required
                    type="text"
                    value={newUser.surname}
                    onChange={(e) => setNewUser({ ...newUser, surname: e.target.value })}
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
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Surname</label>
                  <input
                    required
                    type="text"
                    value={editingUser.surname || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, surname: e.target.value })}
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
                    type="number"
                    value={editingRoom.capacity}
                    onChange={(e) => setEditingRoom({ ...editingRoom, capacity: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Min Age</label>
                  <input
                    required
                    type="number"
                    value={editingRoom.minAge}
                    onChange={(e) => setEditingRoom({ ...editingRoom, minAge: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Max Age</label>
                  <input
                    required
                    type="number"
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
                    type="number"
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
                    type="number"
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
                    type="number"
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
    </div>
  );
}
