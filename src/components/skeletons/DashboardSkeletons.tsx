import React from "react";
import { Skeleton, SkeletonPanel, SkeletonPill, SkeletonRoot, SkeletonRows } from "./primitives";

/**
 * The volunteer station before its data arrives.
 *
 * Mirrors the real page: `space-y-8` root, a header with the service badge on
 * the right, then the two-column `lg:grid-cols-2 gap-8 items-start` split where
 * the scanner sits on the left and the roster and activity feed on the right.
 * This page used to render the admin-shaped skeleton, so the swap to content
 * rearranged the screen.
 */
export const VolunteerDashboardSkeleton: React.FC = () => (
  <SkeletonRoot className="space-y-8">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-72" />
      </div>
      <SkeletonPill className="h-10 w-40" />
    </header>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      {/* Scanner column: the camera frame is square on the real page. */}
      <SkeletonPanel>
        <div className="aspect-square w-full rounded-2xl bg-gray-100 dark:bg-gray-800/60" />
        <div className="mt-6 flex gap-3">
          <SkeletonPill className="h-11 flex-1" />
          <SkeletonPill className="h-11 w-28" />
        </div>
      </SkeletonPanel>

      {/* Roster and recent activity. */}
      <div className="space-y-8">
        <SkeletonPanel>
          <SkeletonRows count={4} />
        </SkeletonPanel>
        <SkeletonPanel>
          <SkeletonRows count={5} rowClassName="h-12" />
        </SkeletonPanel>
      </div>
    </div>
  </SkeletonRoot>
);

/**
 * The parent dashboard before its data arrives.
 *
 * Header with the action buttons, then the `md:grid-cols-2 lg:grid-cols-3`
 * grid of child cards. This page had no loading state at all — it rendered
 * empty and popped — so anything here is new ground rather than a replacement.
 */
export const ParentDashboardSkeleton: React.FC = () => (
  <SkeletonRoot className="space-y-8">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center space-x-3">
        <div className="h-12 w-12 bg-gray-200 dark:bg-gray-800 rounded-2xl shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <SkeletonPill className="h-12 w-36" />
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-4"
        >
          <div className="flex items-center space-x-3">
            <div className="h-16 w-16 rounded-2xl bg-gray-200 dark:bg-gray-800 shrink-0" />
            <div className="space-y-2 min-w-0">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <SkeletonPill className="h-10 w-full" />
        </div>
      ))}
    </div>
  </SkeletonRoot>
);
