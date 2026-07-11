import { describe, it, expect } from "bun:test";

// Tests for the 3 new pipeline layers: precedent-matcher, burden-of-proof, cost-benefit

// ── Precedent Match extraction ──────────────────────────────

interface PrecedentMatch {
  claim: string;
  paragraph: string;
  gericht: string;
  entscheidung: string;
  datum: string;
  position: string;
  relevanz: string;
  verified: boolean;
}

function extractPrecedentMatches(json: unknown): {
  matches: PrecedentMatch[];
  gaps: Array<{ claim: string; warnung: string }>;
  score: number;
} {
  if (!json || typeof json !== "object") return { matches: [], gaps: [], score: 0 };
  const obj = json as Record<string, unknown>;
  const matches = Array.isArray(obj.precedent_matches)
    ? (obj.precedent_matches as Array<Record<string, unknown>>).map((m) => ({
        claim: String(m.claim ?? ""),
        paragraph: String(m.paragraph ?? ""),
        gericht: String(m.gericht ?? ""),
        entscheidung: String(m.entscheidung ?? ""),
        datum: String(m.datum ?? ""),
        position: String(m.position ?? ""),
        relevanz: String(m.relevanz ?? ""),
        verified: Boolean(m.verified),
      }))
    : [];
  const gaps = Array.isArray(obj.precedent_gaps)
    ? (obj.precedent_gaps as Array<Record<string, unknown>>).map((g) => ({
        claim: String(g.claim ?? ""),
        warnung: String(g.warnung ?? ""),
      }))
    : [];
  const score = typeof obj.overall_precedent_score === "number" ? obj.overall_precedent_score : 0;
  return { matches, gaps, score };
}

describe("precedent-matcher extraction", () => {
  it("extracts stützende and gefährdende precedents", () => {
    const json = {
      precedent_matches: [
        {
          claim: "Amtshaftung",
          paragraph: "§ 1 AHG",
          gericht: "OGH",
          entscheidung: "1 Ob 123/24d",
          datum: "2024-03-15",
          position: "stützend",
          relevanz: "hoch",
          verified: true,
        },
        {
          claim: "Amtshaftung",
          paragraph: "§ 1 AHG",
          gericht: "OGH",
          entscheidung: "1 Ob 456/23d",
          datum: "2023-06-10",
          position: "gefährdend",
          relevanz: "mittel",
          verified: true,
        },
      ],
      precedent_gaps: [],
      overall_precedent_score: 75,
    };
    const result = extractPrecedentMatches(json);
    expect(result.matches.length).toBe(2);
    expect(result.matches[0]!.position).toBe("stützend");
    expect(result.matches[1]!.position).toBe("gefährdend");
    expect(result.score).toBe(75);
  });

  it("extracts precedent gaps when no stützende Judikatur found", () => {
    const json = {
      precedent_matches: [],
      precedent_gaps: [
        { claim: "Amtshaftung", paragraph: "§ 1 AHG", warnung: "Keine stützende OGH-Judikatur" },
      ],
      overall_precedent_score: 30,
    };
    const result = extractPrecedentMatches(json);
    expect(result.matches.length).toBe(0);
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0]!.warnung).toContain("Keine stützende");
    expect(result.score).toBe(30);
  });

  it("returns empty for null input", () => {
    const result = extractPrecedentMatches(null);
    expect(result.matches).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.score).toBe(0);
  });
});

// ── Burden of Proof extraction ──────────────────────────────

interface BurdenAnalysis {
  claim: string;
  paragraph: string;
  overall_beweislast: string;
  beweis_kraft: string;
  beweislastumkehr_moeglich: boolean;
}

function extractBurdenAnalysis(json: unknown): {
  analysis: BurdenAnalysis[];
  missing: Array<{ merkmal: string; prioritaet: string }>;
  score: number;
} {
  if (!json || typeof json !== "object") return { analysis: [], missing: [], score: 0 };
  const obj = json as Record<string, unknown>;
  const analysis = Array.isArray(obj.burden_analysis)
    ? (obj.burden_analysis as Array<Record<string, unknown>>).map((a) => ({
        claim: String(a.claim ?? ""),
        paragraph: String(a.paragraph ?? ""),
        overall_beweislast: String(a.overall_beweislast ?? ""),
        beweis_kraft: String(a.beweis_kraft ?? ""),
        beweislastumkehr_moeglich: Boolean(a.beweislastumkehr_moeglich),
      }))
    : [];
  const missing = Array.isArray(obj.missing_evidence)
    ? (obj.missing_evidence as Array<Record<string, unknown>>).map((m) => ({
        merkmal: String(m.merkmal ?? ""),
        prioritaet: String(m.prioritaet ?? ""),
      }))
    : [];
  const score = typeof obj.overall_beweis_score === "number" ? obj.overall_beweis_score : 0;
  return { analysis, missing, score };
}

