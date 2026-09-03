import { describe, test, expect } from "vitest";
import {
  QUERY_MODE_LABELS,
  type QueryMode,
  type MatterParty,
  type MatterDeadlineSummary,
  type MatterDocumentSummary,
  type MatterFactEntry,
  type MatterCommunicationEntry,
  type MatterPermissionSummary,
  type MatterContextBundle,
  type SourceCoverageEntry,
  type MatterCoverageStatus,
  type MatterGap,
  type GapType,
  type GapSeverity,
  type RetrievalExplanation,
  type ExplainedSearchResult,
  type BrainQualitySummary,
  type MatterRiskItem,
  type MatterUnderstandingPanel,
  type RecentlyChangedSource,
  type CaseInvestigationContradiction,
  type CaseInvestigationContradictionCategory,
  type CaseInvestigationSeverity,
  type CaseInvestigationMateriality,
  type CaseInvestigationEvidenceGap,
  type CaseInvestigationHypothesis,
  type CaseInvestigationQuestion,
  type CaseInvestigationResult,
  type CaseInvestigationSuggestion,
  type CaseInvestigationSuggestionIndicators,
} from "./matter-context-types";

describe("QUERY_MODE_LABELS", () => {
  const modes: QueryMode[] = ["conservative", "balanced", "deep_matter"];

  test("has entry for every QueryMode", () => {
    for (const mode of modes) {
      expect(QUERY_MODE_LABELS[mode]).toBeDefined();
      expect(QUERY_MODE_LABELS[mode].label).toBeTruthy();
      expect(QUERY_MODE_LABELS[mode].description).toBeTruthy();
    }
  });

  test("conservative has German label", () => {
    expect(QUERY_MODE_LABELS.conservative.label).toBe("Verlässlich");
  });

  test("balanced has label", () => {
    expect(QUERY_MODE_LABELS.balanced.label).toBe("Akten + Recht");
  });

  test("deep_matter has label", () => {
    expect(QUERY_MODE_LABELS.deep_matter.label).toBe("Tiefensuche");
  });

  test("all descriptions are non-empty strings", () => {
    for (const mode of modes) {
      expect(QUERY_MODE_LABELS[mode].description.length).toBeGreaterThan(5);
    }
  });
});

