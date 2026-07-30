import { describe, it, expect } from "vitest";
import {
  CONVERSATION_FIXTURES,
  getConversationFixtures,
  getTotalTurns,
} from "./conversation-fixtures.ts";
import { TEMPORAL_FIXTURES, getTemporalFixtures } from "./temporal-fixtures.ts";
import {
  EXPERTISE_FIXTURES,
  getPairedFixtures,
  evaluateExpertiseMatch,
} from "./expertise-fixtures.ts";

// ── Conversation Fixtures ─────────────────────────────────────────────

describe("Conversation Fixtures", () => {
  it("has at least 18 scenarios", () => {
    expect(CONVERSATION_FIXTURES.length).toBeGreaterThanOrEqual(18);
  });

  it("has 50+ total user turns", () => {
    const total = getTotalTurns();
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it("all scenarios have at least 2 turns", () => {
    for (const s of CONVERSATION_FIXTURES) {
      expect(s.turns.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("all user turns have expected_slugs", () => {
    for (const s of CONVERSATION_FIXTURES) {
      for (const t of s.turns) {
        if (t.speaker === "user") {
          expect(t.expected_slugs).toBeDefined();
          expect(t.expected_slugs!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("covers DE, AT, CH, EU jurisdictions", () => {
    const jurisdictions = new Set(CONVERSATION_FIXTURES.map((s) => s.jurisdiction));
    expect(jurisdictions.has("DE")).toBe(true);
    expect(jurisdictions.has("AT")).toBe(true);
    expect(jurisdictions.has("CH")).toBe(true);
    expect(jurisdictions.has("EU")).toBe(true);
  });

  it("has beginner, normal, and expert difficulties", () => {
    const difficulties = new Set(CONVERSATION_FIXTURES.map((s) => s.difficulty));
    expect(difficulties.has("beginner")).toBe(true);
    expect(difficulties.has("normal")).toBe(true);
    expect(difficulties.has("expert")).toBe(true);
  });

  it("filters by jurisdiction", () => {
    const deOnly = getConversationFixtures("de");
    expect(deOnly.every((s) => s.jurisdiction === "DE")).toBe(true);
  });

  it("has follow-up turns that reference prior context", () => {
    const hasReferences = CONVERSATION_FIXTURES.some((s) =>
      s.turns.slice(1).some((t) => t.references_prior)
    );
    expect(hasReferences).toBe(true);
  });
});

// ── Temporal Fixtures ─────────────────────────────────────────────────

describe("Temporal Fixtures", () => {
  it("has at least 10 fixtures", () => {
    expect(TEMPORAL_FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it("all fixtures have valid reference dates", () => {
    for (const f of TEMPORAL_FIXTURES) {
      expect(f.reference_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all fixtures have expected deadlines", () => {
    for (const f of TEMPORAL_FIXTURES) {
      expect(f.expected_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all fixtures are date-sensitive", () => {
    for (const f of TEMPORAL_FIXTURES) {
      expect(f.date_sensitive).toBe(true);
    }
  });

  it("all fixtures have expected keywords", () => {
    for (const f of TEMPORAL_FIXTURES) {
      expect(f.expected_keywords.length).toBeGreaterThan(0);
    }
  });

  it("covers multiple jurisdictions", () => {
    const jurisdictions = new Set(TEMPORAL_FIXTURES.map((f) => f.jurisdiction));
    expect(jurisdictions.size).toBeGreaterThanOrEqual(3);
  });

  it("filters by jurisdiction", () => {
    const deOnly = getTemporalFixtures("de");
    expect(deOnly.every((f) => f.jurisdiction === "DE")).toBe(true);
  });
});

// ── Expertise Fixtures ────────────────────────────────────────────────

describe("Expertise Fixtures", () => {
  it("has paired fixtures (non_expert + expert)", () => {
    const pairs = getPairedFixtures();
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    for (const pair of pairs) {
      expect(pair.lay.expertise).toBe("non_expert");
      expect(pair.pro.expertise).toBe("expert");
      expect(pair.lay.topic).toBe(pair.pro.topic);
    }
  });

  it("non-expert fixtures have plain language keywords", () => {
    const layFixtures = EXPERTISE_FIXTURES.filter((f) => f.expertise === "non_expert");
    for (const f of layFixtures) {
      expect(f.expected_plain_keywords).toBeDefined();
      expect(f.expected_plain_keywords!.length).toBeGreaterThan(0);
    }
  });

  it("expert fixtures have technical keywords", () => {
    const proFixtures = EXPERTISE_FIXTURES.filter((f) => f.expertise === "expert");
    for (const f of proFixtures) {
      expect(f.expected_technical_keywords).toBeDefined();
      expect(f.expected_technical_keywords!.length).toBeGreaterThan(0);
    }
  });

  it("non-expert fixtures have jargon to explain", () => {
    const layFixtures = EXPERTISE_FIXTURES.filter((f) => f.expertise === "non_expert");
    for (const f of layFixtures) {
      expect(f.jargon_to_explain).toBeDefined();
      expect(f.jargon_to_explain!.length).toBeGreaterThan(0);
    }
  });

  it("expert fixtures have doctrinal concepts", () => {
    const proFixtures = EXPERTISE_FIXTURES.filter((f) => f.expertise === "expert");
    for (const f of proFixtures) {
      expect(f.expected_doctrinal_concepts).toBeDefined();
      expect(f.expected_doctrinal_concepts!.length).toBeGreaterThan(0);
    }
  });
});

describe("evaluateExpertiseMatch", () => {
  it("scores non-expert answer with explained jargon highly", () => {
    const fixture = EXPERTISE_FIXTURES.find((f) => f.id === "exp-de-001-lay")!;
    const answer =
      "Sie können Reparatur verlangen. Das bedeutet, der Verkäufer muss den Mangel beseitigen. Gewährleistung heißt, dass der Verkäufer für Mängel haftet. Nacherfüllung, also dass der Verkäufer reparieren oder eine neue Sache liefern muss. Wenn er das nicht tut, können Sie Geld zurück verlangen, also Rücktritt vom Vertrag.";
    const result = evaluateExpertiseMatch(answer, fixture);
    expect(result.jargon_score).toBeGreaterThan(0.5);
  });

  it("scores non-expert answer with unexplained jargon lower", () => {
    const fixture = EXPERTISE_FIXTURES.find((f) => f.id === "exp-de-001-lay")!;
    const answer =
      "Sie haben Gewährleistungsrechte gemäß Nacherfüllung. Der Verkäufer muss Rücktritt akzeptieren.";
    const result = evaluateExpertiseMatch(answer, fixture);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("scores expert answer with technical terms highly", () => {
    const fixture = EXPERTISE_FIXTURES.find((f) => f.id === "exp-de-001-pro")!;
    const answer =
      "Der Käufer hat Nacherfüllung, Rücktritt, Minderung und Schadensersatz gemäß § 437 BGB. Der Sachmangel muss bei Gefahrübergang vorliegen. Die Gewährleistung setzt einen Mangel bei Gefahrübergang voraus.";
    const result = evaluateExpertiseMatch(answer, fixture);
    expect(result.keyword_score).toBeGreaterThan(0.5);
  });

  it("scores expert answer without technical terms lower", () => {
    const fixture = EXPERTISE_FIXTURES.find((f) => f.id === "exp-de-001-pro")!;
    const answer = "Der Käufer kann Reparatur verlangen oder Geld zurück.";
    const result = evaluateExpertiseMatch(answer, fixture);
    expect(result.keyword_score).toBeLessThan(0.5);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
