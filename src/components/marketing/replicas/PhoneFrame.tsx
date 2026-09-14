import type { ReactNode } from "react";
import { Shield } from "lucide-react";

/**
 * A thin neutral device frame around a phone-shaped replica screen. Pure CSS,
 * no image asset, so it costs nothing to render and never needs an
 * intrinsic-size placeholder.
 *
 * Carries its own small "GuardianCheck" status bar: every phone replica on
 * the page is otherwise unbranded UI (a tenant's name at most), which reads
 * as a generic template rather than a specific, real product.
 */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`w-[220px] rounded-[2rem] border-[6px] border-gray-900 dark:border-gray-700 bg-gray-900 dark:bg-gray-700 shadow-xl ${className}`}
    >
      <div className="rounded-[1.5rem] overflow-hidden bg-white dark:bg-gray-950 aspect-[9/19] flex flex-col">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-bold text-gray-900 dark:text-white tracking-tight truncate">
            GuardianCheck
          </span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col justify-center">{children}</div>
      </div>
    </div>
  );
}
