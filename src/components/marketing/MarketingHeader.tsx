import React from "react";
import { Link } from "react-router-dom";
import { Shield, Menu, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { NAV_ANCHORS, DEMO_MESSAGE } from "../../constants/marketing";
import { COMPANY } from "../../constants/company";
import { whatsappUrl } from "../../lib/whatsapp";
import { setMarketingMobileMenuOpen } from "../../lib/marketingMobileMenu";

/**
 * Header for the marketing tree (`/`, `/about`, `/contact`, the legal pages).
 * Distinct from `Navigation` in App.tsx, which is written for signed-in
 * dashboard users — this speaks to a visitor deciding whether to sign up.
 *
 * Must not import anything from `pages/` or read Firestore beyond what
 * `useAuth` already exposes: see the marketing/app code boundary in
 * docs/marketing-redesign-plan.md §2.
 */
export function MarketingHeader() {
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const signedIn = !loading && !!user;
  const demoHref = whatsappUrl(COMPANY.whatsapp, DEMO_MESSAGE);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  React.useEffect(() => {
    setMarketingMobileMenuOpen(menuOpen);
    return () => setMarketingMobileMenuOpen(false);
  }, [menuOpen]);

  const linkClass =
    "text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary/80 transition-colors";
  const ghostBtnClass =
    "border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold hover:border-primary dark:hover:border-primary/50 hover:text-primary dark:hover:text-primary/80 transition-colors";
  const primaryBtnClass =
    "bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors";

  return (
    <header className="sticky top-0 z-50 bg-canvas/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200/70 dark:border-gray-800 transition-colors">
      {/* First focusable element on the page, visible only once focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-primary focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
      >
        Skip to content
      </a>

      <nav aria-label="Primary" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-ink dark:text-white tracking-tight">GuardianCheck</span>
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {NAV_ANCHORS.map((item) => (
              <a key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            {signedIn ? (
              <Link to="/app" className={primaryBtnClass}>
                Open GuardianCheck
              </Link>
            ) : (
              <>
                <Link to="/login" className={linkClass}>
                  Log in
                </Link>
                <a href={demoHref} target="_blank" rel="noopener noreferrer" className={ghostBtnClass}>
                  Book a demo
                </a>
                <Link to="/register-church" className={primaryBtnClass}>
                  Start free trial
                </Link>
              </>
            )}
          </div>

          <div className="flex lg:hidden items-center gap-2 shrink-0">
            {signedIn ? (
              <Link to="/app" className={`${primaryBtnClass} !px-3 !py-1.5 !text-xs`}>
                Open app
              </Link>
            ) : (
              <Link to="/register-church" className={`${primaryBtnClass} !px-3 !py-1.5 !text-xs`}>
                Start free trial
              </Link>
            )}
            <button
              ref={menuButtonRef}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="marketing-mobile-nav"
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div
          id="marketing-mobile-nav"
          className="lg:hidden border-t border-gray-200/70 dark:border-gray-800 px-4 py-4 space-y-1 bg-canvas dark:bg-gray-950"
        >
          {NAV_ANCHORS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {item.label}
            </a>
          ))}
          <div className="pt-2 space-y-2">
            {!signedIn && (
              <>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Log in
                </Link>
                <a
                  href={demoHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="block text-center border border-gray-200 dark:border-gray-700 px-3 py-3 rounded-lg text-sm font-semibold text-gray-800 dark:text-gray-200"
                >
                  Book a demo
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
