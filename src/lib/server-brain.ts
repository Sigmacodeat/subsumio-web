import { ENGINE_URL } from "@/lib/engine";
import type { BrainPage, SearchResult } from "@/lib/types";

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
  createPage(page: {
    slug: string;
    title: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
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

export function createServerBrainClient(headers: Record<string, string>): ServerBrainClient {
  return {
    getPage(slug) {
      return engineJson<BrainPage>(headers, `/api/pages/${encodeSlug(slug)}`);
    },

    listPages(options) {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.source) params.set("source", options.source);
      if (options?.type) params.set("type", options.type);
      if (options?.tag) params.set("tag", options.tag);
      if (options?.q) params.set("q", options.q);
      if (options?.cursor) params.set("cursor", options.cursor);
      const qs = params.toString();
      return engineJson<BrainPage[]>(headers, `/api/pages${qs ? `?${qs}` : ""}`);
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
      return engineJson<{ success?: boolean }>(headers, `/api/pages/${encodeSlug(slug)}`, {
        method: "DELETE",
      });
    },

    search(query, limit = 10) {
      return engineJson<SearchResult[]>(
        headers,
        `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
    },
  };
}
