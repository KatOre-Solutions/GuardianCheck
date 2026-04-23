import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { addDocument, getCollection, updateDocument, subscribeToCollection, getDocument, subscribeToDocument, logAudit, setDocument } from "../lib/firestore";
import { where, query, collection } from "firebase/firestore";
import { QRScanner } from "../components/QRScanner";
import { 
  ClipboardCheck, 
  Scan, 
  Users, 
  Search, 
  CheckCircle2, 
  LogOut, 
  AlertCircle, 
  AlertTriangle,
  Clock, 
  ChevronRight,
  ShieldCheck,
  X,
  UserCheck,
  ShieldAlert,
  Key,
  Lock,
  WifiOff,
  Wifi,
  User as UserIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { safeFetch } from "../lib/api";
import { showErrorToast, showSuccessToast, showInfoToast } from "../lib/error-handler";
import { hashPin } from "../lib/security";
import { useActiveService } from "../hooks/useActiveService";
import { activateService, closeService } from "../lib/firestore";
import { DashboardSkeleton, Skeleton } from "../components/Skeleton";

export default function VolunteerDashboard() {
  const { user, userData, role, darkMode } = useAuth();
  const { activeService, upcomingServices, loading: serviceLoading } = useActiveService();
  const [activeTab, setActiveTab] = useState<"scan" | "list">("scan");
  const [scannedChildren, setScannedChildren] = useState<any[]>([]);
  const [authorizedGuardians, setAuthorizedGuardians] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [checkedInChildren, setCheckedInChildren] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutChild, setCheckoutChild] = useState<any>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveChild, setMoveChild] = useState<any>(null);
  const [newRoomForMove, setNewRoomForMove] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overridePin, setOverridePin] = useState("");
  const [autoAssignedRooms, setAutoAssignedRooms] = useState<Record<string, string>>({});
  const [churchData, setChurchData] = useState<any>(null);
  const [churchSecurity, setChurchSecurity] = useState<any>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [scanningGuardian, setScanningGuardian] = useState(false);
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

  useEffect(() => {
    if (!userData?.churchId) return;

    // Pre-fetch/Warm cache for offline resilience
    const unsubChildren = subscribeToCollection("children", [where("churchId", "==", userData.churchId)], setAllChildren);
    const unsubGuardians = subscribeToCollection("guardians", [where("churchId", "==", userData.churchId)], setAllGuardians);
    
    return () => {
      unsubChildren();
      unsubGuardians();
    };
  }, [userData?.churchId]);

  useEffect(() => {
    if (!userData?.churchId) return;

    const fetchRooms = async () => {
      const data = await getCollection("rooms", [where("churchId", "==", userData.churchId)]);
      setRooms(data || []);
    };
    fetchRooms();

    const unsubscribe = subscribeToCollection("checkins", [
      where("churchId", "==", userData.churchId),
      where("status", "==", "checked-in")
    ], (data) => {
      setCheckedInChildren(data);
    });

    const unsubscribeRecent = subscribeToCollection("checkins", [
      where("churchId", "==", userData.churchId)
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
  }, [userData?.churchId]);

  useEffect(() => {
    if (userData?.churchId) {
      const unsubChurch = subscribeToDocument("churches", userData.churchId, setChurchData);
      return () => {
        unsubChurch();
      };
    }
  }, [userData?.churchId]);

  useEffect(() => {
    const fetchGuardians = async () => {
      if (scannedChildren.length === 1 && userData?.churchId) {
        const data = await getCollection("guardians", [
          where("churchId", "==", userData.churchId),
          where("childIds", "array-contains", scannedChildren[0].id),
          where("active", "==", true)
        ]);
        setAuthorizedGuardians(data || []);
      } else {
        setAuthorizedGuardians([]);
      }
    };
    fetchGuardians();
  }, [scannedChildren, userData?.churchId]);

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

    // Case 1: Scanning for Guardian during checkout
    if (scanningGuardian && checkoutChild && userData?.churchId) {
      const guardian = allGuardians.find(g => 
        g.childIds?.includes(checkoutChild.childId) && 
        g.qrToken === decodedText && 
        g.active === true
      );

      if (guardian) {
        await processCheckout(checkoutChild, guardian.id, `${guardian.firstName} ${guardian.lastName}`);
      } else {
        // Fallback to network
        setLoading(true);
        try {
          const guardians = await getCollection("guardians", [
            where("churchId", "==", userData.churchId),
            where("childIds", "array-contains", checkoutChild.childId),
            where("qrToken", "==", decodedText),
            where("active", "==", true)
          ]);

          if (guardians && guardians.length > 0) {
            const g = guardians[0] as any;
            await processCheckout(checkoutChild, g.id, `${g.firstName} ${g.lastName}`);
          } else {
            showErrorToast("Unauthorized guardian QR code");
          }
        } catch (err) {
          console.error(err);
          showErrorToast("Verification failed");
        } finally {
          setLoading(false);
        }
      }
      setScanningGuardian(false);
      return;
    }

    // Case 2: Group Scan
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

    // Case 3: Scanning for Child (Check-in or initiate Check-out)
    const alreadyCheckedIn = checkedInChildren.find(c => c.childId === decodedText || c.qrCode === decodedText);
    
    if (alreadyCheckedIn) {
      setCheckoutChild(alreadyCheckedIn);
      setShowCheckoutModal(true);
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

  const processCheckout = async (record: any, guardianId: string, guardianName: string = "", isOverride = false, reason = "") => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await safeFetch("/api/check-out", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          checkinId: record.id,
          volunteerId: user?.uid,
          volunteerName: userData?.firstName && userData?.lastName 
            ? `${userData.firstName} ${userData.lastName}` 
            : (user?.displayName || user?.email || "Volunteer"),
          guardianId,
          guardianName,
          overrideReason: isOverride ? reason : null
        })
      });

      if (!result.ok) {
        if (result.status === 409) {
          showErrorToast(result.error);
          return;
        }
        throw new Error(result.error || "Server error");
      }

      showSuccessToast(`${record.childName} checked out successfully!`);
      setShowCheckoutModal(false);
      setShowOverrideModal(false);
      setCheckoutChild(null);
      setOverrideReason("");
      setActiveTab("list");
    } catch (err) {
      console.warn("Checkout API failed, falling back to local update:", err);
      try {
        await updateDocument("checkins", record.id, {
          checkOutTime: new Date().toISOString(),
          status: "checked-out",
          checkOutVolunteerId: user?.uid,
          checkOutVolunteerName: userData?.firstName && userData?.lastName 
            ? `${userData.firstName} ${userData.lastName}` 
            : (user?.displayName || user?.email || "Volunteer"),
          guardianId: guardianId || "admin_override",
          guardianName: guardianName || (isOverride ? "Admin Override" : "Guardian"),
          overrideReason: isOverride ? reason : null
        });
        showSuccessToast(`${record.childName} checked out successfully!`);
        setShowCheckoutModal(false);
        setShowOverrideModal(false);
        setCheckoutChild(null);
        setOverrideReason("");
        setActiveTab("list");
      } catch (localErr) {
        console.error(localErr);
        showErrorToast("Checkout failed");
      }
    }
  };

  const handleAdminOverride = async () => {
    if (!overrideReason.trim()) {
      showErrorToast("Please provide a reason for override");
      return;
    }
    if (overridePin.length !== 4) {
      showErrorToast("Please enter a 4-digit PIN");
      return;
    }

    // Rate limiting check
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      showErrorToast(`Too many failed attempts. Try again in ${remaining} seconds.`);
      return;
    }

    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await safeFetch("/api/verify-pin", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ churchId: userData.churchId, pin: overridePin })
      });
      
      const isValid = result.ok && result.data?.isValid;
      
      if (isValid) {
        // Success
        await processCheckout(checkoutChild, "admin_override", "Admin Override", true, overrideReason);
        
        // Log audit event via server for better security
        const auditToken = await auth.currentUser?.getIdToken();
        await fetch("/api/audit", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${auditToken}`
          },
          body: JSON.stringify({
            churchId: userData.churchId,
            userId: user.uid,
            action: "admin_override_checkout",
            category: "security",
            details: {
              childId: checkoutChild.childId,
              childName: checkoutChild.childName,
              reason: overrideReason,
              method: "admin_override"
            }
          })
        });

        setFailedAttempts(0);
        setOverridePin("");
      } else {
        // Failure
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        
        if (newAttempts >= 3) {
          const lockoutTime = Date.now() + (60 * 1000); // 1 minute lockout
          setLockoutUntil(lockoutTime);
          showErrorToast("Incorrect PIN. Too many failed attempts. Locked for 1 minute.");
        } else {
          showErrorToast(`Incorrect PIN. ${3 - newAttempts} attempts remaining.`);
        }
        
        // Log failed attempt
        await logAudit({
          action: "failed_admin_override",
          category: "security",
          details: {
            childId: checkoutChild.childId,
            childName: checkoutChild.childName,
            attempts: newAttempts
          },
          churchId: userData.churchId,
          userId: user.uid
        });
      }
    } catch (err) {
      console.error(err);
      showErrorToast("Override verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (role !== "admin" && role !== "volunteer") {
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
            className={`flex-1 md:flex-none px-8 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-2 ${
              activeTab === "scan" ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Scan className="h-4 w-4" />
            <span>Scan QR</span>
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 md:flex-none px-8 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-2 ${
              activeTab === "list" ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Attendance</span>
          </button>
        </div>
      </header>

      {activeTab === "scan" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {scanningGuardian ? "Scan Guardian QR" : "Scan Child QR Code"}
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {scanningGuardian 
                    ? "Verify the authorized guardian's identity" 
                    : "Position the QR code within the frame"}
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
              
              {scanningGuardian && (
                <button 
                  onClick={() => setScanningGuardian(false)}
                  className="w-full py-2 text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Cancel Guardian Scan
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {scannedChildren.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border-2 border-primary/20 dark:border-primary/30 space-y-8"
              >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-16 w-16 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center overflow-hidden">
                        {scannedChildren.length === 1 && scannedChildren[0].photoUrl ? (
                          <img src={scannedChildren[0].photoUrl} alt={`${scannedChildren[0].firstName} ${scannedChildren[0].lastName}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Users className="h-8 w-8 text-primary dark:text-primary/80" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
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
                                <div className="h-10 w-10 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700">
                                  {child.photoUrl ? (
                                    <img src={child.photoUrl} alt={`${child.firstName} ${child.lastName}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <Users className="h-5 w-5 text-primary dark:text-primary/80" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">{child.firstName} {child.lastName}</p>
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
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{activity.childName}</p>
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
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Currently Checked In</h3>
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
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {checkedInChildren
              .filter(record => record.childName.toLowerCase().includes(attendanceSearch.toLowerCase()))
              .map((record) => (
              <div key={record.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary dark:text-primary/80" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{record.childName}</p>
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80 px-2 py-0.5 rounded-md font-bold uppercase">{record.roomName}</span>
                        <span>•</span>
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(record.checkInTime), "h:mm a")}</span>
                      </div>
                      {record.eventName && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                          {record.eventName} • {record.serviceName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setMoveChild(record);
                      setNewRoomForMove(record.roomId);
                      setShowMoveModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-primary transition-colors"
                    title="Move Room"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      setCheckoutChild(record);
                      setShowCheckoutModal(true);
                    }}
                    className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all"
                  >
                    Check Out
                  </button>
                </div>
              </div>
            ))}
            {checkedInChildren.length === 0 && (
              <div className="p-20 text-center space-y-4">
                <div className="h-20 w-20 bg-gray-50 dark:bg-gray-900/50 rounded-full flex items-center justify-center mx-auto">
                  <Users className="h-10 w-10 text-gray-200 dark:text-gray-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">No children checked in</p>
                  <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                    Once children are checked in, they will appear here for management and checkout.
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

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckoutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowCheckoutModal(false);
                setScanningGuardian(false);
              }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Secure Pickup</h2>
                  </div>
                  <button onClick={() => setShowCheckoutModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  </button>
                </div>

                <div className="text-center space-y-2">
                  <p className="text-gray-500 dark:text-gray-400">Verifying pickup for</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{checkoutChild?.childName}</p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={() => {
                      setActiveTab("scan");
                      setScanningGuardian(true);
                      setShowCheckoutModal(false);
                    }}
                    className="w-full bg-primary text-white p-6 rounded-2xl font-bold flex flex-col items-center justify-center space-y-2 hover:bg-primary/90 transition-all"
                  >
                    <Scan className="h-8 w-8" />
                    <span>Scan Guardian QR Code</span>
                  </button>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-100 dark:border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500">Or Admin Override</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowOverrideModal(true)}
                    className="w-full bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 p-4 rounded-2xl font-bold flex items-center justify-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                  >
                    <ShieldAlert className="h-5 w-5" />
                    <span>Manual Verification</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Override Modal */}
      <AnimatePresence>
        {showOverrideModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOverrideModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center space-x-3">
                  <Key className="h-6 w-6 text-red-600 dark:text-red-400" />
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Override</h2>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      Use this only if the guardian is physically present but cannot scan their QR code. This action will be logged.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Admin Override PIN</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        value={overridePin}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length <= 4) setOverridePin(val);
                        }}
                        placeholder="Enter 4-digit PIN"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-white text-center text-2xl tracking-[1em] font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Reason for Override</label>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Guardian forgot phone, verified ID manually"
                      className="w-full p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-white h-24 resize-none"
                    />
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowOverrideModal(false)}
                      className="flex-1 py-4 font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAdminOverride}
                      disabled={!overrideReason.trim() || loading || overridePin.length !== 4}
                      className="flex-[2] bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "Confirm Override"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
