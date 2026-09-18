import { useEffect, useState } from "react";
import { getChurchAccess, toDate, type ChurchAccess } from "../lib/churchAccess";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `getChurchAccess` for a church document the component already holds, kept
 * current while the page stays open.
 *
 * A dashboard left open on a volunteer's tablet must flip to the locked state
 * at midnight on its own. Nothing about the document changes at that moment,
 * so without the timer below nothing would re-render.
 *
 * The browser's clock decides only what is shown. The server and the rules
 * decide what is allowed, on their own clocks.
 */
export function useChurchAccess(church: { accessUntil?: unknown } | null | undefined): ChurchAccess {
  const [tick, setTick] = useState(0);
  const accessUntilMs = toDate(church?.accessUntil)?.getTime() ?? null;

  // Deps, rather than none at all: this hook is called by ChurchAccessGate,
  // which wraps every admin route, and by three dashboards that re-render on
  // every live check-in. Without them the timer was torn down and rebuilt on
  // each of those renders, for an instant that had not moved.
  //
  // `tick` belongs in them. It is what the timer sets, so listing it is how a
  // wait longer than a day schedules its next leg: the effect re-runs when the
  // timer fires, and only then.
  useEffect(() => {
    if (accessUntilMs === null) return;
    const wait = accessUntilMs - Date.now();
    if (wait <= 0) return;
    // setTimeout overflows past about 24.8 days, so wake at most daily and let
    // the next run schedule the rest. The extra second lands past the instant.
    const id = setTimeout(() => setTick((t) => t + 1), Math.min(wait + 1000, DAY_MS));
    return () => clearTimeout(id);
  }, [accessUntilMs, tick]);

  return getChurchAccess(church);
}
