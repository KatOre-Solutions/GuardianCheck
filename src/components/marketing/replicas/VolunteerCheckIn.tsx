import { Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SAMPLE } from "../../../constants/marketing";

/**
 * Volunteer's check-in screen, after scanning a child's QR code. Mirrors the
 * real scanned-child card in VolunteerDashboard.tsx (around lines 655-735).
 * Fictional data only, from `SAMPLE`.
 */
export function VolunteerCheckIn({ compact = false }: { compact?: boolean }) {
  const child = SAMPLE.children[0];

  return (
    <div
      role="img"
      aria-label={`Volunteer check-in screen showing ${child.name} checked in to ${child.room}`}
      data-nosnippet
      className={`rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 ${compact ? "p-4" : "p-5"} space-y-4`}
    >
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Checked in
        </span>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium truncate">{SAMPLE.church}</p>
      </div>

      <div className="flex items-start gap-3 min-w-0">
        <div className="h-12 w-12 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 dark:text-white truncate">{child.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{child.age} years old</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{child.room}</p>
        </div>
      </div>

      {child.allergy && (
        <div className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900/30">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Allergy: {child.allergy}</span>
        </div>
      )}
    </div>
  );
}
