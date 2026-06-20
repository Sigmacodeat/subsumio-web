import type {
  AnonymizeResponse,
  BrainPage,
  BrainStats,
  CaseScannerResponse,
  ConflictCheckResponse,
  ConnectorStatus,
  DocumentAnalysisResult,
  DocumentTranslation,
  GraphLink,
  GraphNode,
  JudgementsSyncResponse,
  ObligationExtractionResult,
  Playbook,
  PlaybookRule,
  PrecedentSearchResponse,
  QueryResponse,
  RecentQuery,
  SearchResult,
  TabularReviewResponse,
} from "./types";
import { csrfFetch, getCsrfToken } from "./csrf";

// Browser: same-origin Next.js proxy (/api/*). Server: direct engine URL.
import { env } from "@/lib/env";

const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : env("SUBSUMIO_API_URL") || env("NEXT_PUBLIC_SUBSUMIO_API_URL") || "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  const res = await csrfFetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
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

    listPages(options?: {
      limit?: number;
      offset?: number;
      source?: string;
      type?: string;
      tag?: string;
      q?: string;
      cursor?: string;
    }): Promise<BrainPage[]> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.source) params.set("source", options.source);
      if (options?.type) params.set("type", options.type);
      if (options?.tag) params.set("tag", options.tag);
      if (options?.q) params.set("q", options.q);
      if (options?.cursor) params.set("cursor", options.cursor);
      return request(`/api/pages?${params.toString()}`);
    },

    createPage(page: {
      slug: string;
      title: string;
      content?: string;
      type?: string;
      frontmatter?: Record<string, unknown>;
    }): Promise<{ slug: string }> {
      return request("/api/pages", { method: "POST", body: JSON.stringify(page) });
    },

    /**
     * Partial update: the server merges the given frontmatter keys into the
     * existing page and keeps the body when `content` is omitted. Without
     * merge semantics a metadata-only update would wipe the page body.
     */
    updatePage(page: {
      slug: string;
      title?: string;
      content?: string;
      type?: string;
      frontmatter?: Record<string, unknown>;
    }): Promise<{ slug: string; success: boolean }> {
      return request("/api/pages", {
        method: "POST",
        body: JSON.stringify({ ...page, merge: true }),
      });
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
      const res = await csrfFetch(`${BASE_URL}/api/think`, {
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

    analyzeDocument(input: {
      document_slug?: string;
      text?: string;
      jurisdiction?: string;
    }): Promise<DocumentAnalysisResult> {
      return request("/api/legal/analyze", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    precedentSearch(input: {
      query: string;
      jurisdiction?: "at" | "de" | "ch";
      legal_area?: string;
      limit?: number;
    }): Promise<PrecedentSearchResponse> {
      return request("/api/legal/precedent-search", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    caseScan(input: {
      look_ahead_days?: number;
      evidence_threshold?: number;
      max_cases?: number;
    }): Promise<CaseScannerResponse> {
      return request("/api/legal/case-scanner", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    translate(input: {
      document_slug?: string;
      text?: string;
      source_language?: string;
      target_language: string;
      legal_terminology?: boolean;
      preserve_formatting?: boolean;
    }): Promise<DocumentTranslation> {
      return request("/api/legal/translate", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    extractObligations(input: {
      document_slug?: string;
      text?: string;
      jurisdiction?: "at" | "de" | "ch" | "all";
    }): Promise<ObligationExtractionResult> {
      return request("/api/legal/obligation-extract", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    judgementsSync(options?: {
      jurisdiction?: "at" | "de" | "all";
      query?: string;
    }): Promise<JudgementsSyncResponse> {
      return request("/api/legal/judgements-sync", {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      });
    },

    judgementsSearch(options: {
      q: string;
      jurisdiction?: "at" | "de" | "all";
      limit?: number;
    }): Promise<{ results?: Array<Record<string, string>> }> {
      const params = new URLSearchParams();
      params.set("q", options.q);
      if (options.jurisdiction) params.set("jurisdiction", options.jurisdiction);
      if (options.limit) params.set("limit", String(options.limit));
      return request(`/api/legal/judgements-search?${params.toString()}`);
    },

    anonymize(text: string, types?: string[]): Promise<AnonymizeResponse> {
      return request("/api/legal/anonymize", {
        method: "POST",
        body: JSON.stringify({ text, ...(types ? { types } : {}) }),
      });
    },

    /** Tabellarische Massenprüfung: jede Frage gegen jedes Dokument, zitiert. */
    tabularReview(input: {
      type?: string;
      slugs?: string[];
      questions: string[];
      limit?: number;
    }): Promise<TabularReviewResponse> {
      return request("/api/legal/tabular-review", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    /** Contract redlining: streams AI-generated redline suggestions. */
    async contractRedline(input: {
      original_text: string;
      counterparty_text?: string;
      playbook_slug?: string;
      contract_type?: string;
      jurisdiction?: "at" | "de" | "ch" | "all";
      perspective?: "client" | "counterparty" | "neutral";
      language?: "de" | "en";
      onChunk?: (chunk: string) => void;
    }): Promise<{ redline: string }> {
      const res = await csrfFetch(`${BASE_URL}/api/legal/contract-redline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_text: input.original_text,
          counterparty_text: input.counterparty_text,
          playbook_slug: input.playbook_slug,
          contract_type: input.contract_type,
          jurisdiction: input.jurisdiction ?? "all",
          perspective: input.perspective ?? "client",
          language: input.language ?? "de",
        }),
      });

      if (!res.ok) {
        const error = await res.text().catch(() => "");
        throw new Error(error || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (!contentType.includes("text/event-stream") && !contentType.includes("application/json")) {
        return { redline: await res.text() };
      }

      if (contentType.includes("application/json")) {
        return { redline: JSON.stringify(await res.json()) };
      }

      // SSE streaming
      let redline = "";
      if (!res.body) return { redline };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (data: string) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (typeof parsed.chunk === "string") {
            redline += parsed.chunk;
            input.onChunk?.(parsed.chunk);
          }
        } catch {
          redline += data;
          input.onChunk?.(data);
        }
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

      return { redline };
    },

    playbooks: {
      list(options?: {
        limit?: number;
        jurisdiction?: string;
        contract_type?: string;
      }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.jurisdiction) params.set("jurisdiction", options.jurisdiction);
        if (options?.contract_type) params.set("contract_type", options.contract_type);
        const qs = params.toString();
        return request(`/api/legal/playbooks${qs ? `?${qs}` : ""}`);
      },

      get(slug: string): Promise<BrainPage> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/playbooks/${path}`);
      },

      create(input: {
        title: string;
        jurisdiction: string;
        contract_types: string[];
        rules: PlaybookRule[];
        description?: string;
      }): Promise<{ slug: string }> {
        return request("/api/legal/playbooks", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      update(
        slug: string,
        input: Partial<{
          title: string;
          jurisdiction: string;
          contract_types: string[];
          rules: PlaybookRule[];
          description: string;
        }>
      ): Promise<{ slug: string; success: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/playbooks/${path}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      delete(slug: string): Promise<{ ok: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/playbooks/${path}`, { method: "DELETE" });
      },
    },
  },

  whatsapp: {
    status(): Promise<{
      configured: boolean;
      verifyToken: boolean;
      appSecret: boolean;
      accessToken: boolean;
      phoneNumberId: boolean;
      mediaStorageProvider: string;
      mediaStorageDir: string;
      mediaMaxBytes: number;
      blobConfigured: boolean;
      allowedSenders: Array<{
        brainId: string;
        userId?: string;
        name?: string;
        role?: string;
        phoneLast4: string;
      }>;
      webhookUrl: string;
    }> {
      return request("/api/whatsapp/status");
    },

    sendText(to: string, message: string): Promise<{ ok: boolean; type: string; sentTo: string }> {
      return request("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to, type: "text", message }),
      });
    },

    sendTemplate(
      to: string,
      template: { name: string; language: { code: string }; components?: unknown[] }
    ): Promise<{ ok: boolean; type: string; messageId: string; sentTo: string }> {
      return request("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to, type: "template", template }),
      });
    },

    sendInteractive(
      to: string,
      interactive: {
        type: "button" | "list";
        body: { text: string };
        action: Record<string, unknown>;
        header?: unknown;
        footer?: unknown;
      }
    ): Promise<{ ok: boolean; type: string; messageId: string; sentTo: string }> {
      return request("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to, type: "interactive", interactive }),
      });
    },

    sendMedia(
      to: string,
      media: {
        type: "image" | "document" | "audio" | "video" | "sticker";
        mediaId?: string;
        link?: string;
        caption?: string;
        filename?: string;
      }
    ): Promise<{ ok: boolean; type: string; messageId: string; sentTo: string }> {
      return request("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to, type: "media", media }),
      });
    },

    sendFlow(
      to: string,
      flow: {
        flowToken: string;
        flowName?: string;
        flowId?: string;
        flowCta: string;
        headerText?: string;
        bodyText: string;
        footerText?: string;
        initialScreen?: string;
        initialData?: Record<string, unknown>;
      }
    ): Promise<{ ok: boolean; type: string; messageId: string; sentTo: string }> {
      return request("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to, type: "flow", flow }),
      });
    },
  },

  connectors: {
    list(): Promise<{ connectors: ConnectorStatus[] }> {
      return request("/api/connectors");
    },

    sync(
      service: string
    ): Promise<{ success: boolean; status: string; service: string; message?: string }> {
      return request(`/api/connectors/${encodeURIComponent(service)}/sync`, { method: "POST" });
    },

    toggle(
      service: string
    ): Promise<{ success: boolean; service: string; enabled: boolean; message?: string }> {
      return request(`/api/connectors/${encodeURIComponent(service)}/toggle`, { method: "POST" });
    },
  },

  email: {
    import(email: {
      subject: string;
      from: string;
      body: string;
      date?: string;
    }): Promise<Record<string, unknown>> {
      return request("/api/email-import", {
        method: "POST",
        body: JSON.stringify(email),
      });
    },
  },

  dataExport: {
    gdpr(): Promise<Record<string, unknown>> {
      return request("/api/data-export/gdpr");
    },
  },

  auth: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    login(input: { email: string; password: string }): Promise<any> {
      return request("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verify2FA(input: { challengeToken: string; token: string }): Promise<any> {
      return request("/api/auth/2fa/login-verify", { method: "POST", body: JSON.stringify(input) });
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register(input: {
      email: string;
      password: string;
      name: string;
      referredBy?: string;
      industry?: string;
    }): Promise<any> {
      return request("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
    },

    logout(): Promise<{ ok?: boolean }> {
      return request("/api/auth/logout", { method: "POST" });
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async me(): Promise<any> {
      try {
        return await request("/api/auth/me");
      } catch {
        return null;
      }
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

        // Attach CSRF token for browser-side uploads
        const csrfToken = getCsrfToken();
        if (csrfToken) {
          xhr.setRequestHeader("x-csrf-token", csrfToken);
        }

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

export type {
  QueryResponse,
  BrainStats,
  SearchResult,
  BrainPage,
  GraphNode,
  GraphLink,
  ConnectorStatus,
  Playbook,
  PlaybookRule,
};
