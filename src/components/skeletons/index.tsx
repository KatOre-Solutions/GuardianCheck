/**
 * Skeleton loading, and the rule for using it consistently.
 *
 * ## When to use what
 *
 * 1. **A page or route is loading** → a skeleton shaped like the page that is
 *    coming. Never a bare centred spinner for a whole page.
 * 2. **A section inside an already-rendered page is still loading** → a section
 *    skeleton occupying the same box its content will occupy.
 * 3. **A list or table inside a loaded page** → skeleton rows. Never an
 *    empty-state string: "No children registered yet" is a statement about
 *    loaded data, and saying it before the query answers is how this dashboard
 *    came to tell established churches they had nothing set up.
 * 4. **An action the user just triggered** — submit, upload, export, regenerate
 *    a PIN → the inline spinner in or beside the control, unchanged. A skeleton
 *    means "content is arriving"; a spinner means "your action is running".
 *    They are not interchangeable.
 * 5. **A wait whose outcome is a redirect rather than content**, carrying an
 *    explicit label → a full-screen spinner is right. Two places qualify:
 *    Login's "Authenticating…" and AcceptInvite's "Validating invitation…".
 *
 * **Loading, empty and error are three different states and must never share a
 * rendering.** A component that takes its data as props takes a `loading` prop
 * alongside it, because it cannot tell an empty array from an unanswered query.
 *
 * ## Route continuity
 *
 * The gates on an authenticated route render before the page mounts, so they
 * have to show the same placeholder the page will. `getRouteSkeleton` is what
 * lets them: the tenant layout cannot see which child route is about to render,
 * so it resolves the skeleton from the path instead — the same path-shape
 * technique `constants/appRoutes.ts` uses for the edge. Both pending phases
 * then draw the same pixels and the handover changes nothing on screen.
 */

import React from "react";
import { AdminDashboardSkeleton } from "./AdminDashboardSkeleton";
import { FormPageSkeleton, PageSkeleton } from "./PageSkeleton";
import { ParentDashboardSkeleton, VolunteerDashboardSkeleton } from "./DashboardSkeletons";

export * from "./primitives";
export { AdminDashboardSkeleton } from "./AdminDashboardSkeleton";
export { PageSkeleton, FormPageSkeleton } from "./PageSkeleton";
export { VolunteerDashboardSkeleton, ParentDashboardSkeleton } from "./DashboardSkeletons";

/**
 * The skeleton a path will resolve into.
 *
 * Matches on the shape of the route, not on a router match, because this app
 * uses a declarative `<Routes>` tree rather than a data router — `useMatches()`
 * would mean migrating the router, which is far more than this needs.
 */
export function getRouteSkeleton(pathname: string): React.ReactElement {
  const parts = pathname.split("/").filter(Boolean);
  // `/:churchSlug/admin` and `/admin` both key on what follows the tenant.
  const leaf = parts.length >= 2 ? parts.slice(1).join("/") : parts[0] || "";

  switch (leaf) {
    case "admin":
      return <AdminDashboardSkeleton />;
    case "volunteer":
      return <VolunteerDashboardSkeleton />;
    case "parent":
      return <ParentDashboardSkeleton />;
    case "admin/settings":
    case "profile":
    case "complete-profile":
      return <FormPageSkeleton />;
    default:
      return <PageSkeleton />;
  }
}
