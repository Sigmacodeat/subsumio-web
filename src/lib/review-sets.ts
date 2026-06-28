/**
 * Defensible Review Sets — strukturierte Dokumenten-Review-Sets mit
 * Privilege Log, Redaction Codes und Production Export.
 *
 * Use cases:
 *   - eDiscovery / Offenlegungspflicht
 *   - GoBD-konforme Dokumentenproduktion
 *   - Interner Compliance-Review
 *   - Mandanten-Privileg-Verwaltung
 */

export type ReviewSetStatus = "draft" | "in_review" | "produced" | "archived";
export type PrivilegeType =
  | "attorney_client"
  | "work_product"
  | "joint_defense"
  | "settlement"
  | "none";

export type RedactionCode =
  | "PRIV_ATTORNEY_CLIENT"
  | "PRIV_WORK_PRODUCT"
  | "PRIV_SETTLEMENT"
  | "PERSONAL_DATA"
  | "CONFIDENTIAL"
  | "TRADE_SECRET"
  | "THIRD_PARTY";

export type ReviewDecision = "responsive" | "non_responsive" | "privileged" | "redact" | "withhold";

export interface ReviewSetDocument {
  slug: string;
  title: string;
  decision: ReviewDecision;
  decisionBy?: string;
  decisionAt?: string;
  decisionNotes?: string;
  privilegeType: PrivilegeType;
  privilegeBasis?: string;
  redactionCode?: RedactionCode;
  redactionNotes?: string;
  batesNumber?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ReviewSet {
  slug: string;
  title: string;
  caseSlug?: string;
  caseTitle?: string;
  status: ReviewSetStatus;
  description?: string;
  documents: ReviewSetDocument[];
  criteria: {
    dateFrom?: string;
    dateTo?: string;
    docTypes?: string[];
    keywords?: string[];
    custodians?: string[];
  };
  production: {
    produced: boolean;
    producedAt?: string;
    producedTo?: string;
    format: "pdf" | "tiff" | "native" | "csv";
    batesPrefix?: string;
    batesStart?: number;
  };
  statistics: {
    total: number;
    responsive: number;
    nonResponsive: number;
    privileged: number;
    redacted: number;
    withheld: number;
    unreviewed: number;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export const REDACTION_CODE_LABELS_DE: Record<RedactionCode, string> = {
  PRIV_ATTORNEY_CLIENT: "Mandatsgeheimnis (§ 203 StGB)",
  PRIV_WORK_PRODUCT: "Arbeitsprodukt des Anwalts",
  PRIV_SETTLEMENT: "Vergleichsgeheimnis",
  PERSONAL_DATA: "Personenbezogene Daten (DSGVO)",
  CONFIDENTIAL: "Vertraulich",
  TRADE_SECRET: "Geschäftsgeheimnis (§ 17 UWG)",
  THIRD_PARTY: "Drittschutz",
};

export const PRIVILEGE_TYPE_LABELS_DE: Record<PrivilegeType, string> = {
  attorney_client: "Mandatsgeheimnis",
  work_product: "Arbeitsprodukt",
  joint_defense: "Joint Defense",
  settlement: "Vergleichsprivileg",
  none: "Kein Privileg",
};

export const REVIEW_DECISION_LABELS_DE: Record<ReviewDecision, string> = {
  responsive: "Relevant",
  non_responsive: "Nicht relevant",
  privileged: "Privilegiert",
  redact: "Geschwärzt",
  withhold: "Zurückbehalten",
};

export const REVIEW_SET_STATUS_LABELS_DE: Record<ReviewSetStatus, string> = {
  draft: "Entwurf",
  in_review: "In Prüfung",
  produced: "Produziert",
  archived: "Archiviert",
};

export const DECISION_COLORS: Record<ReviewDecision, string> = {
  responsive: "#22c55e",
  non_responsive: "#6a6a8a",
  privileged: "#f59e0b",
  redact: "#ef4444",
  withhold: "#8b5cf6",
};

export function computeStatistics(documents: ReviewSetDocument[]): ReviewSet["statistics"] {
  const stats = {
    total: documents.length,
    responsive: 0,
    nonResponsive: 0,
    privileged: 0,
    redacted: 0,
    withheld: 0,
    unreviewed: 0,
  };
  for (const doc of documents) {
    switch (doc.decision) {
      case "responsive":
        stats.responsive++;
        break;
      case "non_responsive":
        stats.nonResponsive++;
        break;
      case "privileged":
        stats.privileged++;
        break;
      case "redact":
        stats.redacted++;
        break;
      case "withhold":
        stats.withheld++;
        break;
      default:
        stats.unreviewed++;
        break;
    }
  }
  return stats;
}

export function generateBatesNumber(prefix: string, start: number, index: number): string {
  const num = start + index;
  return `${prefix}${String(num).padStart(7, "0")}`;
}

export function exportPrivilegeLog(documents: ReviewSetDocument[]): string {
  const headers = [
    "Bates-Nummer",
    "Dokument",
    "Privileg-Typ",
    "Grundlage",
    "Geschwärzt",
    "Notizen",
  ];
  const rows = documents
    .filter((d) => d.privilegeType !== "none" || d.redactionCode)
    .map((d) => [
      d.batesNumber ?? "",
      d.title,
      PRIVILEGE_TYPE_LABELS_DE[d.privilegeType] ?? d.privilegeType,
      d.privilegeBasis ?? "",
      d.redactionCode ? REDACTION_CODE_LABELS_DE[d.redactionCode] : "",
      d.redactionNotes ?? d.decisionNotes ?? "",
    ]);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function parseReviewSet(
  slug: string,
  frontmatter: Record<string, unknown>
): ReviewSet | null {
  if (frontmatter.type !== "review_set") return null;
  const docs = (frontmatter.documents as ReviewSetDocument[]) ?? [];
  return {
    slug,
    title: (frontmatter.title as string) ?? slug,
    caseSlug: frontmatter.case_slug as string | undefined,
    caseTitle: frontmatter.case_title as string | undefined,
    status: (frontmatter.status as ReviewSetStatus) ?? "draft",
    description: frontmatter.description as string | undefined,
    documents: docs,
    criteria: (frontmatter.criteria as ReviewSet["criteria"]) ?? {},
    production: (frontmatter.production as ReviewSet["production"]) ?? {
      produced: false,
      format: "pdf",
    },
    statistics: computeStatistics(docs),
    createdAt: (frontmatter.created_at as string) ?? new Date().toISOString(),
    updatedAt: (frontmatter.updated_at as string) ?? new Date().toISOString(),
    createdBy: frontmatter.created_by as string | undefined,
  };
}
