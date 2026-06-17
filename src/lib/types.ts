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
