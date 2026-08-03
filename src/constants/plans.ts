/**
 * Subscription tiers.
 *
 * `priceZar` is read by `scripts/generate-llms-txt.ts`, so the pricing an AI
 * engine is told about comes from the same place the app reads.
 *
 * Note: the price is currently *also* written as inline ternaries in
 * `AdminDashboard.tsx`, `ChurchSettings.tsx` and `MasterAdminDashboard.tsx`,
 * and as a separate array in `Home.tsx`. Those predate this constant. Until
 * they are migrated onto it, a price change means editing five places — which
 * is the drift this field exists to start closing, not evidence that it is
 * already closed.
 */

export const PLAN_LIMITS = {
  starter: {
    users: 20,
    children: 50,
    label: "Starter",
    priceZar: 249,
    summary: "Small churches getting started",
  },
  growth: {
    users: 50,
    children: 150,
    label: "Growth",
    priceZar: 499,
    summary: "Growing congregations",
  },
  professional: {
    users: Infinity,
    children: Infinity,
    label: "Professional",
    priceZar: 999,
    summary: "Large churches, unlimited scale",
  },
};

export type PlanTier = keyof typeof PLAN_LIMITS;

/** Free trial granted at registration, in months. Mirrors `server.ts`. */
export const TRIAL_MONTHS = 1;
