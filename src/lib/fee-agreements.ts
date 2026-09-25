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

export interface BudgetEntryLike {
  minutes?: number;
  rate?: number;
  billable?: boolean;
  billed?: boolean;
}

/**
 * Budget inputs of a matter from its time entries — ONE rule for the budget
 * widget and the fee-agreement page. Every billable entry counts exactly
 * once: billed ones as `billedAmount`, open ones as `minutes`/`trackedValue`
 * (each at its own rate, else the agreement's).
 */
export function budgetInputsFromEntries(
  entries: BudgetEntryLike[],
  defaultRate?: number
): { minutes: number; trackedValue: number; billedAmount: number } {
  let minutes = 0;
  let trackedCents = 0;
  let billedCents = 0;
  for (const e of entries) {
    if (e.billable === false) continue;
    const m = Number(e.minutes) || 0;
    const cents = Math.round((m / 60) * (Number(e.rate) || defaultRate || 0) * 100);
    if (e.billed === true) {
      billedCents += cents;
    } else {
      minutes += m;
      trackedCents += cents;
    }
  }
  return { minutes, trackedValue: trackedCents / 100, billedAmount: billedCents / 100 };
}

export function computeBudgetStatus(
  agreement: FeeAgreement,
  tracked: { minutes: number; hourlyRate?: number; billedAmount: number; trackedValue?: number }
): BudgetStatus {
  const trackedValue =
    tracked.trackedValue ??
    (tracked.minutes > 0
      ? (tracked.hourlyRate ?? agreement.hourly_rate ?? 0) * (tracked.minutes / 60)
      : 0);

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
  rvg: { de: "Tarif (RATG/AHK)", en: "Statutory tariff (RATG/AHK)" },
  hourly: { de: "Stundensatz", en: "Hourly Rate" },
  flat: { de: "Pauschale", en: "Flat Fee" },
  capped: { de: "Deckelung", en: "Capped Budget" },
};
