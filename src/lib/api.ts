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
import type { WorkProductReceipt } from "./work-product-receipts";
import { csrfFetch, getCsrfToken } from "./csrf";
import { consumeSSEStream } from "./sse-stream";

// Browser: same-origin Next.js proxy (/api/*). Server: direct engine URL.
import { env } from "@/lib/env";
import {
  getUploadSession,
  saveUploadSession,
  updateSessionParts,
  deleteUploadSession,
  cleanupExpiredSessions,
  type UploadSession,
} from "./upload-session-store";
import { computeFileSha256 } from "./file-hash";

const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : env("SUBSUMIO_API_URL") || env("NEXT_PUBLIC_SUBSUMIO_API_URL") || "http://localhost:3001";

type ThinkMode = "conservative" | "balanced" | "tokenmax";
type UploadProgressPhase =
  | "starting"
  | "uploading"
  | "server_processing"
  | "downloading"
  | "verifying"
  | "scanning"
  | "extracting";

// Clean up expired upload sessions on module load (browser only)
if (typeof window !== "undefined") {
  cleanupExpiredSessions().catch(() => {});
}

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

/**
 * Parse SSE stream from /api/upload/confirm. The engine sends:
 *   event: progress  data: { phase, filename, bytes }
 *   event: done      data: { slug, title, ... }
 *   event: error     data: { error, message }
 *
 * Resolves on "done", rejects on "error" or stream end without done.
 */
async function parseSseConfirm(
  body: ReadableStream<Uint8Array>,
  onProgress:
    | ((
        progress: number,
        transfer?: { loaded: number; total: number; phase?: UploadProgressPhase }
      ) => void)
    | undefined,
  fileSize: number
): Promise<{
  slug: string;
  title: string;
  original_persisted?: boolean;
  persist_error?: string;
  extraction_status?: string;
  extraction_method?: string;
  extraction_warnings?: string;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const progressMap: Record<string, number> = {
    downloading: 93,
    verifying: 94,
    scanning: 95,
    extracting: 97,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error("Upload-Bestätigung: Stream endete ohne Ergebnis.");
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const block of events) {
      const lines = block.split("\n");
      let eventType = "";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (eventType === "progress" && data) {
        try {
          const p = JSON.parse(data) as { phase?: string };
          if (onProgress && p.phase && p.phase in progressMap) {
            onProgress(progressMap[p.phase], {
              loaded: fileSize,
              total: fileSize,
              phase: p.phase as UploadProgressPhase,
            });
          }
        } catch {
          /* ignore */
        }
      } else if (eventType === "done" && data) {
        if (onProgress)
          onProgress(100, { loaded: fileSize, total: fileSize, phase: "server_processing" });
        return JSON.parse(data);
      } else if (eventType === "error" && data) {
        const err = JSON.parse(data) as { message?: string; error?: string };
        throw new Error(err.message || err.error || "Upload-Bestätigung fehlgeschlagen.");
      }
    }
  }
}

