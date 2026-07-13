import { describe, expect, test } from "bun:test";
import {
  buildClaimEvidenceReceiptArtifacts,
  buildGraphFromGroundingMap,
  buildGraphFromLegalIssue,
  computeClaimEvidenceCoverage,
  explainClaim,
  extractDependenciesFromGraph,
  mergePrecedentMatches,
  validateClaimEvidenceGraph,
  type ClaimEvidenceGraph,
} from "./claim-evidence.ts";
import type { LegalIssue } from "./issues/types.ts";

const NOW = "2026-07-13T10:00:00.000Z";

function graph(): ClaimEvidenceGraph {
  return {
    schema_version: "1.0",
    graph_id: "ceg-1",
    output_id: "memo-1",
    output_type: "memo",
    jurisdiction: "DE",
    as_of_date: "2026-07-13",
    created_at: NOW,
    claims: [
      {
        id: "claim-1",
        kind: "claim",
        claim_kind: "legal",
        text: "Der Anspruch setzt einen Sachmangel voraus.",
        risk: "high",
        jurisdiction: "DE",
        requires_verified_support: true,
      },
    ],
    evidence: [
      {
        id: "ev-1",
        kind: "rule",
        text: "Die Sache ist frei von Sachmängeln ...",
        source_slug: "law/de/bgb/434",
        jurisdiction: "DE",
        verification: "verified",
        snapshot_hash: "a".repeat(64),
        paragraph_ref: "§ 434 BGB",
        start_offset: 0,
        end_offset: 35,
      },
    ],
    edges: [
      {
        id: "edge-1",
        from_id: "claim-1",
        to_id: "ev-1",
        relation: "supports",
        verified: true,
      },
    ],
  };
}

