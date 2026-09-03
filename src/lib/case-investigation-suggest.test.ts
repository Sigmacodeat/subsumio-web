import { describe, test, expect } from "vitest";
import {
  computeInvestigationIndicators,
  countActiveIndicators,
  computeUrgency,
  buildSuggestionReason,
  shouldSuggestInvestigation,
} from "./case-investigation-suggest";
import type {
  MatterContextBundle,
  MatterParty,
  MatterFactEntry,
  MatterDocumentSummary,
  MatterGap,
  MatterCommunicationEntry,
} from "./matter-context-types";

// ── Fixtures ───────────────────────────────────────────────────────────

function makeBundle(overrides: Partial<MatterContextBundle> = {}): MatterContextBundle {
  return {
    case_slug: "mueller-vs-huber",
    case_title: "Müller vs. Huber",
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
    generated_at: "2026-08-23T10:00:00Z",
    engine_reachable: true,
    ...overrides,
  };
}

function makeParty(role: MatterParty["role"], name: string): MatterParty {
  return { slug: name.toLowerCase().replace(/\s/g, "-"), name, role };
}

function makeFact(overrides: Partial<MatterFactEntry> = {}): MatterFactEntry {
  return {
    id: "fact-1",
    statement: "Test statement",
    source: "D-01",
    confidence: "medium",
    ...overrides,
  };
}

function makeDoc(
  analysisStatus: MatterDocumentSummary["analysis_status"] = "completed"
): MatterDocumentSummary {
  return {
    slug: "doc-1",
    name: "Test.pdf",
    uploaded_at: "2026-08-23T10:00:00Z",
    analysis_status: analysisStatus,
  };
}

function makeGap(): MatterGap {
  return {
    type: "missing_document",
    severity: "high",
    title: "Missing doc",
    description: "A document is missing",
    recommendation: "Request it",
    detected_at: "2026-08-23T10:00:00Z",
  };
}

function makeComm(): MatterCommunicationEntry {
  return {
    id: "comm-1",
    channel: "email",
    direction: "incoming",
    subject: "Test",
    timestamp: "2026-08-23T10:00:00Z",
    privileged: false,
    has_attachments: false,
  };
}

// ── computeInvestigationIndicators ─────────────────────────────────────

describe("computeInvestigationIndicators", () => {
  test("leerer Bundle → alle Indikatoren false/0", () => {
    const bundle = makeBundle();
    const indicators = computeInvestigationIndicators(bundle);
    expect(indicators.has_opposing_parties).toBe(false);
    expect(indicators.known_contradictions).toBe(0);
    expect(indicators.ready_documents).toBe(0);
    expect(indicators.has_gaps).toBe(false);
    expect(indicators.has_communication).toBe(false);
  });

  test("client + opponent → has_opposing_parties true", () => {
    const bundle = makeBundle({
      parties: [makeParty("client", "Müller"), makeParty("opponent", "Huber")],
    });
    expect(computeInvestigationIndicators(bundle).has_opposing_parties).toBe(true);
  });

  test("nur client → has_opposing_parties false", () => {
    const bundle = makeBundle({ parties: [makeParty("client", "Müller")] });
    expect(computeInvestigationIndicators(bundle).has_opposing_parties).toBe(false);
  });

  test("facts mit contradicts → known_contradictions gezählt", () => {
    const bundle = makeBundle({
      facts: [
        makeFact({ id: "f1", contradicts: ["f2"] }),
        makeFact({ id: "f2", contradicts: ["f1"] }),
        makeFact({ id: "f3", contradicts: [] }),
      ],
    });
    expect(computeInvestigationIndicators(bundle).known_contradictions).toBe(2);
  });

  test("documents mit analysis_status completed → ready_documents gezählt", () => {
    const bundle = makeBundle({
      documents: [
        makeDoc("completed"),
        makeDoc("completed"),
        makeDoc("pending"),
        makeDoc("failed"),
      ],
    });
    expect(computeInvestigationIndicators(bundle).ready_documents).toBe(2);
  });

  test("gaps vorhanden → has_gaps true", () => {
    const bundle = makeBundle({ gaps: [makeGap()] });
    expect(computeInvestigationIndicators(bundle).has_gaps).toBe(true);
  });

  test("communications vorhanden → has_communication true", () => {
    const bundle = makeBundle({ communications: [makeComm()] });
    expect(computeInvestigationIndicators(bundle).has_communication).toBe(true);
  });
});

