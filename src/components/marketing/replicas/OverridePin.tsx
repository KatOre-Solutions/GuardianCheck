import { Lock, ShieldAlert } from "lucide-react";
import { SAMPLE } from "../../../constants/marketing";

/** The override screen a volunteer sees when releasing a child without the guardian's QR code. */
export function OverridePin() {
  return (
    <div
      role="img"
      aria-label="Override screen requiring the church PIN and a written reason before a child can be released without a guardian QR code"
      data-nosnippet
      className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-5 space-y-4"
    >
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <ShieldAlert className="h-5 w-5" />
        <p className="text-sm font-bold">No guardian QR code presented</p>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {SAMPLE.overridePinLabel}
        </label>
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
          <Lock className="h-4 w-4 text-gray-400" />
          <span className="tracking-[0.4em] font-mono text-gray-800 dark:text-gray-200">••••</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Reason for release
        </label>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-500 dark:text-gray-400 italic">
          "Grandmother collecting, QR code left at home"
        </div>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Locks after repeated wrong PINs. Every attempt is logged.
      </p>
    </div>
  );
}