describe("Claim–Evidence graph", () => {
  test("validates and covers a supported high-risk claim", () => {
    const candidate = graph();
    expect(validateClaimEvidenceGraph(candidate)).toEqual({ valid: true, errors: [] });
    const coverage = computeClaimEvidenceCoverage(candidate);
    expect(coverage.weighted_coverage).toBe(1);
    expect(coverage.publishable).toBe(true);
    expect(coverage.claims[0]?.resolution).toBe("supported");
    expect(coverage.claims[0]?.missing_evidence_groups).toEqual([]);
  });

  test("fails closed when a high-risk claim has no verified evidence", () => {
    const candidate = graph();
    candidate.evidence[0]!.verification = "unverified";
    candidate.edges[0]!.verified = false;
    const coverage = computeClaimEvidenceCoverage(candidate);
    expect(coverage.publishable).toBe(false);
    expect(coverage.unsupported_high_risk_claim_ids).toEqual(["claim-1"]);
    expect(buildClaimEvidenceReceiptArtifacts(candidate).check.severity).toBe("critical");
  });

  test("marks verified contradicting evidence as disputed", () => {
    const candidate = graph();
    candidate.edges[0]!.relation = "contradicts";
    const coverage = computeClaimEvidenceCoverage(candidate);
    expect(coverage.claims[0]?.resolution).toBe("disputed");
    expect(coverage.contradiction_coverage).toBe(1);
    expect(coverage.publishable).toBe(false);
  });

  test("marks stale evidence as stale and blocks publication", () => {
    const candidate = graph();
    candidate.evidence[0]!.verification = "stale";
    candidate.edges[0]!.verified = false;
    const coverage = computeClaimEvidenceCoverage(candidate);
    expect(coverage.claims[0]?.resolution).toBe("stale");
    expect(coverage.publishable).toBe(false);
  });

  test("returns a claim-specific why bundle", () => {
    const explanation = explainClaim(graph(), "claim-1");
    expect(explanation?.claim.text).toContain("Sachmangel");
    expect(explanation?.supports.map((evidence) => evidence.id)).toEqual(["ev-1"]);
  });

  test("converts backend-verified grounding without trusting unverified matches", () => {
    const converted = buildGraphFromGroundingMap({
      output_id: "memo-2",
      output_type: "memo",
      jurisdiction: "DE",
      as_of_date: "2026-07-13",
      now: NOW,
      entries: [
        {
          finding: "Es liegt ein Sachmangel vor.",
          finding_type: "anspruch",
          on_reference: "ON 1",
          quote: "Bremsen defekt",
          matched_paragraphs: [
            {
              paragraph: "§ 434",
              statute: "BGB",
              confidence: "hoch",
              verified: true,
              source_slug: "law/de/bgb/434",
              source_url: "https://www.gesetze-im-internet.de/bgb/__434.html",
              snapshot_hash: "b".repeat(64),
              valid_from: "2022-01-01",
              valid_to: null,
              evidence_start: 10,
              evidence_end: 30,
              source_text: "Die Sache ist frei von Sachmängeln",
            },
            {
              paragraph: "§ 999",
              statute: "BGB",
              confidence: "niedrig",
              verified: false,
              reason: "Quelle nicht im Corpus gefunden",
            },
          ],
        },
      ],
    });
    expect(converted.claims).toHaveLength(1);
    expect(converted.evidence).toHaveLength(3);
    // A verified rule is not enough for subsumption: the quoted case fact is
    // still unresolved and therefore cannot satisfy factual evidence coverage.
    expect(computeClaimEvidenceCoverage(converted).publishable).toBe(false);
    expect(computeClaimEvidenceCoverage(converted).claims[0]?.missing_evidence_groups).toEqual([
      ["fact", "document_span"],
    ]);
    expect(converted.edges.filter((edge) => edge.verified)).toHaveLength(1);
  });

  test("verifies a unique exact case quote and satisfies both evidence dimensions", () => {
    const converted = buildGraphFromGroundingMap({
      output_id: "memo-3",
      output_type: "memo",
      jurisdiction: "DE",
      as_of_date: "2026-07-13",
      now: NOW,
      case_documents: [
        {
          source_slug: "cases/1/anlage-a",
          text: "Am 10. Mai stellte die Werkstatt einen Bremsendefekt fest.",
        },
      ],
      entries: [
        {
          finding: "Das Fahrzeug war mangelhaft.",
          finding_type: "anspruch",
          on_reference: "Anlage A",
          quote: "einen Bremsendefekt",
          matched_paragraphs: [
            {
              paragraph: "§ 434",
              statute: "BGB",
              confidence: "hoch",
              verified: true,
              source_slug: "law/de/bgb/434",
              source_url: "https://www.gesetze-im-internet.de/bgb/__434.html",
              snapshot_hash: "d".repeat(64),
              valid_from: "2022-01-01",
              valid_to: null,
              evidence_start: 0,
              evidence_end: 20,
              source_text: "Die Sache ist frei von Sachmängeln",
            },
          ],
        },
      ],
    });
    const coverage = computeClaimEvidenceCoverage(converted);
    expect(coverage.publishable).toBe(true);
    expect(coverage.claims[0]?.missing_evidence_groups).toEqual([]);
    const documentEvidence = converted.evidence.find(
      (evidence) => evidence.kind === "document_span"
    );
    expect(documentEvidence?.verification).toBe("verified");
    expect(documentEvidence?.source_slug).toBe("cases/1/anlage-a");
  });

  test("does not verify an ambiguous quote appearing in multiple documents", () => {
    const converted = buildGraphFromGroundingMap({
      output_id: "memo-ambiguous",
      output_type: "memo",
      jurisdiction: "DE",
      as_of_date: "2026-07-13",
      now: NOW,
      case_documents: [
        { source_slug: "cases/1/a", text: "Bremsen defekt" },
        { source_slug: "cases/1/b", text: "Bremsen defekt" },
      ],
      entries: [
        {
          finding: "Mangel",
          finding_type: "anspruch",
          on_reference: "A/B",
          quote: "Bremsen defekt",
          matched_paragraphs: [],
        },
      ],
    });
    expect(converted.evidence[0]?.verification).toBe("unverified");
    expect(computeClaimEvidenceCoverage(converted).publishable).toBe(false);
  });

  test("converts LegalIssue assessments and conflicting evidence", () => {
    const evidence = {
      id: "ev-source",
      source_slug: "law/de/bgb/434",
      jurisdiction: "DE" as const,
      start_offset: 0,
      end_offset: 20,
      text: "Sachmangel liegt vor",
      content_hash: "c".repeat(64),
      verification: "verified" as const,
      extracted_at: NOW,
      paragraph_ref: "§ 434 BGB",
    };
    const issue = {
      id: "issue-1",
      title: "Sachmangel",
      jurisdiction: "DE",
      as_of_date: "2026-07-13",
      source_snapshot: {
        jurisdiction: "DE",
        as_of_date: "2026-07-13",
        corpus_hashes: { "law/de/bgb/434": "c".repeat(64) },
        corpus_slugs: ["law/de/bgb/434"],
      },
      applicable_rules: [],
      required_elements: [{ id: "el-1", label: "Sachmangel", required: true }],
      element_assessments: [
        {
          element_id: "el-1",
          status: "disputed",
          evidence: [evidence],
          conflicting_evidence: [{ ...evidence, id: "ev-conflict", text: "Kein Mangel" }],
          reasoning: "Parteien widersprechen sich",
          agent_generated: true,
          assessed_at: NOW,
        },
      ],
      supporting_facts: [],
      opposing_facts: [],
      missing_facts: [],
      assumptions: [],
      status: "open",
      risk: "high",
      created_at: NOW,
      updated_at: NOW,
    } satisfies LegalIssue;
    const converted = buildGraphFromLegalIssue(issue);
    expect(converted.edges.some((edge) => edge.relation === "contradicts")).toBe(true);
    expect(computeClaimEvidenceCoverage(converted).publishable).toBe(false);
  });

  test("mergePrecedentMatches adds decision evidence with correct relations", () => {
    const base = graph();
    const merged = mergePrecedentMatches(base, [
      {
        claim: "Der Anspruch setzt einen Sachmangel voraus",
        gericht: "OGH",
        entscheidung: "7Ob123/24",
        datum: "2024-03-15",
        leitsatz: "Sachmangel liegt bei Bremsendefekt vor.",
        position: "stützend",
        verified: true,
      },
      {
        claim: "Sachmangel Anspruch",
        gericht: "BGH",
        entscheidung: "VIII ZR 100/23",
        datum: "2023-11-20",
        leitsatz: "Kein Sachmangel bei normaler Abnutzung.",
        position: "gefährdend",
      },
    ]);

    const decisionEvidence = merged.evidence.filter((evidence) => evidence.kind === "decision");
    expect(decisionEvidence).toHaveLength(2);

    const supportsEdge = merged.edges.find(
      (edge) => edge.relation === "supports" && edge.to_id === decisionEvidence[0]!.id
    );
    expect(supportsEdge).toBeDefined();
    expect(supportsEdge!.verified).toBe(false); // LLM-asserted verified=true → still unverified

    const contradictsEdge = merged.edges.find(
      (edge) => edge.relation === "contradicts" && edge.to_id === decisionEvidence[1]!.id
    );
    expect(contradictsEdge).toBeDefined();
  });

  test("mergePrecedentMatches does not mark LLM-asserted evidence as backend-verified", () => {
    const base = graph();
    const merged = mergePrecedentMatches(base, [
      {
        claim: "Sachmangel",
        gericht: "OGH",
        entscheidung: "5Ob99/24",
        leitsatz: "Bestätigt Sachmangel.",
        position: "stützend",
        verified: true,
      },
    ]);
    const decisionEvidence = merged.evidence.find((evidence) => evidence.kind === "decision");
    expect(decisionEvidence?.verification).toBe("unverified");
    expect(decisionEvidence?.snapshot_hash).toBeUndefined();
  });

  test("mergePrecedentMatches marks as verified when backend-resolved", () => {
    const base = graph();
    const slug = "decision/ogh/5ob99-24";
    const resolvedDecisions = new Map([[slug, "e".repeat(64)]]);
    const merged = mergePrecedentMatches(
      base,
      [
        {
          claim: "Sachmangel",
          gericht: "OGH",
          entscheidung: "5Ob99/24",
          leitsatz: "Bestätigt Sachmangel.",
          position: "stützend",
        },
      ],
      { resolvedDecisions }
    );
    const decisionEvidence = merged.evidence.find((evidence) => evidence.kind === "decision");
    expect(decisionEvidence?.verification).toBe("verified");
    expect(decisionEvidence?.snapshot_hash).toBe("e".repeat(64));
  });

  test("mergePrecedentMatches handles unmatched claims gracefully", () => {
    const base = graph();
    const merged = mergePrecedentMatches(base, [
      {
        claim: "Completely unrelated topic about tax law",
        gericht: "BFH",
        entscheidung: "VI R 42/23",
        leitsatz: "Steuerrechtliche Entscheidung.",
        position: "stützend",
      },
    ]);
    // Evidence is still added but no edge connects it to a claim
    expect(merged.evidence.filter((evidence) => evidence.kind === "decision")).toHaveLength(1);
    expect(merged.edges.filter((edge) => edge.relation === "supports")).toHaveLength(1); // original edge only
  });

  test("mergePrecedentMatches maps abweichend to distinguishes", () => {
    const base = graph();
    const merged = mergePrecedentMatches(base, [
      {
        claim: "Sachmangel Anspruch",
        gericht: "OLG",
        entscheidung: "3U123/24",
        leitsatz: "Abweichende Beurteilung.",
        position: "abweichend",
      },
    ]);
    const distinguishesEdge = merged.edges.find((edge) => edge.relation === "distinguishes");
    expect(distinguishesEdge).toBeDefined();
  });

  test("extractDependenciesFromGraph returns verified evidence with snapshot hashes", () => {
    const base = graph();
    const deps = extractDependenciesFromGraph(base);
    expect(deps).toHaveLength(1);
    expect(deps[0]!.source_slug).toBe("law/de/bgb/434");
    expect(deps[0]!.snapshot_hash).toBe("a".repeat(64));
    expect(deps[0]!.paragraph_ref).toBe("§ 434 BGB");
    expect(deps[0]!.claim_hash).toBeTruthy();
  });

  test("extractDependenciesFromGraph deduplicates identical dependencies", () => {
    const base = graph();
    // Add a second edge from the same claim to the same evidence
    base.edges.push({
      id: "edge-dup",
      from_id: "claim-1",
      to_id: "ev-1",
      relation: "supports",
      verified: true,
    });
    const deps = extractDependenciesFromGraph(base);
    expect(deps).toHaveLength(1);
  });

  test("extractDependenciesFromGraph skips evidence without snapshot_hash", () => {
    const base = graph();
    base.evidence[0]!.snapshot_hash = undefined;
    const deps = extractDependenciesFromGraph(base);
    expect(deps).toHaveLength(0);
  });
});
