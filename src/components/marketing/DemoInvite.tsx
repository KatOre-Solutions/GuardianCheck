import React from "react";
import { X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useMarketingMobileMenuOpen } from "../../lib/marketingMobileMenu";
import { DEMO_MESSAGE } from "../../constants/marketing";
import { COMPANY } from "../../constants/company";
import { whatsappUrl } from "../../lib/whatsapp";

const ENGAGE_DELAY_MS = 25_000;
const SESSION_KEY = "gc.demoInvite.dismissed";
const SNOOZE_KEY = "gc.demoInvite.notNowUntil";
const SNOOZE_DAYS = 7;

function readFlag(storage: Storage, key: string): boolean {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function readSnoozedUntil(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Delayed, dismissible invite to book a human demo. Appears only once a
 * visitor has both spent real time on the page and shown interest by
 * scrolling to pricing. See docs/marketing-redesign-plan.md §7 for the
 * full spec this implements, including why each guard exists.
 *
 * Rendered once, at the end of Home. Not a dialog: it never steals focus,
 * and Escape only dismisses it when focus is already inside.
 */
export function DemoInvite() {
  const { user, loading } = useAuth();
  const mobileMenuOpen = useMarketingMobileMenuOpen();
  const demoHref = whatsappUrl(COMPANY.whatsapp, DEMO_MESSAGE);

  const [timeElapsed, setTimeElapsed] = React.useState(false);
  const [engaged, setEngaged] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(() => readFlag(sessionStorage, SESSION_KEY));
  const [snoozed, setSnoozed] = React.useState(() => readSnoozedUntil() > Date.now());
  const [nearEnd, setNearEnd] = React.useState(false);

  const asideRef = React.useRef<HTMLElement>(null);
  const endSentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setTimeElapsed(true), ENGAGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    const pricing = document.getElementById("pricing");
    if (!pricing) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setEngaged(true);
    });
    observer.observe(pricing);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const sentinel = endSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setNearEnd(entry.isIntersecting), {
      rootMargin: "0px 0px 200px 0px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // `eligible` only ever turns on once per page view. It never flickers
  // back off, so the card mounts exactly once. `shown` layers the transient
  // reasons to step aside (the mobile sheet, the final CTA/footer) on top,
  // as a CSS transition rather than a mount/unmount.
  const eligible = timeElapsed && engaged && !loading && !user && !dismissed && !snoozed;
  const shown = eligible && !mobileMenuOpen && !nearEnd;
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (!shown) {
      setEntered(false);
      return;
    }
    // Mount in the hidden state first, then flip on the next frame so the
    // opacity/transform change is a transition, not an instant appearance.
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  React.useEffect(() => {
    if (!shown) {
      document.body.style.paddingBottom = "";
      return;
    }
    const mql = window.matchMedia("(max-width: 639px)");
    // Recomputed on resize/rotation, not just when `shown` changes: a device
    // rotated (or a desktop window resized) while the card is already open
    // crosses the mobile breakpoint without `shown` itself changing.
    const apply = () => {
      document.body.style.paddingBottom = mql.matches ? "56px" : "";
    };
    apply();
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
      document.body.style.paddingBottom = "";
    };
  }, [shown]);

  React.useEffect(() => {
    if (!eligible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && asideRef.current?.contains(document.activeElement)) {
        dismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Best-effort: without storage this reappears on the next page view.
    }
  }

  function notNow() {
    setSnoozed(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // Best-effort: without storage this reappears on the visitor's next visit.
    }
  }

  return (
    <>
      {eligible && (
        <aside
          ref={asideRef}
          aria-label="Book a demo"
          aria-hidden={!shown}
          inert={!shown ? true : undefined}
          className={`fixed z-40 left-0 right-0 bottom-0 sm:right-auto sm:w-80 sm:m-6 transition-[opacity,transform] duration-[240ms] motion-reduce:transition-opacity motion-reduce:duration-0 ${
            entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
          }`}
        >
          {/* Mobile: 56px bottom bar. */}
          <div className="sm:hidden h-14 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 pb-[env(safe-area-inset-bottom)]">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Want a walkthrough?</span>
            <div className="flex items-center gap-3">
              <a href={demoHref} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary">
                Book a demo &rsaquo;
              </a>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Desktop/tablet: card. */}
          <div className="hidden sm:block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-ink dark:text-white leading-snug">
                See GuardianCheck at your church
              </h3>
              <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="shrink-0 min-h-[44px] min-w-[44px] -m-2 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              A short walkthrough with our team, shaped around how your Sundays run.
            </p>
            <div className="flex items-center gap-4 pt-1">
              <a
                href={demoHref}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Book a demo
              </a>
              <button
                onClick={notNow}
                className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 min-h-[44px]"
              >
                Not now
              </button>
            </div>
          </div>
        </aside>
      )}
      {/* Marks proximity to the final CTA/footer so the invite can step
          aside without needing to know Footer's own layout. */}
      <div ref={endSentinelRef} aria-hidden="true" />
    </>
  );
}
