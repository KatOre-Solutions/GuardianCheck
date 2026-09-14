import { Users, CheckCircle2, Mail } from "lucide-react";
import { SAMPLE } from "../../../constants/marketing";

/** A parent's view of their child's current status, plus the email confirmation they get. */
export function ParentChildCard() {
  const child = SAMPLE.children[0];

  return (
    <div
      role="img"
      aria-label={`Parent screen showing ${child.name} checked in, with an email confirmation`}
      data-nosnippet
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-12 w-12 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-bold text-gray-900 dark:text-white truncate">{child.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{child.room}</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Checked in
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        <Mail className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Emailed to the account holder: "{child.name} was checked in to {child.room} at {SAMPLE.church}."</span>
      </div>
    </div>
  );
}
