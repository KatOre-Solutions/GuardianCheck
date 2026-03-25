import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { addDocument, getCollection, updateDocument, subscribeToCollection, getDocument } from "../lib/firestore";
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
  Clock, 
  ChevronRight,
  ShieldCheck,
  X,
  UserCheck,
  ShieldAlert,
  Key
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function VolunteerDashboard() {
  const { user, role, darkMode } = useAuth();
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
  const [overrideReason, setOverrideReason] = useState("");
  const [scanningGuardian, setScanningGuardian] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const lastScannedRef = useRef<{ text: string, time: number } | null>(null);

  useEffect(() => {
    const fetchRooms = async () => {
      const data = await getCollection("rooms");
      setRooms(data || []);
    };
    fetchRooms();

    const unsubscribe = subscribeToCollection("checkins", [where("status", "==", "checked-in")], (data) => {
      setCheckedInChildren(data);
    });

    const unsubscribeRecent = subscribeToCollection("checkins", [], (data) => {
      const sorted = data.sort((a: any, b: any) => 
        new Date(b.updatedAt || b.checkInTime).getTime() - new Date(a.updatedAt || a.checkInTime).getTime()
      ).slice(0, 5);
      setRecentActivity(sorted);
    });

    return () => {
      unsubscribe();
      unsubscribeRecent();
    };
  }, []);

  useEffect(() => {
    const fetchGuardians = async () => {
      if (scannedChildren.length === 1) {
        const data = await getCollection("guardians", [
          where("childIds", "array-contains", scannedChildren[0].id),
          where("active", "==", true)
        ]);
        setAuthorizedGuardians(data || []);
      } else {
        setAuthorizedGuardians([]);
      }
    };
    fetchGuardians();
  }, [scannedChildren]);

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
    if (scanningGuardian && checkoutChild) {
      setLoading(true);
      try {
        const guardians = await getCollection("guardians", [
          where("childIds", "array-contains", checkoutChild.childId),
          where("qrToken", "==", decodedText),
          where("active", "==", true)
        ]);

        if (guardians && guardians.length > 0) {
          const guardian = guardians[0] as any;
          await processCheckout(checkoutChild, guardian.id, `${guardian.firstName} ${guardian.surname}`);
        } else {
          toast.error("Unauthorized guardian QR code");
        }
      } catch (err) {
        console.error(err);
        toast.error("Verification failed");
      } finally {
        setLoading(false);
        setScanningGuardian(false);
      }
      return;
    }

    // Case 2: Group Scan
    if (decodedText.startsWith("group:")) {
      const childIds = decodedText.replace("group:", "").split(",");
      setLoading(true);
      try {
        const foundChildren = [];
        for (const id of childIds) {
          const childDoc = await getDocument("children", id);
          if (childDoc) {
            // Check if already checked in
            const alreadyCheckedIn = checkedInChildren.find(c => c.childId === id);
            if (!alreadyCheckedIn) {
              foundChildren.push({ ...childDoc, id });
            }
          }
        }
        
        if (foundChildren.length > 0) {
          setScannedChildren(foundChildren);
          toast.success(`Found ${foundChildren.length} children for check-in`);
        } else {
          toast.info("All children in this group are already checked in or not found.");
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to process group scan");
      } finally {
        setLoading(false);
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
    setLoading(true);
    try {
      const children = await getCollection("children", [where("qrCode", "==", decodedText)]);
      if (children && children.length > 0) {
        setScannedChildren([children[0]]);
      } else {
        toast.error("Child not found. Please register the child first.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (scannedChildren.length === 0 || !selectedRoom || !user) return;
    setLoading(true);
    try {
      const room = rooms.find(r => r.id === selectedRoom);
      
      for (const child of scannedChildren) {
        // Fetch parent name for check-in record
        const parentDoc = await getDocument("users", (child as any).parentId) as any;
        const parentName = parentDoc ? `${parentDoc.firstName} ${parentDoc.surname}` : "Parent";

        await addDocument("checkins", {
          childId: child.id,
          childName: `${child.firstName} ${child.surname}`,
          roomId: selectedRoom,
          roomName: room.name,
          checkInTime: new Date().toISOString(),
          volunteerId: user.uid,
          volunteerName: user.displayName || user.email || "Volunteer",
          status: "checked-in",
          qrCode: child.qrCode,
          checkedInBy: parentName
        });
      }
      
      toast.success(`${scannedChildren.length} children checked in successfully!`);
      setScannedChildren([]);
      setSelectedRoom("");
      setActiveTab("list");
    } catch (err) {
      console.error(err);
      toast.error("Check-in failed");
    } finally {
      setLoading(false);
    }
  };

  const processCheckout = async (record: any, guardianId: string, guardianName: string = "", isOverride = false, reason = "") => {
    try {
      await updateDocument("checkins", record.id, {
        checkOutTime: new Date().toISOString(),
        status: "checked-out",
        checkOutVolunteerId: user?.uid,
        checkOutVolunteerName: user?.displayName || user?.email || "Volunteer",
        guardianId: guardianId || "admin_override",
        guardianName: guardianName || (isOverride ? "Admin Override" : "Guardian"),
        overrideReason: isOverride ? reason : null
      });
      toast.success(`${record.childName} checked out successfully!`);
      setShowCheckoutModal(false);
      setShowOverrideModal(false);
      setCheckoutChild(null);
      setOverrideReason("");
      setActiveTab("list");
    } catch (err) {
      console.error(err);
      toast.error("Checkout failed");
    }
  };

  const handleAdminOverride = async () => {
    if (!overrideReason.trim()) {
      toast.error("Please provide a reason for override");
      return;
    }
    setLoading(true);
    await processCheckout(checkoutChild, "admin_override", "Admin Override", true, overrideReason);
    setLoading(false);
  };

  if (role !== "admin" && role !== "volunteer") {
    return <div className="text-center py-12">Access denied. Volunteer permissions required.</div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Volunteer Station</h1>
          <p className="text-gray-500 dark:text-gray-400">Secure identity verification via QR</p>
        </div>
        <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex-1 md:flex-none px-8 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-2 ${
              activeTab === "scan" ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Scan className="h-4 w-4" />
            <span>Scan QR</span>
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 md:flex-none px-8 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-2 ${
              activeTab === "list" ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
                    toast.error(err);
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
                className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border-2 border-blue-100 dark:border-blue-900/30 space-y-8"
              >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-16 w-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center overflow-hidden">
                        {scannedChildren.length === 1 && scannedChildren[0].photoUrl ? (
                          <img src={scannedChildren[0].photoUrl} alt={`${scannedChildren[0].firstName} ${scannedChildren[0].surname}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                          {scannedChildren.length === 1 ? `${scannedChildren[0].firstName} ${scannedChildren[0].surname}` : `${scannedChildren.length} Children`}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400">
                          {scannedChildren.length === 1 ? `${scannedChildren[0].age} years old` : "Group Check-in"}
                        </p>
                      </div>
                    </div>
                  <button onClick={() => setScannedChildren([])} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                  </button>
                </div>

                {scannedChildren.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Group Members</p>
                    <div className="grid grid-cols-1 gap-2">
                      {scannedChildren.map(child => (
                        <div key={child.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                          <div className="flex items-center space-x-3">
                            <div className="h-8 w-8 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700">
                              {child.photoUrl ? (
                                <img src={child.photoUrl} alt={`${child.firstName} ${child.surname}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              )}
                            </div>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{child.firstName} {child.surname}</span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{child.age}y</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scannedChildren.length === 1 && authorizedGuardians.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Authorized Guardians</p>
                    <div className="grid grid-cols-1 gap-2">
                      {authorizedGuardians.map(g => (
                        <div key={g.id} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                          <div className="h-8 w-8 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center border border-gray-100 dark:border-gray-700">
                            <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{g.firstName} {g.surname}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">{g.relationship}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {scannedChildren.length === 1 && scannedChildren[0].allergies && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/30 flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-600 dark:text-red-400">Allergies & Medical</p>
                      <p className="text-red-500 dark:text-red-300 text-sm">{scannedChildren[0].allergies}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Assign to Room</label>
                  <div className="grid grid-cols-2 gap-3">
                    {rooms
                      .filter(room => {
                        if (scannedChildren.length === 0) return true;
                        return scannedChildren.every(child => 
                          child.age >= (room.minAge || 0) && child.age <= (room.maxAge || 99)
                        );
                      })
                      .map((room) => (
                        <button
                          key={room.id}
                          onClick={() => setSelectedRoom(room.id)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all ${
                            selectedRoom === room.id
                              ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                              : "border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          <p className="font-bold">{room.name}</p>
                          <p className="text-xs opacity-70">Ages: {room.minAge}-{room.maxAge}</p>
                        </button>
                      ))}
                    {rooms.filter(room => 
                      scannedChildren.every(child => 
                        child.age >= (room.minAge || 0) && child.age <= (room.maxAge || 99)
                      )
                    ).length === 0 && (
                      <p className="col-span-2 text-sm text-red-500 font-medium p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
                        No rooms found for this age group ({scannedChildren.map(c => c.age).join(", ")} years).
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleCheckIn}
                  disabled={!selectedRoom || loading}
                  className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  <span>{loading ? "Checking In..." : "Confirm Check-In"}</span>
                </button>
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
                        {activity.status === "checked-in" ? activity.volunteerName : activity.checkOutVolunteerName}
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {activity.status === "checked-in" ? "Assigned to " : "Released from "}
                      <span className="font-bold text-blue-600 dark:text-blue-400">{activity.roomName}</span>
                    </p>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <p className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm italic">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Currently Checked In</h3>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Users className="h-4 w-4" />
              <span>{checkedInChildren.length} children</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {checkedInChildren.map((record) => (
              <div key={record.id} className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{record.childName}</p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md font-bold uppercase">{record.roomName}</span>
                      <span>•</span>
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(record.checkInTime), "h:mm a")}</span>
                    </div>
                  </div>
                </div>
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
            ))}
            {checkedInChildren.length === 0 && (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                No children are currently checked in.
              </div>
            )}
          </div>
        </div>
      )}

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
                    className="w-full bg-blue-600 text-white p-6 rounded-2xl font-bold flex flex-col items-center justify-center space-y-2 hover:bg-blue-700 transition-all"
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
                      disabled={!overrideReason.trim() || loading}
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
