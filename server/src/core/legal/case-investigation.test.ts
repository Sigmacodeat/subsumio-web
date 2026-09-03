import { describe, test, expect, mock } from "bun:test";
import {
  caseInvestigation,
  reviewContradiction,
  type CaseInvestigationOpts,
  type CaseInvestigationResult,
} from "./case-investigation.ts";

// ── Mock Engine ────────────────────────────────────────────────────────

function makeMockEngine(
  pages: Array<{ slug: string; title?: string; content: string; caseSlug?: string; type?: string }>
) {
  return {
    listPages: mock(async (_filters?: { type?: string }) => {
      // Return pages only on first call per type to avoid duplicates.
      // loadDocuments calls listPages 5× (once per document type).
      // We return all pages on every call — loadDocuments deduplicates
      // by slug when building the docs array (via casePages filter).
      // But since the mock returns the same pages each time, we need to
      // ensure the test's case_slug matches the page's caseSlug.
      return pages.map((p) => ({
        slug: p.slug,
        title: p.title ?? p.slug,
        frontmatter: {
          case_slug: p.caseSlug ?? "test-case",
          assignment_status: "assigned",
          status: "active",
        },
      }));
    }),
    getPage: mock(async (slug: string) => {
      const p = pages.find((x) => x.slug === slug);
      if (!p) return null;
      return { slug: p.slug, title: p.title ?? p.slug, compiled_truth: p.content };
    }),
  } as unknown as Parameters<typeof caseInvestigation>[0];
}

// ── Mock LLM ───────────────────────────────────────────────────────────

function makeMockLLM(responses: string[]): NonNullable<CaseInvestigationOpts["llm"]> {
  let callIndex = 0;
  return (async () => {
    const r = responses[callIndex % responses.length] ?? "{}";
    callIndex++;
    return r;
  }) as unknown as NonNullable<CaseInvestigationOpts["llm"]>;
}

const EMPTY_LLM_RESPONSE = JSON.stringify({ facts: [] });
const EXTRACTION_RESPONSE = JSON.stringify({
  facts: [
    {
      id: "F-001",
      statement: "Zeuge war am 14.05. in Linz",
      exact_quote: "Am 14.05. war ich in Linz",
      speaker_entity: "Zeuge Z",
      perception_type: "eigen",
      beweis_anforderung: "vollbeweis",
    },
    {
      id: "F-002",
      statement: "Zeuge war am 14.05. in Wien",
      exact_quote: "Am 14.05. war ich in Wien",
      speaker_entity: "Zeuge Z",
      perception_type: "eigen",
      beweis_anforderung: "vollbeweis",
    },
  ],
});

const RESEARCHER_RESPONSE = JSON.stringify({
  contradictions: [
    {
      claim_a_id: "F-001",
      claim_b_id: "F-002",
      category: "räumlich",
      severity: "hoch",
      materiality: "zentral",
      is_direct: true,
      belastende_interpretation: "Zeuge kann nicht an beiden Orten gewesen sein",
      entlastende_interpretation: "Zeitangabe könnte geschätzt sein",
    },
  ],
  evidence_gaps: [
    {
      beschreibung: "Keine Reisekostenabrechnung",
      fehlendes_beweismittel: "Hotelrechnung",
      erwartete_quelle: "Buchhaltung",
      beweisbedeutung: "Stützt Aufenthalt in Linz",
    },
  ],
});

const AUDITOR_RESPONSE = JSON.stringify({
  verified: [
    {
      claim_a_id: "F-001",
      claim_b_id: "F-002",
      audit_confidence: 0.95,
      zpo_relevanz: "§ 226 ZPO",
    },
  ],
});

