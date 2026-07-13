import { describe, it, expect } from "vitest";
import {
  checkCitationGrounding,
  extractCitations,
  detectHedging,
  detectUncertaintyQuality,
  type GuardrailResult,
} from "./citation-guardrail.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

const SAMPLE_CONTEXT = `
§ 823 BGB Schadensersatzpflicht
(1) Wer vorsätzlich oder fahrlässig das Leben, Körper, Gesundheit, Freiheit, Eigentum oder ein sonstiges Recht eines anderen widerrechtlich verletzt, ist dem anderen zum Ersatz des daraus entstehenden Schadens verpflichtet.
(2) Die gleiche Verpflichtung trifft denjenigen, welcher gegen ein den Schutz eines anderen bezweckendes Gesetz verstößt.

§ 1004 BGB Beseitigungs- und Unterlassungsanspruch
(1) Wird das Eigentum in anderer Weise als durch Entziehung oder Vorkehrung des Besitzes beeinträchtigt, so kann der Eigentümer von dem Störer die Beseitigung der Beeinträchtigung verlangen.

§ 1295 ABGB Schadenersatz
(1) Wer einem anderen schaden zufügt, ob er es vorsätzlich oder fahrlässig getan habe, ist ihm schadenersatzpflichtig.
`;

const DE_SLUGS = ["law/de/bgb", "law/de/zpo"];

// ─── citationInContext v2 Tests ───────────────────────────────────────────

describe("citationInContext v2 — Absatz precision", () => {
  it("matches § 823 without Abs (loose check)", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 823 BGB wird gehaftet.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.ungrounded_citations).toHaveLength(0);
  });

  it("matches § 823 Abs. 1 when Abs. 1 is in context", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 823 Abs. 1 BGB wird gehaftet.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.ungrounded_citations).toHaveLength(0);
  });

  it("flags § 823 Abs. 3 when Abs. 3 is NOT in context (v2 precision)", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 823 Abs. 3 BGB wird gehaftet.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    // v2: should flag because Abs. 3 doesn't exist in context,
    // even though § 823 does exist
    expect(result.ungrounded_citations).toContain("§ 823 Abs. 3 BGB");
  });

  it("flags § 823 Abs. 1 Satz 5 when Satz 5 is NOT in context", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 823 Abs. 1 Satz 5 BGB wird gehaftet.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.ungrounded_citations).toContain("§ 823 Abs. 1 Satz 5 BGB");
  });

  it("does NOT flag § 823 Abs. 2 when Abs. 2 is in context", () => {
    const result = checkCitationGrounding({
      answer: "§ 823 Abs. 2 BGB regelt die Schutzgesetzverletzung.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.ungrounded_citations).toHaveLength(0);
  });
});

// ─── Uncertainty Quality v2 Tests ─────────────────────────────────────────

describe("detectUncertaintyQuality v2", () => {
  it("flags vague uncertainty without substantiation", () => {
    const text = "Die Rechtslage kann nicht bestimmt werden.";
    const result = detectUncertaintyQuality(text);
    expect(result.unsubstantiated.length).toBeGreaterThan(0);
  });

  it("does NOT flag vague uncertainty when substantiated with § reference", () => {
    const text =
      "Die Rechtslage ist umstritten. § 823 Abs. 1 BGB und § 823 Abs. 2 BGB werden unterschiedlich ausgelegt.";
    const result = detectUncertaintyQuality(text);
    expect(result.unsubstantiated).toHaveLength(0);
  });

  it("does NOT flag substantiated uncertainty with OGH reference", () => {
    const text =
      "Die Rechtsprechung ist nicht eindeutig, 5 Ob 123/23a steht im Widerspruch zu 7 Ob 456/22b.";
    const result = detectUncertaintyQuality(text);
    expect(result.unsubstantiated).toHaveLength(0);
  });

  it("flags hedging without substantiation", () => {
    const text = "Dieser § wird in den Quellen nicht genannt, ist aber dennoch anwendbar.";
    const result = detectUncertaintyQuality(text);
    expect(result.unsubstantiated.length).toBeGreaterThan(0);
  });

  it("does NOT flag hedging with § substantiation", () => {
    const text =
      "§ 823 BGB wird in den Quellen nicht vollständig zitiert, jedoch ist die Norm umstritten in der Rechtsprechung.";
    const result = detectUncertaintyQuality(text);
    // "umstritten" is a substantiation pattern
    expect(result.unsubstantiated).toHaveLength(0);
  });

  it("flags 'ist unklar' without substantiation", () => {
    const text = "Die Rechtslage ist unklar.";
    const result = detectUncertaintyQuality(text);
    expect(result.unsubstantiated.length).toBeGreaterThan(0);
  });

  it("does NOT flag 'ist unklar' with BGH reference", () => {
    const text =
      "Die Rechtslage ist unklar, BGH, Urteil vom 15.01.2023 nimmt eine andere Position ein.";
    const result = detectUncertaintyQuality(text);
    expect(result.unsubstantiated).toHaveLength(0);
  });
});

