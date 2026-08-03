import { Link } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import { Seo } from "../components/Seo";

/**
 * Catch-all page for URLs that match no route.
 *
 * The server already answered 404 for these paths (see
 * `src/constants/appRoutes.ts`); this is the body that goes with that status.
 * It still renders `<Seo noindex />` rather than relying on the status code
 * alone — a not-found page reached by client-side navigation never touches the
 * server, so the status line is not always there to speak for it.
 */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Seo title="Page not found" noindex />

      <div className="max-w-md w-full text-center space-y-6">
        <div className="h-20 w-20 bg-primary/10 dark:bg-primary/20 rounded-3xl flex items-center justify-center mx-auto">
          <Compass className="h-10 w-10 text-primary" />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">404</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            We couldn't find that page
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            The link may be out of date, or the address may have a typo in it.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center space-x-2 bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all"
        >
          <span>Go to the home page</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
