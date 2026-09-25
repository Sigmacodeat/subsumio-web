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
    // Cursor-paginated: a single request returns at most 100 cases, and a
    // firm with a hold beyond that cap would wrongly report "clear".
    const held: string[] = [];
    let cursor: string | undefined;
    let iterations = 0;
    for (;;) {
      if (++iterations > 1000) return { status: "unknown" };
      const pageParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetchImpl(`${ENGINE_URL}/api/pages?type=legal_case&limit=100${pageParam}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { status: "unknown" };
      const raw = (await res.json()) as unknown;
      const pages = (
        Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { pages?: unknown[] })?.pages)
            ? (raw as { pages: unknown[] }).pages
            : []
      ) as Array<{ slug: string; frontmatter?: Record<string, unknown> }>;
      for (const p of pages) {
        if (p.frontmatter?.legal_hold === true) held.push(p.slug);
      }
      const next = res.headers.get("x-next-cursor");
      if (next && next !== cursor) {
        cursor = next;
        continue;
      }
      // Fallback for engines without the cursor header: a full batch means
      // the list may continue — answer "unknown" rather than a false "clear".
      if (!next && pages.length === 100) return { status: "unknown" };
      break;
    }
    return held.length > 0 ? { status: "held", cases: held } : { status: "clear" };
  } catch {
    return { status: "unknown" };
  }
}