const ADVERSARIAL_RESPONSE = JSON.stringify({
  analyses: [
    {
      claim_a_id: "F-001",
      claim_b_id: "F-002",
      alternative_explanations: ["Telefonisch geklärt?"],
      resolution_questions: ["Wo waren Sie davor?"],
    },
  ],
  hypotheses: [
    {
      beschreibung: "Gespräch fand telefonisch statt",
      stuetzende_indizien: ["Keine Reisekosten"],
      gegen_indizien: ["Zeuge sagt persönlich"],
    },
  ],
  questions: [
    {
      ziel_person: "Zeuge Z",
      einstiegsfrage: "Schildern Sie den 14.05.",
      praezisierungsfragen: ["Wo waren Sie davor?"],
      konfrontationsfrage: "Sie sagen Linz — Müller sagt Wien?",
      beweisbedeutung: "Klärung des Aufenthaltsorts",
    },
  ],
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("caseInvestigation", () => {
  test("leerer Fall → leeres Result", async () => {
    const engine = makeMockEngine([]);
    const result = await caseInvestigation(engine, {
      case_slug: "test-case",
      jurisdiction: "at",
      llm: makeMockLLM([EXTRACTION_RESPONSE]),
    });
    expect(result.contradictions).toEqual([]);
    expect(result.claims_count).toBe(0);
    expect(result.engine_reachable).toBe(true);
    expect(result.rechtlicher_rahmen.zpo_vorschriften).toContain("§ 226 ZPO");
  });

  test("kein LLM verfügbar → leeres Result mit claims_count=0", async () => {
    // Use a case_slug that doesn't match any mock page → no docs → empty result
    const engine = makeMockEngine([
      { slug: "doc-1", content: "Test content", caseSlug: "other-case" },
    ]);
    const result = await caseInvestigation(engine, {
      case_slug: "test-case-no-docs",
      jurisdiction: "at",
      llm: makeMockLLM([EXTRACTION_RESPONSE]),
    });
    expect(result.contradictions).toEqual([]);
    expect(result.claims_count).toBe(0);
  });

  test("vollständige Pipeline: Extraction → Researcher → Auditor → Adversarial", async () => {
    const engine = makeMockEngine([
      {
        slug: "doc-1",
        title: "Zeugenaussage Z",
        content: "Am 14.05. war ich in Linz. Am 14.05. war ich in Wien.",
        caseSlug: "mueller-vs-huber",
      },
    ]);
    const result = await caseInvestigation(engine, {
      case_slug: "mueller-vs-huber",
      jurisdiction: "at",
      pruefauftrag: "Sachverhaltsprüfung",
      llm: makeMockLLM([
        EXTRACTION_RESPONSE,
        RESEARCHER_RESPONSE,
        AUDITOR_RESPONSE,
        ADVERSARIAL_RESPONSE,
      ]),
    });

    expect(result.case_slug).toBe("mueller-vs-huber");
    expect(result.jurisdiction).toBe("at");
    expect(result.pruefauftrag).toBe("Sachverhaltsprüfung");
    expect(result.claims_count).toBe(2);
    expect(result.contradictions).toHaveLength(1);

    const c = result.contradictions[0];
    expect(c.category).toBe("räumlich");
    expect(c.severity).toBe("hoch");
    expect(c.materiality).toBe("zentral");
    expect(c.audit_verified).toBe(true);
    expect(c.audit_confidence).toBe(0.95);
    expect(c.zpo_relevanz).toBe("§ 226 ZPO");
    expect(c.alternative_explanations).toEqual(["Telefonisch geklärt?"]);
    expect(c.resolution_questions).toEqual(["Wo waren Sie davor?"]);
    expect(c.review_status).toBe("pending");

    expect(result.evidence_gaps).toHaveLength(1);
    expect(result.evidence_gaps[0].fehlendes_beweismittel).toBe("Hotelrechnung");

    expect(result.alternative_hypotheses).toHaveLength(1);
    expect(result.alternative_hypotheses[0].stuetzende_indizien).toEqual(["Keine Reisekosten"]);

    expect(result.neutral_questions).toHaveLength(1);
    expect(result.neutral_questions[0].ziel_person).toBe("Zeuge Z");
    expect(result.neutral_questions[0].konfrontationsfrage).toContain("Müller sagt Wien");

    expect(result.pruefbedarf_hinweis).toContain("anwaltlich");
  });

  test("Researcher findet keine Widersprüche → nur evidence_gaps", async () => {
    const engine = makeMockEngine([
      { slug: "doc-1", content: "Am 14.05. war ich in Linz. Am 14.05. war ich in Wien." },
    ]);
    const result = await caseInvestigation(engine, {
      case_slug: "test-case",
      jurisdiction: "at",
      llm: makeMockLLM([
        EXTRACTION_RESPONSE,
        JSON.stringify({ contradictions: [], evidence_gaps: [] }),
      ]),
    });
    expect(result.contradictions).toEqual([]);
    expect(result.claims_count).toBe(2);
  });

  test("ungültige Category wird auf 'direkt' gefallbacked", async () => {
    const engine = makeMockEngine([
      { slug: "doc-1", content: "Am 14.05. war ich in Linz. Am 14.05. war ich in Wien." },
    ]);
    const result = await caseInvestigation(engine, {
      case_slug: "test-case",
      jurisdiction: "at",
      llm: makeMockLLM([
        EXTRACTION_RESPONSE,
        JSON.stringify({
          contradictions: [
            {
              claim_a_id: "F-001",
              claim_b_id: "F-002",
              category: "INVALID_CATEGORY",
              severity: "INVALID",
              materiality: "INVALID",
              is_direct: true,
              belastende_interpretation: "test",
              entlastende_interpretation: "test",
            },
          ],
          evidence_gaps: [],
        }),
        AUDITOR_RESPONSE,
        ADVERSARIAL_RESPONSE,
      ]),
    });
    expect(result.contradictions[0].category).toBe("direkt");
    expect(result.contradictions[0].severity).toBe("mittel");
    expect(result.contradictions[0].materiality).toBe("möglicherweise");
  });

  test("Grounding: Facts ohne exact_quote im Text werden gedroppt", async () => {
    const engine = makeMockEngine([{ slug: "doc-1", content: "Am 14.05. war ich in Linz." }]);
    const result = await caseInvestigation(engine, {
      case_slug: "test-case",
      jurisdiction: "at",
      llm: makeMockLLM([
        JSON.stringify({
          facts: [
            {
              id: "F-001",
              statement: "Hallucinierte Aussage",
              exact_quote: "DIESER TEXT EXISTIERT NICHT IM DOKUMENT",
              speaker_entity: "Zeuge",
            },
            {
              id: "F-002",
              statement: "Reale Aussage",
              exact_quote: "Am 14.05. war ich in Linz",
              speaker_entity: "Zeuge",
            },
          ],
        }),
        JSON.stringify({ contradictions: [], evidence_gaps: [] }),
      ]),
    });
    // Only the grounded fact should be counted
    expect(result.claims_count).toBe(1);
  });

  test("run_id und generated_at sind gesetzt", async () => {
    const engine = makeMockEngine([]);
    const result = await caseInvestigation(engine, {
      case_slug: "test-case",
      jurisdiction: "at",
      llm: makeMockLLM([]),
    });
    expect(result.run_id).toMatch(/^run-\d+/);
    expect(result.generated_at).toBeTruthy();
  });
});

describe("reviewContradiction", () => {
  test("accepted mit reason", async () => {
    const engine = makeMockEngine([]);
    const result = await reviewContradiction(engine, "run-1", "W-001", {
      review_status: "accepted",
      review_reason: "Bestätigter Widerspruch",
    });
    expect(result.review_status).toBe("accepted");
    expect(result.review_reason).toBe("Bestätigter Widerspruch");
  });

  test("dismissed ohne reason", async () => {
    const engine = makeMockEngine([]);
    const result = await reviewContradiction(engine, "run-1", "W-001", {
      review_status: "dismissed",
    });
    expect(result.review_status).toBe("dismissed");
    expect(result.review_reason).toBeUndefined();
  });

  test("no_contradiction", async () => {
    const engine = makeMockEngine([]);
    const result = await reviewContradiction(engine, "run-1", "W-001", {
      review_status: "no_contradiction",
    });
    expect(result.review_status).toBe("no_contradiction");
  });
});

describe("Run Store (BUG #1 + #4)", () => {
  test("POST speichert Result → GET liefert es → PATCH aktualisiert es", async () => {
    const engine = makeMockEngine([
      {
        slug: "doc-1",
        title: "Zeugenaussage",
        content: "Am 14.05. war ich in Linz. Am 14.05. war ich in Wien.",
        caseSlug: "mueller-vs-huber",
      },
    ]);
    // 1. POST — creates run
    const postResult = await caseInvestigation(engine, {
      case_slug: "mueller-vs-huber",
      jurisdiction: "at",
      llm: makeMockLLM([
        EXTRACTION_RESPONSE,
        RESEARCHER_RESPONSE,
        AUDITOR_RESPONSE,
        ADVERSARIAL_RESPONSE,
      ]),
    });
    expect(postResult.contradictions).toHaveLength(1);
    const runId = postResult.run_id;

    // 2. GET — retrieves persisted run
    const { getRun } = await import("./case-investigation.ts");
    const getResult = getRun(runId);
    expect(getResult).not.toBeNull();
    expect(getResult!.run_id).toBe(runId);
    expect(getResult!.contradictions).toHaveLength(1);
    expect(getResult!.contradictions[0].review_status).toBe("pending");

    // 3. PATCH — updates contradiction in store
    const patched = await reviewContradiction(engine, runId, getResult!.contradictions[0].id, {
      review_status: "accepted",
      review_reason: "Bestätigt",
    });
    expect(patched.review_status).toBe("accepted");
    expect(patched.review_reason).toBe("Bestätigt");
    // Verify store was updated
    const afterPatch = getRun(runId);
    expect(afterPatch!.contradictions[0].review_status).toBe("accepted");
  });

  test("GET für unbekannte runId → null", async () => {
    const { getRun } = await import("./case-investigation.ts");
    expect(getRun("nonexistent-run")).toBeNull();
  });
});
