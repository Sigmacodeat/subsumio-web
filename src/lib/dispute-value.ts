import { parseDisputeValue } from "@/lib/bulk-cases";

/**
 * Streitwert as typed by a lawyer ("12.000", "12.000,50 €", "12000.50") →
 * the stored number. Empty = no Streitwert (cleared). Anything else that is
 * not a non-negative amount is refused — never stored as NaN or 0.
 */
export function disputeValueFromInput(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = parseDisputeValue(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** "12.000,50" for the input field (dot grouping, which the parser reads back; no currency sign). */
export function formatDisputeValueInput(value: number | undefined | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
