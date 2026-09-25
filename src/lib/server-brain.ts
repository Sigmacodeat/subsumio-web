import { ENGINE_URL } from "@/lib/engine";
import type { BrainPage, SearchResult } from "@/lib/types";

export interface PageArrayAppendResult {
  slug: string;
  field: string;
  appended: number;
  length: number;
  items: unknown[];
}

export interface PageArrayMutateResult {
  slug: string;
  field: string;
  matched_ids: string[];
  updated_ids: string[];
  skipped_ids: string[];
  not_found_ids: string[];
  items: unknown[];
  length: number;
}

export interface PageArrayMutation {
  match: Array<string | number | boolean>;
  match_key?: string;
  set?: Record<string, unknown>;
  unset?: string[];
  remove?: boolean;
  unless?: { eq?: Record<string, unknown>; ne?: Record<string, unknown> };
}

export interface ServerBrainClient {
  getPage(slug: string): Promise<BrainPage>;
  listPages(options?: {
    limit?: number;
    offset?: number;
    source?: string;
    type?: string;
    tag?: string;
    q?: string;
    cursor?: string;
  }): Promise<BrainPage[]>;
  /**
   * One page of a listPages scan plus the engine's keyset cursor
   * (`x-next-cursor` → `nextCursor`). Paging callers use this so a batch
   * shortened by matter-scope/ACL filters does not look like the end of the
   * list. Optional: callers keep an offset fallback for older engines.
   */
  listPagesPaged?(options?: {
    limit?: number;
    offset?: number;
    source?: string;
    type?: string;
    tag?: string;
    q?: string;
    cursor?: string;
  }): Promise<{ items: BrainPage[]; nextCursor: string | null }>;
  createPage(page: {
    slug: string;
    title: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
    /** Create only: 409 page_exists instead of replacing a stored page. */
    if_absent?: boolean;
  }): Promise<{ slug: string }>;
  updatePage(page: {
    slug: string;
    title?: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  }): Promise<{ slug: string; success?: boolean }>;
  deletePage(slug: string): Promise<{ success?: boolean }>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  /**
   * Atomic append to a top-level frontmatter array field — engine-side
   * single UPDATE, no read-modify-write (lost-update safe).
   */
  appendPageArray(slug: string, field: string, items: unknown[]): Promise<PageArrayAppendResult>;
  /**
   * Atomic patch/remove of frontmatter array elements matched by
   * `match_key` ∈ `match`, with an optional {eq,ne} skip guard.
   */
  mutatePageArray(
    slug: string,
    field: string,
    mutation: PageArrayMutation
  ): Promise<PageArrayMutateResult>;
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

async function engineJson<T>(
  headers: Record<string, string>,
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(options?.headers as Record<string, string> | undefined),
    },
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function listPagesParams(options?: Parameters<ServerBrainClient["listPages"]>[0]): string {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.source) params.set("source", options.source);
  if (options?.type) params.set("type", options.type);
  if (options?.tag) params.set("tag", options.tag);
  if (options?.q) params.set("q", options.q);
  if (options?.cursor) params.set("cursor", options.cursor);
  return params.toString();
}

export function createServerBrainClient(headers: Record<string, string>): ServerBrainClient {
  return {
    getPage(slug) {
      return engineJson<BrainPage>(headers, `/api/pages/${encodeSlug(slug)}`);
    },

    listPages(options) {
      const qs = listPagesParams(options);
      return engineJson<BrainPage[]>(headers, `/api/pages${qs ? `?${qs}` : ""}`);
    },

    async listPagesPaged(options) {
      const qs = listPagesParams(options);
      const res = await fetch(`${ENGINE_URL}/api/pages${qs ? `?${qs}` : ""}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const raw = (await res.json()) as unknown;
      const items = Array.isArray(raw)
        ? raw
        : ((raw as { items?: BrainPage[]; pages?: BrainPage[] })?.items ??
          (raw as { pages?: BrainPage[] })?.pages ??
          []);
      return { items, nextCursor: res.headers.get("x-next-cursor") };
    },

    createPage(page) {
      return engineJson<{ slug: string }>(headers, "/api/pages", {
        method: "POST",
        body: JSON.stringify(page),
      });
    },

    updatePage(page) {
      return engineJson<{ slug: string; success?: boolean }>(headers, "/api/pages", {
        method: "POST",
        body: JSON.stringify({ ...page, merge: true }),
      });
    },

    deletePage(slug) {
      // Soft-delete by tombstoning via the merge-update POST (same path
      // updatePage uses). The engine's DELETE /api/pages/{slug} would set
      // deleted_at instead; callers of this client rely on the tombstone.
      return engineJson<{ success?: boolean }>(headers, "/api/pages", {
        method: "POST",
        body: JSON.stringify({
          slug,
          frontmatter: {
            status: "tombstoned",
            tombstoned_at: new Date().toISOString(),
            tombstone_reason: "manual_delete",
          },
          merge: true,
        }),
      });
    },

    search(query, limit = 10) {
      return engineJson<SearchResult[]>(
        headers,
        `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
    },

    appendPageArray(slug, field, items) {
      return engineJson<PageArrayAppendResult>(headers, "/api/pages/array-append", {
        method: "POST",
        body: JSON.stringify({ slug, field, items }),
      });
    },

    mutatePageArray(slug, field, mutation) {
      return engineJson<PageArrayMutateResult>(headers, "/api/pages/array-mutate", {
        method: "POST",
        body: JSON.stringify({ slug, field, ...mutation }),
      });
    },
  };
}
