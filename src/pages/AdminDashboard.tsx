import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { getCollection, addDocument, updateDocument, removeDocument, subscribeToCollection, getDocument, subscribeToDocument, setDocument, restoreDocument, logAudit } from "../lib/firestore";
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
  AlertTriangle,
  Download,
  History,
  RotateCcw,
  FileText
} from "lucide-react";
import PayFastButton from "../components/PayFastButton";
import { safeFetch } from "../lib/api";
import { hashPin, generatePin, obfuscatePin, deobfuscatePin } from "../lib/security";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  Cell,
  AreaChart,
  Area
} from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";
import { motion } from "motion/react";
import { useActiveService } from "../hooks/useActiveService";
import SetupWizard from "../components/SetupWizard";
import { DashboardSkeleton, Skeleton } from "../components/Skeleton";
import { useTenant } from "../contexts/TenantContext";
import ChildDetailsModal from "../components/ChildDetailsModal";
import ChildrenDirectory from "../components/ChildrenDirectory";
import { toCsv, downloadCsv } from "../lib/csv";
import {
  buildAttendanceTrend,
  buildRoomOccupancy,
  buildServiceComparison,
  delta,
  filterHistorical,
  findStaleCheckins,
  inRange,
  rangeFor,
  sortByCheckInTimeDesc,
  summarise,
} from "../lib/analytics";
import WhatsAppSupport from "../components/WhatsAppSupport";

import { PLAN_LIMITS, PlanTier } from "../constants/plans";

const HelpTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-1">
    <AlertCircle className="h-3.5 w-3.5 text-gray-400 cursor-help hover:text-primary transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl z-50 text-center leading-tight">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
    </div>
  </div>
);

/**
 * One figure, with the period it covers stated on the card.
 *
 * The scope badge is not decoration. This page mixes three time horizons —
 * live occupancy, a selected window, and all-time totals — and nothing on it
 * used to say which was which, so an admin reading "Total Parents" beside
 * "Active Service Attendance" had no way to know one was all-time and the
 * other was the last hour.
 */
