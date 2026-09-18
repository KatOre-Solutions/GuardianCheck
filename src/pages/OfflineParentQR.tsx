import { Link } from "react-router-dom";
import { WifiOff, Download, User, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import QRCode from "react-qr-code";

/**
 * The minimal read-only view of a parent's QR codes. ParentDashboard renders
 * it in place of the full dashboard in two situations:
 *
 *   - "offline": the installed app cold-launched with no signal. No add/edit/
 *     delete/photo-upload, since none of those can do anything useful with no
 *     network. Just what a parent needs at a check-in desk: their children's
 *     check-in QR and each guardian's checkout QR.
 *
 *   - "locked": the church's trial or subscription has ended (see
 *     src/lib/churchAccess.ts). Check-in is paused, so the child check-in
 *     codes are hidden, but children checked in before the lock still have to
 *     be collected, and the volunteer's check-out screen works by scanning a
 *     guardian's QR. Without this view a locked parent could not show that code
 *     and every pickup would need an admin override.
 *
 * `children`/`guardians`/`checkins` are whatever ParentDashboard's own
 * Firestore listeners already have. This component makes no queries of its
 * own, so offline, what it can show is entirely a function of what Firestore's
 * persistent local cache synced before the device went offline.
 */
export default function OfflineParentQR({
  children,
  guardians,
  checkins = [],
  downloadQR,
  mode = "offline",
  churchName,
  adminPath,
}: {
  children: any[];
  guardians: any[];
  /** Open check-ins for this parent, used to badge children still in a room. */
  checkins?: any[];
  downloadQR: (id: string, name: string, type: "CHILD" | "GUARDIAN" | "GROUP") => void;
  mode?: "offline" | "locked";
  churchName?: string;
  /** Set for an admin viewing this page, so the locked banner can send them to billing. */
  adminPath?: string;
}) {
  const locked = mode === "locked";
  const activeChildren = children.filter((c) => !c.deleted);
  const openCheckinFor = (childId: string) => checkins.find((c) => c.childId === childId);

  return (
    <div className="space-y-8">
      {locked ? (
        <div className="flex items-start space-x-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl px-5 py-4">
          <div className="h-10 w-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-sm text-gray-900 dark:text-white">
              {churchName ? `${churchName}'s` : "Your church's"} GuardianCheck access is paused
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Check-in is unavailable until your church administrator renews GuardianCheck. Your guardian
              pickup codes below still work, so any child already checked in can be collected as usual.
            </p>
            {adminPath && (
              <Link to={adminPath} className="inline-block text-xs font-bold text-primary hover:underline">
                Choose a plan on the admin dashboard
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl px-5 py-4">
          <div className="h-10 w-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <WifiOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900 dark:text-white">You're offline</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Showing the check-in and checkout codes last synced to this device. Reconnect for the full dashboard.
            </p>
          </div>
        </div>
      )}

      {activeChildren.length === 0 ? (
        <div className="py-24 text-center space-y-4 bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
          <div className="mx-auto h-16 w-16 bg-primary/5 dark:bg-primary/10 rounded-full flex items-center justify-center">
            <User className="h-8 w-8 text-primary/40 dark:text-primary/60" />
          </div>
          <div className="space-y-2">
            {locked ? (
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">No children registered</h3>
            ) : (
              <>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">No codes available offline yet</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  This device hasn't synced your children's check-in codes yet. Connect once online and they'll be
                  available here the next time you're offline.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeChildren.map((child) => {
            // Same test as both check-out paths, the server's guardian lookup
            // and CheckOutTab's offline one: `active` must be exactly true.
            // Any other guardian's code would only fail at the desk.
            //
            // Deliberately stricter than ChildrenDirectory's inclusive
            // `deleted || active === false`, and the two are not in conflict:
            // that screen lists people an admin manages, so an odd record is
            // better shown than hidden, while this one lists codes that have to
            // work when scanned. `resolveGuardianByToken` in server.ts refuses
            // anything but `active === true`, so an inclusive filter here would
            // hand a parent a code the desk rejects, offline and with no way to
            // find out why. Every write path sets the field (SetupWizard,
            // ParentDashboard), and an audit of the 308 guardian records in
            // production found none without it.
            const childGuardians = guardians.filter(
              (g) => g.childIds?.includes(child.id) && g.active === true && g.deleted !== true,
            );
            const openCheckin = openCheckinFor(child.id);
            return (
              <div
                key={child.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-6"
              >
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {child.firstName} {child.lastName}
                  </h3>
                  {openCheckin && (
                    <div className="inline-flex items-center space-x-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-lg text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Checked in{openCheckin.roomName ? `: ${openCheckin.roomName}` : ""}</span>
                    </div>
                  )}
                </div>

                {!locked && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl flex flex-col items-center space-y-3 border border-dashed border-gray-200 dark:border-gray-700">
                    <div className="bg-white p-4 rounded-xl shadow-sm w-full max-w-[240px]">
                      <QRCode
                        id={`offline-qr-child-${child.id}`}
                        value={child.qrCode}
                        size={256}
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Child Check-In Code</p>
                    <button
                      onClick={() => downloadQR(`offline-qr-child-${child.id}`, `${child.firstName} ${child.lastName}`, "CHILD")}
                      className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-primary dark:text-primary/80"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download QR</span>
                    </button>
                  </div>
                )}

                <div className={`space-y-3 ${locked ? "" : "pt-2 border-t border-gray-50 dark:border-gray-800"}`}>
                  <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-sm font-medium">Guardian Checkout Codes</span>
                  </div>

                  {childGuardians.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No active guardians.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {childGuardians.map((guardian) => (
                        <div
                          key={guardian.id}
                          className="flex flex-col items-center space-y-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700"
                        >
                          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 text-center">
                            {guardian.firstName} {guardian.lastName}
                          </p>
                          <div className="bg-white p-2 rounded-lg w-full max-w-[160px]">
                            <QRCode
                              id={`offline-qr-guardian-${child.id}-${guardian.id}`}
                              value={guardian.qrToken}
                              size={256}
                              style={{ width: "100%", height: "auto", display: "block" }}
                            />
                          </div>
                          <button
                            onClick={() =>
                              downloadQR(
                                `offline-qr-guardian-${child.id}-${guardian.id}`,
                                `${guardian.firstName} ${guardian.lastName}`,
                                "GUARDIAN",
                              )
                            }
                            className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-primary dark:text-primary/80"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download QR</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