describe("burden-of-proof extraction", () => {
  it("extracts burden analysis with umkehr possibility", () => {
    const json = {
      burden_analysis: [
        {
          claim: "Amtshaftung",
          paragraph: "§ 1 AHG",
          overall_beweislast: "kläger",
          beweis_kraft: "mittel",
          beweislastumkehr_moeglich: true,
        },
      ],
      missing_evidence: [{ merkmal: "hoheitliches Handeln", prioritaet: "hoch" }],
      overall_beweis_score: 55,
    };
    const result = extractBurdenAnalysis(json);
    expect(result.analysis.length).toBe(1);
    expect(result.analysis[0]!.beweislastumkehr_moeglich).toBe(true);
    expect(result.missing.length).toBe(1);
    expect(result.missing[0]!.prioritaet).toBe("hoch");
    expect(result.score).toBe(55);
  });

  it("handles empty analysis", () => {
    const json = { burden_analysis: [], missing_evidence: [], overall_beweis_score: 0 };
    const result = extractBurdenAnalysis(json);
    expect(result.analysis).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("returns empty for null input", () => {
    const result = extractBurdenAnalysis(null);
    expect(result.analysis).toEqual([]);
    expect(result.score).toBe(0);
  });
});

// ── Cost-Benefit extraction ─────────────────────────────────

function extractCostBenefit(json: unknown): {
  streitwert: number;
  win_probability: number;
  schadenshoehe: number;
  urteil: string;
  ev: number | undefined;
} {
  if (!json || typeof json !== "object")
    return { streitwert: 0, win_probability: 0, schadenshoehe: 0, urteil: "", ev: undefined };
  const obj = json as Record<string, unknown>;
  const evData = obj.expected_value as Record<string, unknown> | undefined;
  return {
    streitwert: typeof obj.streitwert === "number" ? obj.streitwert : 0,
    win_probability: typeof obj.win_probability === "number" ? obj.win_probability : 0,
    schadenshoehe: typeof obj.schadenshoehe === "number" ? obj.schadenshoehe : 0,
    urteil: String(obj.kosten_nutzen_urteil ?? ""),
    ev: typeof evData?.ev === "number" ? evData.ev : undefined,
  };
}

describe("cost-benefit extraction", () => {
  it("extracts EV and recommendation", () => {
    const json = {
      streitwert: 50000,
      win_probability: 65,
      schadenshoehe: 45000,
      kosten_schaetzung: {
        eigene_kosten_gesamt: 9500,
        gegnerische_kosten_bei_verlust: 9500,
      },
      expected_value: {
        ev: 16075,
        break_even_schaden: 29231,
      },
      risk_assessment: {
        empfehlung: "positiv",
        risk_reward_ratio: 1.87,
      },
      kosten_nutzen_urteil: "EMPFOHLEN",
      zusammenfassung: "EV positiv — Verfahren empfohlen",
    };
    const result = extractCostBenefit(json);
    expect(result.streitwert).toBe(50000);
    expect(result.win_probability).toBe(65);
    expect(result.schadenshoehe).toBe(45000);
    expect(result.urteil).toBe("EMPFOHLEN");
    expect(result.ev).toBe(16075);
  });

  it("handles BEDINGT EMPFOHLEN when no schadenshoehe", () => {
    const json = {
      streitwert: 0,
      win_probability: 50,
      schadenshoehe: 0,
      kosten_nutzen_urteil: "BEDINGT EMPFOHLEN",
    };
    const result = extractCostBenefit(json);
    expect(result.urteil).toBe("BEDINGT EMPFOHLEN");
    expect(result.schadenshoehe).toBe(0);
    expect(result.ev).toBeUndefined();
  });

  it("returns defaults for null input", () => {
    const result = extractCostBenefit(null);
    expect(result.streitwert).toBe(0);
    expect(result.urteil).toBe("");
  });

  it("NICHT EMPFOHLEN when EV negative", () => {
    const json = {
      streitwert: 10000,
      win_probability: 20,
      schadenshoehe: 5000,
      expected_value: { ev: -5000 },
      kosten_nutzen_urteil: "NICHT EMPFOHLEN",
    };
    const result = extractCostBenefit(json);
    expect(result.urteil).toBe("NICHT EMPFOHLEN");
    expect(result.ev).toBe(-5000);
  });
});

// ── EV calculation logic test ───────────────────────────────

describe("EV calculation logic", () => {
  function calculateEV(
    winProb: number,
    schaden: number,
    eigeneKosten: number,
    gegnerKosten: number
  ): number {
    const gewinn = schaden - eigeneKosten;
    const verlust = -eigeneKosten - gegnerKosten;
    return (winProb / 100) * gewinn + (1 - winProb / 100) * verlust;
  }

  it("positive EV when win probability high", () => {
    const ev = calculateEV(65, 45000, 9500, 9500);
    expect(ev).toBeGreaterThan(0);
    // 0.65 * 35500 + 0.35 * (-19000) = 23075 - 6650 = 16425
    expect(Math.round(ev)).toBe(16425);
  });

  it("negative EV when win probability low", () => {
    const ev = calculateEV(20, 5000, 9500, 9500);
    expect(ev).toBeLessThan(0);
  });

  it("break-even at 50% when damage equals 2x costs", () => {
    // gewinn = schaden - kosten, verlust = -kosten - gegnerkosten
    // At 50%: 0.5 * (schaden - kosten) + 0.5 * (-kosten - gegnerkosten) = 0
    // → schaden = 2 * kosten + gegnerkosten (when kosten == gegnerkosten: schaden = 3 * kosten)
    const ev = calculateEV(50, 15000, 5000, 5000);
    expect(ev).toBe(0);
  });
});
