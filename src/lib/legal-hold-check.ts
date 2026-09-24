/**
 * Shared legal-hold check for a firm (brain): are any of its matters flagged
 * `legal_hold: true`? Used everywhere a deletion of personal or case data
 * must be blocked while a hold is active — the initial soft-delete request
 * (admin/data-delete) and the automatic hard-delete purge 30 days later
 * (cron/trash-purge) both call this SAME function, so the two stages of one
 * deletion cannot silently diverge (e.g. a hold placed during the grace
 * window would otherwise stop the first check but not the second).
 *
 * Fail-closed: an unreachable or erroring engine returns "unknown", which
 * every caller must treat the same as "held" — a deletion never proceeds
 * on unproven ground.
 */

import { ENGINE_URL } from "./engine";

export type LegalHoldCheckResult =
  | { status: "clear" }
  | { status: "held"; cases: string[] }
  | { status: "unknown" };

export async function checkFirmLegalHolds(
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<LegalHoldCheckResult> {
  try {
    const res = await fetchImpl(`${ENGINE_URL}/api/pages?type=legal_case&limit=500`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { status: "unknown" };
    const pages = (await res.json()) as Array<{
      slug: string;
      frontmatter?: Record<string, unknown>;
    }>;
    const held = pages.filter((p) => p.frontmatter?.legal_hold === true).map((p) => p.slug);
    return held.length > 0 ? { status: "held", cases: held } : { status: "clear" };
  } catch {
    return { status: "unknown" };
  }
}
