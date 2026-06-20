/**
 * Matter Context Types — Kanzlei Superbrain / Legal Context Graph.
 *
 * Definiert den Datenvertrag für Matter Context Bundles, Coverage-Status,
 * Gap Detection und Retrieval Explainability.
 *
 * Diese Typen sind die Single Source of Truth für das Superbrain-Modul.
 * Keine ad-hoc-Typen in API-Routen oder UI-Komponenten.
 */

import type { ExtractionStatus, ExtractionMethod } from "@/lib/extraction-status";

// ── Query Modes ───────────────────────────────────────────────────────

export type QueryMode =
  | "conservative" // nur freigegebene/hochvertrauenswürdige Quellen
  | "balanced" // interne Akten + freigegebene Quellen
  | "deep_matter" // gesamte Akte inklusive Historie und Kommunikation
  | "external_law" // Rechtsquellen/Partnerquellen
  | "admin_audit"; // Audit-/Aktivitätskontext

export const QUERY_MODE_LABELS: Record<QueryMode, { label: string; description: string }> = {
  conservative: { label: "Präzise", description: "Nur freigegebene, hochvertrauenswürdige Quellen" },
  balanced: { label: "Balanced", description: "Interne Akten + freigegebene Quellen" },
  deep_matter: { label: "Deep Matter", description: "Gesamte Akte inkl. Historie und Kommunikation" },
  external_law: { label: "Externe Quellen", description: "Rechtsquellen und Partnerquellen" },
  admin_audit: { label: "Audit", description: "Audit- und Aktivitätskontext" },
};

// ── Matter Context Bundle ─────────────────────────────────────────────

export interface MatterParty {
  slug: string;
  name: string;
  role: "client" | "opponent" | "lawyer" | "court" | "witness" | "third_party" | "other";
  contact_info?: {
    email?: string;
    phone?: string;
    company?: string;
    address?: string;
  };
}

export interface MatterDeadlineSummary {
  id?: string;
  title: string;
  date: string;
  status: string;
  urgency: "overdue" | "critical" | "upcoming" | "normal" | "done";
  source: string;
  court?: string;
}

export interface MatterDocumentSummary {
  slug: string;
  name: string;
  kind?: string;
  uploaded_at: string;
  size?: number;
  source?: string;
  ocr_status?: "text_layer" | "ocr_complete" | "ocr_needed" | "unknown" | "not_applicable";
  extraction_status?: ExtractionStatus;
  extraction_method?: ExtractionMethod;
  extraction_unverified?: boolean;
}

export interface MatterActivityEntry {
  at: string;
  action: string;
  actor?: string;
  description: string;
  entity_type?: string;
}

export interface MatterFactEntry {
  id: string;
  statement: string;
  source: string;
  confidence: "high" | "medium" | "low";
  date?: string;
  superseded_by?: string;
  contradicts?: string[];
}

export interface MatterContextBundle {
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

// ── Coverage Status ───────────────────────────────────────────────────

export interface SourceCoverageEntry {
  source_id: string;
  source_label: string;
  source_type: "statute_corpus" | "judgement_api" | "dms" | "email" | "whatsapp" | "portal" | "upload" | "regulatory_feed" | "commercial";
  connected: boolean;
  last_sync_at: string | null;
  document_count: number;
  index_fresh: boolean;
  ocr_complete: boolean;
  error?: string;
}

export interface MatterCoverageStatus {
  sources: SourceCoverageEntry[];
  total_sources: number;
  connected_sources: number;
  fresh_sources: number;
  stale_sources: number;
  error_sources: number;
  ocr_pending: number;
  overall_freshness: "fresh" | "stale" | "unknown";
  completeness_score: number; // 0..1 — weighted: connected + fresh + ocr
  warnings: string[];
}

// ── Gap Detection ─────────────────────────────────────────────────────

export type GapType =
  | "missing_document"
  | "missing_deadline"
  | "missing_power_of_attorney"
  | "missing_attachment"
  | "missing_deadline_confirmation"
  | "unclear_opponent"
  | "unreviewed_document"
  | "contradictory_facts"
  | "stale_knowledge_asset"
  | "missing_client_info"
  | "engine_unreachable"
  | "incomplete_coverage";

export type GapSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface MatterGap {
  type: GapType;
  severity: GapSeverity;
  title: string;
  description: string;
  recommendation: string;
  detected_at: string;
  related_entity?: string;
}

// ── Retrieval Explainability ──────────────────────────────────────────

export interface RetrievalExplanation {
  slug: string;
  title: string;
  score: number;
  search_mode: "hybrid" | "semantic" | "keyword" | "graph" | "unknown";
  source: string;
  source_type?: string;
  recency_hours?: number;
  graph_signal?: number;
  chunk_info?: {
    page?: number;
    snippet?: string;
  };
  permission_filtered: boolean;
}

export interface ExplainedSearchResult {
  slug: string;
  title: string;
  snippet: string;
  score: number;
  explanation: RetrievalExplanation;
}

// ── Brain Dashboard Quality ───────────────────────────────────────────

export interface BrainQualitySummary {
  total_pages: number;
  total_entities: number;
  total_edges: number;
  indexed_pages: number;
  ocr_pending: number;
  stale_sources: number;
  coverage_score: number; // 0..1
  last_synced: string | null;
  source_breakdown: Array<{
    source_type: string;
    count: number;
    fresh: boolean;
  }>;
  quality_issues: string[];
}
