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
  /** WP-8.50: QC second-level review — drawn by seeded sampling. */
  qcSampled?: boolean;
  qcDecision?: ReviewDecision;
  qcBy?: string;
  qcAt?: string;
  qcNotes?: string;
  /**
   * QC-Konflikt-Resolution: weichen Erst- und QC-Entscheidung ab, trifft ein
   * Partner die bindende Endentscheidung (Meet-and-Confer-Nachweis).
   */
  finalDecision?: ReviewDecision;
  finalBy?: string;
  finalAt?: string;
  finalNotes?: string;
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
  PRIV_ATTORNEY_CLIENT: "Verschwiegenheit (§ 9 Abs. 2 RAO)",
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

// ── WP-8.50: Defensible Review — QC-Sampling + Coding-Consistency ───────────

/**
 * Deterministic PRNG (mulberry32) — a fixed seed reproduces the exact same
 * sample, which is the defensibility point: the draw is auditable, not ad hoc.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Draw a seeded QC sample of *decided* documents. Sampling unreviewed docs
 * would be meaningless; sampling is reproducible via the seed (ISO string
 * or any token — hashed into the PRNG). Returns the sampled slugs.
 */
export function sampleForQC(
  documents: ReviewSetDocument[],
  opts: { rate: number; seed: string; strata?: Partial<Record<ReviewDecision, number>> }
): string[] {
  const rate = Math.min(1, Math.max(0, opts.rate));
  const decided = documents.filter((d) => d.decision && d.decision !== undefined);
  const rnd = mulberry32(hashSeed(opts.seed));
  // Stratifizierung: sensible Entscheidungen (z. B. withhold/privileged) können
  // mit eigener Rate — üblicherweise 1.0 = vollständige QC-Prüfung — gezogen
  // werden, der Rest mit der Basisrate.
  const strata = opts.strata ?? {};
  return decided
    .filter((d) => {
      const r = strata[d.decision];
      const effective = r !== undefined ? Math.min(1, Math.max(0, r)) : rate;
      return rnd() < effective;
    })
    .map((d) => d.slug);
}

export interface CodingConsistency {
  sampled: number;
  qcReviewed: number;
  agreements: number;
  conflicts: number;
  /** share of identical decision/qcDecision pairs over QC-reviewed docs */
  agreementRate: number | null;
  /** Cohen's kappa over the five decision categories, null without QC data */
  kappa: number | null;
  conflictItems: Array<{ slug: string; decision: ReviewDecision; qcDecision: ReviewDecision }>;
  /** Konflikte mit verbindlicher Endentscheidung (Partner-Resolution). */
  resolvedConflicts: number;
  /** Konflikte ohne Endentscheidung — müssen vor Produktion auf 0 stehen. */
  openConflicts: number;
}

/** Inter-rater reliability between first-level and QC decisions. */
export function computeCodingConsistency(documents: ReviewSetDocument[]): CodingConsistency {
  const sampled = documents.filter((d) => d.qcSampled);
  const qcReviewed = sampled.filter((d) => d.qcDecision);
  const categories: ReviewDecision[] = [
    "responsive",
    "non_responsive",
    "privileged",
    "redact",
    "withhold",
  ];

  let agreements = 0;
  const conflictItems: CodingConsistency["conflictItems"] = [];
  const firstCounts: Record<string, number> = {};
  const qcCounts: Record<string, number> = {};

  for (const d of qcReviewed) {
    firstCounts[d.decision] = (firstCounts[d.decision] ?? 0) + 1;
    qcCounts[d.qcDecision!] = (qcCounts[d.qcDecision!] ?? 0) + 1;
    if (d.decision === d.qcDecision) {
      agreements++;
    } else {
      conflictItems.push({ slug: d.slug, decision: d.decision, qcDecision: d.qcDecision! });
    }
  }

  const resolvedConflicts = qcReviewed.filter(
    (d) => d.decision !== d.qcDecision && d.finalDecision
  ).length;

  const n = qcReviewed.length;
  if (n === 0) {
    return {
      sampled: sampled.length,
      qcReviewed: 0,
      agreements: 0,
      conflicts: 0,
      agreementRate: null,
      kappa: null,
      conflictItems: [],
      resolvedConflicts: 0,
      openConflicts: 0,
    };
  }

  const agreementRate = agreements / n;
  // Cohen's kappa: (Po − Pe) / (1 − Pe), Pe = expected agreement by marginals
  let pe = 0;
  for (const c of categories) {
    pe += ((firstCounts[c] ?? 0) / n) * ((qcCounts[c] ?? 0) / n);
  }
  const kappa = pe >= 1 ? null : (agreementRate - pe) / (1 - pe);

  return {
    sampled: sampled.length,
    qcReviewed: n,
    agreements,
    conflicts: conflictItems.length,
    agreementRate,
    kappa,
    conflictItems,
    resolvedConflicts,
    openConflicts: conflictItems.length - resolvedConflicts,
  };
}

