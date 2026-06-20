/**
 * Matter Context Client SDK — Typed API client for AI agents, workflows, and UI.
 *
 * Single entry point for all Matter Context API calls.
 * AI agents and workflows import from here instead of building ad-hoc fetch calls.
 *
 * @example
 * ```ts
 * import { matterContext } from "@/lib/matter-context-client";
 *
 * // Full bundle
 * const bundle = await matterContext.getBundle("cases/2024-001");
 *
 * // Sub-resources (lighter payloads)
 * const deadlines = await matterContext.getDeadlines("cases/2024-001");
 * const facts = await matterContext.getFacts("cases/2024-001");
 *
 * // Retrieval explainability
 * const results = await matterContext.explain("cases/2024-001", "Verjährung", "deep_matter");
 *
 * // Brain quality
 * const quality = await matterContext.getQuality();
 * ```
 */

import type {
  MatterContextBundle,
  MatterCoverageStatus,
  MatterFactEntry,
  MatterActivityEntry,
  MatterParty,
  MatterDeadlineSummary,
  MatterDocumentSummary,
  MatterGap,
  ExplainedSearchResult,
  BrainQualitySummary,
  QueryMode,
  MatterUnderstandingPanel,
} from "@/lib/matter-context-types";

// ── Response Types (API contract — mirrors API route responses) ───────

export interface MatterContextBundleResponse {
  case_slug: string;
  case_title: string;
  case_number?: string;
  legal_area?: string;
  status?: string;
  parties: MatterParty[];
  deadlines: MatterDeadlineSummary[];
  documents: MatterDocumentSummary[];
  recent_activity: MatterActivityEntry[];
  facts: MatterFactEntry[];
  coverage: MatterCoverageStatus;
  gaps: MatterGap[];
  generated_at: string;
  engine_reachable: boolean;
}

export interface MatterCoverageResponse extends MatterCoverageStatus {}

export interface MatterGapsResponse {
  case_slug: string;
  gaps: MatterGap[];
  gap_count: number;
  critical_count: number;
  high_count: number;
  generated_at: string;
}

export interface MatterFactsResponse {
  case_slug: string;
  facts: MatterFactEntry[];
  fact_count: number;
  high_confidence: number;
  contradictions: MatterGap[];
  generated_at: string;
}

export interface MatterActivityResponse {
  case_slug: string;
  recent_activity: MatterActivityEntry[];
  activity_count: number;
  generated_at: string;
}

export interface MatterPartiesResponse {
  case_slug: string;
  parties: MatterParty[];
  party_count: number;
  has_client: boolean;
  has_opponent: boolean;
  generated_at: string;
}

export interface MatterDeadlinesResponse {
  case_slug: string;
  deadlines: MatterDeadlineSummary[];
  deadline_count: number;
  overdue_count: number;
  critical_count: number;
  upcoming_count: number;
  generated_at: string;
}

export interface MatterDocumentsResponse {
  case_slug: string;
  documents: MatterDocumentSummary[];
  document_count: number;
  ocr_pending: number;
  extraction_pending: number;
  generated_at: string;
}

export interface MatterExplainResponse {
  query: string;
  mode: QueryMode;
  results: ExplainedSearchResult[];
  result_count: number;
  generated_at: string;
}

export interface MatterQualityResponse extends BrainQualitySummary {}

export interface MatterUnderstandingResponse extends MatterUnderstandingPanel {}

// ── Client ────────────────────────────────────────────────────────────

interface MatterContextClientOptions {
  /** Base URL for API calls. Defaults to relative paths (same-origin). */
  baseUrl?: string;
  /** Custom fetch (for testing or edge runtime). */
  fetchFn?: typeof fetch;
}

class MatterContextClient {
  private baseUrl: string;
  private fetchFn?: typeof fetch;

  constructor(options?: MatterContextClientOptions) {
    this.baseUrl = options?.baseUrl ?? "";
    this.fetchFn = options?.fetchFn;
  }

  private async get<T>(path: string): Promise<T> {
    const fetchImpl = this.fetchFn ?? globalThis.fetch;
    const res = await fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
      throw new MatterContextError(
        body.error ?? `http_${res.status}`,
        body.message ?? `Request failed: ${res.status}`,
        res.status,
      );
    }

    return res.json() as Promise<T>;
  }

  /** Full Matter Context Bundle — all sub-resources in one response. */
  getBundle(caseSlug: string): Promise<MatterContextBundleResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}`);
  }

  /** Coverage status — source connectivity, freshness, OCR completeness. */
  getCoverage(caseSlug: string): Promise<MatterCoverageResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/coverage`);
  }

  /** Gap detection — missing documents, overdue deadlines, contradictions. */
  getGaps(caseSlug: string): Promise<MatterGapsResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/gaps`);
  }

  /** Facts — extracted from strategy, claims, evidence with confidence levels. */
  getFacts(caseSlug: string): Promise<MatterFactsResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/facts`);
  }

  /** Recent activity — audit log + timeline entries, sorted descending. */
  getActivity(caseSlug: string): Promise<MatterActivityResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/activity`);
  }

  /** Parties — client, opponent, lawyer, court with contact info. */
  getParties(caseSlug: string): Promise<MatterPartiesResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/parties`);
  }

  /** Deadlines — sorted by date, with urgency classification. */
  getDeadlines(caseSlug: string): Promise<MatterDeadlinesResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/deadlines`);
  }

  /** Documents — with OCR and extraction status. */
  getDocuments(caseSlug: string): Promise<MatterDocumentsResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/documents`);
  }

  /** Retrieval explainability — search with source, score, mode, recency. */
  explain(caseSlug: string, query: string, mode?: QueryMode): Promise<MatterExplainResponse> {
    const params = new URLSearchParams({ q: query });
    if (mode) params.set("mode", mode);
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/explain?${params}`);
  }

  /** Brain quality summary — page/entity counts, source breakdown, quality issues. */
  getQuality(): Promise<MatterQualityResponse> {
    return this.get(`/api/matter-context/quality`);
  }

  /** Understanding panel — "Akte verstanden?" with facts, gaps, risks, freshness, recently changed sources. */
  getUnderstanding(caseSlug: string): Promise<MatterUnderstandingResponse> {
    return this.get(`/api/matter-context/${encodeSlug(caseSlug)}/understanding`);
  }
}

// ── Error ─────────────────────────────────────────────────────────────

export class MatterContextError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "MatterContextError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

// ── Singleton ─────────────────────────────────────────────────────────

export const matterContext = new MatterContextClient();