// ── countActiveIndicators ──────────────────────────────────────────────

describe("countActiveIndicators", () => {
  test("keine Indikatoren → 0", () => {
    expect(
      countActiveIndicators({
        has_opposing_parties: false,
        known_contradictions: 0,
        ready_documents: 0,
        has_gaps: false,
        has_communication: false,
      })
    ).toBe(0);
  });

  test("alle Indikatoren → 5", () => {
    expect(
      countActiveIndicators({
        has_opposing_parties: true,
        known_contradictions: 3,
        ready_documents: 10,
        has_gaps: true,
        has_communication: true,
      })
    ).toBe(5);
  });

  test("ready_documents unter Schwelle → nicht gezählt", () => {
    expect(
      countActiveIndicators({
        has_opposing_parties: false,
        known_contradictions: 0,
        ready_documents: 4,
        has_gaps: false,
        has_communication: false,
      })
    ).toBe(0);
  });

  test("ready_documents ab Schwelle → gezählt", () => {
    expect(
      countActiveIndicators({
        has_opposing_parties: false,
        known_contradictions: 0,
        ready_documents: 5,
        has_gaps: false,
        has_communication: false,
      })
    ).toBe(1);
  });
});

// ── computeUrgency ─────────────────────────────────────────────────────

describe("computeUrgency", () => {
  test("high: Widersprüche + genug Dokumente + Parteien", () => {
    expect(
      computeUrgency(
        {
          has_opposing_parties: true,
          known_contradictions: 3,
          ready_documents: 10,
          has_gaps: false,
          has_communication: false,
        },
        3
      )
    ).toBe("high");
  });

  test("medium: 3 Indikatoren aber nicht alle high-Kriterien", () => {
    expect(
      computeUrgency(
        {
          has_opposing_parties: true,
          known_contradictions: 0,
          ready_documents: 10,
          has_gaps: true,
          has_communication: false,
        },
        3
      )
    ).toBe("medium");
  });

  test("low: nur 2 Indikatoren", () => {
    expect(
      computeUrgency(
        {
          has_opposing_parties: true,
          known_contradictions: 0,
          ready_documents: 5,
          has_gaps: false,
          has_communication: false,
        },
        2
      )
    ).toBe("low");
  });
});

// ── buildSuggestionReason ──────────────────────────────────────────────

describe("buildSuggestionReason", () => {
  test("enthält Fall-Titel", () => {
    const bundle = makeBundle({ case_title: "Müller vs. Huber" });
    const reason = buildSuggestionReason(bundle, computeInvestigationIndicators(bundle));
    expect(reason).toContain("Müller vs. Huber");
  });

  test("enthält Partei-Namen wenn client + opponent", () => {
    const bundle = makeBundle({
      case_title: "Fall X",
      parties: [makeParty("client", "Müller"), makeParty("opponent", "Huber")],
    });
    const reason = buildSuggestionReason(bundle, computeInvestigationIndicators(bundle));
    expect(reason).toContain("Müller vs. Huber");
  });

  test("enthält Anzahl Dokumente wenn vorhanden", () => {
    const bundle = makeBundle({
      documents: [makeDoc(), makeDoc(), makeDoc()],
    });
    const reason = buildSuggestionReason(bundle, computeInvestigationIndicators(bundle));
    expect(reason).toContain("3 analysierte Dokumente");
  });

  test("enthält Anzahl Widersprüche wenn vorhanden", () => {
    const bundle = makeBundle({
      facts: [makeFact({ contradicts: ["f2"] }), makeFact({ id: "f2", contradicts: ["f1"] })],
    });
    const reason = buildSuggestionReason(bundle, computeInvestigationIndicators(bundle));
    expect(reason).toContain("2 bereits bekannte Widerspruchs-Referenzen");
  });

  test("leerer Bundle → Hinweis auf unzureichende Datenlage", () => {
    const bundle = makeBundle();
    const reason = buildSuggestionReason(bundle, computeInvestigationIndicators(bundle));
    expect(reason).toContain("unzureichende Datenlage");
  });
});

