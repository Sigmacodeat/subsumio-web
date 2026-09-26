import "server-only";

import { ENGINE_URL } from "@/lib/engine";
import type { BrainPage } from "@/lib/types";
import type { ActImportItem } from "@/lib/act-import";

export async function fetchActImportItems(
  headers: Record<string, string>,
  sessionId: string,
  options: { offset?: number; limit?: number } = {}
): Promise<ActImportItem[]> {
  const params = new URLSearchParams({
    type: "act_import_item",
    slug_prefix: `act-import-items/${sessionId}/`,
    offset: String(options.offset ?? 0),
    limit: String(Math.min(options.limit ?? 100, 200)),
  });
  const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`act_import_items_failed:${response.status}`);
  const pages = (await response.json()) as BrainPage[];
  return pages.map((page) => page.frontmatter as unknown as ActImportItem);
}

export async function fetchAllActImportItems(
  headers: Record<string, string>,
  sessionId: string
): Promise<ActImportItem[]> {
  const all: ActImportItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const batch = await fetchActImportItems(headers, sessionId, { offset, limit: 100 });
    all.push(...batch);
    if (batch.length < 100) return all;
    if (all.length > 10_000) throw new Error("act_import_manifest_too_large");
  }
}

export async function fetchEnginePage(
  headers: Record<string, string>,
  slug: string
): Promise<BrainPage | null> {
  const path = slug.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`engine_page_failed:${response.status}`);
  return (await response.json()) as BrainPage;
}

/**
 * Every document of an import must belong to the import's matter and be
 * readable for the caller (the engine answers with the caller's rights: an
 * unreadable page is "missing"). Returns the first slug that fails.
 */
export async function findForeignDocument(
  headers: Record<string, string>,
  slugs: readonly string[],
  caseSlug: string
): Promise<string | null> {
  const unique = [...new Set(slugs.filter(Boolean))];
  const CONCURRENCY = 8;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (slug) => {
        const page = await fetchEnginePage(headers, slug).catch(() => null);
        const owner = page?.frontmatter?.case_slug;
        return page && owner === caseSlug ? null : slug;
      })
    );
    const bad = results.find((r) => r !== null);
    if (bad) return bad;
  }
  return null;
}

/**
 * Create-only lock for one finalize attempt of an import session: of two
 * concurrent finalize calls only one gets "claimed" (the engine's create-only
 * insert decides), the other "taken". `attempt` comes from the session and
 * is advanced after every attempt, so a later finalize gets a fresh lock.
 */
export async function claimFinalizeLock(
  headers: Record<string, string>,
  sessionId: string,
  attempt: number,
  actor: string
): Promise<"claimed" | "taken"> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `act-import-locks/${sessionId}/finalize-${attempt}`,
      title: `Finalize-Sperre ${sessionId} #${attempt}`,
      type: "act_import_lock",
      content: "",
      frontmatter: {
        session_id: sessionId,
        attempt,
        claimed_by: actor,
        claimed_at: new Date().toISOString(),
      },
      if_absent: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return "claimed";
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (res.status === 409 && body?.error === "page_exists") return "taken";
  throw new Error(`finalize_lock_failed:${res.status}`);
}
