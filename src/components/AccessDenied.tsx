import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

/**
 * Shown when a signed-in account genuinely lacks the role a page requires.
 *
 * Two rules for callers, both learned from the bug this replaced:
 *
 * 1. **Only render this once authentication has settled.** `roles` starts empty,
 *    so a check that runs before the user document arrives denies everybody for
 *    the first few frames. Every dashboard used to flash a bare "Access denied"
 *    line on its way to rendering normally.
 * 2. **Test role membership, not `role`.** `role` is `roles[0]`, so comparing it
 *    permanently denied accounts that hold several roles — a volunteer who is
 *    also an admin could not open the admin dashboard at all.
 *
 * Styled after the "Church Not Found" state in App.tsx, which is the house
 * pattern for a whole-page dead end.
 */
export function AccessDenied({ requirement }: { requirement: string }) {
  /* /profile is itself behind ProtectedRoute, so an account holding no roles
     is denied there too -- and a "Go to your profile" link on that page is a
     dead end pointing at itself. Offer the way out that still works. */
  const location = useLocation();
  const onProfile = location.pathname === "/profile";

  return (
    <div className="p-12 text-center space-y-4">
      <div className="h-20 w-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
        <ShieldAlert className="h-10 w-10 text-red-600 dark:text-red-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Access denied</h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        This page needs {requirement} permissions, which your account doesn't have. If you
        think that's wrong, your church administrator can check your role.
      </p>
      <Link to={onProfile ? "/" : "/profile"} className="inline-block text-primary font-bold hover:underline">
        {onProfile ? "Go to GuardianCheck Home" : "Go to your profile"}
      </Link>
    </div>
  );
}

export default AccessDenied;
