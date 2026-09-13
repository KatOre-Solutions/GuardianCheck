/**
 * Boot-waterfall marks: when did each gate between "JS executed" and "the
 * dashboard is on screen" actually open?
 *
 * Resource timing cannot answer that. Firestore reads ride one long-lived
 * WebChannel, so the network panel shows a connection, not which query it was
 * serving or when the page stopped waiting on it. These marks name the gates
 * themselves -- auth, the tenant lookup, the policy check, the route guard --
 * so a before/after comparison measures the thing a change claims to move.
 *
 * Marks are always recorded. `performance.mark` is local, costs nothing
 * measurable, sends nothing anywhere, and shows up in DevTools' Performance
 * panel under Timings. Each name is recorded once per page load: the question
 * is "time to *first* X", and a soft navigation re-running a gate must not
 * overwrite the cold-start number.
 *
 * The console summary is opt-in: load any page with `?perf=1` (remembered in
 * localStorage until `?perf=0`). `window.__gcPerf()` returns the same rows, for
 * reading them from automation.
 */

import { useEffect } from "react";

const PREFIX = "gc:";
const FLAG_KEY = "gc.perf";
const recorded = new Set<string>();

export function markOnce(name: string, detail?: Record<string, unknown>): void {
  if (recorded.has(name)) return;
  recorded.add(name);
  try {
    performance.mark(PREFIX + name, { detail });
  } catch {
    // Very old engines lack the options form. A missing mark is not worth
    // surfacing to anyone.
  }
}

/** Record `name` the first time `ready` is true after a commit. */
export function useMarkWhen(name: string, ready: boolean, detail?: Record<string, unknown>): void {
  useEffect(() => {
    if (ready) markOnce(name, detail);
    // `detail` is descriptive only; re-running on its identity would be noise.
  }, [name, ready]);
}

interface PerfRow {
  name: string;
  ms: number;
  detail: string;
}

function collectRows(latestLcp: PerformanceEntry | null): PerfRow[] {
  const rows: PerfRow[] = [];
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav) rows.push({ name: "ttfb", ms: nav.responseStart, detail: "" });

  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  if (fcp) rows.push({ name: "fcp", ms: fcp.startTime, detail: "" });

  const firestore = performance
    .getEntriesByType("resource")
    .find((entry) => entry.name.includes("firestore.googleapis.com"));
  if (firestore) rows.push({ name: "firestore-first-request", ms: firestore.startTime, detail: "" });

  for (const entry of performance.getEntriesByType("mark")) {
    if (!entry.name.startsWith(PREFIX)) continue;
    const detail = (entry as PerformanceMark).detail;
    rows.push({
      name: entry.name.slice(PREFIX.length),
      ms: entry.startTime,
      detail: detail ? JSON.stringify(detail) : "",
    });
  }

  if (latestLcp) {
    const element = (latestLcp as PerformanceEntry & { element?: Element | null }).element;
    rows.push({
      name: "lcp",
      ms: latestLcp.startTime,
      detail: element ? `<${element.tagName.toLowerCase()}> ${(element.textContent || "").trim().slice(0, 40)}` : "",
    });
  }

  return rows
    .map((row) => ({ ...row, ms: Math.round(row.ms) }))
    .sort((a, b) => a.ms - b.ms);
}

function isEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("perf");
    if (param === "1") localStorage.setItem(FLAG_KEY, "1");
    if (param === "0") localStorage.removeItem(FLAG_KEY);
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function startPerfReport(): void {
  if (typeof window === "undefined" || !isEnabled()) return;

  let latestLcp: PerformanceEntry | null = null;
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      latestLcp = entries[entries.length - 1] ?? latestLcp;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // No LCP support; the gate marks are still reported.
  }

  (window as unknown as { __gcPerf: () => PerfRow[] }).__gcPerf = () => collectRows(latestLcp);

  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    console.table(collectRows(latestLcp));
  };

  // LCP keeps updating until the page settles, so print a few seconds after
  // the dashboard appears -- or when the tab is hidden, whichever comes first.
  new PerformanceObserver((list, observer) => {
    if (list.getEntries().some((entry) => entry.name === `${PREFIX}dashboard-rendered`)) {
      observer.disconnect();
      setTimeout(print, 3000);
    }
  }).observe({ type: "mark", buffered: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") print();
  });
}
