import type { GroundingMetadata } from "@/lib/citation-gate-client";

export interface BrainPage {
  slug: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  source?: string;
  tags?: string[];
  entities?: Entity[];
  backlinks?: string[];
  word_count?: number;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

export interface Entity {
  slug: string;
  type: "person" | "company" | "idea" | "document" | "event" | "place";
  name: string;
  description?: string;
  connections?: EntityConnection[];
}

export interface EntityConnection {
  target_slug: string;
  target_name: string;
  edge_type: string;
  weight?: number;
}

export interface SearchResult {
  slug: string;
  title: string;
  snippet: string;
  score: number;
  evidence?: string;
  source?: string;
  /** Page type (legal_case, legal_document, …). */
  type?: string;
  /** Matter the hit belongs to, when the page is bound to one. */
  case_slug?: string;
  created_at?: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  gaps: string[];
  tokens_used?: number;
  latency_ms?: number;
  mode?: "conservative" | "balanced" | "tokenmax";
  /** Model the engine answered with, e.g. "anthropic:claude-sonnet-5". */
  model?: string;
  _grounding?: GroundingMetadata;
  /** True when verification replaced the streamed draft with `answer`. */
  answer_revised?: boolean;
}

export interface Citation {
  slug: string;
  title: string;
  quote: string;
  confidence: number;
}

export interface BrainStats {
  total_pages: number;
  total_entities: number;
  total_queries: number;
  total_edges: number;
  last_synced?: string;
  storage_used_mb?: number;
  dream_cycle_last?: string;
  /**
   * Whether the engine actually answered this request. `false` means the
   * proxy could not reach the engine (timeout, network error, non-2xx) and
   * the counts above are fallback zeros — NOT a real empty brain. Always
   * present on responses from `/api/stats`; optional only because older
   * cached query data (or tests) may predate this field.
   */
  engine_reachable?: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  type: Entity["type"];
  connections: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  weight?: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "processing" | "done" | "error";
  progress: number;
  slug?: string;
  error?: string;
}

export interface RecentQuery {
  id: string;
  query: string;
  answer_preview: string;
  citations_count: number;
  created_at: string;
}

export interface OnboardingProgress {
  firm: boolean;
  firstCase: boolean;
  firstDeadline: boolean;
  teamInvited: boolean;
  firstQuery: boolean;
  /** Guided dashboard tour finished or skipped — kept server-side so a new device does not replay it. */
  tourCompleted?: boolean;
}

export interface ConflictMatch {
  slug: string;
  title: string;
  role: "client" | "opponent" | "contact";
  status: string;
  matched_name: string;
  exact: boolean;
  similarity?: number;
  match_type?: "exact" | "fuzzy" | "substring";
  /** Relative to the new mandate: critical (other side), review, info (same side). */
  assessment?: "critical" | "review" | "info";
}

export interface ConflictCheckResponse {
  name: string;
  /** Side of the checked name in the new mandate, when the caller gave one. */
  side?: "client" | "opponent";
  severity: "critical" | "low" | "none";
  explanation: string;
  matches: ConflictMatch[];
  checked_cases: number;
  disclaimer: string;
}

export interface JudgementsSyncResponse {
  success: boolean;
  jurisdiction: string;
  fetched: number;
  imported: number;
  errors?: string[];
}

export interface ConnectorStatus {
  service: string;
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  hasCredentials: boolean;
  last_sync_at: number | null;
}

export interface AnonReplacement {
  type: string;
  original: string;
  placeholder: string;
}

export interface AnonymizeResponse {
  anonymized: string;
  replacements: AnonReplacement[];
  stats: Record<string, number>;
  llm_used: boolean;
  count: number;
  disclaimer: string;
}

export interface TabularCell {
  answer: string;
  citations: { slug: string; title: string }[];
}

export interface TabularRow {
  slug: string;
  title: string;
  cells: TabularCell[];
}

export interface TabularReviewResponse {
  questions: string[];
  rows: TabularRow[];
  document_count: number;
  truncated: boolean;
}

// ── Async tabular review runs (start / status / retry) ───────────────

export interface TabularReviewEstimate {
  llm_calls: number;
  approx_input_tokens: number;
  approx_output_tokens: number;
  approx_usd: number;
}

export interface TabularReviewStartRequest {
  questions: string[];
  slugs?: string[];
  case_slug?: string;
  type?: string;
  limit?: number;
  title?: string;
  concurrency?: number;
}

export type TabularReviewRunStatus = "queued" | "running" | "done" | "partial" | "failed";

export interface TabularReviewStartResponse {
  run_slug: string;
  job_id: string;
  document_count: number;
  estimate: TabularReviewEstimate;
  status: "queued";
}

export interface TabularReviewCell {
  answer: string;
  citations: string[];
}

export type TabularReviewRowStatus = "pending" | "done" | "error";

export interface TabularReviewRow {
  slug: string;
  title: string;
  status: TabularReviewRowStatus;
  cells?: TabularReviewCell[];
  error?: string;
}

export interface TabularReviewRun {
  run_slug: string;
  title: string;
  status: TabularReviewRunStatus;
  progress: { total: number; done: number; failed: number };
  questions: string[];
  rows: TabularReviewRow[];
  estimate: TabularReviewEstimate;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
}

export interface TabularReviewRetryResponse {
  job_id: string;
  retried: number;
  status: "queued";
}

export type PlaybookRequiredPosition = "favorable" | "neutral" | "exclude" | "must_include";
export type PlaybookSeverity = "low" | "medium" | "high" | "critical";

export interface PlaybookRule {
  id: string;
  clause_type: string;
  required_position: PlaybookRequiredPosition;
  deviation_flag: string;
  severity: PlaybookSeverity;
  notes?: string;
}

export interface Playbook {
  slug: string;
  title: string;
  jurisdiction: string;
  contract_types: string[];
  rules: PlaybookRule[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface PricingTier {
  id: "free" | "pro" | "team";
  name: string;
  price_monthly: number;
  price_yearly: number;
  pages_limit: number;
  queries_limit: number | null;
  features: string[];
  highlight?: boolean;
}

// ── Legal Analysis Types ──────────────────────────────────────────────

export interface DocumentAnalysisIssue {
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  quote: string;
  rationale: string;
}

export interface DocumentAnalysisResult {
  document_type: string;
  type_confidence?: number;
  parties: Array<{ name: string; role: string }>;
  key_dates?: Array<{ date: string; what: string }>;
  deadlines?: Array<{ label: string; date: string; urgency: string; source: string }>;
  issues?: DocumentAnalysisIssue[];
  cited_statutes?: Array<{ code: string; paragraph: string; context: string; verified: boolean }>;
  relevant_statutes?: string[];
  risks?: Array<{ severity: string; description: string; mitigation: string }>;
  action_items?: string[];
  recommended_actions?: string[];
  summary: string;
  language?: string;
  attorney_review_required?: boolean;
  privilege?: {
    is_privileged: boolean;
    privilege_type: "attorney_client" | "work_product" | "settlement_negotiation" | "none";
    privilege_basis: string;
  };
  suggested_precedents?: Array<{
    id: string;
    title: string;
    court: string;
    date: string;
    case_number: string;
    ecli: string;
    legal_area: string;
    url: string;
    snippet: string;
    source: string;
    relevance_reason: string;
  }>;
  warnings?: string[];
  _grounding?: GroundingMetadata;
  _warnings?: string[];
  _degraded?: boolean;
}

export interface PrecedentSearchResult {
  id: string;
  title: string;
  court: string;
  date: string;
  legalArea: string;
  keyHolding: string;
  relevanceScore: number;
  source: "internal" | "external";
  caseRef?: string;
}

export interface PrecedentSearchResponse {
  results: PrecedentSearchResult[];
  total: number;
  warnings?: string[];
}

export interface TranslationGlossaryEntry {
  source_term: string;
  target_term: string;
  note?: string;
}

export interface DocumentTranslation {
  translated_text: string;
  source_language: string;
  target_language: string;
  glossary: TranslationGlossaryEntry[];
  warnings: string[];
  attorney_review_required: true;
}

export interface ObligationEntry {
  description: string;
  obligated_party: string;
  counterparty: string;
  type:
    | "payment"
    | "notice"
    | "delivery"
    | "performance"
    | "compliance"
    | "renewal"
    | "termination"
    | "other";
  trigger_date?: string;
  recurring?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "one-time";
  urgency: "low" | "medium" | "high" | "critical";
  clause_reference?: string;
  notes?: string;
}

// ── Legal Grounding Types ─────────────────────────────────────────────

export interface RawCitation {
  code?: string;
  paragraph?: string;
  context?: string;
}

export interface GroundedCitation {
  code: string;
  paragraph: string;
  context?: string;
  verified: boolean;
  source_text?: string;
  source_file?: string;
  /** Official text of the norm / decision (AT: RIS). */
  source_url?: string;
  /** RIS search for a citation we could not resolve (case law). */
  search_url?: string;
  /** Does the source carry the statement it is cited for? (second grounding stage) */
  support?: "supported" | "partial" | "unsupported" | "unchecked";
  /** One-sentence reason for the support verdict. */
  support_reason?: string;
  unverifiable_reason?: string;
  category?:
    | "statute"
    | "state_treaty"
    | "state_law"
    | "materialien"
    | "literatur"
    | "verlags_literatur"
    | "judikatur";
  jurisdiction?: "at" | "de" | "ch" | "eu";
}

export interface ObligationExtractionResult {
  obligations: ObligationEntry[];
  renewal_dates: Array<{ date: string; description: string; auto_renew: boolean }>;
  payment_terms: Array<{ due_date: string; amount?: string; description: string }>;
  notice_periods: Array<{ event: string; notice_period: string; days: number }>;
  summary: string;
  warnings: string[];
  attorney_review_required: true;
}

// ── Shared Spaces Types ─────────────────────────────────────────────────────

export interface SharedSpace {
  id: string;
  slug: string;
  name: string;
  description?: string;
  organization_id: string;
  created_by: string;
  created_at: string;
  expires_at?: string;
  status: "active" | "expired" | "archived";
  access_token: string;
  settings: {
    allow_upload: boolean;
    allow_download: boolean;
    max_file_size: number;
    allowed_file_types: string[];
    require_auth: boolean;
  };
}

export interface SharedSpaceParticipant {
  id: string;
  shared_space_id: string;
  user_id?: string;
  email?: string;
  role: "owner" | "editor" | "viewer";
  invited_by: string;
  invited_at: string;
  accepted_at?: string;
}

export interface SharedSpaceDocument {
  id: string;
  shared_space_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_at: string;
  metadata?: {
    whatsapp_message_id?: string;
    client_portal_upload?: boolean;
  };
}

export interface WhatsAppDocumentMapping {
  id: string;
  whatsapp_message_id: string;
  shared_space_id?: string;
  document_id?: string;
  mapped_at: string;
  mapped_by: "system" | "user";
}

// ── Claim Provenance & Confidence Types ──────────────────────────────

export interface ProvenanceLink {
  claim_index: number;
  claim_text: string;
  source_slug: string;
  source_passage: string;
  passage_start: number;
  passage_end: number;
  relevance: "direct" | "paraphrase" | "background";
}

export interface ProvenanceResult {
  links: ProvenanceLink[];
  unsupported_claims: string[];
}

export interface ClaimConfidence {
  claim_text: string;
  claim_index: number;
  confidence: number;
  level: "high" | "medium" | "low";
  factors: {
    has_citation: boolean;
    citation_grounded: boolean;
    citation_verified: boolean;
    hedging_detected: boolean;
    guardrail_flags: number;
    cross_verify_flags: number;
  };
  supporting_passages: string[];
}

export interface DocumentConfidence {
  overall_confidence: number;
  confidence_level: "high" | "medium" | "low";
  claim_confidences: ClaimConfidence[];
}

/**
 * The engine keeps a page's type in its own column and strips `type` from the
 * stored frontmatter, so `page.frontmatter.type` is undefined for every page
 * that came through the engine. Parsers must gate on the column first and only
 * fall back to frontmatter (fixtures, offline cache, markdown imports).
 */
export function pageTypeOf(
  page: { type?: string | null; frontmatter?: Record<string, unknown> | null } | null | undefined
): string | undefined {
  if (!page) return undefined;
  if (typeof page.type === "string" && page.type) return page.type;
  const fmType = page.frontmatter?.type;
  return typeof fmType === "string" && fmType ? fmType : undefined;
}
