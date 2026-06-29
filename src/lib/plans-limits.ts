import type { Plan } from "@/lib/auth/store";

export interface PlanLimits {
  pages: number;
  queriesPerMonth: number;
  seats: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { pages: 200, queriesPerMonth: 100, seats: 1 },
  pro: { pages: 50_000, queriesPerMonth: 1_000, seats: 1 },
  team: { pages: 200_000, queriesPerMonth: 4_000, seats: 5 },
  enterprise: { pages: 1_000_000, queriesPerMonth: 15_000, seats: 25 },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}
