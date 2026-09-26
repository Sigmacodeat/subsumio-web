/**
 * Lists the Word add-in offers after connecting: every matter the user can
 * see (paged through the keyset cursor — the page list returns at most 100
 * per call) and the firm's playbooks.
 */

export interface ListedPage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

/** Upper bound of matters read into the dropdowns. */
export const MAX_CASES = 5_000;

export type PageBatch = ListedPage[] | { items?: ListedPage[]; nextCursor?: string | null };

/** Every matter, following the relayed cursor until the list ends. */
export async function listAllCases(
  fetchBatch: (query: string) => Promise<PageBatch>,
  max: number = MAX_CASES
): Promise<ListedPage[]> {
  const out = new Map<string, ListedPage>();
  let cursor: string | null = null;
  for (let i = 0; i < 100 && out.size < max; i++) {
    const q = `type=legal_case&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const raw = await fetchBatch(q);
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    for (const p of items) {
      const status = p.frontmatter?.status;
      if (p?.slug && status !== "tombstoned" && status !== "archived") out.set(p.slug, p);
    }
    const next = Array.isArray(raw) ? null : (raw.nextCursor ?? null);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return [...out.values()]
    .slice(0, max)
    .sort((a, b) => (a.title || a.slug).localeCompare(b.title || b.slug, "de"));
}

/** Playbooks from GET /api/legal/playbooks (`{data: [...]}`; older `{playbooks}`). */
export function playbooksFrom(json: unknown): Array<{ slug: string; title: string }> {
  const obj = (json ?? {}) as { data?: unknown; playbooks?: unknown };
  const list = Array.isArray(json)
    ? json
    : Array.isArray(obj.data)
      ? obj.data
      : Array.isArray(obj.playbooks)
        ? obj.playbooks
        : [];
  return (list as Array<{ slug?: unknown; title?: unknown }>)
    .filter((p) => typeof p?.slug === "string" && p.slug)
    .map((p) => ({
      slug: p.slug as string,
      title: typeof p.title === "string" ? p.title : (p.slug as string),
    }));
}
