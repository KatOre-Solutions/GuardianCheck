import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Key, Lock } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { safeFetch } from "../lib/api";
import { updateDocument, logAudit } from "../lib/firestore";
import { showErrorToast, showSuccessToast } from "../lib/error-handler";

/**
 * Admin Override check-out: the fallback for when the collecting adult is
 * present but has no phone or QR code.
 *
 * Extracted from VolunteerDashboard when check-out moved to its own tab. The
 * PIN verification, lockout and audit behaviour is carried over unchanged --
 * in particular the 429 branch, which stops a throttled request being reported
 * to the volunteer as a wrong PIN and logged as a failed override they never
 * attempted.
 *
 * This is the only remaining caller of /api/check-out, which now accepts
 * override check-outs only; guardian-QR pickups go through
 * /api/check-out-guardian, where the server verifies the guardian itself.
 */

interface CheckinRecord {
  id: string;
  childId: string;
  childName: string;
}

interface AdminOverrideModalProps {
  record: CheckinRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AdminOverrideModal({ record, isOpen, onClose, onSuccess }: AdminOverrideModalProps) {
  const { user, userData } = useAuth();
  const [overridePin, setOverridePin] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [pinFocused, setPinFocused] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => pinInputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  const close = () => {
    setOverridePin("");
    setOverrideReason("");
    onClose();
  };

  const checkOutWithOverride = async (reason: string) => {
    if (!record) return false;

    const token = await auth.currentUser?.getIdToken();
    const result = await safeFetch("/api/check-out", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        checkinId: record.id,
        volunteerId: user?.uid,
        volunteerName: userData?.firstName && userData?.lastName
          ? `${userData.firstName} ${userData.lastName}`
          : (user?.displayName || user?.email || "Volunteer"),
        overrideReason: reason,
      }),
    });

    if (result.ok) return true;

    // Only a request that never reached the server falls back to a local
    // write. A server that answered and refused -- already checked out, wrong
    // church, bad request -- is final; writing anyway would turn a refusal
    // into a silent success.
    if (!result.networkError) {
      showErrorToast(new Error(result.error || "Checkout failed"));
      return false;
    }

    try {
      await updateDocument("checkins", record.id, {
        checkOutTime: new Date().toISOString(),
        status: "checked-out",
        checkOutVolunteerId: user?.uid,
        checkOutVolunteerName: userData?.firstName && userData?.lastName
          ? `${userData.firstName} ${userData.lastName}`
          : (user?.displayName || user?.email || "Volunteer"),
        guardianId: "admin_override",
        guardianName: "Admin Override",
        overrideReason: reason,
      });
      return true;
    } catch (localErr) {
      console.error(localErr);
      showErrorToast(new Error("Checkout failed"));
      return false;
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

      // A throttled request is not a wrong PIN. Without this branch the 429 falls
      // through to the failure path below, tells the volunteer the PIN is
      // incorrect, and writes a failed_admin_override the volunteer never made.
      if (result.status === 429) {
        showErrorToast("Too many PIN attempts. Please wait a few minutes and try again.");
        return;
      }

      const isValid = result.ok && result.data?.isValid;

      if (isValid) {
        const checkedOut = await checkOutWithOverride(overrideReason);
        if (!checkedOut) return;

        showSuccessToast(`${record?.childName} checked out successfully!`);

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
              childId: record?.childId,
              childName: record?.childName,
              reason: overrideReason,
              method: "admin_override"
            }
          })
        });

        setFailedAttempts(0);
        setOverridePin("");
        setOverrideReason("");
        onSuccess?.();
        onClose();
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
            childId: record?.childId,
            childName: record?.childName,
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center space-x-3">
                <Key className="h-6 w-6 text-red-600 dark:text-red-400" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Override</h2>
              </div>

              {record && (
                <div className="text-center space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Checking out</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{record.childName}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    Use this only if the guardian is physically present but cannot scan their QR code. This action will be logged.
                  </p>
                </div>

                {/* Four boxes rather than one text field. The old input
                    centred a letter-spaced string next to a left-aligned icon,
                    so the digits sat visibly off-centre and the caret landed
                    somewhere in the tracking. Boxes show progress at a glance
                    and give a full-width tap target on a phone. */}
                <div className="space-y-2">
                  <label htmlFor="override-pin" className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                    <Lock className="h-4 w-4 text-gray-400" />
                    Admin Override PIN
                  </label>

                  <div className="relative">
                    <input
                      id="override-pin"
                      ref={pinInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={overridePin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val.length <= 4) setOverridePin(val);
                      }}
                      onFocus={() => setPinFocused(true)}
                      onBlur={() => setPinFocused(false)}
                      aria-label="Admin override PIN, 4 digits"
                      // Invisible but genuinely focused: the boxes below are
                      // the visual, this is the real field.
                      className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                    />
                    <div className="flex gap-2 sm:gap-3" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => {
                        const filled = overridePin.length > i;
                        const active = pinFocused && overridePin.length === i;
                        return (
                          <div
                            key={i}
                            className={`flex-1 h-16 rounded-xl border-2 flex items-center justify-center transition-all ${
                              active
                                ? "border-red-500 bg-white dark:bg-gray-900 ring-4 ring-red-500/10"
                                : filled
                                ? "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50"
                                : "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                            }`}
                          >
                            {filled && (
                              <span className="h-3 w-3 rounded-full bg-gray-900 dark:bg-white" />
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                    onClick={close}
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
  );
}
