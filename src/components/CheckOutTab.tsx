import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format, isToday } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  LogOut,
  RefreshCw,
  ShieldAlert,
  UserX,
  Users,
  WifiOff,
} from "lucide-react";
import { QRScanner } from "./QRScanner";
import { auth } from "../lib/firebase";
import { safeFetch } from "../lib/api";
import { updateDocument } from "../lib/firestore";
import { showErrorToast } from "../lib/error-handler";
import { hasRecordedAllergies } from "../lib/child-utils";

/**
 * Check Out: scan the collecting guardian's QR, pick their children, release.
 *
 * The server decides who may collect whom. This component sends the scanned
 * token up and renders what comes back -- it never works out eligibility from
 * local state, because a browser that can decide that can also be told to lie.
 * The one exception is the offline path below, which is explicitly bounded.
 */

interface EligibleChild {
  checkinId: string;
  childId: string;
  childName: string;
  roomName: string | null;
  checkInTime: string;
}

interface NotCheckedInChild {
  childId: string;
  childName: string;
}

interface GuardianSummary {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
}

interface CheckOutResult {
  checkinId: string;
  childName: string | null;
  outcome: "checked-out" | "already-checked-out" | "not-authorized" | "not-found" | "error";
}

interface CheckOutTabProps {
  /** Warm cache of the church's children, for photo and allergy display only. */
  allChildren: any[];
  /** Warm cache of guardians, used only by the offline fallback. */
  allGuardians: any[];
  checkedInChildren: any[];
  volunteerId: string;
  volunteerName: string;
  isOnline: boolean;
  onGoToAttendance: () => void;
}

type Phase = "scan" | "select" | "done";

