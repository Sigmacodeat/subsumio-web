/**
 * Canonical Claim–Evidence Graph — Epic 6.1 / T1.3
 *
 * This module is the shared contract between legal reasoning, grounding,
 * verification receipts, dependency tracking and future UI/export adapters.
 * LLM output can propose claims and links, but coverage and publishability are
 * derived deterministically from backend-verified evidence.
 */

import { createHash } from "node:crypto";
import type { ReceiptCheck } from "@/lib/work-product-receipts.ts";
import type { Jurisdiction } from "./corpus-receipt.ts";
import type { EvidenceSpan, EvidenceVerification, LegalIssue } from "./issues/types.ts";
import type { MatchedParagraphResult, VerifiedGroundingEntry } from "./grounding-map-validator.ts";

export type ClaimRisk = "low" | "medium" | "high" | "critical";
export type ClaimKind = "factual" | "legal" | "procedural" | "deadline" | "conclusion";
export type EvidenceNodeKind = "fact" | "document_span" | "rule" | "decision";
export type ClaimResolution = "supported" | "unsupported" | "disputed" | "stale";
export type ClaimEvidenceRelation =
  | "supports"
  | "contradicts"
  | "defines"
  | "applies"
  | "distinguishes"
  | "overrules";

export interface ClaimNode {
  id: string;
  kind: "claim" | "conclusion";
  claim_kind: ClaimKind;
  text: string;
  risk: ClaimRisk;
  jurisdiction: Jurisdiction;
  /** Material claims require at least one backend-verified supporting source. */
  requires_verified_support: boolean;
  /**
   * Every inner group is an OR, the outer array is an AND. A subsumption
   * claim typically requires [["fact", "document_span"], ["rule", "decision"]].
   */
  required_evidence_groups?: EvidenceNodeKind[][];
  source_ref?: string;
}

export interface EvidenceNode {
  id: string;
  kind: EvidenceNodeKind;
  text: string;
  source_slug: string;
  jurisdiction: Jurisdiction;
  verification: EvidenceVerification;
  snapshot_hash?: string;
  paragraph_ref?: string;
  source_url?: string;
  start_offset?: number;
  end_offset?: number;
}

export interface ClaimEvidenceEdge {
  id: string;
  from_id: string;
  to_id: string;
  relation: ClaimEvidenceRelation;
  /** Backend verification, never an LLM assertion. */
  verified: boolean;
}

export interface ClaimEvidenceGraph {
  schema_version: "1.0";
  graph_id: string;
  output_id: string;
  output_type: string;
  jurisdiction: Jurisdiction;
  as_of_date: string;
  brain_id?: string;
  claims: ClaimNode[];
  evidence: EvidenceNode[];
  edges: ClaimEvidenceEdge[];
  created_at: string;
}

export interface ClaimCoverage {
  claim_id: string;
  resolution: ClaimResolution;
  verified_support_count: number;
  verified_contradiction_count: number;
  stale_evidence_count: number;
  missing_evidence_groups: EvidenceNodeKind[][];
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
}

export interface ClaimEvidenceCoverage {
  total_claims: number;
  material_claims: number;
  supported_claims: number;
  disputed_claims: number;
  stale_claims: number;
  unsupported_claims: number;
  unsupported_high_risk_claim_ids: string[];
  weighted_coverage: number;
  contradiction_coverage: number;
  publishable: boolean;
  claims: ClaimCoverage[];
}

export interface ClaimExplanation {
  claim: ClaimNode;
  coverage: ClaimCoverage;
  supports: EvidenceNode[];
  contradicts: EvidenceNode[];
  other_links: Array<{ edge: ClaimEvidenceEdge; evidence: EvidenceNode }>;
}

export interface ClaimEvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

const RISK_WEIGHT: Record<ClaimRisk, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
};

export function stableClaimEvidenceId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
  return `${prefix}-${hash.slice(0, 20)}`;
}

