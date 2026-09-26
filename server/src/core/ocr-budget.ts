/**
 * Daily OCR page budget per firm (tenant source).
 *
 * Every scanned upload sends up to GBRAIN_OCR_MAX_PAGES pages to a vision
 * model at the operator's cost. Without a per-firm bound, a mass import of
 * scanned files had no ceiling. The extraction of an upload runs inside
 * `withOcrOwner(tenant, …)`; the PDF OCR fallback asks `reserveOcrPages` how
 * many pages it may still process today. Pages over the budget are left
 * unread and reported like the per-document page cap ("teilweise gelesen",
 * OCR owed), never silently dropped.
 *
 * GBRAIN_OCR_DAILY_PAGES_PER_FIRM (default 2000; 0 = unlimited). The counter
 * is per engine process and resets at midnight UTC or on restart — a cost
 * guard, not billing.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const owner = new AsyncLocalStorage<{ key: string }>();
const usage = new Map<string, { day: string; pages: number }>();

export function ocrDailyPageCap(): number {
  const raw = Number(process.env.GBRAIN_OCR_DAILY_PAGES_PER_FIRM);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 2000;
}

/** Run an extraction with its firm known to the OCR budget. */
export function withOcrOwner<T>(key: string | undefined, fn: () => Promise<T>): Promise<T> {
  return key ? owner.run({ key }, fn) : fn();
}

/**
 * Reserve up to `requested` OCR pages for the current firm today; returns
 * how many were granted. Without a firm context (CLI, maintenance jobs) or
 * with the cap disabled, everything is granted.
 */
export function reserveOcrPages(requested: number, now: Date = new Date()): number {
  const cap = ocrDailyPageCap();
  const key = owner.getStore()?.key;
  if (!key || cap === 0 || requested <= 0) return Math.max(0, requested);
  const day = now.toISOString().slice(0, 10);
  const cur = usage.get(key);
  const used = cur && cur.day === day ? cur.pages : 0;
  const granted = Math.max(0, Math.min(requested, cap - used));
  usage.set(key, { day, pages: used + granted });
  return granted;
}

/** Tests only. */
export function _resetOcrBudget(): void {
  usage.clear();
}
