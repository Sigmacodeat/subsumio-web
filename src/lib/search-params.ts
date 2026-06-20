/**
 * Pure search param helpers — route-agnostic and testable.
 */

export const LEGAL_BOOST = "statute:1.5,deadline:2.0,judgement:1.3,norm:1.4";

export const ALLOWED_TYPES = new Set([
  "statute", "deadline", "judgement", "norm", "case", "contract",
  "contact", "task", "note", "document", "correspondence",
]);

export function sanitizeTypeFilter(raw: string): string {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALLOWED_TYPES.has(t))
    .join(",");
}

export function buildSearchParams(q: string, limit: string, typeFilter: string): URLSearchParams {
  const params = new URLSearchParams({ q, limit, boost_types: LEGAL_BOOST });
  if (typeFilter) params.set("type", typeFilter);
  return params;
}
