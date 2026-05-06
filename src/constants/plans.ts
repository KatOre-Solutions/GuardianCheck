export const PLAN_LIMITS = {
  starter: {
    users: 20,
    children: 50,
    label: "Starter"
  },
  growth: {
    users: 50,
    children: 150,
    label: "Growth"
  },
  professional: {
    users: Infinity,
    children: Infinity,
    label: "Professional"
  }
};

export type PlanTier = keyof typeof PLAN_LIMITS;
