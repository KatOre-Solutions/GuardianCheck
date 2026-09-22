import React from "react";
import type { LiveStatus } from "../hooks/useLiveData";

/** Keep protected content unmounted until the access lookup succeeds. */
export function ChurchAccessBoundary({ status, hasChurch, children }: {
  status: LiveStatus;
  hasChurch: boolean;
  children: React.ReactNode;
}) {
  if (status === "loading") {
    return (
      <div role="status" className="max-w-lg mx-auto p-8 text-center text-gray-600 dark:text-gray-300">
        Checking your church's access…
      </div>
    );
  }

  if (status === "error" || !hasChurch) {
    return (
      <div role="alert" className="max-w-lg mx-auto p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Unable to verify your church's access</h1>
        <p className="text-gray-600 dark:text-gray-300">Check your connection and try again. If this continues, contact support.</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
          Try again
        </button>
        <a href="mailto:info@guardiancheck.co.za" className="block text-indigo-600 dark:text-indigo-400">Contact support</a>
      </div>
    );
  }

  return <>{children}</>;
}
