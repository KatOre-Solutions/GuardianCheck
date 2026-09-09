import React from "react";
import {
  Skeleton,
  SkeletonPanel,
  SkeletonPill,
  SkeletonRoot,
  SkeletonRows,
  SkeletonStatCard,
} from "./primitives";

/**
 * The default placeholder for a page with no skeleton of its own.
 *
 * A header, a row of metrics and a couple of panels — the shape most screens in
 * this app take. It will not match any particular page exactly, which is fine:
 * its job is to be a better answer than a centred spinner for a route the gate
 * cannot identify, not to be pixel-perfect.
 */
export function PageSkeleton() {
  return (
    <SkeletonRoot className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <SkeletonPill className="h-10 w-36" />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      <SkeletonPanel>
        <SkeletonRows count={5} />
      </SkeletonPanel>
    </SkeletonRoot>
  );
}

/**
 * For pages that are a form in a panel — profile, church settings, the
 * onboarding steps.
 */
export function FormPageSkeleton() {
  return (
    <SkeletonRoot className="space-y-8 max-w-3xl mx-auto">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <SkeletonPanel title={false}>
        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <SkeletonPill className="h-11 w-36" />
        </div>
      </SkeletonPanel>
    </SkeletonRoot>
  );
}

export default PageSkeleton;