export default function CheckOutTab({
  allChildren,
  allGuardians,
  checkedInChildren,
  volunteerId,
  volunteerName,
  isOnline,
  onGoToAttendance,
}: CheckOutTabProps) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [loading, setLoading] = useState(false);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [guardian, setGuardian] = useState<GuardianSummary | null>(null);
  const [eligible, setEligible] = useState<EligibleChild[]>([]);
  const [notCheckedIn, setNotCheckedIn] = useState<NotCheckedInChild[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [results, setResults] = useState<CheckOutResult[]>([]);
  const [wasOffline, setWasOffline] = useState(false);

  const childById = (childId: string) => allChildren.find((c) => c.id === childId);

  const resetToScan = () => {
    setPhase("scan");
    setScannedToken(null);
    setGuardian(null);
    setEligible([]);
    setNotCheckedIn([]);
    setSelected(new Set());
    setLookupError(null);
    setResults([]);
    setWasOffline(false);
  };

  // --- Scan -----------------------------------------------------------------

  const handleScan = async (decodedText: string) => {
    const qrToken = decodedText.trim();
    if (!qrToken || loading) return;

    setLoading(true);
    setLookupError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await safeFetch("/api/guardian-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrToken }),
      });

      if (!result.ok) {
        if (result.networkError) {
          // Offline: fall back to the warm cache so a dropped connection during
          // pickup does not stop the queue. A server that answered and refused
          // is never worked around this way.
          const offline = buildOfflineLookup(qrToken);
          if (!offline) {
            setLookupError("Offline, and this QR is not in the cached guardian list. Use Attendance to check out instead.");
            return;
          }
          setWasOffline(true);
          setScannedToken(qrToken);
          setGuardian(offline.guardian);
          setEligible(offline.eligible);
          setNotCheckedIn(offline.notCheckedIn);
          setSelected(new Set(offline.eligible.map((c) => c.checkinId)));
          setPhase("select");
          return;
        }
        if (result.status === 404) {
          setLookupError("That QR code was not recognised. Ask for the parent's GuardianCheck QR, or use Attendance to check the child out with an Admin Override.");
          return;
        }
        setLookupError(result.error || "Could not look up that QR code. Please try again.");
        return;
      }

      const data: any = result.data;
      setScannedToken(qrToken);
      setGuardian(data.guardian);
      setEligible(data.eligible || []);
      setNotCheckedIn(data.notCheckedIn || []);
      // Pre-selected: the guardian presented their own QR, so collecting every
      // eligible child is the overwhelmingly common intent. Deselecting is one
      // tap, and the confirm button names who is being released.
      setSelected(new Set((data.eligible || []).map((c: EligibleChild) => c.checkinId)));
      setPhase("select");
    } catch (err: any) {
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  /** Mirrors the server's eligibility rule against cached data. Offline only. */
  const buildOfflineLookup = (qrToken: string) => {
    const match = allGuardians.find(
      (g) => g.qrToken === qrToken && g.active === true && g.deleted !== true
    );
    if (!match) return null;

    const childIds: string[] = Array.isArray(match.childIds) ? match.childIds : [];
    const eligibleRecords: EligibleChild[] = checkedInChildren
      .filter((record) => childIds.includes(record.childId))
      .map((record) => ({
        checkinId: record.id,
        childId: record.childId,
        childName: record.childName,
        roomName: record.roomName || null,
        checkInTime: record.checkInTime,
      }));

    const eligibleChildIds = new Set(eligibleRecords.map((c) => c.childId));
    const missing: NotCheckedInChild[] = childIds
      .filter((id) => !eligibleChildIds.has(id))
      .map((id) => {
        const child = childById(id);
        return {
          childId: id,
          childName: child ? `${child.firstName || ""} ${child.lastName || ""}`.trim() : "Unknown child",
        };
      });

    return {
      guardian: {
        id: match.id,
        firstName: match.firstName || "",
        lastName: match.lastName || "",
        relationship: match.relationship || "",
      },
      eligible: eligibleRecords,
      notCheckedIn: missing,
    };
  };

  // --- Confirm --------------------------------------------------------------

  const toggle = (checkinId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(checkinId)) next.delete(checkinId);
      else next.add(checkinId);
      return next;
    });
  };

  const handleCheckOut = async (idsOverride?: string[]) => {
    const checkinIds = idsOverride ?? Array.from(selected);
    if (checkinIds.length === 0 || !scannedToken || loading) return;

    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const result = await safeFetch("/api/check-out-guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrToken: scannedToken, checkinIds }),
      });

      if (!result.ok) {
        if (result.networkError) {
          await checkOutOffline(checkinIds);
          return;
        }
        showErrorToast(new Error(result.error || "Check-out failed"));
        return;
      }

      setResults((result.data as any).results || []);
      setPhase("done");
    } catch (err: any) {
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Offline release. Re-checks the guardian link against the cached guardian
   * record before writing -- the same rule the server applies, minus the
   * authority. firestore.rules still constrains the transition itself.
   */
  const checkOutOffline = async (checkinIds: string[]) => {
    const offline = scannedToken ? buildOfflineLookup(scannedToken) : null;
    if (!offline) {
      showErrorToast(new Error("Cannot verify this guardian while offline."));
      return;
    }

    const authorized = new Set(offline.eligible.map((c) => c.checkinId));
    const offlineResults: CheckOutResult[] = [];

    for (const checkinId of checkinIds) {
      const record = eligible.find((c) => c.checkinId === checkinId);
      if (!authorized.has(checkinId)) {
        offlineResults.push({ checkinId, childName: record?.childName || null, outcome: "not-authorized" });
        continue;
      }
      try {
        await updateDocument("checkins", checkinId, {
          checkOutTime: new Date().toISOString(),
          status: "checked-out",
          checkOutVolunteerId: volunteerId,
          checkOutVolunteerName: volunteerName,
          guardianId: offline.guardian.id,
          guardianName: `${offline.guardian.firstName} ${offline.guardian.lastName}`.trim(),
          overrideReason: null,
        });
        offlineResults.push({ checkinId, childName: record?.childName || null, outcome: "checked-out" });
      } catch (err) {
        offlineResults.push({ checkinId, childName: record?.childName || null, outcome: "error" });
      }
    }

    setWasOffline(true);
    setResults(offlineResults);
    setPhase("done");
  };

  // --- Render ---------------------------------------------------------------

  const guardianName = guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : "";
  const selectedNames = eligible.filter((c) => selected.has(c.checkinId)).map((c) => c.childName.split(" ")[0]);

  const confirmLabel = () => {
    if (selectedNames.length === 0) return "Select a child to check out";
    if (selectedNames.length === 1) return `Check Out ${selectedNames[0]}`;
    if (selectedNames.length === 2) return `Check Out ${selectedNames[0]} + ${selectedNames[1]} (2)`;
    return `Check Out ${selectedNames.length} children`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!isOnline && (
        <div className="flex items-center space-x-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            You are offline. Check-outs will be saved on this device and synced when the connection returns.
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ---------------------------------------------------------- SCAN */}
        {phase === "scan" && (
          <motion.div
            key="scan"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 space-y-6"
          >
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Scan Parent QR</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Scan the collecting parent or guardian's QR code to see the children they can check out.
              </p>
            </div>

            <QRScanner
              elementId="qr-reader-checkout"
              autoStart
              onScanSuccess={handleScan}
              onScanFailure={(error) => {
                if (error.includes("camera") || error.includes("permission") || error.includes("access")) {
                  showErrorToast(new Error(error));
                }
              }}
            />

            {loading && (
              <div className="flex items-center justify-center space-x-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Looking up guardian...</span>
              </div>
            )}

            {lookupError && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 space-y-3">
                <div className="flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-red-900 dark:text-red-200">{lookupError}</p>
                </div>
                <button
                  onClick={onGoToAttendance}
                  className="w-full py-3 rounded-xl bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  Go to Attendance
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* -------------------------------------------------------- SELECT */}
        {phase === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-6"
          >
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Collecting</p>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{guardianName}</h2>
                  {guardian?.relationship && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{guardian.relationship}</p>
                  )}
                </div>
                <button
                  onClick={resetToScan}
                  className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>

              {eligible.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center">
                    <UserX className="w-7 h-7 text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    {notCheckedIn.length > 0
                      ? "None of their children are checked in"
                      : "No children linked to this guardian"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    {notCheckedIn.length > 0
                      ? "There is nothing to check out right now."
                      : "Ask an admin to link this guardian to a child in the parent's account."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eligible.map((record) => {
                    const child = childById(record.childId);
                    const isSelected = selected.has(record.checkinId);
                    const allergic = hasRecordedAllergies(child?.allergies);
                    const stale = record.checkInTime && !isToday(new Date(record.checkInTime));
                    return (
                      <button
                        key={record.checkinId}
                        onClick={() => toggle(record.checkinId)}
                        className={`w-full p-4 rounded-2xl border-2 flex items-center space-x-4 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 dark:bg-primary/20"
                            : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600"
                        }`}
                      >
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {child?.photoUrl ? (
                            <img
                              src={child.photoUrl}
                              alt={record.childName}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Users className="h-7 w-7 text-primary dark:text-primary/80" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate">{record.childName}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {record.roomName && (
                              <span className="px-2 py-0.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {record.roomName}
                              </span>
                            )}
                            {record.checkInTime && (
                              <span className="inline-flex items-center text-xs text-gray-500 dark:text-gray-400">
                                <Clock className="w-3 h-3 mr-1" />
                                {format(new Date(record.checkInTime), "h:mm a")}
                              </span>
                            )}
                            {allergic && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Allergies
                              </span>
                            )}
                            {stale && (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                since {format(new Date(record.checkInTime), "EEE h:mm a")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-gray-200 dark:border-gray-600"
                          }`}
                        >
                          {isSelected && <Check className="w-4 h-4 text-white" />}
                        </div>
                      </button>
                    );
                  })}

                  {notCheckedIn.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Not checked in</p>
                      {notCheckedIn.map((child) => (
                        <div
                          key={child.childId}
                          className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/50 flex items-center space-x-3 opacity-60"
                        >
                          <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                            <Users className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                          </div>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                            {child.childName}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {eligible.length > 0 && (
              <div className="space-y-3">
                {selected.size < eligible.length && (
                  <button
                    onClick={() => setSelected(new Set(eligible.map((c) => c.checkinId)))}
                    className="w-full py-3 rounded-2xl border-2 border-gray-100 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:border-primary/40 transition-colors"
                  >
                    Select all {eligible.length}
                  </button>
                )}
                <button
                  onClick={() => handleCheckOut()}
                  disabled={selected.size === 0 || loading}
                  className="w-full py-4 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg transition-all transform active:scale-[0.99] flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Checking out...</span>
                    </>
                  ) : (
                    <>
                      <LogOut className="w-5 h-5" />
                      <span>{confirmLabel()}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ---------------------------------------------------------- DONE */}
        {phase === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Checked Out</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Released to {guardianName} at {format(new Date(), "h:mm a")}
              </p>
              {wasOffline && (
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Saved offline
                </p>
              )}
            </div>

            <div className="space-y-2">
              {results.map((result) => (
                <div
                  key={result.checkinId}
                  className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between gap-3"
                >
                  <p className="font-bold text-gray-900 dark:text-white truncate">
                    {result.childName || "Child"}
                  </p>
                  {result.outcome === "checked-out" && (
                    <span className="inline-flex items-center text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400 flex-shrink-0">
                      <Check className="w-4 h-4 mr-1" />
                      Checked out
                    </span>
                  )}
                  {result.outcome === "already-checked-out" && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex-shrink-0">
                      Already out
                    </span>
                  )}
                  {(result.outcome === "not-authorized" || result.outcome === "not-found") && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex-shrink-0">
                      Not permitted
                    </span>
                  )}
                  {result.outcome === "error" && (
                    <button
                      onClick={() => handleCheckOut([result.checkinId])}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-xs font-bold text-gray-700 dark:text-gray-200 flex-shrink-0"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={resetToScan}
              className="w-full py-4 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-lg transition-all transform active:scale-[0.99] flex items-center justify-center space-x-2"
            >
              <span>Next Family</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
