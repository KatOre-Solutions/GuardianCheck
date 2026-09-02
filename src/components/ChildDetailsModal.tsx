import React, { useState, useEffect } from "react";
import { 
  X, 
  User, 
  Baby, 
  AlertCircle, 
  ShieldCheck, 
  History, 
  Calendar, 
  Clock, 
  MapPin, 
  UserPlus,
  Phone,
  HeartPulse,
  ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { subscribeToDocument, subscribeToCollection } from "../lib/firestore";
import { where, orderBy, limit as firestoreLimit } from "firebase/firestore";
import { useTenant } from "../contexts/TenantContext";

interface ChildDetailsModalProps {
  childId: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Supplied only where an override check-out is actually possible -- the
   * volunteer Attendance view, for a child who is currently checked in. Admin
   * screens open this modal without it and see no such button.
   */
  overrideCheckout?: {
    childName: string;
    onRequest: () => void;
  };
}

export default function ChildDetailsModal({ childId, isOpen, onClose, overrideCheckout }: ChildDetailsModalProps) {
  const { church } = useTenant();
  const churchId = church?.id;
  const [child, setChild] = useState<any>(null);
  const [medical, setMedical] = useState<any>(null);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [recentCheckins, setRecentCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !childId || !churchId) return;

    setLoading(true);

    // Subscribe to child basic info
    const unsubChild = subscribeToDocument("children", childId, (data) => {
      if (import.meta.env.VITE_DEV_MODE === 'true') {
        console.log("[DEBUG] Child data received:", data);
      }
      setChild(data);
      if (data) setLoading(false);
    }, (error) => {
      console.error("[DEBUG] Child subscription error:", error);
      setLoading(false);
    });

    // Subscribe to medical info
    const unsubMedical = subscribeToDocument("child_medical", childId, (data) => {
      if (import.meta.env.VITE_DEV_MODE === 'true') {
        console.log("[DEBUG] Medical data received:", data);
      }
      setMedical(data);
    }, (error) => {
      console.error("[DEBUG] Medical subscription error:", error);
    });

    // Subscribe to guardians (where childIds contains childId)
    const unsubGuardians = subscribeToCollection("guardians", [
      where("churchId", "==", churchId),
      where("childIds", "array-contains", childId),
      where("active", "==", true)
    ], (data) => {
      if (import.meta.env.VITE_DEV_MODE === 'true') {
        console.log("[DEBUG] Guardians data received:", data);
      }
      setGuardians(data);
    });

    // Subscribe to recent check-ins
    const unsubCheckins = subscribeToCollection("checkins", [
      where("churchId", "==", churchId),
      where("childId", "==", childId),
      orderBy("checkInTime", "desc"),
      firestoreLimit(5)
    ], (data) => {
      if (import.meta.env.VITE_DEV_MODE === 'true') {
        console.log("[DEBUG] Checkins data received:", data);
      }
      setRecentCheckins(data);
    });

    return () => {
      unsubChild();
      unsubMedical();
      unsubGuardians();
      unsubCheckins();
    };
  }, [isOpen, childId, churchId]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white dark:bg-gray-900 rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-800"
        >
          {/* Header */}
          <div className="relative h-32 bg-primary flex items-end px-8 pb-4">
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center space-x-4 mb-[-40px]">
              <div className="h-24 w-24 bg-white dark:bg-gray-800 rounded-3xl p-1 shadow-xl border-4 border-white dark:border-gray-900">
                <div className="h-full w-full bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center overflow-hidden">
                  {child?.photoUrl || child?.photoURL ? (
                    <img src={child.photoUrl || child.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Baby className="h-10 w-10 text-primary/40" />
                  )}
                </div>
              </div>
              <div className="pb-1">
                <h2 className="text-2xl font-bold text-white drop-shadow-sm">{child?.firstName} {child?.lastName}</h2>
                {import.meta.env.VITE_DEV_MODE === 'true' && (
                  <span className="bg-white/20 text-white text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full">
                    ID: {childId.slice(-6).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-14 p-8 space-y-8">
            {/* Quick Info Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Age</p>
                <p className="font-bold text-gray-900 dark:text-white">{child?.age} Years</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Gender</p>
                <p className="font-bold text-gray-900 dark:text-white">{child?.gender || "Not Set"}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Grade</p>
                <p className="font-bold text-gray-900 dark:text-white uppercase">{child?.grade || "N/A"}</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Status</p>
                <div className="flex items-center justify-center space-x-1">
                  <div className={`h-2 w-2 rounded-full ${recentCheckins[0]?.status === 'checked-in' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                  <p className="font-bold text-gray-900 dark:text-white text-xs uppercase">{recentCheckins[0]?.status || "Out"}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Medical & Alerts */}
              <div className="space-y-6">
                <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                  <HeartPulse className="h-5 w-5" />
                  <h3 className="font-bold uppercase tracking-wider text-sm">Medical & Allergies</h3>
                </div>
                
                <div className={`p-6 rounded-3xl border transition-colors ${child?.allergies ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Allergies</label>
                  <p className={`font-medium ${child?.allergies ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>
                    {child?.allergies || "No known allergies"}
                  </p>
                </div>

                <div className="p-6 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-3xl">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Medical Notes / Special Instructions</label>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {medical?.notes || "No special instructions provided."}
                  </p>
                </div>
              </div>

              {/* Authorized Guardians */}
              <div className="space-y-6">
                <div className="flex items-center space-x-2 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                  <h3 className="font-bold uppercase tracking-wider text-sm">Authorized Guardians</h3>
                </div>
                
                <div className="space-y-3">
                  {guardians.map((guardian) => (
                    <div key={guardian.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center space-x-3 shadow-sm">
                      <div className="h-10 w-10 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center justify-center overflow-hidden border border-gray-100 dark:border-gray-700">
                        {guardian.photoUrl || guardian.photoURL ? (
                          <img src={guardian.photoUrl || guardian.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="h-5 w-5 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">{guardian.firstName} {guardian.lastName}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{guardian.relationship} • {guardian.phone}</p>
                      </div>
                      <a href={`tel:${guardian.phone}`} className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary transition-colors hover:text-white">
                        <Phone className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                  {guardians.length === 0 && (
                    <div className="p-6 text-center bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                      <p className="text-sm text-gray-400 italic">No guardians found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance History */}
            <div className="space-y-6">
              <div className="flex items-center space-x-2 text-orange-600">
                <History className="h-5 w-5" />
                <h3 className="font-bold uppercase tracking-wider text-sm">Recent Activity</h3>
              </div>

              <div className="overflow-hidden rounded-3xl border border-gray-100 dark:border-gray-800">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Service</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Room</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Time</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {recentCheckins.map((checkin) => (
                      <tr key={checkin.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">{checkin.serviceName || "Global Service"}</p>
                          <p className="text-[10px] text-gray-500">{checkin.eventName || format(new Date(checkin.checkInTime), "MMM d, yyyy")}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3 text-primary" />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{checkin.roomName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-1 text-[10px] text-gray-500">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(checkin.checkInTime), "HH:mm")}</span>
                            </div>
                            {checkin.checkOutTime && (
                              <div className="flex items-center space-x-1 text-[10px] text-orange-500">
                                <Clock className="h-3 w-3" />
                                <span>Out {format(new Date(checkin.checkOutTime), "HH:mm")}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            checkin.status === 'checked-in' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {checkin.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {recentCheckins.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-400 italic text-sm bg-white dark:bg-gray-900">
                          No recent attendance records
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              onClick={onClose}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-8 py-3 rounded-2xl font-bold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              Close Details
            </button>
            {overrideCheckout && (
              <button
                onClick={overrideCheckout.onRequest}
                className="px-6 py-3 rounded-2xl font-bold border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
              >
                <ShieldAlert className="h-5 w-5" />
                <span>Check Out (Admin Override)</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
