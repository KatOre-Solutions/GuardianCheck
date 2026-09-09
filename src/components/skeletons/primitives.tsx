import React from "react";
import { PANEL, STAT_CARD, STAT_CARD_H } from "../ui/surfaces";

/**
 * The boxes every page skeleton is assembled from.
 *
 * Two rules hold the whole system together:
 *
 * 1. **A skeleton box occupies the same space as the thing that replaces it.**
 *    That is the entire point — a placeholder of the wrong size is a layout
 *    shift with extra steps.
 * 2. **One animation for the whole skeleton, not one per box.** The pulse lives
 *    on the page-skeleton root (`SkeletonRoot`) and reaches every box through
 *    inherited opacity. The previous implementation ran an infinite `motion`
 *    tween on each box *and* an `animate-pulse` on the wrapper, so dozens of
 *    JavaScript animations ran on the critical loading path and beat against
 *    the CSS one at a different period.
 *
 * Reduced motion is handled by `motion-safe:`, so a viewer who asks for less
 * movement gets a still grey layout instead of a pulsing one — still
 * unmistakably a placeholder.
 */

const BOX = "bg-gray-200 dark:bg-gray-800 rounded-md";

/**
 * The pulsing wrapper. Every page-level skeleton starts with one of these and
 * nothing nested inside animates on its own.
 */
export const SkeletonRoot: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = "", children }) => {
  return (
    <div className={`motion-safe:animate-pulse ${className}`} aria-hidden="true">
      {children}
    </div>
  );
};

/** A single grey box. Size it with `className`. */
export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => {
  return <div className={`${BOX} ${className}`} />;
};

/** Stacked text lines, the last one short, the way a paragraph ends. */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 2, className = "" }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`${BOX} h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
};

/** A rounded control: a button, a select, a filter pill. */
export const SkeletonPill: React.FC<{ className?: string }> = ({ className = "h-10 w-32" }) => {
  return <div className={`bg-gray-200 dark:bg-gray-800 rounded-xl ${className}`} />;
};

/**
 * A metric tile matching `StatCard`: icon tile, label, value.
 * `withTrend` picks the taller variant used in the trends zone.
 */
export const SkeletonStatCard: React.FC<{ withTrend?: boolean }> = ({ withTrend = false }) => {
  return (
    <div className={`${STAT_CARD} ${withTrend ? STAT_CARD_H.withTrend : STAT_CARD_H.plain}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-800 rounded-2xl shrink-0" />
          <div className={`${BOX} h-3 w-24`} />
        </div>
        <div className={`${BOX} h-5 w-14`} />
      </div>
      <div className="space-y-2">
        <div className={`${BOX} h-7 w-16`} />
        {withTrend && <div className={`${BOX} h-3 w-28`} />}
      </div>
    </div>
  );
};

/** A content panel with a title row and whatever body the caller supplies. */
export const SkeletonPanel: React.FC<{
  title?: boolean;
  className?: string;
  children?: React.ReactNode;
}> = ({ title = true, className = "", children }) => {
  return (
    <div className={`${PANEL} ${className}`}>
      {title && (
        <div className="flex items-center space-x-3 mb-6">
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-800 rounded-2xl shrink-0" />
          <div className="space-y-2">
            <div className={`${BOX} h-6 w-56`} />
            <div className={`${BOX} h-3 w-40`} />
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * List rows. Use this instead of an empty-state string while data is in
 * flight: "No children registered yet" is a statement about loaded data, and
 * saying it before the query answers is how the dashboard came to tell
 * established churches they had nothing.
 */
export const SkeletonRows: React.FC<{ count?: number; rowClassName?: string }> = ({ count = 5, rowClassName = "h-14" }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`bg-gray-100 dark:bg-gray-800/60 rounded-2xl ${rowClassName}`} />
      ))}
    </div>
  );
};

/** A chart well. The real charts are fixed-height, so this matches exactly. */
export const SkeletonChart: React.FC<{ className?: string }> = ({ className = "h-64" }) => {
  return <div className={`bg-gray-100 dark:bg-gray-800/60 rounded-2xl w-full ${className}`} />;
};

/** The icon-tile + title + subtitle row that opens each dashboard zone. */
export const SkeletonSectionHeader: React.FC<{ action?: boolean }> = ({ action = false }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center space-x-3">
        <div className="h-12 w-12 bg-gray-200 dark:bg-gray-800 rounded-2xl shrink-0" />
        <div className="space-y-2">
          <div className={`${BOX} h-7 w-48`} />
          <div className={`${BOX} h-3 w-64`} />
        </div>
      </div>
      {action && <SkeletonPill className="h-10 w-48" />}
    </div>
  );
};
