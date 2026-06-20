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
  created_at?: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  gaps: string[];
  tokens_used?: number;
  latency_ms?: number;
  mode?: "conservative" | "balanced" | "tokenmax";
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

export interface ConflictMatch {
  slug: string;
  title: string;
  role: "client" | "opponent";
  status: string;
  matched_name: string;
  exact: boolean;
}

export interface ConflictCheckResponse {
  name: string;
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
  warnings?: string[];
  _grounding?: {
    citations_verified: number;
    citations_unverified: number;
    corpus_checked: boolean;
    analyzed_at: string;
  };
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

export interface CaseScannerResponse {
  success: boolean;
  job_id: string;
  status: "queued";
  look_ahead_days: number;
  evidence_threshold: number;
  max_cases: number;
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
  type: "payment" | "notice" | "delivery" | "performance" | "compliance" | "renewal" | "termination" | "other";
  trigger_date?: string;
  recurring?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "one-time";
  urgency: "low" | "medium" | "high" | "critical";
  clause_reference?: string;
  notes?: string;
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
