import React from "react";
import {
  Skeleton,
  SkeletonChart,
  SkeletonPanel,
  SkeletonPill,
  SkeletonRoot,
  SkeletonRows,
  SkeletonSectionHeader,
  SkeletonStatCard,
} from "./primitives";

/**
 * The admin dashboard, section for section, before its data arrives.
 *
 * The grids, gaps and spacing here mirror `AdminDashboard`'s real tree rather
 * than approximating it: same `space-y-12` root, same `md:grid-cols-2
 * lg:grid-cols-4` stat rows, same fixed `h-64`/`h-72` chart wells. The old
 * shared `DashboardSkeleton` used `space-y-8` and a four-card-plus-two-panel
 * shape that matched no page in the app, so swapping it for content was itself
 * a jump.
 *
 * Where a section's height depends on how much data a church has — the
 * activity feeds, the directory, the room and user lists — the skeleton shows a
 * plausible number of rows. Those cannot match every tenant exactly; what
 * matters is that they are replaced in one step rather than growing in front of
 * the reader.
 */
export function AdminDashboardSkeleton() {
  return (
    <SkeletonRoot className="space-y-12 pb-24">
      {/* Control-center header: title block left, action cluster right. */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonPill className="h-10 w-36" />
          <SkeletonPill className="h-10 w-36" />
          <SkeletonPill className="h-10 w-24" />
          <SkeletonPill className="h-10 w-40" />
        </div>
      </header>

      {/* Zone A — right now. */}
      <section className="space-y-6">
        <SkeletonSectionHeader />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <SkeletonPanel>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </section>

      {/* Zone B — trends over time, with the 7/30/90 selector. */}
      <section className="space-y-8">
        <SkeletonSectionHeader action />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} withTrend />
          ))}
        </div>
        <SkeletonPanel>
          <SkeletonChart className="h-64" />
        </SkeletonPanel>
        <SkeletonPanel>
          <SkeletonChart className="h-72" />
        </SkeletonPanel>
      </section>

      {/* Zone C — church totals. */}
      <section className="space-y-6">
        <SkeletonSectionHeader />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      </section>

      {/* Report generation, historical analysis, volunteer + recent activity. */}
      <SkeletonPanel>
        <div className="flex flex-wrap gap-3">
          <SkeletonPill className="h-10 w-44" />
          <SkeletonPill className="h-10 w-44" />
          <SkeletonPill className="h-10 w-32" />
        </div>
      </SkeletonPanel>

      <SkeletonPanel>
        <div className="flex flex-wrap gap-3 mb-6">
          <SkeletonPill className="h-10 w-40" />
          <SkeletonPill className="h-10 w-40" />
        </div>
        <SkeletonRows count={4} />
      </SkeletonPanel>

      <SkeletonPanel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </SkeletonPanel>

      <SkeletonPanel>
        <SkeletonRows count={5} />
      </SkeletonPanel>

      {/* Subscription and security. */}
      <SkeletonPanel>
        <SkeletonRows count={3} rowClassName="h-20" />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonRows count={3} />
      </SkeletonPanel>

      {/* Children directory. */}
      <SkeletonPanel>
        <SkeletonPill className="h-11 w-full mb-6" />
        <SkeletonRows count={6} />
      </SkeletonPanel>

      {/* Room management + user management. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SkeletonPanel>
          <SkeletonRows count={4} />
        </SkeletonPanel>
        <SkeletonPanel>
          <SkeletonRows count={4} />
        </SkeletonPanel>
      </div>
    </SkeletonRoot>
  );
}

export default AdminDashboardSkeleton;
