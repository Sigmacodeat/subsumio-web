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