describe("Type instantiation", () => {
  test("MatterParty with all fields", () => {
    const party: MatterParty = {
      slug: "contact/1",
      name: "Max Mustermann",
      role: "client",
      contact_info: { email: "max@example.com", phone: "+43 123" },
    };
    expect(party.role).toBe("client");
  });

  test("MatterParty with all role types", () => {
    const roles: MatterParty["role"][] = [
      "client",
      "opponent",
      "lawyer",
      "court",
      "witness",
      "third_party",
      "other",
    ];
    expect(roles).toHaveLength(7);
  });

  test("MatterDeadlineSummary with urgency levels", () => {
    const deadline: MatterDeadlineSummary = {
      title: "Frist",
      date: "2024-12-01",
      status: "open",
      urgency: "critical",
      source: "engine",
    };
    expect(deadline.urgency).toBe("critical");
  });

  test("MatterDocumentSummary with OCR status", () => {
    const doc: MatterDocumentSummary = {
      slug: "doc/1",
      name: "Klage.pdf",
      uploaded_at: "2024-01-01",
      ocr_status: "ocr_complete",
    };
    expect(doc.ocr_status).toBe("ocr_complete");
  });

  test("MatterFactEntry with contradiction fields", () => {
    const fact: MatterFactEntry = {
      id: "f1",
      statement: "Der Beklagte hat gezahlt",
      source: "email",
      confidence: "high",
      contradicts: ["f2"],
    };
    expect(fact.contradicts).toContain("f2");
  });

  test("MatterCommunicationEntry with channels", () => {
    const channels: MatterCommunicationEntry["channel"][] = [
      "email",
      "whatsapp",
      "phone",
      "letter",
      "portal",
      "bea",
      "other",
    ];
    expect(channels).toHaveLength(7);
  });

  test("MatterPermissionSummary with ethical wall", () => {
    const perm: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: true,
      legal_hold: false,
      allowed_users: ["u1"],
      blocked_users: ["u2"],
      ethical_wall_active: true,
    };
    expect(perm.ethical_wall_active).toBe(true);
  });

  test("MatterContextBundle with all fields", () => {
    const bundle: MatterContextBundle = {
      case_slug: "cases/1",
      case_title: "Test Case",
      parties: [],
      deadlines: [],
      documents: [],
      recent_activity: [],
      facts: [],
      communications: [],
      document_requests: [],
      intake_requests: [],
      conversation_events: [],
      permissions: {
        visibility: "full",
        privileged: false,
        legal_hold: false,
        allowed_users: [],
        blocked_users: [],
        ethical_wall_active: false,
      },
      coverage: {
        sources: [],
        total_sources: 0,
        connected_sources: 0,
        fresh_sources: 0,
        stale_sources: 0,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "unknown",
        completeness_score: 0,
        warnings: [],
      },
      gaps: [],
      generated_at: "2024-01-01",
      engine_reachable: true,
    };
    expect(bundle.case_slug).toBe("cases/1");
    expect(bundle.engine_reachable).toBe(true);
  });

  test("SourceCoverageEntry with source types", () => {
    const sourceTypes: SourceCoverageEntry["source_type"][] = [
      "statute_corpus",
      "judgement_api",
      "dms",
      "email",
      "whatsapp",
      "portal",
      "upload",
      "regulatory_feed",
      "commercial",
    ];
    expect(sourceTypes).toHaveLength(9);
  });

  test("MatterCoverageStatus with freshness levels", () => {
    const freshness: MatterCoverageStatus["overall_freshness"][] = ["fresh", "stale", "unknown"];
    expect(freshness).toHaveLength(3);
  });

  test("GapType has all expected types", () => {
    const gapTypes: GapType[] = [
      "missing_document",
      "missing_deadline",
      "missing_power_of_attorney",
      "missing_attachment",
      "missing_deadline_confirmation",
      "unclear_opponent",
      "unreviewed_document",
      "contradictory_facts",
      "stale_knowledge_asset",
      "missing_client_info",
      "engine_unreachable",
      "incomplete_coverage",
      "missing_communication_log",
      "unprivileged_communication",
      "ethical_wall_violation",
    ];
    expect(gapTypes).toHaveLength(15);
  });

  test("GapSeverity has all levels", () => {
    const severities: GapSeverity[] = ["critical", "high", "medium", "low", "info"];
    expect(severities).toHaveLength(5);
  });

  test("MatterGap with all fields", () => {
    const gap: MatterGap = {
      type: "missing_document",
      severity: "high",
      title: "Missing document",
      description: "Klage fehlt",
      recommendation: "Upload needed",
      detected_at: "2024-01-01",
      related_entity: "cases/1",
    };
    expect(gap.type).toBe("missing_document");
  });

  test("RetrievalExplanation with search modes", () => {
    const modes: RetrievalExplanation["search_mode"][] = [
      "hybrid",
      "semantic",
      "keyword",
      "graph",
      "unknown",
    ];
    expect(modes).toHaveLength(5);
  });

  test("ExplainedSearchResult with explanation", () => {
    const result: ExplainedSearchResult = {
      slug: "cases/1",
      title: "Case 1",
      snippet: "Test",
      score: 0.9,
      explanation: {
        slug: "cases/1",
        title: "Case 1",
        score: 0.9,
        search_mode: "hybrid",
        source: "internal",
        permission_filtered: false,
      },
    };
    expect(result.explanation.search_mode).toBe("hybrid");
  });

  test("BrainQualitySummary with source breakdown", () => {
    const summary: BrainQualitySummary = {
      total_pages: 100,
      total_entities: 50,
      total_edges: 200,
      indexed_pages: 95,
      ocr_pending: 5,
      stale_sources: 2,
      coverage_score: 0.85,
      last_synced: "2024-01-01",
      source_breakdown: [{ source_type: "dms", count: 50, fresh: true }],
      quality_issues: [],
    };
    expect(summary.coverage_score).toBe(0.85);
  });

  test("MatterRiskItem with severity levels", () => {
    const severities: MatterRiskItem["severity"][] = ["critical", "high", "medium", "low"];
    expect(severities).toHaveLength(4);
  });

  test("MatterUnderstandingPanel with all fields", () => {
    const panel: MatterUnderstandingPanel = {
      case_slug: "cases/1",
      case_title: "Test",
      understanding_score: 0.75,
      summary: "Good coverage",
      facts: [],
      gaps: [],
      risks: [],
      freshness: {
        overall: "fresh",
        completeness_score: 0.8,
        stale_sources: 0,
        fresh_sources: 3,
        total_sources: 3,
        last_activity: "2024-01-01",
      },
      recently_changed_sources: [],
      engine_reachable: true,
      generated_at: "2024-01-01",
    };
    expect(panel.understanding_score).toBe(0.75);
  });

  test("RecentlyChangedSource with change types", () => {
    const changeTypes: RecentlyChangedSource["change_type"][] = [
      "created",
      "updated",
      "synced",
      "reviewed",
    ];
    expect(changeTypes).toHaveLength(4);
  });

  // ── Case Investigation Types ─────────────────────────────────────

  test("MatterFactEntry mit Case-Investigation-Erweiterung", () => {
    const fact: MatterFactEntry = {
      id: "f1",
      statement: "Ich war am 14.05. in Linz.",
      source: "D-12",
      confidence: "medium",
      speaker_entity: "Zeuge Z",
      source_page: 4,
      source_span: "S.4 Abs.2",
      exact_quote: "Am 14.05. war ich bis ca. 13:30 Uhr ausschließlich beim Kunden in Linz.",
      perception_type: "eigen",
      beweis_anforderung: "vollbeweis",
      on_norm_ref: "ON 1923",
      extraction_confidence: 0.87,
      provenance: {
        extractor_version: "1.0.0",
        extracted_at: "2026-08-23T10:00:00Z",
        content_hash: "abc123",
      },
    };
    expect(fact.speaker_entity).toBe("Zeuge Z");
    expect(fact.perception_type).toBe("eigen");
    expect(fact.extraction_confidence).toBe(0.87);
  });

  test("MatterFactEntry review_status mit neuen Werten", () => {
    const statuses: MatterFactEntry["review_status"][] = [
      "pending",
      "approved",
      "party_assertion",
      "corrected",
      "dismissed",
      "no_contradiction",
    ];
    expect(statuses).toHaveLength(6);
  });

  test("CaseInvestigationContradictionCategory hat alle Kategorien", () => {
    const categories: CaseInvestigationContradictionCategory[] = [
      "direkt",
      "zeitlich",
      "räumlich",
      "identität",
      "mengen",
      "kausal",
      "semantisch",
      "dokumentarisch",
      "aussageentwicklung",
      "rechtlich",
    ];
    expect(categories).toHaveLength(10);
  });

  test("CaseInvestigationContradiction mit allen Feldern", () => {
    const c: CaseInvestigationContradiction = {
      id: "W-07",
      case_slug: "mueller-vs-huber",
      claim_a_id: "f43",
      claim_b_id: "f89",
      category: "zeitlich",
      severity: "hoch",
      materiality: "zentral",
      is_direct: true,
      alternative_explanations: ["Telefonisch?", "Zeit geschätzt?"],
      belastende_interpretation: "Zeuge kann nicht an beiden Orten gewesen sein",
      entlastende_interpretation: "Zeitangabe könnte geschätzt sein",
      resolution_questions: ["Wo waren Sie unmittelbar davor/danach?"],
      zpo_relevanz: "§ 226 ZPO",
      audit_verified: true,
      audit_confidence: 0.92,
      review_status: "pending",
    };
    expect(c.category).toBe("zeitlich");
    expect(c.audit_confidence).toBe(0.92);
  });

  test("CaseInvestigationSeverity hat 3 Stufen", () => {
    const severities: CaseInvestigationSeverity[] = ["niedrig", "mittel", "hoch"];
    expect(severities).toHaveLength(3);
  });

  test("CaseInvestigationMateriality hat 3 Stufen", () => {
    const materialities: CaseInvestigationMateriality[] = [
      "nicht_erkennbar",
      "möglicherweise",
      "zentral",
    ];
    expect(materialities).toHaveLength(3);
  });

  test("CaseInvestigationEvidenceGap mit allen Feldern", () => {
    const gap: CaseInvestigationEvidenceGap = {
      id: "L-01",
      case_slug: "mueller-vs-huber",
      beschreibung: "Keine Reisekostenabrechnung für Linz am 14.05.",
      fehlendes_beweismittel: "Hotelrechnung, Tankquittung",
      erwartete_quelle: "Buchhaltung Müller GmbH",
      beweisbedeutung: "Stützt oder widerlegt Aufenthalt in Linz",
    };
    expect(gap.fehlendes_beweismittel).toContain("Hotelrechnung");
  });

  test("CaseInvestigationHypothesis mit Indizien", () => {
    const h: CaseInvestigationHypothesis = {
      id: "H-01",
      case_slug: "mueller-vs-huber",
      beschreibung: "Gespräch fand telefonisch statt, nicht persönlich",
      stuetzende_indizien: ["Keine Reisekosten", "Kalender zeigt keinen Termin"],
      gegen_indizien: ['Zeuge sagt „persönlich"'],
    };
    expect(h.stuetzende_indizien).toHaveLength(2);
  });

  test("CaseInvestigationQuestion mit PEACE-Struktur", () => {
    const q: CaseInvestigationQuestion = {
      id: "Q-01",
      case_slug: "mueller-vs-huber",
      ziel_person: "Zeuge Z",
      einstiegsfrage: "Schildern Sie das Gespräch mit Frau X am 14.05.",
      praezisierungsfragen: ["Wo befanden Sie sich davor/danach?"],
      konfrontationsfrage: "Müller sagt, Sie waren in Linz — stimmt das?",
      beweisbedeutung: "Klärung des Aufenthaltsorts",
    };
    expect(q.einstiegsfrage).toContain("Schildern Sie");
  });

  test("CaseInvestigationResult mit allen Feldern", () => {
    const r: CaseInvestigationResult = {
      run_id: "run-001",
      case_slug: "mueller-vs-huber",
      jurisdiction: "at",
      pruefauftrag: "Sachverhaltsprüfung Müller vs. Huber",
      rechtlicher_rahmen: {
        zpo_vorschriften: ["§ 226 ZPO", "§ 272 ZPO", "§ 274 ZPO"],
        verfahrensschritt: "Verhandlungsmaxime — beweisbedürftige Tatsachen",
      },
      claims_count: 312,
      contradictions: [],
      evidence_gaps: [],
      alternative_hypotheses: [],
      neutral_questions: [],
      pruefbedarf_hinweis: "anwaltlich zu prüfen",
      generated_at: "2026-08-23T10:00:00Z",
      engine_reachable: true,
    };
    expect(r.jurisdiction).toBe("at");
    expect(r.rechtlicher_rahmen.zpo_vorschriften).toHaveLength(3);
  });

  test("CaseInvestigationSuggestion mit Indikatoren", () => {
    const s: CaseInvestigationSuggestion = {
      suggest: true,
      reason: "Fall Müller vs. Huber: 10 Dokumente, 3 Widersprüche",
      urgency: "high",
      indicators: {
        has_opposing_parties: true,
        known_contradictions: 3,
        ready_documents: 10,
        has_gaps: false,
        has_communication: false,
      },
      estimated_credits: 2,
      estimated_duration_seconds: 45,
      case_slug: "mueller-vs-huber",
      case_title: "Müller vs. Huber",
    };
    expect(s.suggest).toBe(true);
    expect(s.indicators.known_contradictions).toBe(3);
  });

  test("CaseInvestigationSuggestionIndicators mit allen Feldern", () => {
    const ind: CaseInvestigationSuggestionIndicators = {
      has_opposing_parties: false,
      known_contradictions: 0,
      ready_documents: 0,
      has_gaps: false,
      has_communication: false,
    };
    expect(ind.has_opposing_parties).toBe(false);
  });
});
