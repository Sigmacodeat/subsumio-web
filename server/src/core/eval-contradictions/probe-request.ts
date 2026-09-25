/**
 * Validates the body of `POST /api/admin/contradiction-probe` and turns it
 * into CLI arguments for the probe. A request without a query source is
 * refused here (400) instead of reaching the probe command.
 */

export type ProbeRequestResult = { args: string[] } | { error: string };

const DOC_TYPE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function boundedNumber(v: unknown, fallback: number, min: number, max: number): number | null {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

export function parseContradictionProbeBody(body: unknown): ProbeRequestResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const docType = typeof b.doc_type === "string" ? b.doc_type.trim() : "";
  const query = typeof b.query === "string" ? b.query.trim() : "";

  if (!docType && !query) return { error: "doc_type_or_query_required" };
  if (docType && query) return { error: "doc_type_and_query_exclusive" };
  if (docType && !DOC_TYPE_RE.test(docType)) return { error: "invalid_doc_type" };
  if (query.length > 500) return { error: "query_too_long" };

  const budget = boundedNumber(b.budget_usd, 0.5, 0.01, 5);
  const topK = boundedNumber(b.top_k, 5, 1, 20);
  const limit = boundedNumber(b.limit, 20, 1, 100);
  if (budget === null) return { error: "invalid_budget_usd" };
  if (topK === null || !Number.isInteger(topK)) return { error: "invalid_top_k" };
  if (limit === null || !Number.isInteger(limit)) return { error: "invalid_limit" };

  const args = [
    "run",
    "--json",
    "--yes",
    "--budget-usd",
    String(budget),
    "--top-k",
    String(topK),
    "--limit",
    String(limit),
  ];
  if (docType) args.push("--doc-type", docType);
  else args.push("--query", query);
  return { args };
}
