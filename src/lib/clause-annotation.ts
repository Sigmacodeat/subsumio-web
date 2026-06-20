/**
 * Clause Annotation — strukturierte Risiko-Bewertung und Review-Status
 * für einzelne Vertragsklauseln.
 *
 * Eine Clause Annotation ist eine Brain-Page (type="clause_annotation")
 * die mit einem Vertrag (contract_slug) verknüpft ist. Sie enthält:
 * - Klauseltyp und -text (Auszug)
 * - Risiko-Level (low/medium/high/critical)
 * - Rechtsgrundlage (BGB, AGBG, DSGVO, etc.)
 * - Empfehlung (konkreter Änderungsvorschlag)
 * - Review-Status (pending/approved/rejected)
 * - Optional: Playbook-Regel-Referenz
 *
 * Architektur: Thin Client — Types und Helpers hier, Speicherung
 * über Brain-Pages via Engine API.
 */

import type { PlaybookSeverity } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────

export type ClauseRiskLevel = "low" | "medium" | "high" | "critical";

export type ClauseReviewStatus = "pending" | "approved" | "rejected";

export type ClauseCategory =
  | "nda"
  | "employment"
  | "service"
  | "sale"
  | "lease"
  | "partnership"
  | "licensing"
  | "settlement"
  | "liability"
  | "payment"
  | "termination"
  | "ip"
  | "data_protection"
  | "warranty"
  | "general";

export interface ClauseAnnotationFrontmatter {
  type: "clause_annotation";
  contract_slug: string;
  clause_type: ClauseCategory;
  clause_title: string;
  clause_excerpt: string;
  risk_level: ClauseRiskLevel;
  legal_basis: string;
  recommendation: string;
  review_status: ClauseReviewStatus;
  playbook_rule_id?: string;
  position_start?: number;
  position_end?: number;
  annotated_by: string;
  annotated_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  reject_reason?: string;
}

export interface ClauseAnnotation {
  slug: string;
  title: string;
  frontmatter: ClauseAnnotationFrontmatter;
}

// ── Label Maps ────────────────────────────────────────────────────────

export const RISK_LABELS: Record<ClauseRiskLevel, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

export const RISK_COLORS: Record<ClauseRiskLevel, string> = {
  low: "text-emerald-600",
  medium: "text-amber-600",
  high: "text-orange-600",
  critical: "text-red-600",
};

export const RISK_BADGE_VARIANT: Record<
  ClauseRiskLevel,
  "success" | "warning" | "danger" | "default"
> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export const REVIEW_STATUS_LABELS: Record<ClauseReviewStatus, string> = {
  pending: "Offen",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

export const CATEGORY_LABELS: Record<ClauseCategory, string> = {
  nda: "Geheimhaltung",
  employment: "Arbeitsrecht",
  service: "Dienstleistung",
  sale: "Kaufvertrag",
  lease: "Mietvertrag",
  partnership: "Partnerschaft",
  licensing: "Lizenz",
  settlement: "Vergleich",
  liability: "Haftung",
  payment: "Zahlung",
  termination: "Kündigung",
  ip: "Geistiges Eigentum",
  data_protection: "Datenschutz",
  warranty: "Gewährleistung",
  general: "Allgemein",
};

// ── Severity → Risk Level Mapping ─────────────────────────────────────

export function severityToRiskLevel(
  severity: PlaybookSeverity,
): ClauseRiskLevel {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

export function buildAnnotationSlug(
  contractSlug: string,
  clauseType: string,
  at?: Date,
): string {
  const date = at ?? new Date();
  const stamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const contractPart = contractSlug.split("/").pop() ?? contractSlug;
  return `clause_annotations/${contractPart}/${clauseType}-${stamp}`;
}

export function buildAnnotationTitle(
  clauseType: ClauseCategory,
  clauseTitle: string,
): string {
  const catLabel = CATEGORY_LABELS[clauseType] ?? clauseType;
  return `${catLabel}: ${clauseTitle}`;
}

export function buildAnnotationFrontmatter(params: {
  contract_slug: string;
  clause_type: ClauseCategory;
  clause_title: string;
  clause_excerpt: string;
  risk_level: ClauseRiskLevel;
  legal_basis: string;
  recommendation: string;
  annotated_by: string;
  playbook_rule_id?: string;
  position_start?: number;
  position_end?: number;
  at?: Date;
}): Record<string, unknown> {
  const fm: ClauseAnnotationFrontmatter = {
    type: "clause_annotation",
    contract_slug: params.contract_slug,
    clause_type: params.clause_type,
    clause_title: params.clause_title,
    clause_excerpt: params.clause_excerpt,
    risk_level: params.risk_level,
    legal_basis: params.legal_basis,
    recommendation: params.recommendation,
    review_status: "pending",
    playbook_rule_id: params.playbook_rule_id,
    position_start: params.position_start,
    position_end: params.position_end,
    annotated_by: params.annotated_by,
    annotated_at: (params.at ?? new Date()).toISOString(),
  };
  return { ...fm };
}

export function fmToAnnotation(page: {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}): ClauseAnnotation | null {
  const fm = (page.frontmatter ?? {}) as Partial<ClauseAnnotationFrontmatter>;
  if (fm.type !== "clause_annotation") return null;

  return {
    slug: page.slug,
    title: page.title,
    frontmatter: {
      type: "clause_annotation",
      contract_slug: fm.contract_slug ?? "",
      clause_type: fm.clause_type ?? "general",
      clause_title: fm.clause_title ?? "",
      clause_excerpt: fm.clause_excerpt ?? "",
      risk_level: fm.risk_level ?? "medium",
      legal_basis: fm.legal_basis ?? "",
      recommendation: fm.recommendation ?? "",
      review_status: fm.review_status ?? "pending",
      playbook_rule_id: fm.playbook_rule_id,
      position_start: fm.position_start,
      position_end: fm.position_end,
      annotated_by: fm.annotated_by ?? "—",
      annotated_at: fm.annotated_at ?? new Date().toISOString(),
      reviewed_at: fm.reviewed_at,
      reviewed_by: fm.reviewed_by,
      reject_reason: fm.reject_reason,
    },
  };
}

// ── Filtering ─────────────────────────────────────────────────────────

export function filterByContract(
  annotations: ClauseAnnotation[],
  contractSlug: string,
): ClauseAnnotation[] {
  return annotations.filter((a) => a.frontmatter.contract_slug === contractSlug);
}

export function filterByRisk(
  annotations: ClauseAnnotation[],
  risk: ClauseRiskLevel,
): ClauseAnnotation[] {
  return annotations.filter((a) => a.frontmatter.risk_level === risk);
}

export function filterByReviewStatus(
  annotations: ClauseAnnotation[],
  status: ClauseReviewStatus,
): ClauseAnnotation[] {
  return annotations.filter((a) => a.frontmatter.review_status === status);
}

export function filterByCategory(
  annotations: ClauseAnnotation[],
  category: ClauseCategory,
): ClauseAnnotation[] {
  return annotations.filter((a) => a.frontmatter.clause_type === category);
}

// ── Sorting ───────────────────────────────────────────────────────────

export function sortByRiskLevel(
  annotations: ClauseAnnotation[],
  direction?: "asc" | "desc",
): ClauseAnnotation[] {
  const order: Record<ClauseRiskLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const dir = direction ?? "asc";
  return [...annotations].sort((a, b) => {
    const cmp = order[a.frontmatter.risk_level] - order[b.frontmatter.risk_level];
    return dir === "desc" ? -cmp : cmp;
  });
}

export function sortByAnnotatedAt(
  annotations: ClauseAnnotation[],
  direction?: "asc" | "desc",
): ClauseAnnotation[] {
  const dir = direction ?? "desc";
  return [...annotations].sort((a, b) => {
    const cmp = (a.frontmatter.annotated_at ?? "").localeCompare(
      b.frontmatter.annotated_at ?? "",
    );
    return dir === "desc" ? -cmp : cmp;
  });
}

// ── Stats ─────────────────────────────────────────────────────────────

export interface AnnotationStats {
  total: number;
  by_risk: Record<ClauseRiskLevel, number>;
  by_status: Record<ClauseReviewStatus, number>;
  pending_critical: number;
  approved: number;
  rejected: number;
}

export function computeAnnotationStats(
  annotations: ClauseAnnotation[],
): AnnotationStats {
  const stats: AnnotationStats = {
    total: annotations.length,
    by_risk: { low: 0, medium: 0, high: 0, critical: 0 },
    by_status: { pending: 0, approved: 0, rejected: 0 },
    pending_critical: 0,
    approved: 0,
    rejected: 0,
  };

  for (const a of annotations) {
    stats.by_risk[a.frontmatter.risk_level]++;
    stats.by_status[a.frontmatter.review_status]++;
    if (a.frontmatter.review_status === "approved") stats.approved++;
    if (a.frontmatter.review_status === "rejected") stats.rejected++;
    if (
      a.frontmatter.review_status === "pending" &&
      a.frontmatter.risk_level === "critical"
    ) {
      stats.pending_critical++;
    }
  }

  return stats;
}

// ── Review Action ─────────────────────────────────────────────────────

export function buildReviewUpdate(params: {
  status: "approved" | "rejected";
  reviewed_by: string;
  reject_reason?: string;
  at?: Date;
}): Record<string, unknown> {
  const now = (params.at ?? new Date()).toISOString();
  return {
    review_status: params.status,
    reviewed_at: now,
    reviewed_by: params.reviewed_by,
    ...(params.reject_reason ? { reject_reason: params.reject_reason } : {}),
  };
}