const StatCard = ({
  label,
  value,
  hint,
  scope,
  sub,
  icon,
  color,
  trend,
  trendLabel,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  scope?: string;
  /** Secondary line under the value, e.g. which service the peak was. */
  sub?: string;
  icon?: React.ReactNode;
  color?: string;
  trend?: { absolute: number; percent: number | null; direction: "up" | "down" | "flat" };
  trendLabel?: string;
}) => (
  <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center space-x-3 min-w-0">
        {icon && (
          <div className={`h-12 w-12 ${color || "bg-gray-100 dark:bg-gray-800"} rounded-2xl flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        )}
        <p className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider leading-tight">
          {label}
          {hint && <HelpTooltip text={hint} />}
        </p>
      </div>
      {scope && (
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg whitespace-nowrap shrink-0">
          {scope}
        </span>
      )}
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      {trend && (
        <p className={`text-xs font-medium mt-1 ${
          trend.direction === "up"
            ? "text-green-600 dark:text-green-400"
            : trend.direction === "down"
            ? "text-red-500 dark:text-red-400"
            : "text-gray-400 dark:text-gray-500"
        }`}>
          {trend.direction === "flat"
            ? "No change"
            : `${trend.absolute > 0 ? "+" : ""}${trend.absolute}${trend.percent === null ? "" : ` (${trend.percent > 0 ? "+" : ""}${trend.percent}%)`}`}
          {trendLabel ? ` ${trendLabel}` : ""}
        </p>
      )}
    </div>
  </div>
);

export default function AdminDashboard() {
  const { user, role, roles, userData, darkMode } = useAuth();
  const { church } = useTenant();
  const churchId = userData?.churchId || church?.id;
  const { activeService, loading: serviceLoading } = useActiveService();
  const [searchParams] = useSearchParams();
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: "", capacity: "20", minAge: "0", maxAge: "12" });
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
  const [selectedHistoricalEvent, setSelectedHistoricalEvent] = useState<string>("");
  const [selectedHistoricalService, setSelectedHistoricalService] = useState<string>("");
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<number>(30); // days
  const [showDeletedItems, setShowDeletedItems] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [triggeringEmergency, setTriggeringEmergency] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [showChildDetailsModal, setShowChildDetailsModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  useEffect(() => {
    if (churchData?.plan) {
      setSelectedPlan(churchData.plan.toLowerCase());
    }
  }, [churchData?.plan]);

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      showSuccessToast("Payment successful!", "Your subscription is being processed. It may take a few minutes for your status to update.");
    } else if (paymentStatus === "cancel") {
      showErrorToast("Payment cancelled.");
    }
  }, [searchParams]);

  useEffect(() => {
    if ((role === "admin" || roles.includes("master_admin")) && churchId) {
      const unsubChurch = subscribeToDocument("churches", churchId, setChurchData);
      const unsubSecurity = subscribeToDocument("church_security", churchId, setChurchSecurity);
      return () => {
        unsubChurch();
        unsubSecurity();
      };
    }
  }, [role, roles, churchId]);

  useEffect(() => {
    if ((role === "admin" || roles.includes("master_admin")) && churchId) {
      const constraints = [where("churchId", "==", churchId)];
      const unsubRooms = subscribeToCollection("rooms", constraints, setRooms);
      const unsubUsers = subscribeToCollection("users", constraints, setUsers);
      const unsubCheckins = subscribeToCollection("checkins", constraints, setCheckins);
      const unsubChildren = subscribeToCollection("children", constraints, setChildren);
      const unsubGuardians = subscribeToCollection("guardians", constraints, setGuardians);
      const unsubInvitations = subscribeToCollection("invitations", constraints, setInvitations);
      const unsubEvents = subscribeToCollection("events", constraints, setEvents);
      const unsubServices = subscribeToCollection("services", constraints, setServices);

      return () => {
        unsubRooms();
        unsubUsers();
        unsubCheckins();
        unsubChildren();
        unsubGuardians();
        unsubInvitations();
        unsubEvents();
        unsubServices();
      };
    }
  }, [role, roles, churchId]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!churchId) return;
    setLoading(true);
    try {
      await addDocument("rooms", {
        ...newRoom,
        churchId,
        capacity: Number(newRoom.capacity),
        minAge: Number(newRoom.minAge),
        maxAge: Number(newRoom.maxAge),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      showSuccessToast("Room Created", "The room has been added successfully.");
      setShowRoomModal(false);
      setNewRoom({ name: "", capacity: "20", minAge: "0", maxAge: "12" });
    } catch (err) {
      console.error(err);
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const [invitations, setInvitations] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", email: "", role: "volunteer" });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.churchId) {
      showErrorToast("Church ID missing. Please contact support.");
      return;
    }
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await safeFetch("/api/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role
        })
      });

      if (!result.ok) {
        throw new Error(result.error || "Failed to send invitation");
      }

      const data = result.data;
      
      if (data.emailError) {
        showSuccessToast("Invitation created!", `Email failed to send, but you can share this link: ${data.inviteLink}`);
      } else {
        showSuccessToast("Invitation sent!", `An email has been sent to ${newUser.email}`);
      }
      
      setShowUserModal(false);
      setNewUser({ firstName: "", lastName: "", email: "", role: "volunteer" });
    } catch (err: any) {
      showErrorToast(err.message || "Failed to create invitation");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDeactivation = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDocument("users", userId, { deactivated: !currentStatus });
      showSuccessToast(currentStatus ? "User activated!" : "User deactivated!");
    } catch (err) {
      showErrorToast("Failed to update status");
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
      showSuccessToast("Room deleted successfully!");
      setShowDeleteRoomModal(false);
      setRoomToDelete(null);
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to delete room");
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
      showSuccessToast("Room updated successfully!");
      setShowEditRoomModal(false);
      setEditingRoom(null);
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to update room");
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
      showSuccessToast("User deleted successfully!");
      setShowDeleteUserModal(false);
      setUserToDelete(null);
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to delete user");
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
      showSuccessToast("User updated successfully!");
      setShowEditUserModal(false);
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to update user");
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
      
      showSuccessToast("New Admin Override PIN generated!");
      setShowPin(true); // Show it once generated
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to generate new PIN");
    } finally {
      setRegeneratingPin(false);
    }
  };

  const generateReport = () => {
    /*
     * `inRange` is the same filter the dashboard's own totals use, so the row
     * count of this file matches the "Check-ins" figure for the same span.
     * The rows used to be joined with a bare `r.join(",")`, which silently
     * broke the file on any name containing a comma; `toCsv` quotes per
     * RFC 4180 instead.
     */
    const filteredCheckins = inRange(
      checkins,
      startOfDay(new Date(reportRange.start)),
      endOfDay(new Date(reportRange.end)),
    );

    if (filteredCheckins.length === 0) {
      showErrorToast("No data found for the selected range");
      return;
    }

    const csvContent = toCsv(sortByCheckInTimeDesc(filteredCheckins), [
      { header: "Child Name", value: (c) => c.childName || "" },
      { header: "Room", value: (c) => c.roomName || "" },
      { header: "Event", value: (c) => c.eventName || "N/A" },
      { header: "Service", value: (c) => c.serviceName || "N/A" },
      {
        header: "Check-In Time",
        value: (c) =>
          c.checkInTime ? format(new Date(c.checkInTime), "yyyy-MM-dd HH:mm") : "",
      },
      {
        header: "Check-Out Time",
        value: (c) =>
          c.checkOutTime ? format(new Date(c.checkOutTime), "yyyy-MM-dd HH:mm") : "",
      },
      { header: "Status", value: (c) => c.status || "" },
      { header: "Guardian", value: (c) => c.guardianName || "" },
      { header: "Volunteer", value: (c) => c.volunteerName || "" },
    ]);

    downloadCsv(
      `attendance_report_${reportRange.start}_to_${reportRange.end}.csv`,
      csvContent,
    );
    showSuccessToast("Report generated successfully!");
  };

  const handleTriggerEmergency = async () => {
    if (!user || !userData?.churchId) return;
    
    setTriggeringEmergency(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await safeFetch("/api/emergency-alert", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          churchId: userData.churchId,
          adminId: user.uid
        })
      });

      if (!result.ok) {
        throw new Error(result.error || "Failed to trigger emergency alert");
      }

      showSuccessToast("Emergency alerts triggered successfully", "All parents of checked-in children have been notified.");
      setShowEmergencyModal(false);
    } catch (err: any) {
      showErrorToast(err.message);
    } finally {
      setTriggeringEmergency(false);
    }
  };

  const exportAllData = async () => {
    if (!userData?.churchId) return;
    setExporting(true);
    try {
      const collections = [
        { name: "children", data: children },
        { name: "guardians", data: guardians },
        { name: "rooms", data: rooms },
        { name: "events", data: events },
        { name: "services", data: services },
        { name: "checkins", data: checkins },
        { name: "users", data: users }
      ];

      for (const col of collections) {
        if (col.data.length === 0) continue;

        // Union of keys across every record, not just the first. Firestore
        // enforces no schema, so deriving headers from `data[0]` silently
        // dropped any column the first document happened to lack.
        const headerSet = new Set<string>();
        for (const item of col.data) {
          for (const [key, value] of Object.entries(item)) {
            if (typeof value !== "object") headerSet.add(key);
          }
        }
        const headers = Array.from(headerSet);

        downloadCsv(
          `full_backup_${col.name}_${format(new Date(), "yyyyMMdd")}.csv`,
          toCsv(
            col.data,
            headers.map(h => ({
              header: h,
              // Quoting is handled by toCsv, so values are no longer mangled
              // by the old `replace(/,/g, ";")` comma substitution.
              value: (item: any) => (item[h] == null ? "" : String(item[h])),
            })),
          ),
        );
      }

      await logAudit({
        action: "full_data_export",
        category: "admin",
        details: { timestamp: new Date().toISOString() },
        churchId: userData.churchId,
        userId: user?.uid || ""
      });

      showSuccessToast("All data exported successfully!");
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async (path: string, id: string, name: string) => {
    try {
      await restoreDocument(path, id);
      showSuccessToast(`${name} restored successfully!`);
      
      await logAudit({
        action: "restore_document",
        category: "admin",
        details: { path, id, name },
        churchId: userData.churchId,
        userId: user?.uid || ""
      });
    } catch (err) {
      console.error(err);
      showErrorToast("Failed to restore item");
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Derived numbers                                                        */
  /*                                                                        */
  /* Every figure below comes from `src/lib/analytics.ts`, so the trends     */
  /* panel and the historical panel share one definition of each metric and  */
  /* cannot drift apart. They are memoised because the previous inline       */
  /* version rebuilt all eight datasets on every render — including on every */
  /* keystroke in any modal on this page.                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * One clock for the whole page, so every number a render shows is "as at"
   * the same instant. It ticks each minute to keep the live zone's timestamp
   * honest without re-rendering on unrelated state changes.
   */
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const activeServiceId = activeService?.id ?? null;

  // --- Zone B: the 7/30/90 selector governs everything in this group ------

  const range = useMemo(
    () => rangeFor(analyticsTimeRange, now),
    [analyticsTimeRange, now],
  );

  const summary = useMemo(
    () => summarise(checkins, services, events, range.from, range.to),
    [checkins, services, events, range],
  );

  const previousSummary = useMemo(
    () =>
      summarise(
        checkins,
        services,
        events,
        range.previous.from,
        range.previous.to,
      ),
    [checkins, services, events, range],
  );

  const attendanceTrend = useMemo(
    () => buildAttendanceTrend(checkins, range.from, range.to),
    [checkins, range],
  );

  const serviceComparison = useMemo(
    () => buildServiceComparison(checkins, services, events, range.from, range.to),
    [checkins, services, events, range],
  );

  const checkinsDelta = useMemo(
    () => delta(summary.totalCheckins, previousSummary.totalCheckins),
    [summary, previousSummary],
  );

  const childrenDelta = useMemo(
    () => delta(summary.uniqueChildren, previousSummary.uniqueChildren),
    [summary, previousSummary],
  );

  // --- Zone A: right now ---------------------------------------------------

  const roomOccupancy = useMemo(
    () => buildRoomOccupancy(rooms, checkins, activeServiceId),
    [rooms, checkins, activeServiceId],
  );

  const staleCheckins = useMemo(
    () => findStaleCheckins(checkins, services, activeServiceId, now),
    [checkins, services, activeServiceId, now],
  );

  const liveCounts = useMemo(() => {
    const live = checkins.filter(c => c.deleted !== true);
    const startOfToday = startOfDay(now);

    return {
      checkedIn: live.filter(c => c.status === "checked-in").length,
      checkedOutToday: live.filter(c => {
        if (c.status !== "checked-out" || !c.checkOutTime) return false;
        const out = new Date(c.checkOutTime);
        return !Number.isNaN(out.getTime()) && out >= startOfToday;
      }).length,
      activeServiceAttendance: activeServiceId
        ? live.filter(
            c => c.serviceId === activeServiceId && c.status === "checked-in",
          ).length
        : null,
    };
  }, [checkins, activeServiceId, now]);

  const roomsAtCapacity = useMemo(
    () => roomOccupancy.filter(r => r.count >= r.capacity).length,
    [roomOccupancy],
  );

  // --- Zone C: church totals, all time ------------------------------------

  /*
   * A user's role lives in `roles[]` on current documents and in the legacy
   * scalar `role` on older ones. The stat cards read only the scalar, so every
   * user created since the array landed was missing from "Total Parents", and
   * "Staff/Volunteers" counted `role !== "parent"` — which swept in users with
   * no role at all, plus everyone who had been deactivated.
   */
  const hasRole = (u: any, name: string) =>
    Array.isArray(u?.roles) ? u.roles.includes(name) : u?.role === name;

  const peopleCounts = useMemo(() => {
    const active = users.filter(u => !u.deleted && !u.deactivated);

    return {
      parents: active.filter(u => hasRole(u, "parent")).length,
      staff: active.filter(
        u =>
          hasRole(u, "admin") ||
          hasRole(u, "volunteer") ||
          hasRole(u, "master_admin"),
      ).length,
      /* `active !== false`, not `active`: guardians approved before the flag
       * existed have no such field and would otherwise vanish from the count. */
      guardians: guardians.filter(g => g.active !== false && !g.deleted).length,
    };
  }, [users, guardians]);

  /* The server counts a pending invitation as a consumed seat, so the meter
   * must too — otherwise an admin reads 18/20, invites a volunteer, and is
   * refused. */
  const pendingInvitations = useMemo(
    () => invitations.filter(i => !i.deleted && i.status === "pending").length,
    [invitations],
  );

  const usedUserSeats = users.length + pendingInvitations;

  /* Soft-deleted children keep consuming plan quota, because the server
   * enforces the limit with an unfiltered collection query. The meter says so
   * rather than quietly showing a number the enforcement disagrees with. */
  const removedChildren = useMemo(
    () => children.filter(c => c.deleted).length,
    [children],
  );

  // --- Zone D: historical analysis ----------------------------------------

  const historicalCheckins = useMemo(
    () =>
      sortByCheckInTimeDesc(
        filterHistorical(
          checkins,
          services,
          selectedHistoricalEvent,
          selectedHistoricalService,
        ),
      ),
    [checkins, services, selectedHistoricalEvent, selectedHistoricalService],
  );

  /* The filters narrow the services too, so "average per service" divides by
   * the services actually in view rather than by every service the church has
   * ever held. */
  const historicalServices = useMemo(
    () =>
      services.filter(s => {
        if (selectedHistoricalService) return s.id === selectedHistoricalService;
        if (selectedHistoricalEvent) return s.eventId === selectedHistoricalEvent;
        return true;
      }),
    [services, selectedHistoricalEvent, selectedHistoricalService],
  );

  const historicalSummary = useMemo(() => {
    const times = historicalCheckins
      .map(c => new Date(c.checkInTime).getTime())
      .filter(t => !Number.isNaN(t));

    if (times.length === 0) {
      return summarise([], [], [], startOfDay(now), endOfDay(now));
    }

    return summarise(
      historicalCheckins,
      historicalServices,
      events,
      startOfDay(new Date(Math.min(...times))),
      endOfDay(new Date(Math.max(...times))),
    );
  }, [historicalCheckins, historicalServices, events, now]);

  // --- Other panels --------------------------------------------------------

  const volunteerActivity = useMemo(
    () =>
      users
        .filter(u => hasRole(u, "volunteer"))
        .map(v => {
          const checkinsHandled = checkins.filter(c => c.volunteerId === v.id).length;
          const checkoutsHandled = checkins.filter(
            c => c.checkOutVolunteerId === v.id,
          ).length;
          return {
            name: `${v.firstName} ${v.lastName}`,
            totalActions: checkinsHandled + checkoutsHandled,
            checkins: checkinsHandled,
            checkouts: checkoutsHandled,
          };
        })
        .sort((a, b) => b.totalActions - a.totalActions),
    [users, checkins],
  );

  const recentActivity = useMemo(
    () =>
      [...checkins]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.checkInTime).getTime() -
            new Date(a.updatedAt || a.checkInTime).getTime(),
        )
        .slice(0, 5),
    [checkins],
  );

  // --- Chart chrome --------------------------------------------------------

  /*
   * Axis, grid and tooltip colours were hardcoded light-mode hex, so in dark
   * mode the tick labels sat at low contrast on a near-black surface. These
   * follow the theme the user actually chose.
   */
  const chartTheme = useMemo(
    () => ({
      axis: darkMode ? "#9ca3af" : "#94a3b8",
      grid: darkMode ? "#1f2937" : "#f1f5f9",
      tooltip: {
        borderRadius: "12px",
        border: "none",
        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
        backgroundColor: darkMode ? "#111827" : "#1f2937",
        color: "#fff",
      },
    }),
    [darkMode],
  );

  /*
   * Categorical palette for the service slots, in fixed order. Brand-neutral
   * on purpose: `--primary-color` is set per church, so a palette derived from
   * it would stop distinguishing slots for whichever colour a church picks.
   * Validated for colour-vision deficiency and contrast against both the light
   * (#ffffff) and dark (#111827) chart surfaces; the order is the safety
   * mechanism, so slots are assigned from the front and never cycled.
   */
  const SERIES_COLORS = darkMode
    ? ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
    : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

  const [serviceChartView, setServiceChartView] = useState<"day" | "totals">("day");
  const Building2 = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
  );

  if (role !== "admin" && !roles.includes("master_admin")) {
    return <div className="text-center py-12">Access denied. Admin permissions required.</div>;
  }

  if (serviceLoading && !churchData) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-12 pb-24">
      {/* Setup Wizard for new churches */}
      {!churchData?.setupCompleted && userData?.churchId && (
        <SetupWizard 
          churchId={userData.churchId} 
          onComplete={() => {
            // The subscription to churchData will automatically update the UI
            showSuccessToast("Setup complete!");
          }} 
        />
      )}

      {/* Setup Progress Tracker */}
      {churchData?.setupCompleted && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Rooms", count: rooms.filter(r => !r.deleted).length, icon: Building2, link: "#rooms-section", min: 1 },
            { label: "Services", count: services.filter(s => !s.deleted).length, icon: Clock, link: "#services-section", min: 1 },
            { label: "Children", count: children.filter(c => !c.deleted).length, icon: Users, link: "#children-section", min: 1 },
            { label: "Volunteers", count: users.filter(u => u.role === "volunteer" || u.roles?.includes("volunteer")).length, icon: UserPlus, link: "#users-section", min: 1 }
          ].some(item => item.count < item.min) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="col-span-full bg-white dark:bg-gray-900 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-gray-900 dark:text-white">Getting Started Checklist</h3>
                </div>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full uppercase">Action Required</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Create Rooms", count: rooms.filter(r => !r.deleted).length, icon: Building2, min: 1, desc: "Define your classrooms" },
                  { label: "Set Services", count: services.filter(s => !s.deleted).length, icon: Clock, min: 1, desc: "Schedule your meeting times" },
                  { label: "Add Children", count: children.filter(c => !c.deleted).length, icon: Users, min: 1, desc: "Register your first family" },
                  { label: "Invite Team", count: users.filter(u => u.role === "volunteer" || u.roles?.includes("volunteer")).length, icon: UserPlus, min: 1, desc: "Bring your volunteers onboard" }
                ].map((item, i) => (
                  <div key={i} className={`p-4 rounded-2xl border transition-all ${item.count >= item.min ? 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <item.icon className={`h-5 w-5 ${item.count >= item.min ? 'text-green-600' : 'text-gray-400'}`} />
                      {item.count >= item.min ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <div className="h-4 w-4 rounded-full border-2 border-gray-200" />}
                    </div>
                    <p className="font-bold text-sm text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{item.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

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
              {searchParams.get("payment") === "success" ? (
                <>
                  <p className="font-bold flex items-center">
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Subscription Syncing...
                  </p>
                  <p className="text-sm text-orange-50/80">
                    We've received your payment! Updating your dashboard status now.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold">Free Trial Active</p>
                  <p className="text-sm text-orange-50/80">
                    Your trial ends on {churchData.subscription?.trialEndsAt ? format(new Date(churchData.subscription.trialEndsAt), "MMMM d, yyyy") : "N/A"}. 
                    Upgrade now to ensure uninterrupted service.
                  </p>
                </>
              )}
            </div>
          </div>
          {searchParams.get("payment") !== "success" && (
            <button 
              onClick={() => {
                const subSection = document.getElementById('subscription-section');
                subSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-white text-orange-600 px-6 py-2 rounded-xl font-bold text-sm hover:bg-orange-50 transition-colors"
            >
              Upgrade Plan
            </button>
          )}
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
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Admin Control Center</h1>
            {activeService ? (
              <motion.span 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-3 py-1.5 rounded-2xl text-[11px] font-bold uppercase tracking-wider border border-green-100 dark:border-green-800/50 shadow-sm"
              >
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span>{activeService.name} Active</span>
              </motion.span>
            ) : (
              <span className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-800 text-gray-400 px-3 py-1.5 rounded-2xl text-[11px] font-bold uppercase tracking-wider border border-gray-100 dark:border-gray-700">
                <AlertCircle className="h-3 w-3" />
                <span>No Active Service</span>
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">System-wide management and analytics</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowEmergencyModal(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center space-x-2 hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none hover:-translate-y-0.5 cursor-pointer"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Emergency Alert</span>
            <HelpTooltip text="Instantly notify all active volunteers and admins of an emergency situation." />
          </button>
          <button 
            onClick={exportAllData}
            disabled={exporting}
            className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-bold border border-gray-100 dark:border-gray-700 hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>{exporting ? "Exporting..." : "Export All Data"}</span>
          </button>
          <WhatsAppSupport 
            phoneNumber="+27796251393" 
            message={`Bug Report from ${userData?.firstName} ${userData?.lastName} at ${churchData?.name || 'Unknown Church'}: `}
            label="Log Bug"
            position="static"
            className="!px-3 !py-2 !rounded-xl !shadow-none ring-1 ring-inset ring-gray-100 dark:ring-gray-700 font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
          />
          <div className="bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80 px-4 py-2 rounded-xl text-sm font-bold flex items-center space-x-2">
            <Shield className="h-4 w-4" />
            <span>Admin Mode Active</span>
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* Zone A — Right now                                                 */}
      {/* ================================================================== */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center">
              <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Right now</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activeService
                  ? `${activeService.name} is running`
                  : "No service running"}
              </p>
            </div>
          </div>
          <span className="self-start md:self-auto text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg">
            Live · as at {format(now, "HH:mm")}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Checked in right now"
            value={liveCounts.checkedIn}
            scope="Live"
            hint="Children currently in a room, whatever service they were signed into."
            icon={<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />}
            color="bg-green-50 dark:bg-green-900/20"
          />
          <StatCard
            label="In the active service"
            value={liveCounts.activeServiceAttendance ?? "No service running"}
            scope="Live"
            hint="Open check-ins belonging to the service that is running now."
            icon={<Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
          <StatCard
            label="Checked out today"
            value={liveCounts.checkedOutToday}
            scope="Today"
            hint="Children collected since midnight."
            icon={<History className="h-6 w-6 text-primary dark:text-primary/80" />}
            color="bg-primary/10 dark:bg-primary/20"
          />
          <StatCard
            label="Open from earlier services"
            value={staleCheckins.length}
            scope="Live"
            hint="Still checked in against a service that has closed. These need a check-out."
            icon={<AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />}
            color="bg-amber-50 dark:bg-amber-900/20"
          />
        </div>

        {/* Room occupancy */}
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-lg font-bold text-gray-900 dark:text-white">
              Room occupancy
              <HelpTooltip text="Every child currently checked in, whatever service they were signed into. This is the number to trust in an evacuation." />
            </h4>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {roomsAtCapacity > 0
                ? `${roomsAtCapacity} room${roomsAtCapacity === 1 ? "" : "s"} at or over capacity`
                : "All rooms within capacity"}
            </span>
          </div>
          {roomOccupancy.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No rooms set up yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {roomOccupancy.map((room) => (
                <div key={room.id} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{room.name}</p>
                      <p className="text-xs text-gray-500">{room.count} / {room.capacity} children</p>
                      {/* The stale portion is called out rather than removed:
                          hiding it would under-report who is in the room. */}
                      {room.staleCount > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          {room.staleCount} from earlier services
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-bold ${
                      room.percentage > 90 ? "text-red-500" : room.percentage > 70 ? "text-orange-500" : "text-green-500"
                    }`}>
                      {room.percentage}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${room.percentage}%` }}
                      className={`h-full rounded-full ${
                        room.percentage > 90 ? "bg-red-500" : room.percentage > 70 ? "bg-orange-500" : "bg-green-500"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/*
          Stale check-ins. Read-only by design: GuardianCheck is a safeguarding
          system, and an automated check-out would assert a collection that
          never happened. This panel points at the records; a person clears
          them through the normal Check-Out flow.
        */}
        {staleCheckins.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/10 p-8 rounded-3xl border border-amber-200 dark:border-amber-900/30 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                    {staleCheckins.length} open check-in{staleCheckins.length === 1 ? "" : "s"} from an earlier service
                  </h4>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Oldest has been open {staleCheckins[0].daysOpen === 0 ? "since earlier today" : `for ${staleCheckins[0].daysOpen} day${staleCheckins[0].daysOpen === 1 ? "" : "s"}`}.
                    These children still count towards room occupancy.
                  </p>
                </div>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 md:text-right">
                Check them out from the <span className="font-bold">Check-Out</span> tab.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-amber-200 dark:border-amber-900/30">
                    <th className="py-3 px-4 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Child</th>
                    <th className="py-3 px-4 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Room</th>
                    <th className="py-3 px-4 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Service</th>
                    <th className="py-3 px-4 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Checked in</th>
                    <th className="py-3 px-4 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Open for</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 dark:divide-amber-900/20">
                  {staleCheckins.slice(0, 10).map((record) => (
                    <tr key={record.id}>
                      <td className="py-3 px-4">
                        <p
                          className="font-bold text-gray-900 dark:text-white cursor-pointer hover:text-primary transition-colors"
                          onClick={() => {
                            setSelectedChildId(record.childId);
                            setShowChildDetailsModal(true);
                          }}
                        >
                          {record.childName}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{record.roomName}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{record.serviceLabel}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {record.checkInTime ? format(new Date(record.checkInTime), "EEE d MMM, HH:mm") : "Unknown"}
                      </td>
                      <td className="py-3 px-4 text-sm font-bold text-amber-700 dark:text-amber-400">
                        {record.daysOpen === 0 ? "Today" : `${record.daysOpen} day${record.daysOpen === 1 ? "" : "s"}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {staleCheckins.length > 10 && (
                <p className="pt-4 text-xs text-amber-800 dark:text-amber-300">
                  Showing the 10 oldest of {staleCheckins.length}.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ================================================================== */}
      {/* Zone B — Trends over time                                          */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary dark:text-primary/80" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Trends over time</h3>
              {/* The resolved span, not just "30 days" — an admin should never
                  have to work out which dates a figure covers. */}
              <p className="text-sm text-gray-500 dark:text-gray-400">{range.label}</p>
            </div>
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl self-start md:self-auto">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setAnalyticsTimeRange(days)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  analyticsTimeRange === days
                    ? "bg-white dark:bg-gray-700 text-primary shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Check-ins"
            value={summary.totalCheckins}
            scope={`${analyticsTimeRange} days`}
            hint="Attendance records in this range. A child attending two services counts twice."
            icon={<CheckCircle2 className="h-6 w-6 text-primary dark:text-primary/80" />}
            color="bg-primary/10 dark:bg-primary/20"
            trend={checkinsDelta}
            trendLabel={`vs previous ${analyticsTimeRange} days`}
          />
          <StatCard
            label="Unique children"
            value={summary.uniqueChildren}
            scope={`${analyticsTimeRange} days`}
            hint="Distinct children who attended at least once in this range."
            icon={<Users className="h-6 w-6 text-green-600 dark:text-green-400" />}
            color="bg-green-50 dark:bg-green-900/20"
            trend={childrenDelta}
            trendLabel={`vs previous ${analyticsTimeRange} days`}
          />
          <StatCard
            label="Average per service"
            value={summary.averagePerService ?? "—"}
            scope={`${analyticsTimeRange} days`}
            hint={`Check-ins divided by the ${summary.servicesHeld} service${summary.servicesHeld === 1 ? "" : "s"} held in this range, including any nobody attended.`}
            icon={<TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
          <StatCard
            label="Busiest single service"
            value={summary.busiest?.count ?? "—"}
            scope={`${analyticsTimeRange} days`}
            hint="The one service instance with the highest attendance in this range."
            sub={summary.busiest?.label}
            icon={<Zap className="h-6 w-6 text-orange-600 dark:text-orange-400" />}
            color="bg-orange-50 dark:bg-orange-900/20"
          />
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Attendance trend */}
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">Attendance trend</h4>
              <span className="text-xs font-bold text-primary dark:text-primary/80 bg-primary/10 dark:bg-primary/20 px-2 py-1 rounded-lg">
                {range.label}
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceTrend}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.grid} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: chartTheme.axis }} minTickGap={16} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: chartTheme.axis }} />
                  <Tooltip
                    contentStyle={chartTheme.tooltip}
                    itemStyle={{ color: "#fff" }}
                    labelFormatter={(_label, payload) =>
                      payload?.[0]?.payload?.fullLabel ?? _label
                    }
                    formatter={(value: any) => [value, "Check-ins"]}
                  />
                  <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/*
            Attendance by service. The old "Service Comparison" keyed its
            category axis on `service.name`, and the weekly job creates a fresh
            pair of documents both called "09:00 Service" every Sunday — so
            sixteen services collapsed into two ticks with the bars drawn on
            top of each other. Keying on the day and treating the slot as a
            series is what makes it readable.
          */}
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                Attendance by service
                <HelpTooltip text="Each column is one day; each colour is a service slot. Days a service ran with nobody attending stay visible." />
              </h4>
              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                {([["day", "By day"], ["totals", "Totals"]] as const).map(([view, label]) => (
                  <button
                    key={view}
                    onClick={() => setServiceChartView(view)}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      serviceChartView === view
                        ? "bg-white dark:bg-gray-700 text-primary shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {serviceComparison.days.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-400 italic text-sm">
                No services ran in this range
              </div>
            ) : serviceChartView === "day" ? (
              /* Wide ranges scroll rather than squash: a 90-day window can hold
                 a dozen service days and they must stay individually readable. */
              <div className="overflow-x-auto">
                <div
                  className="h-72"
                  style={{ minWidth: `max(100%, ${serviceComparison.days.length * 64}px)` }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serviceComparison.days} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartTheme.grid} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: chartTheme.axis }} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: chartTheme.axis }} />
                      <Tooltip
                        cursor={{ fill: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
                        contentStyle={chartTheme.tooltip}
                        itemStyle={{ color: "#fff" }}
                        labelFormatter={(_label, payload) =>
                          payload?.[0]?.payload?.fullLabel ?? _label
                        }
                        formatter={(value: any, name: any) => [value, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      {serviceComparison.slots.map((slot, index) => (
                        <Bar
                          key={slot}
                          dataKey={slot}
                          fill={SERIES_COLORS[index]}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceComparison.totals} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartTheme.grid} />
                    <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: chartTheme.axis }} />
                    <YAxis dataKey="slot" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: chartTheme.axis }} width={110} />
                    <Tooltip
                      cursor={{ fill: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
                      contentStyle={chartTheme.tooltip}
                      itemStyle={{ color: "#fff" }}
                      formatter={(value: any) => [value, "Check-ins"]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {serviceComparison.totals.map((entry, index) => (
                        <Cell key={entry.slot} fill={SERIES_COLORS[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* The table view is the relief for the palette's lower-contrast
                slots in light mode, and the answer to "what is the exact
                number" that a bar chart never gives well. */}
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-primary transition-colors">
                Show the numbers
              </summary>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Day</th>
                      {serviceComparison.slots.map((slot, index) => (
                        <th key={slot} className="py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[index] }} />
                            {slot}
                          </span>
                        </th>
                      ))}
                      <th className="py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {serviceComparison.days.map((day) => (
                      <tr key={day.dateISO}>
                        <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{day.fullLabel}</td>
                        {serviceComparison.slots.map((slot) => (
                          <td key={slot} className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">{day[slot]}</td>
                        ))}
                        <td className="py-2 px-3 text-sm font-bold text-gray-900 dark:text-white">{day.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Zone C — Church totals                                             */}
      {/* ================================================================== */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
              <LayoutDashboard className="h-6 w-6 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Church totals</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Everything on the books, not tied to a date range</p>
            </div>
          </div>
          <span className="self-start md:self-auto text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
            All time
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            label="Parent accounts"
            value={peopleCounts.parents}
            scope="All time"
            hint="Active accounts holding the parent role. A user can be both a parent and a volunteer, so these counts overlap and will not sum."
            icon={<Users className="h-6 w-6 text-primary dark:text-primary/80" />}
            color="bg-primary/10 dark:bg-primary/20"
          />
          <StatCard
            label="Registered children"
            value={children?.filter(c => !c.deleted)?.length || 0}
            scope="All time"
            hint="Children on the register, excluding any that have been removed."
            icon={<TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />}
            color="bg-green-50 dark:bg-green-900/20"
          />
          <StatCard
            label="Approved guardians"
            value={peopleCounts.guardians}
            scope="All time"
            hint="Guardians authorised to collect a child."
            icon={<Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
          <StatCard
            label="Rooms"
            value={rooms?.filter(r => !r.deleted)?.length || 0}
            scope="All time"
            hint="Rooms available for check-in."
            icon={<LayoutDashboard className="h-6 w-6 text-orange-600 dark:text-orange-400" />}
            color="bg-orange-50 dark:bg-orange-900/20"
          />
          <StatCard
            label="Admins & volunteers"
            value={peopleCounts.staff}
            scope="All time"
            hint="Active accounts holding an admin or volunteer role. A user can be both a parent and a volunteer, so these counts overlap and will not sum."
            icon={<Shield className="h-6 w-6 text-red-600 dark:text-red-400" />}
            color="bg-red-50 dark:bg-red-900/20"
          />
        </div>
      </section>

      {/* Report Generation Section */}
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Generate Attendance Report</h3>
          <Calendar className="h-6 w-6 text-primary dark:text-primary/80" />
        </div>
        <div className="flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={reportRange.start}
              onChange={(e) => setReportRange({ ...reportRange, start: e.target.value })}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={reportRange.end}
              onChange={(e) => setReportRange({ ...reportRange, end: e.target.value })}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
            />
          </div>
          <button
            onClick={generateReport}
            className="bg-primary text-white px-8 py-2 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 dark:shadow-none"
          >
            Generate CSV Report
          </button>
        </div>
      </div>

      {/* Historical Attendance Analysis Section */}
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-purple-50 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center">
              <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Historical Analysis</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Filter past attendance by event or service</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedHistoricalEvent}
              onChange={(e) => setSelectedHistoricalEvent(e.target.value)}
              className="bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none"
            >
              <option value="">All Events</option>
              {[...events]
                .filter(e => !e.deleted)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(event => {
                  const parsed = event.date ? new Date(event.date) : null;
                  const dated = parsed && !Number.isNaN(parsed.getTime());
                  return (
                    <option key={event.id} value={event.id}>
                      {event.name}{dated ? " (" + format(parsed as Date, "d MMM yyyy") + ")" : ""}
                    </option>
                  );
                })}
            </select>
            
            <select
              value={selectedHistoricalService}
              onChange={(e) => setSelectedHistoricalService(e.target.value)}
              className="bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none"
            >
              <option value="">All Services</option>
              {/* Several services share a name, so the date is what tells
                  them apart in this list. */}
              {services
                .filter(s => !s.deleted)
                .filter(s => !selectedHistoricalEvent || s.eventId === selectedHistoricalEvent)
                .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (a.startTime || "").localeCompare(b.startTime || ""))
                .map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name}{service.date ? " — " + service.date : ""}
                  </option>
                ))}
            </select>

            <button 
              onClick={() => {
                setSelectedHistoricalEvent("");
                setSelectedHistoricalService("");
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Clear Filters"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-purple-50 dark:bg-purple-900/10 p-6 rounded-2xl border border-purple-100 dark:border-purple-900/20">
            {/* "Total Attendees" implied people; a child attending two services
                produces two records, so this counts records. */}
            <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
              Check-in records
              <HelpTooltip text="Attendance records matching the filters. A child attending two services appears twice." />
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{historicalSummary.totalCheckins}</p>
          </div>
          <div className="bg-primary/10 dark:bg-primary/20 p-6 rounded-2xl border border-primary/20 dark:border-primary/30">
            <p className="text-xs font-bold text-primary dark:text-primary/80 uppercase tracking-wider mb-1">Unique children</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {historicalSummary.uniqueChildren}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 p-6 rounded-2xl border border-green-100 dark:border-green-900/20">
            <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">
              Average per service
              <HelpTooltip text="Divided by the services held in view, including any nobody attended." />
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {historicalSummary.averagePerService ?? "—"}
            </p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/10 p-6 rounded-2xl border border-orange-100 dark:border-orange-900/20">
            {/* This used to read live room occupancy — a number from the last
                hour, sitting inside a panel about the past and ignoring both
                of its filters. */}
            <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">
              Busiest single service
              <HelpTooltip text="The one service instance with the highest attendance among the filtered records." />
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {historicalSummary.busiest?.count ?? "—"}
            </p>
            {historicalSummary.busiest && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{historicalSummary.busiest.label}</p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Child</th>
                <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Event / Service</th>
                <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Room</th>
                <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Check-In</th>
                <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {historicalCheckins.slice(0, 10).map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-4 px-4">
                    <p 
                      className="font-bold text-gray-900 dark:text-white cursor-pointer hover:text-primary transition-colors"
                      onClick={() => {
                        setSelectedChildId(record.childId);
                        setShowChildDetailsModal(true);
                      }}
                    >
                      {record.childName}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    {/* The server never writes eventName, so most records
                        carry only a service. */}
                    <p className="text-sm text-gray-700 dark:text-gray-300">{record.serviceName || "Unassigned"}</p>
                    <p className="text-xs text-gray-500">
                      {record.checkInTime ? format(new Date(record.checkInTime), "EEE d MMM yyyy") : ""}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-xs font-medium bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                      {record.roomName}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-500">
                    {record.checkInTime ? format(new Date(record.checkInTime), "d MMM, HH:mm") : "—"}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      record.status === "checked-in" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"
                    }`}>
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {historicalCheckins.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-gray-400 dark:text-gray-500 italic">No records found for the selected filters</p>
            </div>
          )}
          {historicalCheckins.length > 10 && (
            <div className="py-4 text-center">
              <p className="text-xs text-gray-500">Showing the 10 most recent of {historicalCheckins.length} records. Use CSV export for full data.</p>
            </div>
          )}
        </div>
      </div>

      {/* Volunteer Activity Section */}
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center">
              <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Volunteer Activity</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tracking check-in/out actions by staff</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {volunteerActivity.slice(0, 8).map((v) => (
            <div key={v.name} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p className="font-bold text-gray-900 dark:text-white truncate">{v.name}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Actions</span>
                <span className="text-sm font-bold text-primary">{v.totalActions}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className="text-gray-500">Check-ins: {v.checkins}</span>
                <span className="text-gray-500">Check-outs: {v.checkouts}</span>
              </div>
              <div className="mt-3 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full" 
                  style={{ width: `${Math.min((v.totalActions / (Math.max(...volunteerActivity.map(va => va.totalActions)) || 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
          {volunteerActivity.length === 0 && (
            <div className="col-span-full py-8 text-center text-gray-400 italic text-sm">
              No volunteer activity recorded yet
            </div>
          )}
        </div>
      </div>
      
      {/* Recent Activity Section */}
      <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center">
              <Clock className="h-6 w-6 text-primary dark:text-primary/80" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Recent Activity</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Latest check-ins and check-outs</p>
            </div>
          </div>
          <button
            onClick={() => setShowDeletedItems(!showDeletedItems)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              showDeletedItems 
                ? "bg-red-50 text-red-600 border border-red-100" 
                : "bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100"
            }`}
          >
            <History className="h-4 w-4" />
            <span>{showDeletedItems ? "Hide Deleted Items" : "Recently Deleted"}</span>
          </button>
        </div>
        
        {showDeletedItems ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Deleted Children */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>Deleted Children</span>
                </h4>
                <div className="space-y-2">
                  {children.filter(c => c.deleted).map(child => (
                    <div key={child.id} className="p-3 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{child.firstName} {child.lastName}</p>
                        <p className="text-[10px] text-gray-500">Deleted: {child.deletedAt ? format(new Date(child.deletedAt), "MMM d, HH:mm") : "N/A"}</p>
                      </div>
                      <button
                        onClick={() => handleRestore("children", child.id, `${child.firstName} ${child.lastName}`)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {children.filter(c => c.deleted).length === 0 && (
                    <p className="text-xs text-gray-400 italic">No deleted children</p>
                  )}
                </div>
              </div>

              {/* Deleted Rooms */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Deleted Rooms</span>
                </h4>
                <div className="space-y-2">
                  {rooms.filter(r => r.deleted).map(room => (
                    <div key={room.id} className="p-3 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{room.name}</p>
                        <p className="text-[10px] text-gray-500">Deleted: {room.deletedAt ? format(new Date(room.deletedAt), "MMM d, HH:mm") : "N/A"}</p>
                      </div>
                      <button
                        onClick={() => handleRestore("rooms", room.id, room.name)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {rooms.filter(r => r.deleted).length === 0 && (
                    <p className="text-xs text-gray-400 italic">No deleted rooms</p>
                  )}
                </div>
              </div>

              {/* Deleted Events/Services */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>Deleted Events & Services</span>
                </h4>
                <div className="space-y-2">
                  {events.filter(e => e.deleted).map(event => (
                    <div key={event.id} className="p-3 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{event.name}</p>
                        <p className="text-[10px] text-gray-500">Event • Deleted: {event.deletedAt ? format(new Date(event.deletedAt), "MMM d, HH:mm") : "N/A"}</p>
                      </div>
                      <button
                        onClick={() => handleRestore("events", event.id, event.name)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {services.filter(s => s.deleted).map(service => (
                    <div key={service.id} className="p-3 bg-red-50/50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{service.name}</p>
                        <p className="text-[10px] text-gray-500">Service • Deleted: {service.deletedAt ? format(new Date(service.deletedAt), "MMM d, HH:mm") : "N/A"}</p>
                      </div>
                      <button
                        onClick={() => handleRestore("services", service.id, service.name)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {events.filter(e => e.deleted).length === 0 && services.filter(s => s.deleted).length === 0 && (
                    <p className="text-xs text-gray-400 italic">No deleted events or services</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentActivity.map((activity) => (
            <div key={activity.id} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`h-2 w-2 rounded-full ${activity.status === "checked-in" ? "bg-green-500" : "bg-orange-500"}`} />
                  <p 
                    className="text-sm font-bold text-gray-900 dark:text-white cursor-pointer hover:text-primary transition-colors"
                    onClick={() => {
                      setSelectedChildId(activity.childId);
                      setShowChildDetailsModal(true);
                    }}
                  >
                    {activity.childName}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">
                  {format(new Date(activity.updatedAt || activity.checkInTime), "HH:mm")}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-[10px]">
                <div className="space-y-1">
                  <p className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">
                    {activity.status === "checked-in" ? "Checked In By" : "Picked Up By"}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 font-medium">
                    {activity.status === "checked-in" ? activity.checkedInBy : activity.guardianName}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Volunteer</p>
                  <p className="text-gray-700 dark:text-gray-300 font-medium truncate">
                    {activity.status === "checked-in" ? activity.volunteerName : activity.checkOutVolunteerName}
                  </p>
                </div>
              </div>
              
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {activity.status === "checked-in" ? "Assigned to " : "Released from "}
                  <span className="font-bold text-primary dark:text-primary/80">{activity.roomName}</span>
                </p>
                {activity.eventName && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                    {activity.eventName} • {activity.serviceName}
                  </p>
                )}
              </div>
            </div>
          ))}
          {recentActivity.length === 0 && (
            <div className="col-span-full py-12 text-center">
              <p className="text-gray-400 dark:text-gray-500 italic">No recent activity found</p>
            </div>
          )}
        </div>
      )}
    </div>

      {/* Subscription Management Section */}
      <div id="subscription-section" className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary dark:text-primary/80" />
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
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Plan Management</p>
                  <div className="flex gap-2 mt-2">
                    {["starter", "growth", "professional"].map((p) => (
                      <button
                        key={p}
                        onClick={() => setSelectedPlan(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                          selectedPlan === p 
                            ? "bg-primary text-white shadow-md shadow-primary/20 scale-105" 
                            : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-100 dark:border-gray-700 hover:border-primary/50"
                        }`}
                      >
                        {p}
                        {churchData?.plan === p && (
                          <span className="ml-1 text-[8px] bg-white/20 px-1 rounded-full">Current</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Price</p>
                  <p className="text-2xl font-bold text-primary">
                    {selectedPlan === "professional" ? "R999" : selectedPlan === "growth" ? "R499" : "R249"}
                    <span className="text-sm text-gray-500 font-normal">/mo</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>Next billing date: <span className="font-bold text-gray-900 dark:text-white">
                  {churchData?.nextBillingDate 
                    ? format(new Date(churchData.nextBillingDate), "MMMM d, yyyy")
                    : churchData?.subscription?.billingDate 
                    ? format(new Date(churchData.subscription.billingDate), "MMMM d, yyyy") 
                    : churchData?.subscription?.trialEndsAt
                    ? format(new Date(churchData.subscription.trialEndsAt), "MMMM d, yyyy")
                    : format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "MMMM d, yyyy") + " (Trial End)"}
                </span></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-xl border border-primary/20 dark:border-primary/30">
                <p className="text-xs font-bold text-primary dark:text-primary/80 uppercase mb-1">
                  Users Limit
                  <HelpTooltip text="Pending invitations hold a seat, so they are counted here — the same way the server counts them when it decides whether to accept a new invite." />
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {usedUserSeats} / {PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.users === Infinity ? "Unlimited" : PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.users || 20}
                </p>
                {pendingInvitations > 0 && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Includes {pendingInvitations} pending invitation{pendingInvitations === 1 ? "" : "s"}
                  </p>
                )}
                {PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.users !== Infinity && (
                  <div className="mt-2 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${usedUserSeats >= PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.users ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, (usedUserSeats / (PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.users || 20)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">
                  Children Limit
                  <HelpTooltip text="Counts every child record, including removed ones — they still consume plan quota until support clears them, which is exactly how the limit is enforced." />
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {children.length} / {PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.children === Infinity ? "Unlimited" : PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.children || 50}
                </p>
                {removedChildren > 0 && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Includes {removedChildren} removed child{removedChildren === 1 ? "" : "ren"}, which still count toward your plan
                  </p>
                )}
                {PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.children !== Infinity && (
                  <div className="mt-2 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${children.length >= PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.children ? 'bg-red-500' : 'bg-purple-500'}`}
                      style={{ width: `${Math.min(100, (children.length / (PLAN_LIMITS[churchData?.plan?.toLowerCase() as PlanTier]?.children || 50)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <h4 className="font-bold text-gray-900 dark:text-white mb-4">Payment Method</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Secure payments processed via PayFast. Local South African payment gateway.
              </p>
              
              {churchData?.subscription?.payfast_token ? (
                <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-900/30 text-center space-y-3">
                  <div className="flex items-center justify-center space-x-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-bold">Active Recurring Subscription</span>
                  </div>
                  <p className="text-xs text-gray-500">Your subscription is active and managed via PayFast.</p>
                  {churchData?.plan !== selectedPlan && (
                    <div className="pt-2 border-t border-green-100/50 dark:border-green-900/20">
                      <p className="text-[10px] text-orange-600 font-bold mb-2">Switching plans? Setup new recurring payment below:</p>
                      <PayFastButton 
                        churchId={userData?.churchId || ""} 
                        plan={selectedPlan || "starter"} 
                        amount={selectedPlan === "professional" ? 999 : selectedPlan === "growth" ? 499 : 249}
                        itemName={`GuardianCheck ${selectedPlan || "Starter"} Subscription`}
                        mPaymentId={`SUB-${userData?.churchId}-${Date.now()}`}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <PayFastButton 
                    churchId={userData?.churchId || ""} 
                    plan={selectedPlan || "starter"} 
                    amount={selectedPlan === "professional" ? 999 : selectedPlan === "growth" ? 499 : 249}
                    itemName={`GuardianCheck ${selectedPlan || "Starter"} Subscription`}
                    mPaymentId={`SUB-${userData?.churchId}-${Date.now()}`}
                    billingDate={
                      churchData?.subscription?.trialEndsAt 
                        ? format(new Date(churchData.subscription.trialEndsAt), "yyyy-MM-dd")
                        : format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd")
                    }
                  />
                  <p className="text-[10px] text-center text-gray-400 mt-4">
                    {!churchData?.subscription?.trialStartedAt 
                      ? "Your card will not be charged until the end of your 30-day free trial."
                      : "By clicking above, you agree to our terms of service and subscription policy."}
                  </p>
                </>
              )}
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
                <span className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center">
                  Admin Override PIN
                  <HelpTooltip text="This 4-digit PIN allows authorized team members to manually check out children if their QR code is unavailable." />
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowPin(!showPin)}
                    className="p-2 text-gray-400 hover:text-primary transition-colors"
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
                  <div className="h-1.5 w-1.5 bg-primary rounded-full mt-1.5 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {/* Children Directory — the church's roster, with guardian and parent
          contact for name tags and safeguarding. Reads only the data this page
          already subscribes to; tenancy is enforced by firestore.rules. */}
      <ChildrenDirectory
        children={children}
        guardians={guardians}
        users={users}
        churchId={churchId || ""}
        churchName={churchData?.name}
        currentUserId={user?.uid || ""}
        onSelectChild={(childId) => {
          setSelectedChildId(childId);
          setShowChildDetailsModal(true);
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Room Management */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Room Management</h3>
            <button
              onClick={() => setShowRoomModal(true)}
              className="bg-primary text-white p-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {rooms?.length > 0 ? rooms.map((room) => (
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
                    className="p-2 text-gray-400 hover:text-primary transition-colors"
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
            )) : (
              <div className="p-12 text-center space-y-4">
                <div className="h-16 w-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto">
                  <Building2 className="h-8 w-8 text-gray-300" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-gray-900 dark:text-white">No rooms created yet</p>
                  <p className="text-sm text-gray-500 max-w-[200px] mx-auto">Create your first room to start assigning children.</p>
                </div>
                <button
                  onClick={() => setShowRoomModal(true)}
                  className="text-primary font-bold text-sm hover:underline"
                >
                  + Add First Room
                </button>
              </div>
            )}
          </div>
        </div>

        {/* User Management */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Management</h3>
              <button
                onClick={() => setShowUserModal(true)}
                className="bg-primary text-white p-2 rounded-lg hover:bg-primary/90 transition-colors"
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
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[600px] overflow-y-auto">
            {users?.filter(u => {
              const search = searchTerm.toLowerCase();
              const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
              const name = (u.name || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              return fullName.includes(search) || name.includes(search) || email.includes(search);
            }).length > 0 ? users?.filter(u => {
              const search = searchTerm.toLowerCase();
              const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
              const name = (u.name || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              return fullName.includes(search) || name.includes(search) || email.includes(search);
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
                    className="p-2 text-gray-400 hover:text-primary transition-colors"
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
            )) : (
              <div className="p-12 text-center space-y-4">
                <div className="h-16 w-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto">
                  <UserPlus className="h-8 w-8 text-gray-300" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-gray-900 dark:text-white">No users found</p>
                  <p className="text-sm text-gray-500 max-w-[200px] mx-auto">Invite your team or search for existing members.</p>
                </div>
                <button
                  onClick={() => setShowUserModal(true)}
                  className="text-primary font-bold text-sm hover:underline"
                >
                  + Invite First Member
                </button>
              </div>
            )}
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                  <input
                    required
                    type="text"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Email Address</label>
                <input
                  required
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                >
                  <option value="volunteer">Volunteer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 dark:shadow-none"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</label>
                  <input
                    required
                    type="text"
                    value={editingUser.lastName || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Role</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  >
                    <option value="parent">Parent</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cell Number</label>
                  <input
                    type="tel"
                    value={editingUser.cellNumber || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, cellNumber: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 dark:shadow-none"
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
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 dark:shadow-none"
              >
                {loading ? "Updating..." : "Update Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Emergency Alert Confirmation Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEmergencyModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
            <div className="h-16 w-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Trigger Emergency Alert?</h2>
              <p className="text-gray-500 dark:text-gray-400">
                This will instantly send email notifications to <strong>all parents</strong> of children currently checked in. Use only in actual emergencies.
              </p>
            </div>

            <div className="flex flex-col space-y-3">
              <button
                onClick={handleTriggerEmergency}
                disabled={triggeringEmergency}
                className="w-full bg-red-600 text-white p-4 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none disabled:opacity-50"
              >
                {triggeringEmergency ? "Sending Alerts..." : "Yes, Trigger Alert Now"}
              </button>
              <button
                onClick={() => setShowEmergencyModal(false)}
                disabled={triggeringEmergency}
                className="w-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 p-4 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
            </div>
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
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white p-4 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 dark:shadow-none"
              >
                {loading ? "Creating..." : "Create Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Child Details Modal */}
      <ChildDetailsModal 
        childId={selectedChildId || ""} 
        isOpen={showChildDetailsModal} 
        onClose={() => setShowChildDetailsModal(false)} 
      />

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
