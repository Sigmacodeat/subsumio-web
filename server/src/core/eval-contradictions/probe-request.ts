/**
 * Validates the body of `POST /api/admin/contradiction-probe` and turns it
 * into CLI arguments for the probe. A request without a query source is
 * refused here (400) instead of reaching the probe command.
 *
 * Every HTTP run is bound to the calling firm's source (`--source`, set by
 * the route, never taken from the body) and its budget is capped by what the
 * firm has left of its daily probe budget.
 */

export type ProbeRequestResult = { args: string[]; budgetUsd: number } | { error: string };

const DOC_TYPE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Per-run ceiling a request may ask for. */
export const PROBE_RUN_MAX_BUDGET_USD = 5;
/** What one firm may spend on probe runs per rolling 24 h (env override). */
export const PROBE_DAILY_BUDGET_DEFAULT_USD = 2;

/** The per-firm daily probe budget: `CONTRADICTION_PROBE_DAILY_BUDGET_USD`, else 2 USD. */
export function probeDailyBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.CONTRADICTION_PROBE_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : PROBE_DAILY_BUDGET_DEFAULT_USD;
}

function boundedNumber(v: unknown, fallback: number, min: number, max: number): number | null {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

export interface ProbeRequestScope {
  /** The firm source the run is bound to. */
  sourceId?: string;
  /** Remaining budget for this run (daily firm budget minus today's spend). */
  maxBudgetUsd?: number;
}

export function parseContradictionProbeBody(
  body: unknown,
  scope: ProbeRequestScope = {}
): ProbeRequestResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const docType = typeof b.doc_type === "string" ? b.doc_type.trim() : "";
  const query = typeof b.query === "string" ? b.query.trim() : "";
  const hasRecent = b.recent_hours !== undefined && b.recent_hours !== null;

  const sources = [docType, query, hasRecent].filter(Boolean).length;
  if (sources === 0) return { error: "doc_type_or_query_required" };
  if (sources > 1) return { error: "doc_type_and_query_exclusive" };
  if (docType && !DOC_TYPE_RE.test(docType)) return { error: "invalid_doc_type" };
  if (query.length > 500) return { error: "query_too_long" };
  const recentHours = hasRecent ? boundedNumber(b.recent_hours, 24, 1, 168) : null;
  if (hasRecent && (recentHours === null || !Number.isInteger(recentHours))) {
    return { error: "invalid_recent_hours" };
  }

  const requested = boundedNumber(b.budget_usd, 0.5, 0.01, PROBE_RUN_MAX_BUDGET_USD);
  const topK = boundedNumber(b.top_k, 5, 1, 20);
  const limit = boundedNumber(b.limit, 20, 1, 100);
  if (requested === null) return { error: "invalid_budget_usd" };
  if (topK === null || !Number.isInteger(topK)) return { error: "invalid_top_k" };
  if (limit === null || !Number.isInteger(limit)) return { error: "invalid_limit" };
  const budget =
    typeof scope.maxBudgetUsd === "number"
      ? Math.min(requested, Math.max(0, scope.maxBudgetUsd))
      : requested;
  if (budget < 0.01) return { error: "probe_budget_exhausted" };

  const args = [
    "run",
    "--json",
    "--yes",
    "--budget-usd",
    String(Math.round(budget * 100) / 100),
    "--top-k",
    String(topK),
    "--limit",
    String(limit),
  ];
  if (scope.sourceId) args.push("--source", scope.sourceId);
  if (docType) args.push("--doc-type", docType);
  else if (query) args.push("--query", query);
  else args.push("--recent-hours", String(recentHours));
  return { args, budgetUsd: budget };
}
