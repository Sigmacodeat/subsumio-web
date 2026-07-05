/**
 * Honorarvereinbarungen & Budget-Alerts
 * ======================================
 * Per-case fee model (RVG / hourly / flat / capped) with budget tracking.
 * At 80% budget consumption → warning in rundown + insights.
 */

export type FeeModelType = "rvg" | "hourly" | "flat" | "capped";

export interface FeeAgreement {
  id: string;
  case_slug: string;
  model: FeeModelType;
  hourly_rate?: number;
  flat_amount?: number;
  budget_cap?: number;
  rvg_area?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetStatus {
  case_slug: string;
  model: FeeModelType;
  budget_cap?: number;
  billed_amount: number;
  tracked_minutes: number;
  tracked_value: number;
  total_value: number;
  utilization: number;
  alert_level: "none" | "warning" | "critical";
}

export function createFeeAgreement(input: {
  case_slug: string;
  model: FeeModelType;
  hourly_rate?: number;
  flat_amount?: number;
  budget_cap?: number;
  rvg_area?: string;
  notes?: string;
}): FeeAgreement {
  const now = new Date().toISOString();
  return {
    id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    model: input.model,
    hourly_rate: input.hourly_rate,
    flat_amount: input.flat_amount,
    budget_cap: input.budget_cap,
    rvg_area: input.rvg_area,
    notes: input.notes,
    created_at: now,
    updated_at: now,
  };
}

export function computeBudgetStatus(
  agreement: FeeAgreement,
  tracked: { minutes: number; hourlyRate?: number; billedAmount: number }
): BudgetStatus {
  const trackedValue =
    tracked.minutes > 0
      ? (tracked.hourlyRate ?? agreement.hourly_rate ?? 0) * (tracked.minutes / 60)
      : 0;

  const totalValue =
    agreement.model === "flat" ? (agreement.flat_amount ?? 0) : trackedValue + tracked.billedAmount;

  const budgetCap =
    agreement.budget_cap ?? (agreement.model === "flat" ? agreement.flat_amount : undefined);

  const utilization = budgetCap && budgetCap > 0 ? totalValue / budgetCap : 0;

  let alertLevel: BudgetStatus["alert_level"] = "none";
  if (budgetCap && budgetCap > 0) {
    if (utilization >= 0.8) alertLevel = "warning";
    if (utilization >= 1.0) alertLevel = "critical";
  }

  return {
    case_slug: agreement.case_slug,
    model: agreement.model,
    budget_cap: budgetCap,
    billed_amount: tracked.billedAmount,
    tracked_minutes: tracked.minutes,
    tracked_value: trackedValue,
    total_value: totalValue,
    utilization,
    alert_level: alertLevel,
  };
}

export const FEE_MODEL_LABELS: Record<FeeModelType, { de: string; en: string }> = {
  rvg: { de: "RVG", en: "RVG (Statutory)" },
  hourly: { de: "Stundensatz", en: "Hourly Rate" },
  flat: { de: "Pauschale", en: "Flat Fee" },
  capped: { de: "Deckelung", en: "Capped Budget" },
};
