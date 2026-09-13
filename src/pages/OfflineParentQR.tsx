import { WifiOff, Download, User, ShieldCheck } from "lucide-react";
import QRCode from "react-qr-code";

/**
 * The dedicated, minimal read-only view a parent sees when they cold-launch
 * the installed app while offline (src/pages/ParentDashboard.tsx's !isOnline
 * branch). Deliberately not the full interactive dashboard -- no add/edit/
 * delete/photo-upload, since none of those can do anything useful with no
 * network. Just what a parent actually needs at a check-in desk with no
 * signal: their children's check-in QR and each guardian's checkout QR.
 *
 * `children`/`guardians` are whatever ParentDashboard's own Firestore
 * listeners already have -- this component makes no queries of its own, so
 * whether there's anything to show here is entirely a function of what
 * Firestore's persistent local cache already synced before the device went
 * offline.
 */
export default function OfflineParentQR({
  children,
  guardians,
  downloadQR,
}: {
  children: any[];
  guardians: any[];
  downloadQR: (id: string, name: string, type: "CHILD" | "GUARDIAN" | "GROUP") => void;
}) {
  const activeChildren = children.filter((c) => !c.deleted);

  return (
    <div className="space-y-8">
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

      {activeChildren.length === 0 ? (
        <div className="py-24 text-center space-y-4 bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800">
          <div className="mx-auto h-16 w-16 bg-primary/5 dark:bg-primary/10 rounded-full flex items-center justify-center">
            <User className="h-8 w-8 text-primary/40 dark:text-primary/60" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">No codes available offline yet</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              This device hasn't synced your children's check-in codes yet. Connect once online and they'll be
              available here the next time you're offline.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeChildren.map((child) => {
            const childGuardians = guardians.filter((g) => g.childIds?.includes(child.id));
            return (
              <div
                key={child.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-6"
              >
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {child.firstName} {child.lastName}
                </h3>

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

                <div className="space-y-3 pt-2 border-t border-gray-50 dark:border-gray-800">
                  <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-sm font-medium">Guardian Checkout Codes</span>
                  </div>

                  {childGuardians.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No guardians added.</p>
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
