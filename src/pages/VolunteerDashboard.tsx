import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { getCollection, subscribeToCollection, getDocument, subscribeToDocument, logAudit, setDocument } from "../lib/firestore";
import { where, collection } from "firebase/firestore";
import { QRScanner } from "../components/QRScanner";
import {
  Scan,
  Users,
  Search,
  CheckCircle2,
  LogOut,
  AlertCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  X,
  WifiOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { safeFetch } from "../lib/api";
import ChildDetailsModal from "../components/ChildDetailsModal";
import CheckOutTab from "../components/CheckOutTab";
import AdminOverrideModal from "../components/AdminOverrideModal";
import { showErrorToast, showSuccessToast, showInfoToast } from "../lib/error-handler";
import { hasRecordedAllergies } from "../lib/child-utils";
import { useActiveService } from "../hooks/useActiveService";
import { activateService, closeService } from "../lib/firestore";
import { DashboardSkeleton } from "../components/Skeleton";
import { useTenant } from "../contexts/TenantContext";

export default function VolunteerDashboard() {
  const { user, userData, role, roles, darkMode } = useAuth();
  const { church } = useTenant();
  const churchId = userData?.churchId || church?.id;
  const { activeService, upcomingServices, loading: serviceLoading } = useActiveService();
  const [activeTab, setActiveTab] = useState<"scan" | "checkout" | "list">("scan");
  const [scannedChildren, setScannedChildren] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [checkedInChildren, setCheckedInChildren] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [overrideRecord, setOverrideRecord] = useState<any>(null);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState<any>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showChildDetailsModal, setShowChildDetailsModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveChild, setMoveChild] = useState<any>(null);
  const [newRoomForMove, setNewRoomForMove] = useState("");
  const [autoAssignedRooms, setAutoAssignedRooms] = useState<Record<string, string>>({});
  const [churchData, setChurchData] = useState<any>(null);
  const [churchSecurity, setChurchSecurity] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [allChildren, setAllChildren] = useState<any[]>([]);
  const [allGuardians, setAllGuardians] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);
  const lastScannedRef = useRef<{ text: string, time: number } | null>(null);

  // Helper component to display volunteer name with lookup
  const VolunteerDisplay = ({ uid, fallbackName }: { uid: string, fallbackName: string }) => {
    const [resolvedName, setResolvedName] = useState<string | null>(null);

    useEffect(() => {
      if (!uid) return;
      
      // If fallbackName is already a proper name (not an email and not generic), use it immediately
      const isGeneric = !fallbackName || fallbackName.toLowerCase() === "volunteer" || fallbackName.toLowerCase() === "unknown";
      if (fallbackName && !fallbackName.includes("@") && !isGeneric) {
        setResolvedName(fallbackName);
        return;
      }

      // Otherwise, try to fetch the real name from the users collection
      const fetchName = async () => {
        try {
          const userDoc = await getDocument("users", uid) as any;
          if (userDoc && userDoc.firstName && userDoc.lastName) {
            setResolvedName(`${userDoc.firstName} ${userDoc.lastName}`);
          } else if (userDoc && userDoc.firstName) {
            setResolvedName(userDoc.firstName);
          } else {
            // Prettify email as final fallback
            const [localPart] = fallbackName.split("@");
            setResolvedName(localPart.charAt(0).toUpperCase() + localPart.slice(1));
          }
        } catch (err) {
          console.error("Failed to resolve volunteer name:", err);
        }
      };
      fetchName();
    }, [uid, fallbackName]);

    return <span>{resolvedName || fallbackName || "Volunteer"}</span>;
  };

  const getEligibleRooms = (childAge: number) => {
    return rooms.filter(room => 
      !room.deleted && 
      childAge >= (room.minAge || 0) && 
      childAge <= (room.maxAge || 99)
    );
  };

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(window.navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // Scanning is the volunteer's whole interaction on this tab, and on a phone
  // the match card renders below the fold. Bring it into view so a successful
  // scan is visibly acknowledged rather than only toasted.
  useEffect(() => {
    if (scannedChildren.length === 0) return;
    // Wait for AnimatePresence to mount the card before measuring it.
    const raf = requestAnimationFrame(() => {
      document.getElementById("scan-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [scannedChildren.length]);

  useEffect(() => {
    if (!churchId) return;

    // Pre-fetch/Warm cache for offline resilience
    const unsubChildren = subscribeToCollection("children", [where("churchId", "==", churchId)], setAllChildren);
    const unsubGuardians = subscribeToCollection("guardians", [where("churchId", "==", churchId)], setAllGuardians);
    
    return () => {
      unsubChildren();
      unsubGuardians();
    };
  }, [churchId]);

  useEffect(() => {
    if (!churchId) return;

    const fetchRooms = async () => {
      const data = await getCollection("rooms", [where("churchId", "==", churchId)]);
      setRooms(data || []);
    };
    fetchRooms();

    const unsubscribe = subscribeToCollection("checkins", [
      where("churchId", "==", churchId),
      where("status", "==", "checked-in")
    ], (data) => {
      setCheckedInChildren(data);
    });

    const unsubscribeRecent = subscribeToCollection("checkins", [
      where("churchId", "==", churchId)
    ], (data) => {
      const sorted = data.sort((a: any, b: any) => 
        new Date(b.updatedAt || b.checkInTime).getTime() - new Date(a.updatedAt || a.checkInTime).getTime()
      ).slice(0, 5);
      setRecentActivity(sorted);
    });

    return () => {
      unsubscribe();
      unsubscribeRecent();
    };
  }, [churchId]);

  useEffect(() => {
    if (churchId) {
      const unsubChurch = subscribeToDocument("churches", churchId, setChurchData);
      return () => {
        unsubChurch();
      };
    }
  }, [churchId]);

  // Attendance rows show the checkin document, which carries no photo or
  // allergy field. Both come from the warm children cache already in memory.
  const childRecord = (childId: string) => allChildren.find((c) => c.id === childId);
  const childPhoto = (childId: string) => childRecord(childId)?.photoUrl;
  const childHasAllergies = (childId: string) => hasRecordedAllergies(childRecord(childId)?.allergies);

  const handleMoveRoom = async () => {
    if (!moveChild || !newRoomForMove) return;
    const room = rooms.find(r => r.id === newRoomForMove);
    if (!room) return;

    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/move-room", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          checkinId: moveChild.id,
          newRoomId: room.id,
          newRoomName: room.name,
          volunteerId: user?.uid,
          volunteerName: `${userData?.firstName} ${userData?.lastName}`
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to move room");
      }

      showSuccessToast(`${moveChild.childName} moved to ${room.name}`);
      setShowMoveModal(false);
      setMoveChild(null);
      setNewRoomForMove("");
      
      await logAudit({
        action: "child_room_move",
        category: "checkin",
        details: { childId: moveChild.childId, from: moveChild.roomName, to: room.name },
        churchId: userData!.churchId,
        userId: user?.uid || ""
      });
    } catch (err: any) {
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const handleScanSuccess = async (text: string) => {
    if (loading) return;
    const decodedText = text.trim();

    // Debounce: ignore same code if scanned within last 3 seconds
    const now = Date.now();
    if (lastScannedRef.current && 
        lastScannedRef.current.text === decodedText && 
        now - lastScannedRef.current.time < 3000) {
      return;
    }
    lastScannedRef.current = { text: decodedText, time: now };

    // Case 1: Group Scan
    if (decodedText.startsWith("group:")) {
      const childIds = decodedText.replace("group:", "").split(",");
      const foundChildren = [];
      for (const id of childIds) {
        const childDoc = allChildren.find(c => c.id === id);
        if (childDoc) {
          const alreadyCheckedIn = checkedInChildren.find(c => c.childId === id);
          if (!alreadyCheckedIn) {
            foundChildren.push({ ...childDoc, id });
          }
        }
      }
      
      if (foundChildren.length > 0) {
        setAlreadyCheckedIn(null);
        setScannedChildren(foundChildren);
        
        // Auto-assign rooms for group members
        const newAutoAssignments: Record<string, string> = {};
        foundChildren.forEach(child => {
          const eligible = getEligibleRooms(child.age);
          if (eligible.length === 1) {
            newAutoAssignments[child.id] = eligible[0].id;
          }
        });
        setAutoAssignedRooms(newAutoAssignments);
        
        showSuccessToast(`Found ${foundChildren.length} children for check-in`);
      } else {
        showInfoToast("All children in this group are already checked in or not found.");
      }
      return;
    }

    // Case 2: Scanning a child's QR.
    // A child who is already in gets a signpost rather than a checkout. Routing
    // a child's own QR into the release path was how a check-in scan could
    // accidentally become a pickup; releasing a child now needs the collecting
    // adult's QR, over in the Check Out tab.
    const existing = checkedInChildren.find(c => c.childId === decodedText || c.qrCode === decodedText);

    if (existing) {
      setScannedChildren([]);
      setAlreadyCheckedIn(existing);
      return;
    }

    // New check-in
    if (userData?.churchId) {
      const child = allChildren.find(c => c.qrCode === decodedText);
      if (child) {
        setScannedChildren([child]);
        const eligible = getEligibleRooms(child.age);
        if (eligible.length === 1) {
          setSelectedRoom(eligible[0].id);
          setAutoAssignedRooms({ [child.id]: eligible[0].id });
        } else {
          setSelectedRoom("");
          setAutoAssignedRooms({});
        }
      } else {
        setLoading(true);
        try {
          const children = await getCollection("children", [
            where("churchId", "==", userData.churchId),
            where("qrCode", "==", decodedText)
          ]);
          if (children && children.length > 0) {
            const foundChild = children[0] as any;
            setScannedChildren([foundChild]);
            const eligible = getEligibleRooms(foundChild.age);
            if (eligible.length === 1) {
              setSelectedRoom(eligible[0].id);
              setAutoAssignedRooms({ [foundChild.id]: eligible[0].id });
            } else {
              setSelectedRoom("");
              setAutoAssignedRooms({});
            }
          } else {
            showErrorToast("Child not found. Please register the child first.");
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleCheckIn = async (childToCheckIn?: any, roomId?: string) => {
    const childrenToProcess = childToCheckIn ? [childToCheckIn] : scannedChildren;
    
    // For group check-in, we might have multiple children with different rooms
    // If it's a bulk check-in (no childToCheckIn), we check if all have rooms
    if (!childToCheckIn && scannedChildren.length > 1) {
      const allHaveRooms = scannedChildren.every(c => autoAssignedRooms[c.id] || selectedRoom);
      if (!allHaveRooms) {
        showErrorToast("Please assign a room to all children");
        return;
      }
    }

    if (childrenToProcess.length === 0 || !user || !userData?.churchId) return;
    
    let currentService = activeService;

    if (!currentService) {
      if (upcomingServices.length === 1) {
        try {
          await activateService(userData.churchId, upcomingServices[0].id);
          currentService = upcomingServices[0];
          showSuccessToast(`Automatically started check-ins for ${currentService.name}`);
        } catch (err) {
          showErrorToast("Failed to auto-activate service. Please activate manually.");
          return;
        }
      } else {
        showErrorToast("No active service. Please activate a service in Events & Services first.");
        return;
      }
    }
    
    setLoading(true);
    try {
      for (const child of childrenToProcess) {
        const targetRoomId = roomId || autoAssignedRooms[child.id] || selectedRoom;
        if (!targetRoomId) continue;

        const room = rooms.find(r => r.id === targetRoomId);
        if (!room) continue;

        try {
          const token = await auth.currentUser?.getIdToken();
          const result = await safeFetch("/api/check-in", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              churchId: userData.churchId,
              childId: child.id,
              childName: `${child.firstName} ${child.lastName}`,
              parentId: child.parentId,
              roomId: targetRoomId,
              roomName: room.name,
              eventId: currentService.eventId,
              eventName: currentService.eventName,
              serviceId: currentService.id,
              serviceName: currentService.name,
              volunteerId: user.uid,
              volunteerName: userData?.firstName && userData?.lastName 
                ? `${userData.firstName} ${userData.lastName}` 
                : (user.displayName || user.email || "Volunteer"),
              qrCode: child.qrCode,
              checkedInBy: child.parentName || "Parent"
            })
          });

          if (!result.ok) {
            if (result.status === 409) {
              showErrorToast(`${child.firstName}: ${result.error}`);
              continue; // Skip this child but continue with others
            }
            // If it's a 404 or other server error, treat it as "server unavailable" and trigger fallback
            throw new Error(result.error || "Server error");
          }
        } catch (err) {
          // Fallback to local write if offline, 404, or regular server error (except 409 conflicts)
          console.warn("Check-in API failed, falling back to local write:", err);
          
          // Local check for "One room at a time" using synced state
          const alreadyCheckedIn = checkedInChildren.find(c => c.childId === child.id);
          if (alreadyCheckedIn) {
            showErrorToast(`${child.firstName} is already checked into ${alreadyCheckedIn.roomName}. Please check them out first.`);
            continue;
          }

          const todayStr = format(new Date(), "yyyyMMdd");
          const checkinId = `checkin_${child.id}_${currentService.id}_${todayStr}`;
          
          await setDocument("checkins", checkinId, {
            churchId: userData.churchId,
            childId: child.id,
            childName: `${child.firstName} ${child.lastName}`,
            parentId: child.parentId,
            roomId: targetRoomId,
            roomName: room.name,
            eventId: currentService.eventId,
            eventName: currentService.eventName || "Service Event",
            serviceId: currentService.id,
            serviceName: currentService.name,
            checkInTime: new Date().toISOString(),
            volunteerId: user.uid,
            volunteerName: userData?.firstName && userData?.lastName 
              ? `${userData.firstName} ${userData.lastName}` 
              : (user.displayName || user.email || "Volunteer"),
            status: "checked-in",
            qrCode: child.qrCode,
            checkedInBy: child.parentName || "Parent",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
      
      if (childToCheckIn) {
        setScannedChildren(prev => prev.filter(c => c.id !== childToCheckIn.id));
        showSuccessToast(`${childToCheckIn.firstName} checked in successfully!`);
        if (scannedChildren.length <= 1) {
          setSelectedRoom("");
          setAutoAssignedRooms({});
          setActiveTab("list");
        }
      } else {
        showSuccessToast(`${scannedChildren.length} children checked in successfully!`);
        setScannedChildren([]);
        setSelectedRoom("");
        setAutoAssignedRooms({});
        setActiveTab("list");
      }
    } catch (err) {
      console.error(err);
      showErrorToast("Check-in failed. It will sync when online.");
    } finally {
      setLoading(false);
    }
  };

  if (role !== "admin" && role !== "volunteer" && !roles.includes("master_admin")) {
    return <div className="text-center py-12">Access denied. Volunteer permissions required.</div>;
  }

  if (serviceLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {!isOnline && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="bg-amber-500 text-white px-6 py-2 rounded-xl flex items-center justify-center space-x-2 font-bold text-sm shadow-lg"
        >
          <WifiOff className="h-4 w-4" />
          <span>Offline Mode Active. Actions will sync when connection is restored.</span>
        </motion.div>
      )}
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Volunteer Station</h1>
          <div className="flex items-center space-x-2">
            <p className="text-gray-500 dark:text-gray-400">Secure identity verification via QR</p>
            {activeService ? (
              <div className="flex items-center space-x-2">
                <span className="flex items-center space-x-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{activeService.name} Active</span>
                </span>
                <button
                  onClick={() => closeService(activeService.id)}
                  className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-wider"
                >
                  Close Service
                </button>
              </div>
            ) : upcomingServices.length > 0 ? (
              <div className="flex items-center space-x-2">
                <span className="flex items-center space-x-1 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  <Clock className="h-3 w-3" />
                  <span>{upcomingServices[0].name} Starting Soon</span>
                </span>
                <button
                  onClick={() => activateService(userData!.churchId, upcomingServices[0].id)}
                  className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider"
                >
                  Start Now
                </button>
              </div>
            ) : (
              <span className="flex items-center space-x-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                <AlertCircle className="h-3 w-3" />
                <span>No Active Service</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex-1 md:flex-none min-w-0 px-1 sm:px-4 md:px-6 py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
              activeTab === "scan" ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Scan className="h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0" />
            <span>Check In</span>
          </button>
          <button
            onClick={() => setActiveTab("checkout")}
            className={`flex-1 md:flex-none min-w-0 px-1 sm:px-4 md:px-6 py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
              activeTab === "checkout" ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <LogOut className="h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0" />
            <span>Check Out</span>
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 md:flex-none min-w-0 px-1 sm:px-4 md:px-6 py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
              activeTab === "list" ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Users className="h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0" />
            <span>Attendance</span>
          </button>
        </div>
      </header>

      {activeTab === "scan" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Scan Child QR Code
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Position the QR code within the frame
                </p>
              </div>
              <QRScanner 
                onScanSuccess={handleScanSuccess} 
                onScanFailure={(err) => {
                  // Only show error if it's a camera error, not just "no QR code found"
                  if (err.includes("camera") || err.includes("permission") || err.includes("access")) {
                    showErrorToast(err);
                  }
                }}
              />
            </div>
          </div>

          <AnimatePresence>
            {alreadyCheckedIn && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-xl border-2 border-amber-200 dark:border-amber-900/50 space-y-5"
              >
                <div className="flex items-start space-x-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {alreadyCheckedIn.childName} is already checked in
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {alreadyCheckedIn.roomName}
                      {alreadyCheckedIn.checkInTime && ` \u00b7 since ${format(new Date(alreadyCheckedIn.checkInTime), "h:mm a")}`}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400">
                  To check this child out, scan the collecting parent or guardian's QR code in the Check Out tab.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setAlreadyCheckedIn(null);
                      setActiveTab("checkout");
                    }}
                    className="flex-1 py-4 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold transition-all transform active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Go to Check Out</span>
                  </button>
                  <button
                    onClick={() => setAlreadyCheckedIn(null)}
                    className="py-4 px-6 rounded-2xl border-2 border-gray-100 dark:border-gray-700 font-bold text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}

            {scannedChildren.length > 0 && (
              <motion.div
                id="scan-result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border-2 border-primary/20 dark:border-primary/30 space-y-8"
              >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div 
                        className="h-16 w-16 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all shadow-sm"
                        onClick={() => {
                          if (scannedChildren.length === 1) {
                            setSelectedChildId(scannedChildren[0].id);
                            setShowChildDetailsModal(true);
                          }
                        }}
                      >
                        {scannedChildren.length === 1 && scannedChildren[0].photoUrl ? (
                          <img src={scannedChildren[0].photoUrl} alt={`${scannedChildren[0].firstName} ${scannedChildren[0].lastName}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Users className="h-8 w-8 text-primary dark:text-primary/80" />
                        )}
                      </div>
                      <div>
                        <h3 
                          className={`text-2xl font-bold text-gray-900 dark:text-white ${scannedChildren.length === 1 ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                          onClick={() => {
                            if (scannedChildren.length === 1) {
                              setSelectedChildId(scannedChildren[0].id);
                              setShowChildDetailsModal(true);
                            }
                          }}
                        >
                          {scannedChildren.length === 1 ? `${scannedChildren[0].firstName} ${scannedChildren[0].lastName}` : `${scannedChildren.length} Children`}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400">
                          {scannedChildren.length === 1 ? `${scannedChildren[0].age} years old` : "Group Check-in"}
                        </p>
                        {scannedChildren.length === 1 && scannedChildren[0].allergies && (
                          <div className="mt-2 inline-flex items-center space-x-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-1 rounded-full border border-red-100 dark:border-red-900/30">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Allergies: {scannedChildren[0].allergies}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  <button onClick={() => setScannedChildren([])} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  </button>
                </div>

                {scannedChildren.length > 1 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Group Members - Assign Individually</p>
                    <div className="grid grid-cols-1 gap-4">
                      {scannedChildren.map(child => {
                        const eligible = getEligibleRooms(child.age);
                        const autoRoomId = autoAssignedRooms[child.id];
                        const autoRoom = rooms.find(r => r.id === autoRoomId);

                        return (
                          <div key={child.id} className={`p-4 rounded-2xl border transition-all space-y-4 ${
                            autoRoomId ? "bg-primary/5 border-primary/20 dark:bg-primary/10 dark:border-primary/30" : "bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700"
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div 
                                  className="h-10 w-10 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                  onClick={() => {
                                    setSelectedChildId(child.id);
                                    setShowChildDetailsModal(true);
                                  }}
                                >
                                  {child.photoUrl ? (
                                    <img src={child.photoUrl} alt={`${child.firstName} ${child.lastName}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <Users className="h-5 w-5 text-primary dark:text-primary/80" />
                                  )}
                                </div>
                                <div>
                                  <p 
                                    className="text-sm font-bold text-gray-900 dark:text-white cursor-pointer hover:text-primary transition-colors"
                                    onClick={() => {
                                      setSelectedChildId(child.id);
                                      setShowChildDetailsModal(true);
                                    }}
                                  >
                                    {child.firstName} {child.lastName}
                                  </p>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{child.age} years old</p>
                                  {child.allergies && (
                                    <div className="mt-1 flex items-center space-x-1 text-red-600 dark:text-red-400">
                                      <AlertTriangle className="h-3 w-3" />
                                      <p className="text-[10px] font-bold uppercase tracking-tight">Allergies: {child.allergies}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {autoRoomId && (
                                <span className="text-[10px] font-bold text-primary dark:text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  Auto-Assigned: {autoRoom?.name}
                                </span>
                              )}
                            </div>
                            
                            {!autoRoomId && (
                              <div className="grid grid-cols-2 gap-2">
                                {eligible.map((room) => (
                                  <button
                                    key={room.id}
                                    onClick={() => {
                                      setAutoAssignedRooms(prev => ({ ...prev, [child.id]: room.id }));
                                    }}
                                    disabled={loading}
                                    className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-left hover:border-primary dark:hover:border-primary transition-all bg-white dark:bg-gray-800"
                                  >
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">{room.name}</p>
                                    <p className="text-[10px] text-gray-400">Assign</p>
                                  </button>
                                ))}
                              </div>
                            )}
                            
                            {autoRoomId && eligible.length > 1 && (
                              <button 
                                onClick={() => setAutoAssignedRooms(prev => {
                                  const next = { ...prev };
                                  delete next[child.id];
                                  return next;
                                })}
                                className="text-[10px] font-bold text-gray-400 hover:text-primary transition-colors uppercase tracking-wider"
                              >
                                Change Room
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={() => handleCheckIn()}
                      disabled={loading || !scannedChildren.every(c => autoAssignedRooms[c.id])}
                      className="w-full bg-primary text-white p-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      <span>{loading ? "Checking In..." : `Check In ${scannedChildren.length} Children`}</span>
                    </button>
                  </div>
                )}

                {scannedChildren.length === 1 && (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Assign to Room</label>
                        {autoAssignedRooms[scannedChildren[0].id] && (
                          <span className="text-[10px] font-bold text-primary dark:text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Auto-Assigned
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {getEligibleRooms(scannedChildren[0].age).map((room) => (
                            <button
                              key={room.id}
                              onClick={() => {
                                setSelectedRoom(room.id);
                                setAutoAssignedRooms({ [scannedChildren[0].id]: room.id });
                              }}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                (selectedRoom === room.id || autoAssignedRooms[scannedChildren[0].id] === room.id)
                                  ? "border-primary bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80"
                                  : "border-gray-100 dark:border-gray-700 hover:border-primary/20 dark:hover:border-primary/30 text-gray-600 dark:text-gray-400"
                              }`}
                            >
                              <p className="font-bold">{room.name}</p>
                              <p className="text-xs opacity-70">Ages: {room.minAge}-{room.maxAge}</p>
                            </button>
                          ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCheckIn()}
                      disabled={(!selectedRoom && !autoAssignedRooms[scannedChildren[0].id]) || loading}
                      className="w-full bg-primary text-white p-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      <span>{loading ? "Checking In..." : "Confirm Check-In"}</span>
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Activity</h3>
              <Clock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-3">
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
                      <p className="text-gray-700 dark:text-gray-300 font-medium">
                        {activity.status === "checked-in" ? (
                          <VolunteerDisplay 
                            uid={activity.volunteerId} 
                            fallbackName={activity.volunteerName} 
                          />
                        ) : (
                          <VolunteerDisplay 
                            uid={activity.checkOutVolunteerId || activity.volunteerId} 
                            fallbackName={activity.checkOutVolunteerName || activity.volunteerName} 
                          />
                        )}
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
                <div className="text-center py-12 space-y-4">
                  <div className="h-16 w-16 bg-gray-50 dark:bg-gray-900/50 rounded-full flex items-center justify-center mx-auto">
                    <Clock className="h-8 w-8 text-gray-300" />
                  </div>
                  <p className="text-gray-400 dark:text-gray-500 text-sm italic">No activity recorded for this service yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "checkout" && (
        <CheckOutTab
          allChildren={allChildren}
          allGuardians={allGuardians}
          checkedInChildren={checkedInChildren}
          volunteerId={user?.uid || ""}
          volunteerName={
            userData?.firstName && userData?.lastName
              ? `${userData.firstName} ${userData.lastName}`
              : (userData?.email || "Volunteer")
          }
          isOnline={isOnline}
          onGoToAttendance={() => setActiveTab("list")}
        />
      )}

      {activeTab === "list" && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-50 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Currently Checked In</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Users className="h-4 w-4" />
                <span>{checkedInChildren.length} children</span>
              </div>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search child name..."
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 sm:py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {checkedInChildren
              .filter(record => record.childName.toLowerCase().includes(attendanceSearch.toLowerCase()))
              .map((record) => (
              <div
                key={record.id}
                className="p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* The whole identity block opens the child's details --
                      a bigger target than the old avatar-only hit area, which
                      matters on a phone held one-handed. */}
                  <button
                    onClick={() => {
                      setSelectedChildId(record.childId);
                      setOverrideRecord(record);
                      setShowChildDetailsModal(true);
                    }}
                    className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left group"
                  >
                    <div className="h-12 w-12 sm:h-14 sm:w-14 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:ring-2 group-hover:ring-primary transition-all">
                      {childPhoto(record.childId) ? (
                        <img
                          src={childPhoto(record.childId)}
                          alt={record.childName}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Users className="h-6 w-6 text-primary dark:text-primary/80" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors">
                        {record.childName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {record.roomName && (
                          <span className="bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80 px-2 py-0.5 rounded-md font-bold uppercase text-[10px] tracking-wider">
                            {record.roomName}
                          </span>
                        )}
                        <span className="inline-flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {format(new Date(record.checkInTime), "h:mm a")}
                        </span>
                        {/* Indicator only. The substance stays behind a tap,
                            where the volunteer who needs it will look. */}
                        {childHasAllergies(record.childId) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/30 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Allergies
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setMoveChild(record);
                      setNewRoomForMove(record.roomId);
                      setShowMoveModal(true);
                    }}
                    className="p-3 -mr-1 text-gray-400 hover:text-primary transition-colors flex-shrink-0"
                    title="Move Room"
                    aria-label={`Move ${record.childName} to another room`}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
            {checkedInChildren.length === 0 && (
              <div className="p-10 sm:p-20 text-center space-y-4">
                <div className="h-20 w-20 bg-gray-50 dark:bg-gray-900/50 rounded-full flex items-center justify-center mx-auto">
                  <Users className="h-10 w-10 text-gray-200 dark:text-gray-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">No children checked in</p>
                  <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                    Once children are checked in, they will appear here. Tap a child to see their details.
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab("scan")}
                  className="text-primary font-bold hover:underline"
                >
                  Start Scanning Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move Room Modal */}
      <AnimatePresence>
        {showMoveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoveModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Move Room</h2>
                  <button onClick={() => setShowMoveModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-gray-500 dark:text-gray-400">Move <strong>{moveChild?.childName}</strong> to a different room:</p>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {rooms.filter(r => !r.deleted).map((room) => (
                      <button
                        key={room.id}
                        onClick={() => setNewRoomForMove(room.id)}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                          newRoomForMove === room.id
                            ? "border-primary bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80"
                            : "border-gray-100 dark:border-gray-700 hover:border-primary/20 dark:hover:border-primary/30 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        <p className="font-bold">{room.name}</p>
                        <p className="text-xs opacity-70">Capacity: {room.capacity}</p>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleMoveRoom}
                    disabled={!newRoomForMove || newRoomForMove === moveChild?.roomId || loading}
                    className="w-full bg-primary text-white p-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 dark:shadow-none disabled:opacity-50"
                  >
                    {loading ? "Moving..." : "Confirm Move"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ChildDetailsModal
        childId={selectedChildId || ""}
        isOpen={showChildDetailsModal}
        onClose={() => setShowChildDetailsModal(false)}
        overrideCheckout={
          // Offered only for a child who is actually checked in. This is the
          // route for when the collecting adult has no phone or QR on them.
          overrideRecord
            ? {
                childName: overrideRecord.childName,
                onRequest: () => {
                  setShowChildDetailsModal(false);
                  setShowOverrideModal(true);
                },
              }
            : undefined
        }
      />

      <AdminOverrideModal
        record={overrideRecord}
        isOpen={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        onSuccess={() => setOverrideRecord(null)}
      />

    </div>
  );
}