const csvEsc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

/**
 * Production protocol — the defensibility record: every document with its
 * Bates number, first-level and QC decision, reviewer identity and
 * timestamps, plus the consistency summary as trailing metadata rows.
 */
export function exportProductionProtocol(set: ReviewSet): string {
  const headers = [
    "Bates-Nummer",
    "Dokument",
    "Entscheidung",
    "Reviewer",
    "Zeitpunkt",
    "Privileg",
    "Schwärzung",
    "QC-Stichprobe",
    "QC-Entscheidung",
    "QC-Reviewer",
    "QC-Zeitpunkt",
    "Übereinstimmung",
    "Endentscheidung",
    "Endentscheidung von",
    "Endentscheidung Zeitpunkt",
  ];
  const rows = set.documents.map((d) => [
    d.batesNumber ?? "",
    d.title,
    REVIEW_DECISION_LABELS_DE[d.decision] ?? d.decision,
    d.decisionBy ?? d.reviewedBy ?? "",
    d.decisionAt ?? d.reviewedAt ?? "",
    d.privilegeType !== "none"
      ? (PRIVILEGE_TYPE_LABELS_DE[d.privilegeType] ?? d.privilegeType)
      : "",
    d.redactionCode ? REDACTION_CODE_LABELS_DE[d.redactionCode] : "",
    d.qcSampled ? "ja" : "",
    d.qcDecision ? (REVIEW_DECISION_LABELS_DE[d.qcDecision] ?? d.qcDecision) : "",
    d.qcBy ?? "",
    d.qcAt ?? "",
    d.qcDecision ? (d.qcDecision === d.decision ? "ja" : "NEIN") : "",
    d.finalDecision ? (REVIEW_DECISION_LABELS_DE[d.finalDecision] ?? d.finalDecision) : "",
    d.finalBy ?? "",
    d.finalAt ?? "",
  ]);
  const c = computeCodingConsistency(set.documents);
  const meta = [
    [],
    ["Review-Set", set.title],
    ["Erstellt", set.createdAt],
    ["Produziert", set.production.producedAt ?? ""],
    ["Dokumente gesamt", String(set.statistics.total)],
    ["QC-Stichprobe", String(c.sampled)],
    ["QC geprüft", String(c.qcReviewed)],
    [
      "Übereinstimmungsrate",
      c.agreementRate !== null ? `${(c.agreementRate * 100).toFixed(1)} %` : "",
    ],
    ["Cohen-Kappa", c.kappa !== null ? c.kappa.toFixed(3) : ""],
    ["Konflikte", String(c.conflicts)],
    ["Konflikte gelöst", String(c.resolvedConflicts)],
    ["Konflikte offen", String(c.openConflicts)],
  ];
  return [
    ...[headers, ...rows].map((r) => r.map(csvEsc).join(",")),
    "",
    ...meta.map((r) => r.map(csvEsc).join(",")),
  ].join("\n");
}

/**
 * SHA-256 over the protocol CSV — makes the defensibility record tamper-evident.
 * Uses WebCrypto so the same code runs in the route handler and the browser.
 */
export async function protocolIntegrityHash(csv: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csv));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Protocol with an integrity footer: the hash covers every preceding line, so
 * any post-export edit invalidates it. The footer itself is marked so a
 * re-hash can exclude it.
 */
export async function exportProductionProtocolSigned(set: ReviewSet): Promise<string> {
  const csv = exportProductionProtocol(set);
  const hash = await protocolIntegrityHash(csv);
  return `${csv}\n\n# INTEGRITAET\n# sha256:${hash}`;
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
  frontmatter: Record<string, unknown>,
  /** Page type from the engine column — frontmatter.type is stripped on store. */
  pageType?: string
): ReviewSet | null {
  if ((pageType ?? frontmatter.type) !== "review_set") return null;
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