export const api = {
  search(query: string, limit = 10, type?: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (type) params.set("type", type);
    return request(`/api/search?${params.toString()}`);
  },

  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

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
      slugPrefix?: string;
    }): Promise<BrainPage[]> {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.source) params.set("source", options.source);
      if (options?.type) params.set("type", options.type);
      if (options?.tag) params.set("tag", options.tag);
      if (options?.q) params.set("q", options.q);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.slugPrefix) params.set("slug_prefix", options.slugPrefix);
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

  memory: {
    list(opts?: { caseSlug?: string; type?: string; pinnedOnly?: boolean }): Promise<{
      memories: Array<{
        id: string;
        type: string;
        key: string;
        value: string;
        source: string;
        pinned: boolean;
        caseSlug?: string;
        entities?: string[];
        supersededBy?: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }> {
      const params = new URLSearchParams();
      if (opts?.caseSlug) params.set("caseSlug", opts.caseSlug);
      if (opts?.type) params.set("type", opts.type);
      if (opts?.pinnedOnly) params.set("pinnedOnly", "true");
      return request(`/api/copilot/memory?${params.toString()}`);
    },

    search(
      query: string,
      caseSlug?: string
    ): Promise<{
      results: Array<{
        id: string;
        type: string;
        key: string;
        value: string;
        pinned: boolean;
        entities?: string[];
      }>;
    }> {
      return request("/api/copilot/memory", {
        method: "POST",
        body: JSON.stringify({ action: "search", message: query, caseSlug }),
      });
    },

    infer(
      message: string,
      caseSlug?: string
    ): Promise<{
      inferred: Array<{ id: string; type: string; key: string; value: string }>;
      superseded?: string[];
      method: string;
    }> {
      return request("/api/copilot/memory", {
        method: "POST",
        body: JSON.stringify({ action: "infer", message, caseSlug }),
      });
    },

    create(opts: {
      type: string;
      key: string;
      value: string;
      source?: string;
      caseSlug?: string;
      pinned?: boolean;
    }): Promise<{ memory: { id: string; type: string; key: string; value: string } }> {
      return request("/api/copilot/memory", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...opts }),
      });
    },

    recordAgentAction(opts: {
      key: string;
      value: string;
      type?: string;
      caseSlug?: string;
    }): Promise<{ memory: { id: string }; superseded?: string[] }> {
      return request("/api/copilot/memory", {
        method: "POST",
        body: JSON.stringify({ action: "agent_action", ...opts }),
      });
    },

    update(
      id: string,
      updates: { value?: string; pinned?: boolean; type?: string }
    ): Promise<{
      ok: boolean;
    }> {
      return request("/api/copilot/memory", {
        method: "PATCH",
        body: JSON.stringify({ id, ...updates }),
      });
    },

    delete(id: string): Promise<{ ok: boolean }> {
      return request("/api/copilot/memory", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
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
    fristen(params?: { case?: string; status?: string; heute?: string }): Promise<{
      fristen: Array<{
        id: string;
        case_slug?: string;
        case_title?: string;
        title: string;
        description?: string;
        due_date: string;
        status: string;
        type: string;
        law?: string;
        court?: string;
        source: string;
        source_slug?: string;
        vorfrist_date?: string;
        is_notfrist?: boolean;
        second_check_required?: boolean;
        second_check_by?: string;
        second_check_at?: string;
        erv_zustelldatum?: string;
        review_status?: string;
        reviewed_by?: string;
        reminder_sent_at?: string;
        calculation_note?: string;
      }>;
      zusammenfassung: {
        gesamt: number;
        overdue: number;
        critical: number;
        warning: number;
        vorfrist: number;
        pending: number;
        done: number;
      };
    }> {
      const qs = new URLSearchParams();
      if (params?.case) qs.set("case", params.case);
      if (params?.status) qs.set("status", params.status);
      if (params?.heute) qs.set("heute", params.heute);
      return request(`/api/legal/fristen${qs.toString() ? `?${qs}` : ""}`);
    },

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
    }): Promise<{ redline: string; receipt?: WorkProductReceipt }> {
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
          const parsed = JSON.parse(text);
          const receipt = parsed.receipt as WorkProductReceipt | undefined;
          const redline = JSON.stringify(parsed);
          return { redline, receipt };
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

  backup: {
    list(): Promise<{
      backups: Array<{
        id: string;
        filename: string;
        createdAt: string;
        createdBy: string;
        totalPages: number;
        totalSize: number;
        pageTypes: Record<string, number>;
        status: string;
      }>;
      stats: {
        totalBackups: number;
        totalSize: number;
        lastBackupAt: string | null;
        oldestBackupAt: string | null;
      };
    }> {
      return request("/api/admin/backup");
    },

    create(): Promise<{ ok: boolean; backup: Record<string, unknown> }> {
      return request("/api/admin/backup", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
    },

    preview(id: string): Promise<{
      metadata: Record<string, unknown>;
      preview: Array<{ slug: string; title: string; type: string }>;
      totalPages: number;
    }> {
      return request(`/api/admin/backup/${encodeURIComponent(id)}?action=preview`);
    },

    download(id: string): string {
      return `/api/admin/backup/${encodeURIComponent(id)}?action=download`;
    },

    restore(
      id: string,
      pageTypes?: string[]
    ): Promise<{
      ok: boolean;
      restored: number;
      skipped: number;
      failed: number;
      errors: string[];
    }> {
      return request(`/api/admin/backup/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ confirm: true, pageTypes }),
      });
    },

    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/api/admin/backup/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
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
      source?: "whatsapp" | "portal" | "web" | "email" | "bea" | "scan" | "manual";
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
      acceptance?: Record<string, unknown>;
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

  inbox: {
    list(params?: {
      channel?: "all" | "bea" | "whatsapp" | "email" | "portal";
      unread_only?: boolean;
      limit?: number;
      triage?: boolean;
    }): Promise<Record<string, unknown>> {
      const searchParams = new URLSearchParams();
      if (params?.channel) searchParams.set("channel", params.channel);
      if (params?.unread_only) searchParams.set("unread_only", "true");
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.triage) searchParams.set("triage", "true");
      const qs = searchParams.toString();
      return request(`/api/inbox${qs ? `?${qs}` : ""}`);
    },

    markRead(input: { slug: string; read?: boolean }): Promise<Record<string, unknown>> {
      return request("/api/inbox/read", {
        method: "PATCH",
        body: JSON.stringify({ slug: input.slug, read: input.read ?? true }),
      });
    },
  },

  reviewInbox: {
    list(): Promise<{
      items: Array<{
        id: string;
        type:
          | "document_request"
          | "suggested_deadline"
          | "client_submission"
          | "suggested_party"
          | "pending_fact";
        title: string;
        description: string;
        caseSlug: string | null;
        caseTitle: string | null;
        priority: "high" | "medium" | "low";
        source: string;
        createdAt: string;
        status: string;
        actionLabel: string;
        secondaryLabel: string | null;
        pageSlug: string;
        requestSlug: string | null;
        items: string[];
        channel: string | null;
        portalUrl: string | null;
        messageDraft: string | null;
        dueDate: string | null;
        urgency: string | null;
        law: string | null;
        confidence: string | null;
        sourceQuote: string | null;
        partyName: string | null;
        partyRole: string | null;
        factId: string | null;
        factStatement: string | null;
        factConfidence: string | null;
        arrayIndex: number | null;
      }>;
      total: number;
    }> {
      return request("/api/review-inbox");
    },
  },

  triage: {
    action(input: {
      slug: string;
      action: "accept" | "reject" | "assign" | "create_deadline" | "dismiss";
      case_slug?: string;
      deadline_date?: string;
      deadline_label?: string;
    }): Promise<Record<string, unknown>> {
      return request("/api/triage/action", { method: "POST", body: JSON.stringify(input) });
    },
  },

  bea: {
    send(input: {
      filing_slug: string;
      draft_slug: string;
      court: string;
      case_number?: string;
      subject: string;
      sender_name: string;
      sender_id?: string;
      priority?: "normal" | "urgent" | "fristgebunden";
      deadline_date?: string;
      deadline_id?: string;
      documents: Array<{
        title: string;
        file_path: string;
        mime_type: string;
        size_bytes: number;
        file_hash: string;
        is_main_document?: boolean;
      }>;
    }): Promise<Record<string, unknown>> {
      return request("/api/bea/send", { method: "POST", body: JSON.stringify(input) });
    },

    retry(input: {
      filing_slug: string;
      draft_slug: string;
      court: string;
      case_number?: string;
      subject: string;
      sender_name: string;
      sender_id?: string;
      priority?: "normal" | "urgent" | "fristgebunden";
      deadline_date?: string;
      deadline_id?: string;
    }): Promise<Record<string, unknown>> {
      return request("/api/bea/send/retry", { method: "POST", body: JSON.stringify(input) });
    },
  },

  outlook: {
    calendar: {
      list(params?: { since?: string; maxResults?: number }): Promise<Record<string, unknown>> {
        const searchParams = new URLSearchParams();
        if (params?.since) searchParams.set("since", params.since);
        if (params?.maxResults) searchParams.set("maxResults", String(params.maxResults));
        const qs = searchParams.toString();
        return request(`/api/outlook/calendar${qs ? `?${qs}` : ""}`);
      },

      create(input: {
        subject: string;
        start: string;
        end: string;
        timeZone?: string;
        location?: string;
        body?: string;
        attendees?: Array<{ name: string; email: string }>;
        categories?: string[];
        caseSlug?: string;
      }): Promise<Record<string, unknown>> {
        return request("/api/outlook/calendar/create", {
          method: "POST",
          body: JSON.stringify(input),
        });
      },
    },

    mail: {
      list(params?: { deltaLink?: string; maxResults?: number }): Promise<Record<string, unknown>> {
        const searchParams = new URLSearchParams();
        if (params?.deltaLink) searchParams.set("deltaLink", params.deltaLink);
        if (params?.maxResults) searchParams.set("maxResults", String(params.maxResults));
        const qs = searchParams.toString();
        return request(`/api/outlook/mail${qs ? `?${qs}` : ""}`);
      },
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
        pause_for_review?: boolean;
        jurisdiction?: string;
        doc_type?: string;
        defer_pipeline?: boolean;
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
      const MAX_RETRIES = 4;
      // 429 = server-side upload concurrency guard (busy) — MUST be retried,
      // honoring Retry-After, so a burst never surfaces a raw error to the user
      // (Dropbox never shows "too busy"). 502/503/504 = transient gateway/engine.
      const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

      // ── Stage 1: Get upload token (auth + quota reservation) ──────────
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
            pause_for_review: options?.pause_for_review,
            jurisdiction: options?.jurisdiction,
            doc_type: options?.doc_type,
            defer_pipeline: options?.defer_pipeline,
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

      // ── Stage 2: Try presigned URL path (bytes bypass server) ─────────
      // Harvey-style architecture: browser uploads directly to S3/R2,
      // server never touches file bytes → zero RAM pressure.
      if (uploadToken && engineUrl) {
        try {
          // End-to-end integrity: hash the file so the engine can verify the
          // stored bytes match at confirm. For multipart uploads (>100MB) the
          // hash is computed incrementally during the upload loop (no double-read).
          // For single PUT (≤100MB) we use SubtleCrypto one-shot before upload.
          const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
          const PART_SIZE = 8 * 1024 * 1024; // 8MB
          const willUseMultipart = file.size > MULTIPART_THRESHOLD;
          let fileSha256: string | null = null;

          if (!willUseMultipart) {
            // Small file: hash now (SubtleCrypto one-shot, ≤256MB is fine)
            fileSha256 = await computeFileSha256(file);
          }
          // For multipart: hash will be computed during the upload loop below
          const presignRes = await fetch(`${engineUrl}/api/upload/presign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-upload-token": uploadToken,
            },
            body: JSON.stringify({
              filename: file.name,
              size: file.size,
              content_type: file.type || undefined,
              source: options?.source ?? "documents",
              case_slug: options?.case_slug,
              title: options?.title,
              tags: options?.tags,
              password: options?.password,
              expected_sha256: fileSha256 ?? undefined,
            }),
            signal: AbortSignal.timeout(15_000),
          });

          if (presignRes.ok) {
            const presign = (await presignRes.json()) as {
              mode: "presigned" | "streaming";
              url: string;
              method: "PUT" | "POST";
              headers?: Record<string, string>;
              upload_token: string;
              expires_at: number;
            };

            // ── Stage 2b: Connectivity probe ────────────────────────────
            // Quick HEAD to the presigned URL to verify network reachability.
            // S3/R2 will return 403/405 for HEAD on a PUT-presigned URL —
            // that's fine, it proves connectivity. A network error means
            // CORS/firewall blocks direct-to-storage → fall back immediately.
            if (presign.mode === "presigned") {
              try {
                await fetch(presign.url, {
                  method: "HEAD",
                  signal: AbortSignal.timeout(5_000),
                  mode: "cors",
                });
              } catch {
                // Network/CORS error — storage not reachable from browser
                console.warn(
                  "[upload] presigned URL not reachable (CORS/firewall), falling back to direct-upload"
                );
                throw new Error("presign_connectivity_failed");
              }
            }

            // ── Stage 3: Upload bytes directly to storage ───────────────

            if (presign.mode === "presigned" && file.size > MULTIPART_THRESHOLD) {
              // ── Multipart upload for large files (resumable) ───────────
              const partCount = Math.ceil(file.size / PART_SIZE);

              // Check for existing session (resume from tab close/reload)
              const existingSession = await getUploadSession(
                file.name,
                file.size,
                presign.upload_token
              );
              let mpInit: {
                upload_id: string;
                storage_path: string;
                parts: Array<{ part_number: number; url: string }>;
              };
              let uploadedParts: Array<{ part_number: number; etag: string }>;

              if (existingSession && existingSession.completedParts.length > 0) {
                // Resume: reuse existing upload ID, re-presign parts
                const mpResumeRes = await fetch(`${engineUrl}/api/upload/presign-multipart`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-upload-token": presign.upload_token,
                  },
                  body: JSON.stringify({ part_count: partCount }),
                  signal: AbortSignal.timeout(30_000),
                });
                if (!mpResumeRes.ok) {
                  await deleteUploadSession(file.name, file.size, presign.upload_token);
                  throw new Error(`Multipart resume failed: HTTP ${mpResumeRes.status}`);
                }
                const mpResume = (await mpResumeRes.json()) as {
                  upload_id: string;
                  storage_path: string;
                  parts: Array<{ part_number: number; url: string }>;
                };
                // Use the existing upload ID (the presign just generates URLs)
                mpInit = { ...mpResume, upload_id: existingSession.uploadId };
                uploadedParts = [...existingSession.completedParts];
                console.info(
                  `[upload] Resuming multipart upload: ${uploadedParts.length}/${partCount} parts already done`
                );
              } else {
                // Fresh multipart upload
                const mpInitRes = await fetch(`${engineUrl}/api/upload/presign-multipart`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-upload-token": presign.upload_token,
                  },
                  body: JSON.stringify({ part_count: partCount }),
                  signal: AbortSignal.timeout(30_000),
                });

                if (!mpInitRes.ok) {
                  throw new Error(`Multipart init failed: HTTP ${mpInitRes.status}`);
                }

                mpInit = (await mpInitRes.json()) as typeof mpInit;
                uploadedParts = [];
              }

              // Save session for potential resume
              const session: UploadSession = {
                id: `${presign.upload_token}-${file.name}-${file.size}`,
                filename: file.name,
                fileSize: file.size,
                fileType: file.type,
                uploadToken: presign.upload_token,
                uploadId: mpInit.upload_id,
                storagePath: mpInit.storage_path,
                partSize: PART_SIZE,
                partCount,
                completedParts: uploadedParts,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                options: options
                  ? {
                      title: options.title,
                      source: options.source,
                      tags: options.tags,
                      case_slug: options.case_slug,
                      password: options.password,
                      pause_for_review: options.pause_for_review,
                      jurisdiction: options.jurisdiction,
                      doc_type: options.doc_type,
                      defer_pipeline: options.defer_pipeline,
                    }
                  : undefined,
              };
              await saveUploadSession(session);

              // Determine which parts still need uploading
              const completedPartNumbers = new Set(uploadedParts.map((p) => p.part_number));
              const MAX_PART_RETRIES = 3;

              // ── Incremental hash-during-upload (Dropbox-style) ──
              // Instead of pre-hashing the entire file (double-read), we feed
              // each chunk to the hasher as it's read for upload. On resume,
              // already-completed parts are read and hashed without uploading.
              const { createSHA256 } = await import("hash-wasm");
              const hasher = await createSHA256();
              hasher.init();

              for (let i = 0; i < mpInit.parts.length; i++) {
                const partInfo = mpInit.parts[i];
                const start = i * PART_SIZE;
                const end = Math.min(start + PART_SIZE, file.size);
                const chunk = file.slice(start, end);
                const chunkBuf = new Uint8Array(await chunk.arrayBuffer());
                hasher.update(chunkBuf);

                if (completedPartNumbers.has(partInfo.part_number)) {
                  continue; // Already uploaded — chunk was just hashed, skip upload
                }

                let partUploaded = false;
                for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt++) {
                  try {
                    const partRes = await new Promise<{ etag: string }>((resolve, reject) => {
                      const xhr = new XMLHttpRequest();
                      xhr.open("PUT", partInfo.url);
                      xhr.setRequestHeader("Content-Type", "application/octet-stream");
                      if (onProgress) {
                        const baseProgress = (uploadedParts.length / partCount) * 90;
                        const partProgressRange = 90 / partCount;
                        xhr.upload.onprogress = (e) => {
                          if (e.lengthComputable) {
                            onProgress(baseProgress + (e.loaded / e.total) * partProgressRange, {
                              loaded: start + e.loaded,
                              total: file.size,
                              phase: "uploading",
                            });
                          }
                        };
                      }
                      xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                          const etag =
                            xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag") || "";
                          if (!etag) {
                            reject(new Error(`Part ${partInfo.part_number}: no ETag in response`));
                          } else {
                            resolve({ etag: etag.replace(/"/g, "") });
                          }
                        } else {
                          reject(new Error(`Part ${partInfo.part_number}: HTTP ${xhr.status}`));
                        }
                      };
                      xhr.onerror = () =>
                        reject(new Error(`Part ${partInfo.part_number}: network error`));
                      xhr.send(new Blob([chunkBuf]));
                    });
                    uploadedParts.push({ part_number: partInfo.part_number, etag: partRes.etag });
                    // Persist progress for resume
                    await updateSessionParts(session, uploadedParts);
                    partUploaded = true;
                    break;
                  } catch (partErr) {
                    console.warn(
                      `[upload] Part ${partInfo.part_number} attempt ${attempt + 1} failed:`,
                      partErr
                    );
                    if (attempt === MAX_PART_RETRIES - 1) throw partErr;
                  }
                }
                if (!partUploaded)
                  throw new Error(
                    `Part ${partInfo.part_number} failed after ${MAX_PART_RETRIES} retries`
                  );
              }

              // Finalize incremental hash
              fileSha256 = hasher.digest("hex");

              // Complete multipart upload
              const completeRes = await fetch(`${engineUrl}/api/upload/complete-multipart`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-upload-token": presign.upload_token,
                },
                body: JSON.stringify({
                  upload_id: mpInit.upload_id,
                  storage_path: mpInit.storage_path,
                  parts: uploadedParts,
                }),
                signal: AbortSignal.timeout(30_000),
              });

              if (!completeRes.ok) {
                // Try to abort the multipart upload to clean up
                try {
                  await fetch(`${engineUrl}/api/upload/abort-multipart`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-upload-token": presign.upload_token,
                    },
                    body: JSON.stringify({
                      upload_id: mpInit.upload_id,
                      storage_path: mpInit.storage_path,
                    }),
                  });
                } catch {}
                throw new Error(`Multipart complete failed: HTTP ${completeRes.status}`);
              }

              // Clean up session
              await deleteUploadSession(file.name, file.size, presign.upload_token);
            } else if (presign.mode === "presigned") {
              // ── Single PUT for files ≤ 100MB ─────────────────────────
              // Direct-to-S3/R2 upload — server never sees file bytes
              const putRes = await new Promise<Response>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open(presign.method, presign.url);
                if (presign.headers) {
                  for (const [k, v] of Object.entries(presign.headers)) {
                    xhr.setRequestHeader(k, v);
                  }
                }
                if (onProgress) {
                  onProgress(0, { loaded: 0, total: file.size, phase: "uploading" });
                  xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                      onProgress((e.loaded / e.total) * 90, {
                        loaded: e.loaded,
                        total: e.total,
                        phase: "uploading",
                      });
                    }
                  };
                  xhr.upload.onload = () => {
                    onProgress(90, {
                      loaded: file.size,
                      total: file.size,
                      phase: "server_processing",
                    });
                  };
                }
                xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(new Response());
                  } else {
                    reject(new Error(`Storage upload failed: HTTP ${xhr.status}`));
                  }
                };
                xhr.onerror = () => reject(new Error("Storage upload network error"));
                xhr.send(file);
              });
              void putRes; // bytes are now in storage
            } else if (presign.mode === "streaming") {
              // Local storage fallback: PUT to engine stream endpoint
              const streamUrl = presign.url.startsWith("http")
                ? presign.url
                : `${engineUrl}${presign.url}`;
              await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("PUT", streamUrl);
                xhr.setRequestHeader("x-upload-token", presign.upload_token);
                if (onProgress) {
                  onProgress(0, { loaded: 0, total: file.size, phase: "uploading" });
                  xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                      onProgress((e.loaded / e.total) * 90, {
                        loaded: e.loaded,
                        total: e.total,
                        phase: "uploading",
                      });
                    }
                  };
                  xhr.upload.onload = () => {
                    onProgress(90, {
                      loaded: file.size,
                      total: file.size,
                      phase: "server_processing",
                    });
                  };
                }
                xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) resolve();
                  else reject(new Error(`Stream upload failed: HTTP ${xhr.status}`));
                };
                xhr.onerror = () => reject(new Error("Stream upload network error"));
                xhr.send(file);
              });
            }

            // ── Stage 4: Confirm → engine downloads, scans, extracts ────
            if (onProgress) {
              onProgress(92, { loaded: file.size, total: file.size, phase: "server_processing" });
            }
            const confirmRes = await csrfFetch(`${BASE_URL}/api/upload/confirm`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
              },
              body: JSON.stringify({
                upload_token: presign.upload_token,
                source: options?.source ?? "documents",
                case_slug: options?.case_slug,
                expected_sha256: fileSha256 ?? undefined,
              }),
              signal: AbortSignal.timeout(540_000),
            });

            if (confirmRes.ok) {
              // SSE path: parse events for done/error
              const contentType = confirmRes.headers.get("content-type") ?? "";
              if (contentType.includes("text/event-stream") && confirmRes.body) {
                const result = await parseSseConfirm(confirmRes.body, onProgress, file.size);
                return result;
              }
              // Plain JSON fallback
              const result = (await confirmRes.json()) as {
                slug: string;
                title: string;
                original_persisted?: boolean;
                persist_error?: string;
                extraction_status?: string;
                extraction_method?: string;
                extraction_warnings?: string;
              };
              if (onProgress)
                onProgress(100, {
                  loaded: file.size,
                  total: file.size,
                  phase: "server_processing",
                });
              return result;
            }
            // Confirm failed — fall through to legacy path
            console.warn("[upload] presigned confirm failed, falling back to direct-upload");
          }
        } catch (err) {
          // Presign path failed (CORS, network, storage down) — fall back
          console.warn(
            `[upload] presigned path failed, falling back to direct-upload:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // ── Fallback: Legacy direct-upload path ───────────────────────────
      // Used when: no token, presign disabled, storage unreachable, or
      // enterprise firewall blocks direct-to-storage uploads.
      const formData = new FormData();
      formData.append("file", file);
      if (options?.title) formData.append("title", options.title);
      if (options?.source) formData.append("source", options.source);
      if (options?.tags) formData.append("tags", JSON.stringify(options.tags));
      if (options?.case_slug) formData.append("case_slug", options.case_slug);
      if (options?.password) formData.append("password", options.password);
      if (options?.pause_for_review) formData.append("pause_for_review", "true");
      if (options?.jurisdiction) formData.append("jurisdiction", options.jurisdiction);
      if (options?.doc_type) formData.append("doc_type", options.doc_type);
      if (options?.defer_pipeline) formData.append("defer_pipeline", "true");

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
              if (RETRYABLE_STATUS.has(xhr.status) && attempt < MAX_RETRIES) {
                // Honor Retry-After (seconds) when the server sends it (the 429
                // concurrency guard does), else exponential backoff. Capped at
                // 30s so the UI never appears wedged.
                const retryAfterHdr = xhr.getResponseHeader("Retry-After");
                const retryAfterMs = retryAfterHdr ? parseInt(retryAfterHdr, 10) * 1000 : 0;
                const delay = Math.min(
                  retryAfterMs > 0 ? retryAfterMs : Math.pow(2, attempt) * 1000,
                  30_000
                );
                console.warn(
                  `[upload] HTTP ${xhr.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                if (onProgress) {
                  onProgress(0, { loaded: 0, total: file.size, phase: "starting" });
                }
                setTimeout(() => attemptUpload(attempt + 1).then(resolve, reject), delay);
                return;
              }
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
      readiness: "processing" | "partial" | "indexed" | "copilot_ready" | "failed";
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
    async waitUntilQueryable(
      slug: string,
      options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}
    ) {
      const timeoutMs = options.timeoutMs ?? 10 * 60_000;
      const intervalMs = options.intervalMs ?? 1_500;
      const deadline = Date.now() + timeoutMs;
      while (true) {
        if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const current = await api.upload.status(slug);
        if (current.readiness === "indexed" || current.readiness === "copilot_ready")
          return current;
        if (current.readiness === "partial") {
          throw new ApiRequestError(
            "Dokument wurde nur teilweise extrahiert und ist noch nicht sicher im Copilot verwendbar.",
            409,
            "document_partial",
            current
          );
        }
        if (current.readiness === "failed") {
          throw new ApiRequestError(
            current.extraction_error ?? "Dokumentverarbeitung fehlgeschlagen.",
            422,
            current.extraction_error_code ?? "document_processing_failed",
            current
          );
        }
        if (Date.now() >= deadline) {
          throw new ApiRequestError(
            "Dokument wird weiterhin verarbeitet. Bitte später erneut versuchen.",
            408,
            "document_processing_timeout",
            current
          );
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, intervalMs);
          options.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );
        });
      }
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
        kind:
          | "navigation"
          | "list"
          | "summary"
          | "confirmation"
          | "deadline_cards"
          | "client_overview";
        title: string;
        items?: Array<{
          label: string;
          value?: string;
          href?: string;
          deadlineStatus?: string;
          daysUntil?: number;
          dueDate?: string;
          caseTitle?: string;
          caseSlug?: string;
          isNotfrist?: boolean;
          isVorfrist?: boolean;
          needsSecondCheck?: boolean;
          deadlineSlug?: string;
        }>;
        href?: string;
        message?: string;
        filterHref?: string;
        summary?: {
          caseTitle?: string;
          caseSlug?: string;
          caseStatus?: string;
          openDeadlines?: number;
          totalDeadlines?: number;
          nextDeadlineDate?: string;
          openTasks?: number;
          documentCount?: number;
        };
      };
    }> {
      return request("/api/copilot/tools", {
        method: "POST",
        body: JSON.stringify({ tool, params }),
      });
    },
  },

  cases: {
    list(params?: { type?: string; limit?: number }): Promise<BrainPage[]> {
      const searchParams = new URLSearchParams();
      searchParams.set("type", params?.type ?? "legal_case");
      if (params?.limit) searchParams.set("limit", String(params.limit));
      return request(`/api/search?type=legal_case&limit=${params?.limit ?? 200}`);
    },
  },

  deadlines: {
    list(params?: { limit?: number }): Promise<BrainPage[]> {
      return request(`/api/search?type=legal_deadline&limit=${params?.limit ?? 200}`);
    },
  },

  tasks: {
    list(params?: { limit?: number }): Promise<BrainPage[]> {
      return request(`/api/search?type=legal_task&limit=${params?.limit ?? 200}`);
    },
  },

  time: {
    list(params?: {
      from?: string;
      to?: string;
      billable?: boolean;
      unbilled?: boolean;
      limit?: number;
    }): Promise<{
      entries: Array<{
        id: string;
        description: string;
        minutes: number;
        date: string;
        rate?: number;
        billable: boolean;
        billed: boolean;
        case_slug?: string;
        case_title?: string;
        lawyer?: string;
        activity_type?: string;
      }>;
      total: number;
      summary: { total_minutes: number; total_hours: number; billable_amount: number };
    }> {
      const searchParams = new URLSearchParams();
      if (params?.from) searchParams.set("from", params.from);
      if (params?.to) searchParams.set("to", params.to);
      if (params?.billable !== undefined) searchParams.set("billable", String(params.billable));
      if (params?.unbilled) searchParams.set("unbilled", "true");
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const qs = searchParams.toString();
      return request(`/api/time${qs ? `?${qs}` : ""}`);
    },

    create(input: {
      case_slug: string;
      description: string;
      minutes: number;
      date: string;
      rate?: number;
      billable?: boolean;
      activity_type?: string;
      lawyer?: string;
    }): Promise<{ id: string }> {
      return request("/api/time", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    unbill(input: {
      entry_ids: string[];
      case_slug: string;
    }): Promise<{ updated: number; not_found: string[] }> {
      return request("/api/time/unbill", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    markBilled(input: {
      entry_ids: string[];
      invoice_number: string;
      case_slug: string;
    }): Promise<{ updated: number; not_found: string[]; invoice_number: string }> {
      return request("/api/time/mark-billed", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    update(input: {
      case_slug: string;
      id: string;
      description?: string;
      minutes?: number;
      date?: string;
      rate?: number;
      billable?: boolean;
      activity_type?: string;
      lawyer?: string;
    }): Promise<{
      entry: {
        id: string;
        description: string;
        minutes: number;
        date: string;
        rate?: number;
        billable: boolean;
        billed: boolean;
        activity_type?: string;
        lawyer?: string;
      };
    }> {
      return request("/api/time", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },

    delete(input: { case_slug: string; id: string }): Promise<{ ok: boolean }> {
      return request("/api/time", {
        method: "DELETE",
        body: JSON.stringify(input),
      });
    },
  },

  notifications: {
    list(params?: { unread?: boolean; limit?: number }): Promise<{
      notifications: Array<{
        id: string;
        type: string;
        data: Record<string, unknown>;
        readAt: string | null;
        createdAt: string;
      }>;
      total: number;
    }> {
      const searchParams = new URLSearchParams();
      if (params?.unread) searchParams.set("unread", "true");
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const qs = searchParams.toString();
      return request(`/api/notifications${qs ? `?${qs}` : ""}`);
    },

    markRead(id: string): Promise<{ ok: boolean }> {
      return request("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
    },

    markAllRead(): Promise<{ ok: boolean }> {
      return request("/api/notifications", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },

    delete(id: string): Promise<{ ok: boolean }> {
      return request("/api/notifications", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
    },

    deleteAllRead(): Promise<{ ok: boolean; deleted: number }> {
      return request("/api/notifications", {
        method: "DELETE",
        body: JSON.stringify({ deleteAllRead: true }),
      });
    },
  },

  autonomous: {
    getQueueStats(): Promise<{
      pending: number;
      running: number;
      completed: number;
      failed: number;
      requires_approval: number;
      by_priority: Record<"urgent" | "normal" | "low", number>;
    }> {
      return request("/api/autonomous/queue-stats");
    },

    listTasks(params?: { status?: string; limit?: number }): Promise<
      Array<{
        id: string;
        task_type: string;
        priority: "urgent" | "normal" | "low";
        title: string;
        status: string;
        case_slug?: string;
        payload: Record<string, unknown>;
        created_at: string;
        started_at?: string;
        completed_at?: string;
      }>
    > {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const qs = searchParams.toString();
      return request(`/api/autonomous/tasks${qs ? `?${qs}` : ""}`);
    },
  },

  workflows: {
    approveStep(input: {
      workflowSlug: string;
      stepId: string;
      action: "approve" | "reject";
      comment?: string;
    }): Promise<{
      ok: boolean;
      workflowSlug: string;
      stepId: string;
      action: string;
      approvalStatus: string;
    }> {
      return request("/api/workflows/approve", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },

  featureFlags: {
    list(): Promise<{
      flags: Array<{
        key: string;
        name: string;
        description: string;
        enabled: boolean;
        rolloutPercentage: number;
        allowedPlans: string[];
        allowedRoles: string[];
        updatedAt: string;
        updatedBy: string;
      }>;
    }> {
      return request("/api/admin/feature-flags");
    },

    create(input: {
      key: string;
      name: string;
      description?: string;
      enabled?: boolean;
      rolloutPercentage?: number;
      allowedPlans?: string[];
      allowedRoles?: string[];
    }): Promise<{ ok: boolean; flag: Record<string, unknown> }> {
      return request("/api/admin/feature-flags", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    update(
      key: string,
      input: {
        name?: string;
        description?: string;
        enabled?: boolean;
        rolloutPercentage?: number;
        allowedPlans?: string[];
        allowedRoles?: string[];
      }
    ): Promise<{ ok: boolean; flag: Record<string, unknown> }> {
      return request("/api/admin/feature-flags", {
        method: "PATCH",
        body: JSON.stringify({ key, ...input }),
      });
    },

    delete(key: string): Promise<{ ok: boolean }> {
      return request("/api/admin/feature-flags", {
        method: "DELETE",
        body: JSON.stringify({ key }),
      });
    },

    check(key?: string): Promise<{
      key?: string;
      enabled: boolean;
      flags?: Array<{ key: string; name: string; enabled: boolean }>;
    }> {
      const qs = key ? `?key=${encodeURIComponent(key)}` : "";
      return request(`/api/feature-flags${qs}`);
    },
  },

  rciid: {
    submit(input: {
      caseSlug: string;
      caseTitle?: string;
      clientReference?: string;
      lawyerReference?: string;
      jurisdiction?: "DE" | "AT" | "CH" | "EU";
      caseType?: string;
      wallets: Array<{
        address: string;
        blockchain: "BTC" | "ETH" | "USDT" | "SOL" | "LTC" | "XRP" | "TRX" | "UNKNOWN";
        label?: string;
        notes?: string;
      }>;
      description?: string;
      priority?: "low" | "medium" | "high" | "urgent";
      webhookUrl?: string;
    }): Promise<{
      ok: boolean;
      caseId: string;
      status: string;
      pricing?: { amount: number; currency: string; type: "flat" | "hourly" };
      estimatedCompletionDays?: number;
      webhookRegistered?: boolean;
    }> {
      return request("/api/rciid/submit", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    getStatus(rciidCaseId: string): Promise<{
      ok: boolean;
      caseId: string;
      status: string;
      progressPercent: number;
      currentPhase: string;
      estimatedCompletionDays?: number;
      pricing?: { amount: number; currency: string; type: "flat" | "hourly" };
      timeline?: Array<{ phase: string; timestamp: string; description: string }>;
      updatedAt?: string;
    }> {
      return request("/api/rciid/status", {
        method: "POST",
        body: JSON.stringify({ rciidCaseId }),
      });
    },

    getReport(
      rciidCaseId: string,
      format?: "json" | "pdf"
    ): Promise<{
      ok: boolean;
      caseId: string;
      status: string;
      reportUrl?: string;
      summary?: string;
      findings?: Array<{
        title: string;
        description: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        evidence?: string[];
      }>;
      generatedAt?: string;
    }> {
      return request("/api/rciid/report", {
        method: "POST",
        body: JSON.stringify({ rciidCaseId, format: format ?? "json" }),
      });
    },

    detectWallets(input: { text?: string; caseSlug?: string }): Promise<{
      ok: boolean;
      wallets: Array<{
        address: string;
        blockchain: string;
        confidence: number;
        context?: string;
        isKnownFraud: boolean;
      }>;
      count: number;
    }> {
      return request("/api/rciid/detect-wallets", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },

    listCases(params?: { status?: string; limit?: number; offset?: number }): Promise<{
      ok: boolean;
      cases: Array<{
        case_id: string;
        status: string;
        progress_percent: number;
        current_phase: string;
        updated_at?: string;
      }>;
      total?: number;
    }> {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const q = qs.toString();
      return request(`/api/rciid/cases${q ? `?${q}` : ""}`);
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
