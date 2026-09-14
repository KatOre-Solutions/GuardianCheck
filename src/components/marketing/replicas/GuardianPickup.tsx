import { User, CheckCircle2 } from "lucide-react";
import { SAMPLE } from "../../../constants/marketing";

/**
 * A volunteer's pickup screen, after scanning a guardian's QR code: the
 * guardian's photo and only the children they are linked to. Fictional data
 * only, from `SAMPLE`.
 */
export function GuardianPickup() {
  return (
    <div
      role="img"
      aria-label={`Pickup screen showing guardian ${SAMPLE.guardian} linked to ${SAMPLE.children.length} children`}
      data-nosnippet
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 ring-2 ring-primary/30">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 dark:text-white truncate">{SAMPLE.guardian}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Authorised guardian</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Linked children
        </p>
        {SAMPLE.children.map((child) => (
          <div
            key={child.name}
            className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2 space-y-1"
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{child.name}</p>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">In {child.room}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