// ─── Full Guardrail v2 Integration Tests ──────────────────────────────────

describe("checkCitationGrounding v2 integration", () => {
  it("passes for clean answer with grounded citations", () => {
    const result = checkCitationGrounding({
      answer:
        "Nach § 823 Abs. 1 BGB haftet der Schädiger. § 1004 Abs. 1 BGB regelt die Beseitigung.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.passed).toBe(true);
    expect(result.flags.filter((f) => f.severity === "high")).toHaveLength(0);
  });

  it("flags ungrounded citation as high severity", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 999 BGB haftet der Schädiger.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.passed).toBe(false);
    expect(
      result.flags.some((f) => f.type === "ungrounded_citation" && f.severity === "high")
    ).toBe(true);
  });

  it("includes unsubstantiated_uncertainty_phrases in result", () => {
    const result = checkCitationGrounding({
      answer: "Die Rechtslage kann nicht bestimmt werden.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.unsubstantiated_uncertainty_phrases.length).toBeGreaterThan(0);
    expect(result.check_count).toBe(6);
  });

  it("does NOT flag substantiated uncertainty in full check", () => {
    const result = checkCitationGrounding({
      answer:
        "Die Auslegung von § 823 Abs. 1 BGB ist umstritten in der Rechtsprechung, jedoch ergibt sich aus dem Wortlaut eine klare Haftung.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS,
    });
    expect(result.unsubstantiated_uncertainty_phrases).toHaveLength(0);
  });

  it("flags cross-law contamination (ABGB in DE context)", () => {
    const result = checkCitationGrounding({
      answer: "Nach § 1295 ABGB haftet der Schädiger.",
      context: SAMPLE_CONTEXT,
      topSlugs: DE_SLUGS, // only DE slugs, no AT
    });
    // ABGB is a known law but not in retrieved DE-only slugs
    expect(result.cross_law_contamination).toContain("ABGB");
  });
});

// ─── Extract Citations Tests ──────────────────────────────────────────────

describe("extractCitations", () => {
  it("extracts simple § citation", () => {
    const cites = extractCitations("Nach § 823 BGB wird gehaftet.");
    expect(cites).toContain("§ 823 BGB");
  });

  it("extracts § with Abs.", () => {
    const cites = extractCitations("§ 823 Abs. 1 BGB regelt die Haftung.");
    expect(cites).toContain("§ 823 Abs. 1 BGB");
  });

  it("extracts § with Abs. and Satz", () => {
    const cites = extractCitations("§ 823 Abs. 1 Satz 2 BGB ist maßgeblich.");
    expect(cites).toContain("§ 823 Abs. 1 Satz 2 BGB");
  });

  it("extracts § with letter suffix", () => {
    const cites = extractCitations("§ 12a HGB definiert den Begriff.");
    expect(cites).toContain("§ 12a HGB");
  });

  it("deduplicates citations", () => {
    const cites = extractCitations("§ 823 BGB. § 823 BGB. § 823 BGB.");
    expect(cites).toHaveLength(1);
  });
});
