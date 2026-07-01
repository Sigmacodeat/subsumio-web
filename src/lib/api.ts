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
import type { SourceRegistryResponse } from "./source-registry";
import type { QueryMode } from "./matter-context-types";
import { csrfFetch, getCsrfToken } from "./csrf";
import { consumeSSEStream } from "./sse-stream";

// Browser: same-origin Next.js proxy (/api/*). Server: direct engine URL.
import { env } from "@/lib/env";

const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : env("SUBSUMIO_API_URL") || env("NEXT_PUBLIC_SUBSUMIO_API_URL") || "http://localhost:3001";

type ThinkMode = "conservative" | "balanced" | "tokenmax";
type UploadProgressPhase = "starting" | "uploading" | "server_processing";

interface ThinkOptions {
  mode?: ThinkMode;
  queryMode?: QueryMode;
  caseSlug?: string;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}

// Auth endpoints are consumed by older UI code with shape-specific property access.
// Keep this loose locally instead of forcing unsafe casts across every caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAuthResponse = Record<string, any>;

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  let res: Response;
  try {
    res = await csrfFetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: options?.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ApiRequestError(
        "Anfrage timeout — Server nicht erreichbar",
        408,
        "request_timeout"
      );
    }
    throw err;
  }

  if (!res.ok) {
    // Session expired → redirect to login (browser only)
    if (res.status === 401 && typeof window !== "undefined") {
      const loginUrl = new URL("/login", window.location.origin);
      loginUrl.searchParams.set("next", window.location.pathname);
      window.location.href = loginUrl.toString();
      throw new ApiRequestError("Session expired — redirecting to login", 401, "session_expired");
    }

    const error = await res.text().catch(() => "");
    if (error) {
      try {
        const parsed = JSON.parse(error) as { message?: unknown; error?: unknown };
        const code = typeof parsed.error === "string" ? parsed.error : undefined;
        const message = typeof parsed.message === "string" ? parsed.message : code ? code : "";
        if (message) throw new ApiRequestError(message, res.status, code, parsed);
      } catch (parseErr) {
        if (parseErr instanceof ApiRequestError) throw parseErr;
      }
    }
    throw new ApiRequestError(error || `HTTP ${res.status}`, res.status);
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
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

    getPages(slugs: string[]): Promise<Record<string, BrainPage>> {
      if (slugs.length === 0) return Promise.resolve({});
      return request<{ pages: Record<string, BrainPage> }>("/api/pages/batch", {
        method: "POST",
        body: JSON.stringify({ slugs }),
      }).then((r) => r.pages);
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

    batchListPages(types: string[], limit = 100): Promise<Record<string, BrainPage[]>> {
      if (types.length === 0) return Promise.resolve({});
      return request<{ results: Record<string, BrainPage[]>; errors: string[] }>(
        "/api/pages/batch-list",
        { method: "POST", body: JSON.stringify({ types, limit }) }
      ).then((r) => r.results);
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

    cockpit(opts?: { types?: string; recentLimit?: number }): Promise<{
      stats: BrainStats | null;
      recent: RecentQuery[];
      pages: Record<string, BrainPage[]>;
    }> {
      const params = new URLSearchParams();
      if (opts?.types) params.set("types", opts.types);
      if (opts?.recentLimit) params.set("recent_limit", String(opts.recentLimit));
      return request(`/api/dashboard/cockpit?${params.toString()}`);
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
      modeOrOptions: ThinkMode | ThinkOptions = "balanced",
      onChunk?: (chunk: string) => void
    ): Promise<QueryResponse> {
      const options =
        typeof modeOrOptions === "string" ? { mode: modeOrOptions, onChunk } : modeOrOptions;
      const mode = options.mode ?? "balanced";
      const res = await csrfFetch(`${BASE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          mode,
          query_mode: options.queryMode,
          case_slug: options.caseSlug,
          ...(options.model && options.model !== "auto" ? { model: options.model } : {}),
        }),
        // SSE stream — use 5 min timeout (matches maxDuration=300) when
        // caller doesn't provide a signal. Default 30s would kill the stream.
        signal: options.signal ?? AbortSignal.timeout(300_000),
      });

      if (!res.ok) {
        const error = await res.text().catch(() => "");
        throw new Error(error || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (!contentType.includes("text/event-stream")) {
        const text = await res.text();
        if (!text) return { answer: "", citations: [], gaps: [], mode };
        try {
          return JSON.parse(text) as QueryResponse;
        } catch {
          return { answer: text, citations: [], gaps: [], mode };
        }
      }

      const result: QueryResponse = { answer: "", citations: [], gaps: [], mode };
      if (!res.body) return result;

      await consumeSSEStream(res.body, (data, parsed) => {
        if (data === "[DONE]") return;
        if (!parsed) {
          console.debug("[api.think] malformed SSE data:", data.slice(0, 100));
          return;
        }
        if (typeof parsed.chunk === "string") {
          result.answer += parsed.chunk;
          options.onChunk?.(parsed.chunk);
        }
        if (Array.isArray(parsed.citations)) result.citations = parsed.citations;
        if (Array.isArray(parsed.gaps)) result.gaps = parsed.gaps;
        if (typeof parsed.tokens_used === "number") result.tokens_used = parsed.tokens_used;
        if (typeof parsed.latency_ms === "number") result.latency_ms = parsed.latency_ms;
      });

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
      jurisdiction?: "at" | "de" | "ch" | "all";
      query?: string;
    }): Promise<JudgementsSyncResponse> {
      return request("/api/legal/judgements-sync", {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      });
    },

    judgementsSearch(options: {
      q: string;
      jurisdiction?: "at" | "de" | "ch" | "all";
      limit?: number;
    }): Promise<{ results?: Array<Record<string, string>> }> {
      const params = new URLSearchParams();
      params.set("q", options.q);
      if (options.jurisdiction) params.set("jurisdiction", options.jurisdiction);
      if (options.limit) params.set("limit", String(options.limit));
      return request(`/api/legal/judgements-search?${params.toString()}`);
    },

    ground(text: string): Promise<{
      citations_verified: number;
      citations_unverified: number;
      corpus_checked: boolean;
      grounded_citations: Array<{
        code: string;
        paragraph: string;
        context: string;
        verified: boolean;
        source_text?: string;
      }>;
      analyzed_at: string;
      has_unverified: boolean;
      warning?: string;
    }> {
      return request("/api/legal/ground", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
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

    /** Deep Analysis: narrativer Gesamt-Report über alle ausgewählten Vault-Dokumente. */
    async deepAnalysis(input: {
      slugs: string[];
      prompt?: string;
      jurisdiction?: "at" | "de" | "ch" | "all";
    }): Promise<{
      executive_summary: string;
      document_count: number;
      findings: Array<{
        theme: string;
        description: string;
        risk_level: "low" | "medium" | "high" | "critical";
        affected_documents: string[];
        citations: Array<{ slug: string; title: string; quote: string }>;
      }>;
      cross_document_patterns: string[];
      overall_risk: "low" | "medium" | "high" | "critical";
      warnings: string[];
      attorney_review_required: true;
    }> {
      return request("/api/legal/deep-analysis", {
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
        // SSE stream — use 5 min timeout. Default 30s would kill the stream.
        signal: AbortSignal.timeout(300_000),
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
        const text = await res.text();
        if (!text) return { redline: "" };
        try {
          return { redline: JSON.stringify(await Promise.resolve(JSON.parse(text))) };
        } catch {
          return { redline: text };
        }
      }

      // SSE streaming
      let redline = "";
      if (!res.body) return { redline };

      await consumeSSEStream(res.body, (data, parsed) => {
        if (data === "[DONE]") return;
        if (parsed && typeof parsed.chunk === "string") {
          redline += parsed.chunk;
          input.onChunk?.(parsed.chunk);
        } else if (!parsed) {
          // Non-JSON payload — append raw
          redline += data;
          input.onChunk?.(data);
        }
      });

      return { redline };
    },

    /** Contradictions check: cross-check documents in a case for conflicting data. */
    async contradictionsCheck(caseSlug: string): Promise<{
      contradictions: Array<{
        doc_a_slug: string;
        doc_b_slug: string;
        field: string;
        value_a: string;
        value_b: string;
        severity: "high" | "medium" | "low";
        description: string;
      }>;
      documents_checked: number;
      checked_at: string;
    }> {
      return request("/api/legal/contradictions", {
        method: "POST",
        body: JSON.stringify({ case_slug: caseSlug }),
      });
    },

    /** Contradiction probe: fetch semantic contradiction findings from GBrain's nightly probe. */
    async contradictionProbe(caseSlug: string): Promise<{
      findings: Array<{
        chunk_a: string;
        chunk_b: string;
        severity: "high" | "medium" | "low" | "info";
        axis: string | null;
        explanation: string;
        slug: string;
      }>;
      total: number;
      last_run: string | null;
      probe_available: boolean;
    }> {
      const params = new URLSearchParams({ case_slug: caseSlug });
      return request(`/api/legal/contradiction-probe?${params.toString()}`);
    },

    /** Submit retrieval feedback (thumbs up/down on search results). */
    async submitRetrievalFeedback(input: {
      query: string;
      result_slug: string;
      result_title?: string;
      feedback_type: "relevant" | "irrelevant" | "outdated" | "wrong";
      severity?: "low" | "medium" | "high";
      comment?: string;
      rank_position?: number;
      result_score?: number;
    }): Promise<{ id: string; created_at: string }> {
      return request("/api/legal/retrieval-feedback", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    /** Case strategy: generate a strategic recommendation for a case. */
    async caseStrategy(
      caseSlug: string,
      opts?: {
        jurisdiction?: "at" | "de" | "ch" | "all";
        language?: "de" | "en";
      }
    ): Promise<{
      summary: string;
      recommended: string;
      recommendedApproach: string;
      risks: Array<{
        description: string;
        probability: "high" | "medium" | "low";
        impact: "high" | "medium" | "low";
        mitigation: string;
      }>;
      next_steps: string[];
      cost_estimate?: {
        min: number;
        max: number;
        currency: string;
        basis: string;
      };
      success_probability: number;
      generatedAt: string;
    }> {
      return request("/api/legal/case-strategy", {
        method: "POST",
        body: JSON.stringify({
          case_slug: caseSlug,
          jurisdiction: opts?.jurisdiction ?? "all",
          language: opts?.language ?? "de",
        }),
      });
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

    templates: {
      list(options?: {
        limit?: number;
        category?: string;
        jurisdiction?: string;
      }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.category) params.set("category", options.category);
        if (options?.jurisdiction) params.set("jurisdiction", options.jurisdiction);
        const qs = params.toString();
        return request(`/api/legal/templates${qs ? `?${qs}` : ""}`);
      },

      get(slug: string): Promise<BrainPage> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/templates/${path}`);
      },

      create(input: {
        title: string;
        category: string;
        jurisdiction: string;
        description?: string;
        body: string;
        variables?: Array<{ key: string; label: string; required: boolean }>;
      }): Promise<{ slug: string }> {
        return request("/api/legal/templates", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      update(
        slug: string,
        input: {
          title?: string;
          category?: string;
          jurisdiction?: string;
          description?: string;
          body?: string;
          variables?: Array<{ key: string; label: string; required: boolean }>;
        }
      ): Promise<{ slug: string; success: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/templates/${path}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      delete(slug: string): Promise<{ ok: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/templates/${path}`, { method: "DELETE" });
      },
    },

    litigation: {
      list(options?: { caseSlug?: string; phase?: string; limit?: number }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.caseSlug) params.set("caseSlug", options.caseSlug);
        if (options?.phase) params.set("phase", options.phase);
        const qs = params.toString();
        return request(`/api/legal/litigation${qs ? `?${qs}` : ""}`);
      },

      get(slug: string): Promise<BrainPage> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/litigation/${path}`);
      },

      create(input: {
        caseSlug: string;
        caseTitle: string;
        phase?: string;
        court?: string;
        courtFileNumber?: string;
        instance?: string;
        steps?: Array<Record<string, unknown>>;
      }): Promise<{ slug: string }> {
        return request("/api/legal/litigation", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      update(
        slug: string,
        input: Record<string, unknown>
      ): Promise<{ slug: string; success: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/litigation/${path}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      delete(slug: string): Promise<{ ok: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/litigation/${path}`, { method: "DELETE" });
      },
    },

    reviewSets: {
      list(options?: { caseSlug?: string; status?: string; limit?: number }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.caseSlug) params.set("caseSlug", options.caseSlug);
        if (options?.status) params.set("status", options.status);
        const qs = params.toString();
        return request(`/api/legal/review-sets${qs ? `?${qs}` : ""}`);
      },

      get(slug: string): Promise<BrainPage> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/review-sets/${path}`);
      },

      create(input: {
        title: string;
        caseSlug?: string;
        caseTitle?: string;
        description?: string;
        criteria?: Record<string, unknown>;
        production?: Record<string, unknown>;
      }): Promise<{ slug: string }> {
        return request("/api/legal/review-sets", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      update(
        slug: string,
        input: Record<string, unknown>
      ): Promise<{ slug: string; success: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/review-sets/${path}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      delete(slug: string): Promise<{ ok: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/review-sets/${path}`, { method: "DELETE" });
      },
    },

    trustAccounts: {
      list(options?: {
        matterSlug?: string;
        status?: string;
        limit?: number;
      }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.matterSlug) params.set("matterSlug", options.matterSlug);
        if (options?.status) params.set("status", options.status);
        const qs = params.toString();
        return request(`/api/legal/trust-accounts${qs ? `?${qs}` : ""}`);
      },

      get(slug: string): Promise<BrainPage> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/trust-accounts/${path}`);
      },

      create(input: {
        accountName: string;
        accountNumber: string;
        bankName?: string;
        iban?: string;
        bic?: string;
        currency?: string;
        openingBalance?: number;
        matterSlug?: string;
        matterTitle?: string;
        clientName?: string;
      }): Promise<{ slug: string }> {
        return request("/api/legal/trust-accounts", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      update(
        slug: string,
        input: Record<string, unknown>
      ): Promise<{ slug: string; success: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/trust-accounts/${path}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      addTransaction(
        slug: string,
        input: {
          type: string;
          amount: number;
          description: string;
          date?: string;
          matterSlug?: string;
          reference?: string;
        }
      ): Promise<{ transaction: Record<string, unknown> }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/trust-accounts/${path}`, {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      delete(slug: string): Promise<{ ok: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/trust-accounts/${path}`, { method: "DELETE" });
      },
    },

    analytics: {
      list(options?: {
        court?: string;
        judge?: string;
        outcome?: string;
        procedureType?: string;
        limit?: number;
      }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.court) params.set("court", options.court);
        if (options?.judge) params.set("judge", options.judge);
        if (options?.outcome) params.set("outcome", options.outcome);
        if (options?.procedureType) params.set("procedureType", options.procedureType);
        const qs = params.toString();
        return request(`/api/legal/analytics${qs ? `?${qs}` : ""}`);
      },

      get(slug: string): Promise<BrainPage> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/analytics/${path}`);
      },

      create(input: {
        caseSlug: string;
        caseTitle: string;
        caseNumber?: string;
        court: string;
        courtLevel?: string;
        judge?: string;
        procedureType?: string;
        outcome?: string;
        amountInDispute?: number;
        amountAwarded?: number;
        startDate?: string;
        endDate?: string;
        lawyerHours?: number;
        notes?: string;
      }): Promise<{ slug: string }> {
        return request("/api/legal/analytics", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      update(
        slug: string,
        input: Record<string, unknown>
      ): Promise<{ slug: string; success: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/analytics/${path}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      delete(slug: string): Promise<{ ok: boolean }> {
        const path = slug.split("/").map(encodeURIComponent).join("/");
        return request(`/api/legal/analytics/${path}`, { method: "DELETE" });
      },
    },

    commentaries: {
      list(options?: {
        jurisdiction?: string;
        statuteAbbr?: string;
        sectionNum?: string;
        commentaryType?: string;
        search?: string;
        limit?: number;
        offset?: number;
      }): Promise<{
        items: Array<Record<string, unknown>>;
        total: number;
      }> {
        const params = new URLSearchParams();
        if (options?.jurisdiction) params.set("jurisdiction", options.jurisdiction);
        if (options?.statuteAbbr) params.set("statuteAbbr", options.statuteAbbr);
        if (options?.sectionNum) params.set("sectionNum", options.sectionNum);
        if (options?.commentaryType) params.set("commentaryType", options.commentaryType);
        if (options?.search) params.set("search", options.search);
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.offset) params.set("offset", String(options.offset));
        const qs = params.toString();
        return request(`/api/legal/commentaries${qs ? `?${qs}` : ""}`);
      },

      get(id: string): Promise<Record<string, unknown>> {
        return request(`/api/legal/commentaries/${encodeURIComponent(id)}`);
      },

      triggerSynthesis(input: {
        statuteAbbr: string;
        sectionNum: string;
        jurisdiction?: string;
      }): Promise<{ success: boolean; commentary?: Record<string, unknown> }> {
        return request("/api/legal/commentaries", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      delete(id: string): Promise<{ success: boolean }> {
        return request(`/api/legal/commentaries/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      },
    },
  },

  tax: {
    returns: {
      list(options?: {
        type?: string;
        year?: number;
        status?: string;
        limit?: number;
      }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.type) params.set("type", options.type);
        if (options?.year) params.set("year", String(options.year));
        if (options?.status) params.set("status", options.status);
        const qs = params.toString();
        return request(`/api/tax/returns${qs ? `?${qs}` : ""}`);
      },

      create(input: {
        clientName: string;
        type?: string;
        year?: number;
        status?: string;
        dueDate?: string;
        notes?: string;
      }): Promise<{ slug: string }> {
        return request("/api/tax/returns", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      get(slug: string): Promise<BrainPage> {
        return request(`/api/tax/returns/${encodeURIComponent(slug)}`);
      },

      update(
        slug: string,
        input: Partial<{
          clientName: string;
          type: string;
          year: number;
          status: string;
          dueDate: string | null;
          submittedDate: string | null;
          assessedDate: string | null;
          assessmentNotice: string | null;
          taxAmount: number | null;
          refundAmount: number | null;
          assignedTo: string | null;
          notes: string | null;
        }>
      ): Promise<BrainPage> {
        return request(`/api/tax/returns/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      remove(slug: string): Promise<{ success: boolean }> {
        return request(`/api/tax/returns/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
      },
    },

    assessments: {
      list(options?: { type?: string; year?: number; limit?: number }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.type) params.set("type", options.type);
        if (options?.year) params.set("year", String(options.year));
        const qs = params.toString();
        return request(`/api/tax/assessments${qs ? `?${qs}` : ""}`);
      },

      create(input: {
        clientName: string;
        type: string;
        taxType?: string;
        year: number;
        noticeDate: string;
        amount: number;
        noticeNumber?: string;
        dueDate?: string;
        notes?: string;
      }): Promise<{ slug: string }> {
        return request("/api/tax/assessments", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      get(slug: string): Promise<BrainPage> {
        return request(`/api/tax/assessments/${encodeURIComponent(slug)}`);
      },

      update(
        slug: string,
        input: Partial<{
          clientName: string;
          type: string;
          taxType: string;
          year: number;
          noticeNumber: string | null;
          noticeDate: string | null;
          dueDate: string | null;
          amount: number;
          paidDate: string | null;
          contested: boolean;
          contestDeadline: string | null;
          notes: string | null;
        }>
      ): Promise<BrainPage> {
        return request(`/api/tax/assessments/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      remove(slug: string): Promise<{ success: boolean }> {
        return request(`/api/tax/assessments/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
      },
    },

    audits: {
      list(options?: { type?: string; phase?: string; limit?: number }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.type) params.set("type", options.type);
        if (options?.phase) params.set("phase", options.phase);
        const qs = params.toString();
        return request(`/api/tax/audits${qs ? `?${qs}` : ""}`);
      },

      create(input: {
        clientName: string;
        type: string;
        year: number;
        phase?: string;
        auditor?: string;
        startDate?: string;
        endDate?: string;
        notes?: string;
      }): Promise<{ slug: string }> {
        return request("/api/tax/audits", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      get(slug: string): Promise<BrainPage> {
        return request(`/api/tax/audits/${encodeURIComponent(slug)}`);
      },

      update(
        slug: string,
        input: Partial<{
          clientName: string;
          type: string;
          year: number;
          phase: string;
          auditor: string | null;
          startDate: string | null;
          endDate: string | null;
          findings: Array<{
            id: string;
            issue: string;
            amount?: number | null;
            accepted?: boolean;
            resolvedAt?: string | null;
          }>;
          totalAdditionalTax: number | null;
          notes: string | null;
        }>
      ): Promise<BrainPage> {
        return request(`/api/tax/audits/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      remove(slug: string): Promise<{ success: boolean }> {
        return request(`/api/tax/audits/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
      },
    },

    clients: {
      list(options?: { type?: string; search?: string; limit?: number }): Promise<BrainPage[]> {
        const params = new URLSearchParams();
        if (options?.limit) params.set("limit", String(options.limit));
        if (options?.type) params.set("type", options.type);
        if (options?.search) params.set("search", options.search);
        const qs = params.toString();
        return request(`/api/tax/clients${qs ? `?${qs}` : ""}`);
      },

      create(input: {
        name: string;
        type?: string;
        taxId: string;
        vatId?: string;
        fiscalYearStart?: string;
        fiscalYearEnd?: string;
        industryCode?: string;
        contactEmail?: string;
        contactPhone?: string;
        street?: string;
        postalCode?: string;
        city?: string;
        country?: string;
        notes?: string;
      }): Promise<{ slug: string }> {
        return request("/api/tax/clients", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },

      get(slug: string): Promise<BrainPage> {
        return request(`/api/tax/clients/${encodeURIComponent(slug)}`);
      },

      update(
        slug: string,
        input: Partial<{
          name: string;
          type: string;
          taxId: string;
          vatId: string | null;
          fiscalYearStart: string;
          fiscalYearEnd: string;
          industryCode: string | null;
          contactEmail: string | null;
          contactPhone: string | null;
          street: string | null;
          postalCode: string | null;
          city: string | null;
          country: string;
          notes: string | null;
        }>
      ): Promise<BrainPage> {
        return request(`/api/tax/clients/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      },

      remove(slug: string): Promise<{ success: boolean }> {
        return request(`/api/tax/clients/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
      },
    },

    elster: {
      status(): Promise<{
        status: {
          mode: string;
          connected: boolean;
          certificateExpiresAt?: string;
          lastError?: string;
        };
        submissions: BrainPage[];
      }> {
        return request("/api/tax/elster");
      },

      submit(input: {
        clientId: string;
        clientName: string;
        formType: string;
        period: string;
        year: number;
        taxAmount?: number;
        refundAmount?: number;
        vatPrevious?: number;
        vatPayable?: number;
        vatDeductible?: number;
        grossWages?: number;
        withheldTax?: number;
        euCountryCode?: string;
        euVatId?: string;
        euTurnover?: number;
        notes?: string;
      }): Promise<{
        slug: string;
        submission: { id: string; status: string; elsterReference?: string };
      }> {
        return request("/api/tax/elster", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },
    },

    caseStrategy(input: {
      returnSlug: string;
      jurisdiction?: "de" | "at";
      language?: "de" | "en";
    }): Promise<{
      summary: string;
      recommended: string;
      recommendedApproach: string;
      risks: Array<{
        description: string;
        probability: "high" | "medium" | "low";
        impact: "high" | "medium" | "low";
        mitigation: string;
      }>;
      next_steps: string[];
      cost_estimate?: {
        min: number;
        max: number;
        currency: string;
        basis: string;
      };
      success_probability: number;
      generatedAt: string;
    }> {
      return request("/api/tax/case-strategy", {
        method: "POST",
        body: JSON.stringify({
          return_slug: input.returnSlug,
          jurisdiction: input.jurisdiction,
          language: input.language,
        }),
      });
    },

    riskAnalysis(input: {
      clientSlug?: string;
      returnSlug?: string;
      text?: string;
      jurisdiction?: "de" | "at";
    }): Promise<{
      overall_risk_level: "low" | "medium" | "high";
      risks: Array<{
        category: string;
        description: string;
        severity: "low" | "medium" | "high";
        potential_amount?: number;
        mitigation: string;
        legal_basis?: string;
      }>;
      recommendations: string[];
      generatedAt: string;
    }> {
      return request("/api/tax/risk-analysis", {
        method: "POST",
        body: JSON.stringify({
          client_slug: input.clientSlug,
          return_slug: input.returnSlug,
          text: input.text,
          jurisdiction: input.jurisdiction,
        }),
      });
    },

    precedentSearch(input: { query: string; jurisdiction?: "de" | "at"; limit?: number }): Promise<{
      precedents: Array<{
        court: string;
        date: string;
        file_number: string;
        summary: string;
        relevance: number;
        key_holdings: string[];
        legal_basis: string[];
      }>;
      generatedAt: string;
    }> {
      return request("/api/tax/precedent-search", {
        method: "POST",
        body: JSON.stringify({
          query: input.query,
          jurisdiction: input.jurisdiction,
          limit: input.limit,
        }),
      });
    },

    appealGenerator(input: {
      assessmentSlug: string;
      contestedPoints?: string;
      jurisdiction?: "de" | "at";
      language?: "de" | "en";
    }): Promise<{
      assessment_summary: string;
      contested_points: Array<{
        position: string;
        tax_office_view: string;
        taxpayer_view: string;
        legal_basis: string;
        disputed_amount: number;
        success_prospect: "stark" | "mittel" | "schwach" | "keine";
        required_evidence: string[];
      }>;
      deadline: string;
      deadline_legal_basis: string;
      days_remaining: number;
      success_prospect_summary: string;
      total_disputed_amount: number;
      draft_letter: {
        recipient: string;
        subject: string;
        body: string;
        requests: string[];
      };
      recommendations: string[];
      generatedAt: string;
    }> {
      return request("/api/tax/appeal-generator", {
        method: "POST",
        body: JSON.stringify({
          assessment_slug: input.assessmentSlug,
          contested_points: input.contestedPoints,
          jurisdiction: input.jurisdiction,
          language: input.language,
        }),
      });
    },

    bfhFeed(input: { topic?: string; limit?: number; jurisdiction?: "de" | "at" }): Promise<{
      decisions: Array<{
        court: string;
        file_number: string;
        date: string;
        topic: string;
        summary: string;
        key_holdings: string[];
        legal_basis: string[];
        relevance: "high" | "medium" | "low";
      }>;
      topic_summary: string;
      generatedAt: string;
    }> {
      return request("/api/tax/bfh-feed", {
        method: "POST",
        body: JSON.stringify({
          topic: input.topic,
          limit: input.limit,
          jurisdiction: input.jurisdiction,
        }),
      });
    },

    clientLetter(input: {
      clientSlug: string;
      occasion:
        | "quarterly_update"
        | "law_change"
        | "reminder"
        | "assessment_received"
        | "audit_notice"
        | "year_end"
        | "custom";
      customOccasion?: string;
      keyPoints?: string;
      language?: "de" | "en";
    }): Promise<{
      recipient_name: string;
      recipient_address: string;
      subject: string;
      body: string;
      key_points: string[];
      call_to_action: string;
      generatedAt: string;
    }> {
      return request("/api/tax/client-letter", {
        method: "POST",
        body: JSON.stringify({
          client_slug: input.clientSlug,
          occasion: input.occasion,
          custom_occasion: input.customOccasion,
          key_points: input.keyPoints,
          language: input.language,
        }),
      });
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
      identities: Array<{
        id: string;
        brainId: string;
        userId?: string;
        name?: string;
        role?: string;
        status: string;
        verifiedAt: string | null;
        phoneHash: string;
        phoneLast4: string;
      }>;
      webhookUrl: string;
    }> {
      return request("/api/whatsapp/status");
    },

    identities(): Promise<{
      identities: Array<{
        id: string;
        brainId: string;
        userId?: string;
        name?: string;
        role?: string;
        status: string;
        verifiedAt: string | null;
        phoneHash: string;
      }>;
    }> {
      return request("/api/whatsapp/identities");
    },

    createIdentity(input: {
      phone: string;
      name?: string;
      role?: "admin" | "lawyer" | "assistant" | "client" | "external" | "intake";
      status?: "active" | "suspended" | "revoked";
      matter_scope?: "all" | string[];
    }): Promise<{ identity: unknown }> {
      return request("/api/whatsapp/identities", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    updateIdentity(input: {
      id: string;
      name?: string;
      role?: "admin" | "lawyer" | "assistant" | "client" | "external" | "intake";
      status?: "active" | "suspended" | "revoked";
      matter_scope?: "all" | string[];
    }): Promise<{ identity: unknown }> {
      return request("/api/whatsapp/identities", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },

    deleteIdentity(id: string): Promise<{ ok: boolean }> {
      return request("/api/whatsapp/identities", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
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

    configureFolder(
      service: "advokat-import" | "bea-import",
      input: { watch_dir: string; poll_interval_ms?: number }
    ): Promise<{
      success: boolean;
      service: string;
      enabled: boolean;
      watch_dir: string;
      poll_interval_ms: number;
    }> {
      return request(`/api/connectors/${encodeURIComponent(service)}/configure`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },

  email: {
    import(email: { subject: string; from: string; body: string; date?: string }): Promise<{
      success: boolean;
      duplicate?: boolean;
      error?: string;
      message?: string;
      matchedCase?: { slug: string; caseNumber?: string; title: string };
      suggestions?: Array<{ slug: string; caseNumber?: string; title: string }>;
    }> {
      return request("/api/email-import", {
        method: "POST",
        body: JSON.stringify(email),
      });
    },
  },

  sources: {
    list(params?: {
      jurisdiction?: string;
      type?: string;
      status?: string;
    }): Promise<SourceRegistryResponse> {
      const searchParams = new URLSearchParams();
      if (params?.jurisdiction) searchParams.set("jurisdiction", params.jurisdiction);
      if (params?.type) searchParams.set("type", params.type);
      if (params?.status) searchParams.set("status", params.status);
      const qs = searchParams.toString();
      return request(`/api/legal/sources${qs ? `?${qs}` : ""}`);
    },

    refresh(sourceId: string): Promise<{
      success: boolean;
      source_id: string;
      label: string;
      sync_summary?: {
        fetched: number;
        imported: number;
        errors: string[];
        duration_ms: number;
        timestamp: string;
      };
    }> {
      return request("/api/legal/sources", {
        method: "POST",
        body: JSON.stringify({ source_id: sourceId }),
      });
    },
  },

  dataExport: {
    gdpr(): Promise<Record<string, unknown>> {
      return request("/api/data-export/gdpr");
    },
  },

  intake: {
    list(params?: { status?: string; limit?: number }): Promise<Record<string, unknown>> {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const qs = searchParams.toString();
      return request(`/api/intake${qs ? `?${qs}` : ""}`);
    },

    create(input: {
      source?: "whatsapp" | "portal" | "web" | "email" | "manual";
      summary: string;
      client_name?: string;
      phone_hash?: string;
      email?: string;
      legal_area?: string;
      missing_documents?: string[];
      source_event_slug?: string;
    }): Promise<Record<string, unknown>> {
      return request("/api/intake", { method: "POST", body: JSON.stringify(input) });
    },

    update(input: {
      slug: string;
      status?: "new" | "needs_info" | "conflict_check" | "accepted" | "rejected" | "converted";
      conflict_check_status?: "pending" | "clear" | "conflict" | "needs_review";
      converted_case_slug?: string;
      missing_documents?: string[];
      summary?: string;
    }): Promise<Record<string, unknown>> {
      return request("/api/intake", { method: "PATCH", body: JSON.stringify(input) });
    },

    convert(input: {
      slug: string;
      case_slug?: string;
      case_number?: string;
      title?: string;
      priority?: "low" | "medium" | "high" | "critical";
      portal_enabled?: boolean;
    }): Promise<Record<string, unknown>> {
      return request("/api/intake/convert", { method: "POST", body: JSON.stringify(input) });
    },
  },

  documentRequests: {
    list(params?: {
      caseSlug?: string;
      status?: string;
      limit?: number;
    }): Promise<Record<string, unknown>> {
      const searchParams = new URLSearchParams();
      if (params?.caseSlug) searchParams.set("caseSlug", params.caseSlug);
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const qs = searchParams.toString();
      return request(`/api/document-requests${qs ? `?${qs}` : ""}`);
    },

    create(input: {
      case_slug: string;
      items?: Array<
        | string
        | { key?: string; label?: string; required?: boolean; received_document_slug?: string }
      >;
      text?: string;
      channel?: "whatsapp" | "portal" | "email" | "manual";
      recipient_role?: "client" | "lawyer" | "assistant" | "other";
      status?: "draft" | "sent" | "partially_fulfilled" | "fulfilled" | "expired";
      source_event_slug?: string;
      message_draft?: string;
      include_portal_link?: boolean;
    }): Promise<Record<string, unknown>> {
      return request("/api/document-requests", { method: "POST", body: JSON.stringify(input) });
    },

    update(input: {
      slug: string;
      status?: "draft" | "sent" | "partially_fulfilled" | "fulfilled" | "expired";
      items?: Array<
        | string
        | { key?: string; label?: string; required?: boolean; received_document_slug?: string }
      >;
      message_draft?: string;
      sent_at?: string;
    }): Promise<Record<string, unknown>> {
      return request("/api/document-requests", { method: "PATCH", body: JSON.stringify(input) });
    },
  },

  auth: {
    login(input: { email: string; password: string }): Promise<LooseAuthResponse> {
      return request("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
    },

    verify2FA(input: { challengeToken: string; token: string }): Promise<LooseAuthResponse> {
      return request("/api/auth/2fa/login-verify", { method: "POST", body: JSON.stringify(input) });
    },

    register(input: {
      email: string;
      password: string;
      name: string;
      referredBy?: string;
      industry?: string;
    }): Promise<LooseAuthResponse> {
      return request("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
    },

    logout(): Promise<{ ok?: boolean }> {
      return request("/api/auth/logout", { method: "POST" });
    },

    async me(): Promise<LooseAuthResponse | null> {
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
      options?: {
        title?: string;
        source?: string;
        tags?: string[];
        case_slug?: string;
        password?: string;
      },
      onProgress?: (
        progress: number,
        transfer?: { loaded: number; total: number; phase?: UploadProgressPhase }
      ) => void
    ): Promise<{
      slug: string;
      title: string;
      original_persisted?: boolean;
      persist_error?: string;
      extraction_status?: string;
      extraction_method?: string;
      extraction_warnings?: string;
      post_upload_queued?: boolean;
    }> {
      const formData = new FormData();
      formData.append("file", file);
      if (options?.title) formData.append("title", options.title);
      if (options?.source) formData.append("source", options.source);
      if (options?.tags) formData.append("tags", JSON.stringify(options.tags));
      if (options?.case_slug) formData.append("case_slug", options.case_slug);
      if (options?.password) formData.append("password", options.password);

      const MAX_RETRIES = 2;
      const RETRYABLE_STATUS = new Set([502, 503, 504]);

      // Always try to get an upload token from the web app. The server returns
      // the engine URL (from SUBSUMIO_API_URL or NEXT_PUBLIC_ENGINE_URL) so the
      // browser can upload directly to the engine, bypassing proxy body limits.
      let uploadToken: string | null = null;
      let engineUrl = "";
      try {
        const passwordHash = options?.password
          ? Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", new TextEncoder().encode(options.password))
              )
            )
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("")
          : undefined;
        const tokenRes = await csrfFetch(`${BASE_URL}/api/upload-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: options?.source ?? "documents",
            case_slug: options?.case_slug,
            title: options?.title,
            tags: options?.tags ? JSON.stringify(options.tags) : undefined,
            filename: file.name,
            size: file.size,
            mime_type: file.type || undefined,
            password_hash: passwordHash,
          }),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          uploadToken = tokenData.token as string;
          engineUrl = tokenData.engine_url as string;
        }
      } catch {
        // Token fetch failed — fall back to same-origin upload
      }

      // If we have a token + engine URL, upload directly to the engine.
      // Otherwise fall back to same-origin upload.
      const targetUrl =
        uploadToken && engineUrl ? `${engineUrl}/api/direct-upload` : `${BASE_URL}/api/upload`;

      const attemptUpload = (
        attempt: number
      ): Promise<{
        slug: string;
        title: string;
        original_persisted?: boolean;
        persist_error?: string;
        extraction_status?: string;
        extraction_method?: string;
        extraction_warnings?: string;
        post_upload_queued?: boolean;
      }> => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", targetUrl);

          if (uploadToken) {
            xhr.setRequestHeader("x-upload-token", uploadToken);
          } else {
            // Same-origin upload needs CSRF token
            const csrfToken = getCsrfToken();
            if (csrfToken) {
              xhr.setRequestHeader("x-csrf-token", csrfToken);
            }
          }

          if (onProgress) {
            onProgress(0, { loaded: 0, total: file.size, phase: "starting" });
            xhr.upload.onloadstart = () => {
              onProgress(0, { loaded: 0, total: file.size, phase: "uploading" });
            };
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                onProgress((e.loaded / e.total) * 100, {
                  loaded: e.loaded,
                  total: e.total,
                  phase: "uploading",
                });
              }
            };
            xhr.upload.onload = () => {
              onProgress(96, { loaded: file.size, total: file.size, phase: "server_processing" });
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
              // Retry transient server errors (502/503/504) — engine restart,
              // Caddy hiccup, etc. Don't retry 4xx (client error) or 500 (bug).
              if (RETRYABLE_STATUS.has(xhr.status) && attempt < MAX_RETRIES) {
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
                console.warn(
                  `[upload] HTTP ${xhr.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                setTimeout(() => attemptUpload(attempt + 1).then(resolve, reject), delay);
                return;
              }
              // Try to parse a meaningful error message from the JSON response body
              try {
                const errBody = JSON.parse(xhr.responseText);
                const message =
                  errBody.message ||
                  errBody.error ||
                  (xhr.status === 413
                    ? "Datei zu groß für den aktuellen Upload-Kanal. Engine-Direct-Upload prüfen (NEXT_PUBLIC_ENGINE_URL)."
                    : `HTTP ${xhr.status}`);
                reject(new Error(message));
              } catch {
                reject(
                  new Error(
                    xhr.status === 413
                      ? "Datei zu groß für den aktuellen Upload-Kanal. Engine-Direct-Upload prüfen (NEXT_PUBLIC_ENGINE_URL)."
                      : xhr.statusText || `HTTP ${xhr.status}`
                  )
                );
              }
            }
          };

          xhr.onerror = () => {
            // Network error — retry if we have attempts left
            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              console.warn(
                `[upload] network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
              );
              setTimeout(() => attemptUpload(attempt + 1).then(resolve, reject), delay);
              return;
            }
            reject(new Error("Upload fehlgeschlagen — Netzwerkfehler nach allen Versuchen"));
          };

          xhr.send(formData);
        });
      };

      return attemptUpload(0);
    },
    status(slug: string): Promise<{
      slug: string;
      title?: string;
      status: "processing" | "ready_to_query" | "failed";
      extraction_status: string;
      extraction_method?: string;
      extraction_warnings?: string;
      extraction_error?: string;
      extraction_error_code?: string;
      analysis_status?: string;
      updated_at?: string;
    }> {
      const path = slug.split("/").map(encodeURIComponent).join("/");
      return request(`/api/upload-status/${path}`);
    },
  },

  copilot: {
    executeTool(
      tool: string,
      params: Record<string, unknown>
    ): Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
      display: {
        kind: "navigation" | "list" | "summary" | "confirmation";
        title: string;
        items?: Array<{ label: string; value?: string; href?: string }>;
        href?: string;
        message?: string;
      };
    }> {
      return request("/api/copilot/tools", {
        method: "POST",
        body: JSON.stringify({ tool, params }),
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