export function validateClaimEvidenceGraph(
  graph: ClaimEvidenceGraph
): ClaimEvidenceValidationResult {
  const errors: string[] = [];
  const allIds = new Set<string>();

  if (!graph.output_id.trim()) errors.push("output_id is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(graph.as_of_date)) {
    errors.push("as_of_date must use YYYY-MM-DD");
  }

  for (const node of [...graph.claims, ...graph.evidence]) {
    if (allIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    allIds.add(node.id);
  }

  for (const claim of graph.claims) {
    if (!claim.text.trim()) errors.push(`claim ${claim.id} has empty text`);
    if (claim.jurisdiction !== graph.jurisdiction) {
      errors.push(`claim ${claim.id} jurisdiction does not match graph`);
    }
  }

  for (const evidence of graph.evidence) {
    if (!evidence.text.trim()) errors.push(`evidence ${evidence.id} has empty text`);
    if (!evidence.source_slug.trim()) errors.push(`evidence ${evidence.id} has no source_slug`);
    if (evidence.verification === "verified") {
      if (!evidence.snapshot_hash)
        errors.push(`verified evidence ${evidence.id} has no snapshot_hash`);
      if (
        evidence.start_offset != null &&
        evidence.end_offset != null &&
        evidence.end_offset <= evidence.start_offset
      ) {
        errors.push(`verified evidence ${evidence.id} has invalid offsets`);
      }
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!allIds.has(edge.from_id)) errors.push(`edge ${edge.id} has unknown from_id`);
    if (!allIds.has(edge.to_id)) errors.push(`edge ${edge.id} has unknown to_id`);

    const claim = graph.claims.find((candidate) => candidate.id === edge.from_id);
    const evidence = graph.evidence.find((candidate) => candidate.id === edge.to_id);
    if (!claim || !evidence) {
      errors.push(`edge ${edge.id} must link claim/conclusion to evidence`);
      continue;
    }
    if (edge.verified && evidence.verification !== "verified") {
      errors.push(`edge ${edge.id} cannot verify unverified evidence ${evidence.id}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function computeClaimEvidenceCoverage(graph: ClaimEvidenceGraph): ClaimEvidenceCoverage {
  const evidenceById = new Map(graph.evidence.map((evidence) => [evidence.id, evidence]));
  const perClaim: ClaimCoverage[] = [];
  let coveredWeight = 0;
  let materialWeight = 0;
  let contradictionClaims = 0;
  let contradictionReviewed = 0;

  for (const claim of graph.claims) {
    const relevant = graph.edges.filter((edge) => edge.from_id === claim.id);
    const supports = relevant.filter(
      (edge) =>
        edge.relation === "supports" || edge.relation === "defines" || edge.relation === "applies"
    );
    const contradicts = relevant.filter(
      (edge) =>
        edge.relation === "contradicts" ||
        edge.relation === "distinguishes" ||
        edge.relation === "overrules"
    );

    const verifiedSupports = supports.filter(
      (edge) => edge.verified && evidenceById.get(edge.to_id)?.verification === "verified"
    );
    const verifiedContradictions = contradicts.filter(
      (edge) => edge.verified && evidenceById.get(edge.to_id)?.verification === "verified"
    );
    const staleCount = relevant.filter(
      (edge) => evidenceById.get(edge.to_id)?.verification === "stale"
    ).length;
    const verifiedSupportKinds = new Set(
      verifiedSupports
        .map((edge) => evidenceById.get(edge.to_id)?.kind)
        .filter((kind): kind is EvidenceNodeKind => Boolean(kind))
    );
    const missingEvidenceGroups = (claim.required_evidence_groups ?? []).filter(
      (group) => !group.some((kind) => verifiedSupportKinds.has(kind))
    );

    if (contradicts.length > 0) {
      contradictionClaims++;
      if (verifiedContradictions.length === contradicts.length) contradictionReviewed++;
    }

    let resolution: ClaimResolution;
    if (staleCount > 0) resolution = "stale";
    else if (verifiedContradictions.length > 0) resolution = "disputed";
    else if (
      !claim.requires_verified_support ||
      (verifiedSupports.length > 0 && missingEvidenceGroups.length === 0)
    )
      resolution = "supported";
    else resolution = "unsupported";

    if (claim.requires_verified_support) {
      const weight = RISK_WEIGHT[claim.risk];
      materialWeight += weight;
      if (resolution === "supported") coveredWeight += weight;
    }

    perClaim.push({
      claim_id: claim.id,
      resolution,
      verified_support_count: verifiedSupports.length,
      verified_contradiction_count: verifiedContradictions.length,
      stale_evidence_count: staleCount,
      missing_evidence_groups: missingEvidenceGroups,
      supporting_evidence_ids: verifiedSupports.map((edge) => edge.to_id),
      contradicting_evidence_ids: verifiedContradictions.map((edge) => edge.to_id),
    });
  }

  const unsupportedHighRisk = graph.claims
    .filter((claim) => claim.risk === "high" || claim.risk === "critical")
    .filter(
      (claim) =>
        perClaim.find((coverage) => coverage.claim_id === claim.id)?.resolution !== "supported"
    )
    .map((claim) => claim.id);
  const unsupported = perClaim.filter((claim) => claim.resolution === "unsupported").length;
  const disputed = perClaim.filter((claim) => claim.resolution === "disputed").length;
  const stale = perClaim.filter((claim) => claim.resolution === "stale").length;

  return {
    total_claims: graph.claims.length,
    material_claims: graph.claims.filter((claim) => claim.requires_verified_support).length,
    supported_claims: perClaim.filter((claim) => claim.resolution === "supported").length,
    disputed_claims: disputed,
    stale_claims: stale,
    unsupported_claims: unsupported,
    unsupported_high_risk_claim_ids: unsupportedHighRisk,
    weighted_coverage: materialWeight === 0 ? 1 : coveredWeight / materialWeight,
    contradiction_coverage:
      contradictionClaims === 0 ? 1 : contradictionReviewed / contradictionClaims,
    publishable: unsupportedHighRisk.length === 0 && disputed === 0 && stale === 0,
    claims: perClaim,
  };
}

/** Return the exact claim-specific evidence bundle used by verifier and “Warum?” UI. */
export function explainClaim(graph: ClaimEvidenceGraph, claimId: string): ClaimExplanation | null {
  const claim = graph.claims.find((candidate) => candidate.id === claimId);
  if (!claim) return null;
  const coverage = computeClaimEvidenceCoverage(graph).claims.find(
    (candidate) => candidate.claim_id === claimId
  );
  if (!coverage) return null;
  const evidenceById = new Map(graph.evidence.map((evidence) => [evidence.id, evidence]));
  const links = graph.edges.filter((edge) => edge.from_id === claimId);
  const linked = (relations: ClaimEvidenceRelation[]) =>
    links
      .filter((edge) => relations.includes(edge.relation))
      .map((edge) => evidenceById.get(edge.to_id))
      .filter((evidence): evidence is EvidenceNode => Boolean(evidence));
  const primaryRelations: ClaimEvidenceRelation[] = [
    "supports",
    "defines",
    "applies",
    "contradicts",
  ];

  return {
    claim,
    coverage,
    supports: linked(["supports", "defines", "applies"]),
    contradicts: linked(["contradicts"]),
    other_links: links
      .filter((edge) => !primaryRelations.includes(edge.relation))
      .map((edge) => ({ edge, evidence: evidenceById.get(edge.to_id) }))
      .filter((item): item is { edge: ClaimEvidenceEdge; evidence: EvidenceNode } =>
        Boolean(item.evidence)
      ),
  };
}

export function buildClaimEvidenceReceiptArtifacts(graph: ClaimEvidenceGraph): {
  check: ReceiptCheck;
  metadata: { claim_evidence_graph_id: string; claim_evidence_coverage: ClaimEvidenceCoverage };
  source_snapshot_hashes: string[];
} {
  const validation = validateClaimEvidenceGraph(graph);
  const coverage = computeClaimEvidenceCoverage(graph);
  const passed = validation.valid && coverage.publishable;

  return {
    check: {
      name: "claim_evidence_coverage",
      description:
        "Every material claim has backend-verified, current evidence and no unresolved contradiction",
      passed,
      severity: passed
        ? "info"
        : coverage.unsupported_high_risk_claim_ids.length > 0
          ? "critical"
          : "error",
      message: passed
        ? `${coverage.supported_claims}/${coverage.total_claims} claims supported`
        : [
            ...validation.errors,
            `${coverage.unsupported_claims} unsupported`,
            `${coverage.disputed_claims} disputed`,
            `${coverage.stale_claims} stale`,
          ].join("; "),
    },
    metadata: {
      claim_evidence_graph_id: graph.graph_id,
      claim_evidence_coverage: coverage,
    },
    source_snapshot_hashes: [
      ...new Set(
        graph.evidence
          .map((evidence) => evidence.snapshot_hash)
          .filter((hash): hash is string => Boolean(hash))
      ),
    ],
  };
}

export function buildGraphFromGroundingMap(opts: {
  output_id: string;
  output_type: string;
  jurisdiction: Jurisdiction;
  as_of_date: string;
  entries: VerifiedGroundingEntry[];
  /** Uploaded case documents used to backend-resolve exact LLM quotes. */
  case_documents?: Array<{ source_slug: string; text: string; snapshot_hash?: string }>;
  brain_id?: string;
  now?: string;
}): ClaimEvidenceGraph {
  const claims: ClaimNode[] = [];
  const evidence: EvidenceNode[] = [];
  const edges: ClaimEvidenceEdge[] = [];
  const evidenceIds = new Set<string>();

  opts.entries.forEach((entry, entryIndex) => {
    const claimId = stableClaimEvidenceId(
      "claim",
      opts.output_id,
      String(entryIndex),
      entry.finding
    );
    claims.push({
      id: claimId,
      kind: "claim",
      claim_kind: "legal",
      text: entry.finding,
      risk: "high",
      jurisdiction: opts.jurisdiction,
      requires_verified_support: true,
      required_evidence_groups: [
        ["fact", "document_span"],
        ["rule", "decision"],
      ],
      source_ref: entry.on_reference,
    });

    if (entry.quote.trim()) {
      const resolvedCaseSpan = resolveExactCaseSpan(entry.quote, opts.case_documents ?? []);
      const caseEvidenceId = stableClaimEvidenceId(
        "evidence",
        resolvedCaseSpan?.source_slug ?? opts.output_id,
        entry.quote
      );
      if (!evidenceIds.has(caseEvidenceId)) {
        evidenceIds.add(caseEvidenceId);
        evidence.push({
          id: caseEvidenceId,
          kind: "document_span",
          text: entry.quote,
          source_slug:
            resolvedCaseSpan?.source_slug ??
            `unresolved-case/${opts.output_id}/${entry.on_reference || entryIndex}`,
          jurisdiction: opts.jurisdiction,
          verification: resolvedCaseSpan ? "verified" : "unverified",
          snapshot_hash: resolvedCaseSpan?.snapshot_hash,
          start_offset: resolvedCaseSpan?.start_offset,
          end_offset: resolvedCaseSpan?.end_offset,
        });
      }
      edges.push({
        id: stableClaimEvidenceId("edge", claimId, caseEvidenceId, "supports"),
        from_id: claimId,
        to_id: caseEvidenceId,
        relation: "supports",
        verified: Boolean(resolvedCaseSpan),
      });
    }

    entry.matched_paragraphs.forEach((paragraph, paragraphIndex) => {
      const evidenceNode = groundingParagraphToEvidence(paragraph, opts.jurisdiction);
      if (!evidenceIds.has(evidenceNode.id)) {
        evidenceIds.add(evidenceNode.id);
        evidence.push(evidenceNode);
      }
      const relation = relationForGroundingEntry(entry.finding_type);
      edges.push({
        id: stableClaimEvidenceId(
          "edge",
          claimId,
          evidenceNode.id,
          relation,
          String(paragraphIndex)
        ),
        from_id: claimId,
        to_id: evidenceNode.id,
        relation,
        verified: paragraph.verified,
      });
    });
  });

  return {
    schema_version: "1.0",
    graph_id: stableClaimEvidenceId("ceg", opts.output_id, opts.as_of_date),
    output_id: opts.output_id,
    output_type: opts.output_type,
    jurisdiction: opts.jurisdiction,
    as_of_date: opts.as_of_date,
    brain_id: opts.brain_id,
    claims,
    evidence,
    edges,
    created_at: opts.now ?? new Date().toISOString(),
  };
}

function resolveExactCaseSpan(
  quote: string,
  documents: Array<{ source_slug: string; text: string; snapshot_hash?: string }>
): {
  source_slug: string;
  snapshot_hash: string;
  start_offset: number;
  end_offset: number;
} | null {
  const matches: Array<{ document: (typeof documents)[number]; start: number }> = [];
  for (const document of documents) {
    let offset = document.text.indexOf(quote);
    while (offset >= 0) {
      matches.push({ document, start: offset });
      offset = document.text.indexOf(quote, offset + 1);
    }
  }
  // Ambiguous or absent quotes never become backend-verified evidence.
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  return {
    source_slug: match.document.source_slug,
    snapshot_hash:
      match.document.snapshot_hash ??
      createHash("sha256").update(match.document.text, "utf8").digest("hex"),
    start_offset: match.start,
    end_offset: match.start + quote.length,
  };
}

export function buildGraphFromLegalIssue(issue: LegalIssue): ClaimEvidenceGraph {
  const claims: ClaimNode[] = [];
  const evidence = new Map<string, EvidenceNode>();
  const edges: ClaimEvidenceEdge[] = [];
  const elements = new Map(issue.required_elements.map((element) => [element.id, element]));

  for (const assessment of issue.element_assessments) {
    const element = elements.get(assessment.element_id);
    const claimId = stableClaimEvidenceId("claim", issue.id, assessment.element_id);
    claims.push({
      id: claimId,
      kind: "claim",
      claim_kind: "legal",
      text: `${element?.label ?? assessment.element_id}: ${assessment.status}`,
      risk: issue.risk,
      jurisdiction: issue.jurisdiction,
      requires_verified_support: assessment.status !== "unknown",
      source_ref: assessment.element_id,
    });
    attachIssueEvidence(claimId, assessment.evidence, "supports", evidence, edges);
    attachIssueEvidence(
      claimId,
      assessment.conflicting_evidence ?? [],
      "contradicts",
      evidence,
      edges
    );
  }

  if (issue.conclusion) {
    const claimId = stableClaimEvidenceId("conclusion", issue.id, issue.conclusion.summary);
    claims.push({
      id: claimId,
      kind: "conclusion",
      claim_kind: "conclusion",
      text: issue.conclusion.summary,
      risk: issue.risk,
      jurisdiction: issue.jurisdiction,
      requires_verified_support: true,
      source_ref: issue.id,
    });
    for (const assessmentClaim of claims.filter((claim) => claim.kind === "claim")) {
      for (const edge of edges.filter((candidate) => candidate.from_id === assessmentClaim.id)) {
        edges.push({
          ...edge,
          id: stableClaimEvidenceId("edge", claimId, edge.to_id, edge.relation),
          from_id: claimId,
        });
      }
    }
  }

  return {
    schema_version: "1.0",
    graph_id: stableClaimEvidenceId("ceg", issue.id, issue.updated_at),
    output_id: issue.id,
    output_type: "legal_issue",
    jurisdiction: issue.jurisdiction,
    as_of_date: issue.as_of_date,
    brain_id: issue.brain_id,
    claims,
    evidence: [...evidence.values()],
    edges,
    created_at: issue.updated_at,
  };
}

function groundingParagraphToEvidence(
  paragraph: MatchedParagraphResult,
  jurisdiction: Jurisdiction
): EvidenceNode {
  const sourceSlug =
    paragraph.source_slug ??
    `unresolved/${jurisdiction.toLowerCase()}/${paragraph.statute}/${paragraph.paragraph}`;
  const text = paragraph.source_text ?? `${paragraph.paragraph} ${paragraph.statute}`;
  return {
    id: stableClaimEvidenceId("evidence", sourceSlug, paragraph.paragraph, text),
    kind: "rule",
    text,
    source_slug: sourceSlug,
    jurisdiction,
    verification: paragraph.verified ? "verified" : "failed",
    snapshot_hash: paragraph.snapshot_hash,
    paragraph_ref: paragraph.paragraph,
    source_url: paragraph.source_url,
    start_offset: paragraph.evidence_start,
    end_offset: paragraph.evidence_end,
  };
}

function relationForGroundingEntry(findingType: string): ClaimEvidenceRelation {
  const normalized = findingType.toLowerCase();
  if (normalized.includes("gegen") || normalized.includes("widerspruch")) return "contradicts";
  return "supports";
}

function attachIssueEvidence(
  claimId: string,
  spans: EvidenceSpan[],
  relation: ClaimEvidenceRelation,
  evidence: Map<string, EvidenceNode>,
  edges: ClaimEvidenceEdge[]
): void {
  for (const span of spans) {
    const evidenceId = stableClaimEvidenceId(
      "evidence",
      span.source_slug,
      span.content_hash,
      String(span.start_offset),
      String(span.end_offset)
    );
    evidence.set(evidenceId, {
      id: evidenceId,
      kind: span.source_slug.startsWith("law/") ? "rule" : "document_span",
      text: span.text,
      source_slug: span.source_slug,
      jurisdiction: span.jurisdiction,
      verification: span.verification,
      snapshot_hash: span.content_hash,
      paragraph_ref: span.paragraph_ref,
      start_offset: span.start_offset,
      end_offset: span.end_offset,
    });
    edges.push({
      id: stableClaimEvidenceId("edge", claimId, evidenceId, relation),
      from_id: claimId,
      to_id: evidenceId,
      relation,
      verified: span.verification === "verified",
    });
  }
}

// ── Precedent Match Integration (E6.1.2) ──────────────────────────────

/**
 * Raw precedent match as produced by the precedent-matcher specialist layer.
 * The `verified` field is an LLM assertion, NOT backend verification.
 */
export interface PrecedentMatch {
  claim?: string;
  paragraph?: string;
  gericht?: string;
  entscheidung?: string;
  datum?: string;
  leitsatz?: string;
  sachverhalt_aehnlichkeit?: string;
  position?: string;
  relevanz?: string;
  source_text?: string;
  verified?: boolean;
  begründung?: string;
}

/**
 * Merge precedent matches (Judikatur) into an existing Claim–Evidence graph.
 *
 * Each match becomes a `decision` evidence node linked to the best-matching
 * claim via a relation determined by `position`:
 *   "stützend"    → supports
 *   "gefährdend"  → contradicts
 *   "abweichend"  → distinguishes
 *
 * LLM-asserted `verified: true` does NOT become backend-verified evidence.
 * Only a backend-resolved source_slug + snapshot_hash can achieve that.
 *
 * If no claim text in the graph matches the precedent's `claim` field,
 * the precedent is attached as an unlinked observation in the graph metadata
 * via `unmatched_precedents`.
 */
export function mergePrecedentMatches(
  graph: ClaimEvidenceGraph,
  matches: PrecedentMatch[],
  opts?: {
    /** Backend-resolved decision sources: slug → snapshot_hash. */
    resolvedDecisions?: Map<string, string>;
  }
): ClaimEvidenceGraph {
  const resolvedDecisions = opts?.resolvedDecisions ?? new Map();
  const newEvidence: EvidenceNode[] = [];
  const newEdges: ClaimEvidenceEdge[] = [];
  const unmatched: PrecedentMatch[] = [];

  for (const match of matches) {
    const claimText = (match.claim ?? "").trim();
    const decisionRef = [match.gericht, match.entscheidung, match.datum].filter(Boolean).join(" ");
    const leitsatz = (match.leitsatz ?? "").trim();
    const sourceText = (match.source_text ?? "").trim();
    const evidenceText = leitsatz || sourceText || decisionRef || claimText;

    // Build a stable source slug for the decision
    const rawSlug = match.entscheidung
      ? `decision/${(match.gericht ?? "unknown").toLowerCase()}/${match.entscheidung.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`
      : `decision/unresolved/${stableClaimEvidenceId("dec", claimText, decisionRef)}`;
    const resolvedHash = resolvedDecisions.get(rawSlug);
    const isBackendVerified = Boolean(resolvedHash);

    const evidenceId = stableClaimEvidenceId("evidence", rawSlug, evidenceText, match.datum ?? "");

    // Skip if this evidence already exists in the graph
    if (graph.evidence.some((evidence) => evidence.id === evidenceId)) {
      // Still try to link it to a claim if not yet linked
      const existingEdges = graph.edges.filter((edge) => edge.to_id === evidenceId);
      if (existingEdges.length > 0) continue;
    } else {
      newEvidence.push({
        id: evidenceId,
        kind: "decision",
        text: evidenceText,
        source_slug: rawSlug,
        jurisdiction: graph.jurisdiction,
        verification: isBackendVerified ? "verified" : "unverified",
        snapshot_hash: resolvedHash,
        paragraph_ref: match.paragraph,
        source_url: undefined,
      });
    }

    // Find the best-matching claim
    const targetClaim = findBestClaimMatch(graph.claims, claimText);
    if (!targetClaim) {
      unmatched.push(match);
      continue;
    }

    const relation = precedentPositionToRelation(match.position);
    newEdges.push({
      id: stableClaimEvidenceId("edge", targetClaim.id, evidenceId, relation),
      from_id: targetClaim.id,
      to_id: evidenceId,
      relation,
      verified: isBackendVerified,
    });
  }

  return {
    ...graph,
    evidence: [...graph.evidence, ...newEvidence],
    edges: [...graph.edges, ...newEdges],
  };
}

/**
 * Map precedent-matcher `position` to a ClaimEvidenceRelation.
 */
function precedentPositionToRelation(position?: string): ClaimEvidenceRelation {
  const normalized = (position ?? "").toLowerCase().trim();
  if (normalized.includes("gefährdend") || normalized.includes("gegen")) {
    return "contradicts";
  }
  if (normalized.includes("abweichend") || normalized.includes("distinguish")) {
    return "distinguishes";
  }
  // "stützend" or default
  return "supports";
}

/**
 * Find the best-matching claim for a precedent's `claim` text.
 * Uses token overlap scoring — no LLM call needed.
 */
function findBestClaimMatch(claims: ClaimNode[], claimText: string): ClaimNode | null {
  if (!claimText) return null;
  const queryTokens = new Set(
    claimText
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-zäöüß0-9]/g, ""))
      .filter((token) => token.length > 2)
  );
  if (queryTokens.size === 0) return null;

  let bestClaim: ClaimNode | null = null;
  let bestScore = 0;

  for (const claim of claims) {
    const claimTokens = new Set(
      claim.text
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.replace(/[^a-zäöüß0-9]/g, ""))
        .filter((token) => token.length > 2)
    );
    let overlap = 0;
    for (const token of queryTokens) {
      if (claimTokens.has(token)) overlap++;
    }
    const score = overlap / Math.sqrt(queryTokens.size);
    if (score > bestScore) {
      bestScore = score;
      bestClaim = claim;
    }
  }

  // Require at least 20% token overlap to avoid false matches
  return bestScore >= 0.2 ? bestClaim : null;
}

/**
 * Extract dependencies from a Claim–Evidence graph for the DependencyGraphStore.
 * Each verified evidence node with a source_slug and snapshot_hash becomes a
 * dependency record.
 */
export interface ExtractedDependency {
  source_slug: string;
  snapshot_hash: string;
  paragraph_ref: string | null;
  claim_hash: string;
}

export function extractDependenciesFromGraph(graph: ClaimEvidenceGraph): ExtractedDependency[] {
  const dependencies: ExtractedDependency[] = [];
  const evidenceById = new Map(graph.evidence.map((evidence) => [evidence.id, evidence]));

  for (const claim of graph.claims) {
    const claimHash = stableClaimEvidenceId("claim-hash", claim.id, claim.text);
    const linkedEdges = graph.edges.filter((edge) => edge.from_id === claim.id);
    for (const edge of linkedEdges) {
      const evidence = evidenceById.get(edge.to_id);
      if (!evidence) continue;
      if (!evidence.snapshot_hash) continue;
      dependencies.push({
        source_slug: evidence.source_slug,
        snapshot_hash: evidence.snapshot_hash,
        paragraph_ref: evidence.paragraph_ref ?? null,
        claim_hash: claimHash,
      });
    }
  }

  // Deduplicate by (source_slug, snapshot_hash, paragraph_ref, claim_hash)
  const seen = new Set<string>();
  return dependencies.filter((dependency) => {
    const key = `${dependency.source_slug}|${dependency.snapshot_hash}|${dependency.paragraph_ref}|${dependency.claim_hash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
