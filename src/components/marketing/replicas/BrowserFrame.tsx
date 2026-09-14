import type { ReactNode } from "react";

/** A thin browser-chrome frame — three dots, a URL pill — around a desktop replica screen. */
export function BrowserFrame({
  url = "guardiancheck.co.za",
  children,
  className = "",
}: {
  url?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        <span className="ml-3 text-[11px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full px-3 py-0.5 truncate">
          {url}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
