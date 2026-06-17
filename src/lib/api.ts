import type {
  AnonymizeResponse,
  BrainPage,
  BrainStats,
  ConflictCheckResponse,
  ConnectorStatus,
  GraphLink,
  GraphNode,
  JudgementsSyncResponse,
  QueryResponse,
  RecentQuery,
  SearchResult,
  TabularReviewResponse,
} from "./types";

// Browser: same-origin Next.js proxy (/api/*). Server: direct engine URL.
const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : process.env.SIGMABRAIN_API_URL ||
      process.env.GBRAIN_API_URL ||
      process.env.NEXT_PUBLIC_SIGMABRAIN_API_URL ||
      process.env.NEXT_PUBLIC_GBRAIN_API_URL ||
      "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  brain: {
    stats(): Promise<BrainStats> {
      return request("/api/stats");
    },

    search(query: string, limit = 10): Promise<SearchResult[]> {
      return request(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    },

    getPage(slug: string): Promise<BrainPage> {
      const path = slug.split("/").map(encodeURIComponent).join("/");
      return request(`/api/pages/${path}`);
    },

    listPages(options?: { limit?: number; offset?: number; source?: string; type?: string; tag?: string }): Promise<BrainPage[]> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.source) params.set("source", options.source);
      if (options?.type) params.set("type", options.type);
      if (options?.tag) params.set("tag", options.tag);
      return request(`/api/pages?${params.toString()}`);
    },

    createPage(page: { slug: string; title: string; content?: string; type?: string; frontmatter?: Record<string, unknown> }): Promise<{ slug: string }> {
      return request("/api/pages", { method: "POST", body: JSON.stringify(page) });
    },

    /**
     * Partial update: the server merges the given frontmatter keys into the
     * existing page and keeps the body when `content` is omitted. Without
     * merge semantics a metadata-only update would wipe the page body.
     */
    updatePage(page: { slug: string; title?: string; content?: string; type?: string; frontmatter?: Record<string, unknown> }): Promise<{ slug: string; success: boolean }> {
      return request("/api/pages", { method: "POST", body: JSON.stringify({ ...page, merge: true }) });
    },

    deletePage(slug: string): Promise<{ success: boolean }> {
      const path = slug.split("/").map(encodeURIComponent).join("/");
      return request(`/api/pages/${path}`, { method: "DELETE" });
    },

    graph(): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
      return request("/api/graph");
    },

    recentQueries(limit = 10): Promise<RecentQuery[]> {
      return request(`/api/queries/recent?limit=${limit}`);
    },
  },

  query: {
    /**
     * /api/think always answers as an SSE stream (`data: {chunk}` events,
     * then one `{citations, gaps}` event, then `[DONE]`). The response is
     * assembled from the stream — calling res.json() on an SSE body throws.
     */
    async think(
      query: string,
      mode: "conservative" | "balanced" | "tokenmax" = "balanced",
      onChunk?: (chunk: string) => void
    ): Promise<QueryResponse> {
      const res = await fetch(`${BASE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode }),
      });

      if (!res.ok) {
        const error = await res.text().catch(() => "");
        throw new Error(error || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (!contentType.includes("text/event-stream")) {
        return res.json() as Promise<QueryResponse>;
      }

      const result: QueryResponse = { answer: "", citations: [], gaps: [], mode };
      if (!res.body) return result;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (data: string) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (typeof parsed.chunk === "string") {
            result.answer += parsed.chunk;
            onChunk?.(parsed.chunk);
          }
          if (Array.isArray(parsed.citations)) result.citations = parsed.citations;
          if (Array.isArray(parsed.gaps)) result.gaps = parsed.gaps;
        } catch {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) handleEvent(line.slice(6));
        }
      }
      if (buffer.startsWith("data: ")) handleEvent(buffer.slice(6));

      return result;
    },
  },

  legal: {
    conflictCheck(name: string): Promise<ConflictCheckResponse> {
      return request("/api/legal/conflict-check", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },

    judgementsSync(options?: { jurisdiction?: "at" | "de" | "all"; query?: string }): Promise<JudgementsSyncResponse> {
      return request("/api/legal/judgements-sync", {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      });
    },

    anonymize(text: string, types?: string[]): Promise<AnonymizeResponse> {
      return request("/api/legal/anonymize", {
        method: "POST",
        body: JSON.stringify({ text, ...(types ? { types } : {}) }),
      });
    },

    /** Tabellarische Massenprüfung: jede Frage gegen jedes Dokument, zitiert. */
    tabularReview(input: { type?: string; slugs?: string[]; questions: string[]; limit?: number }): Promise<TabularReviewResponse> {
      return request("/api/legal/tabular-review", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },

  connectors: {
    list(): Promise<{ connectors: ConnectorStatus[] }> {
      return request("/api/connectors");
    },

    sync(service: string): Promise<{ success: boolean; status: string; service: string; message?: string }> {
      return request(`/api/connectors/${encodeURIComponent(service)}/sync`, { method: "POST" });
    },

    toggle(service: string): Promise<{ success: boolean; service: string; enabled: boolean; message?: string }> {
      return request(`/api/connectors/${encodeURIComponent(service)}/toggle`, { method: "POST" });
    },
  },

  upload: {
    async file(
      file: File,
      options?: { title?: string; source?: string; tags?: string[] },
      onProgress?: (progress: number) => void
    ): Promise<{ slug: string; title: string }> {
      const formData = new FormData();
      formData.append("file", file);
      if (options?.title) formData.append("title", options.title);
      if (options?.source) formData.append("source", options.source);
      if (options?.tags) formData.append("tags", JSON.stringify(options.tags));

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE_URL}/api/upload`);

        if (onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid JSON response from server"));
            }
          } else {
            reject(new Error(xhr.statusText || `HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(formData);
      });
    },
  },
};

export type { QueryResponse, BrainStats, SearchResult, BrainPage, GraphNode, GraphLink, ConnectorStatus };
