/**
 * Value of a time entry — client-safe (no server imports), shared by the
 * time summaries, the budget, the matter billing tab and the invoice dialog.
 */

/** Fixed amount of a Tarifleistung (RATG/AHK), or null for an hourly entry. */
export function tariffAmountOf(entry: { tariff?: unknown }): number | null {
  const t = entry.tariff as { amount?: unknown } | undefined;
  const amount = typeof t?.amount === "number" ? t.amount : NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * The tariff amount for a Tarifleistung, else minutes × rate. `minutes` of a
 * Tarifleistung is the time spent, never billed by the hour.
 */
export function timeEntryValue(
  entry: { minutes?: number; tariff?: unknown },
  rate: number
): number {
  const tariff = tariffAmountOf(entry);
  if (tariff !== null) return tariff;
  return ((entry.minutes || 0) / 60) * rate;
}
