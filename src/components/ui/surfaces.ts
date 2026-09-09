/**
 * The card-shaped surfaces the app draws on.
 *
 * These exist so a real component and its skeleton cannot drift apart. A
 * skeleton is a second copy of a layout, and the copy rots the moment someone
 * changes a padding or a radius in one place only. Import the constant in both
 * and that stops being possible.
 *
 * Only add a constant here when at least two files need the same surface —
 * this is not a place to collect every class string in the app.
 */

/** Full-width content panel: the "Historical Analysis" or "Recent Activity" box. */
export const PANEL =
  "bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800";

/**
 * A metric tile. Its rendered height varies with the optional `sub` and `trend`
 * lines — measured at 141px, 147px and 165px on the live dashboard — and a grid
 * row stretches every card to the tallest in that row. The skeleton therefore
 * pins a height per zone rather than the real card pinning a floor: matching
 * the app to the placeholder would change production layout, which is the wrong
 * way round.
 */
export const STAT_CARD =
  "bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-3";

/** Measured heights of a stat card, by whether it carries a trend line. */
export const STAT_CARD_H = {
  /** Label + value only — Zone A and Zone C. */
  plain: "min-h-[141px]",
  /** Label + value + trend or sub line — Zone B. */
  withTrend: "min-h-[165px]",
} as const;