// ── shouldSuggestInvestigation ─────────────────────────────────────────

describe("shouldSuggestInvestigation", () => {
  test("leerer Bundle → suggest: false", () => {
    const result = shouldSuggestInvestigation(makeBundle());
    expect(result.suggest).toBe(false);
    expect(result.urgency).toBe("low");
  });

  test("engine nicht erreichbar → suggest: false (fail-closed)", () => {
    const bundle = makeBundle({
      engine_reachable: false,
      parties: [makeParty("client", "M"), makeParty("opponent", "H")],
      documents: Array.from({ length: 10 }, () => makeDoc()),
      gaps: [makeGap()],
    });
    expect(shouldSuggestInvestigation(bundle).suggest).toBe(false);
  });

  test("genug Dokumente + genug Indikatoren → suggest: true", () => {
    const bundle = makeBundle({
      parties: [makeParty("client", "Müller"), makeParty("opponent", "Huber")],
      documents: Array.from({ length: 10 }, () => makeDoc()),
      gaps: [makeGap()],
      communications: [makeComm()],
    });
    const result = shouldSuggestInvestigation(bundle);
    expect(result.suggest).toBe(true);
    expect(result.urgency).toBe("medium");
  });

  test("zu wenige Dokumente → suggest: false", () => {
    const bundle = makeBundle({
      parties: [makeParty("client", "M"), makeParty("opponent", "H")],
      documents: [makeDoc(), makeDoc()],
      gaps: [makeGap()],
    });
    expect(shouldSuggestInvestigation(bundle).suggest).toBe(false);
  });

  test("nur 1 Indikator → suggest: false", () => {
    const bundle = makeBundle({
      documents: Array.from({ length: 10 }, () => makeDoc()),
    });
    expect(shouldSuggestInvestigation(bundle).suggest).toBe(false);
  });

  test("starke Indikatorenlage → urgency: high", () => {
    const bundle = makeBundle({
      parties: [makeParty("client", "M"), makeParty("opponent", "H")],
      documents: Array.from({ length: 10 }, () => makeDoc()),
      facts: [makeFact({ contradicts: ["f2"] }), makeFact({ id: "f2", contradicts: ["f1"] })],
    });
    const result = shouldSuggestInvestigation(bundle);
    expect(result.suggest).toBe(true);
    expect(result.urgency).toBe("high");
  });

  test("estimated_credits und duration sind gesetzt", () => {
    const bundle = makeBundle({
      parties: [makeParty("client", "M"), makeParty("opponent", "H")],
      documents: Array.from({ length: 10 }, () => makeDoc()),
      gaps: [makeGap()],
    });
    const result = shouldSuggestInvestigation(bundle);
    expect(result.estimated_credits).toBeGreaterThan(0);
    expect(result.estimated_duration_seconds).toBeGreaterThan(0);
  });

  test("case_slug und case_title werden durchgereicht", () => {
    const bundle = makeBundle({
      case_slug: "test-slug",
      case_title: "Test Title",
    });
    const result = shouldSuggestInvestigation(bundle);
    expect(result.case_slug).toBe("test-slug");
    expect(result.case_title).toBe("Test Title");
  });

  test("Suggestion-Typ ist erfüllt", () => {
    const result = shouldSuggestInvestigation(makeBundle());
    expect(result).toBeDefined();
    expect(typeof result.suggest).toBe("boolean");
    expect(typeof result.reason).toBe("string");
    expect(["low", "medium", "high"]).toContain(result.urgency);
    expect(result.indicators).toBeDefined();
  });
});
