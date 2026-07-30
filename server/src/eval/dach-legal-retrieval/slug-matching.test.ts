import { describe, it, expect } from "vitest";
import { slugMatches, slugMatchesParagraph } from "./run.ts";

interface LegalQuestion {
  question_id: string;
  question: string;
  legal_area: string;
  question_type: string;
  jurisdiction: string;
  answer_slug?: string;
  expected_section?: string;
  expected_slug?: string;
}

describe("slugMatches — paragraph-level matching", () => {
  // DE: § N → p-N
  it("DE: matches correct paragraph slug", () => {
    const q: LegalQuestion = {
      question_id: "de-001",
      question: "Was ist ein Kaufmann?",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
      expected_section: "§ 1",
    };
    expect(slugMatches("legal/statutes/de/hgb/p-1", q)).toBe(true);
  });

  it("DE: does NOT match wrong paragraph from same law", () => {
    const q: LegalQuestion = {
      question_id: "de-001",
      question: "Was ist ein Kaufmann?",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
      expected_section: "§ 1",
    };
    expect(slugMatches("legal/statutes/de/hgb/p-8", q)).toBe(false);
  });

  it("DE: matches paragraph with letter suffix (§ 104a → p-104a)", () => {
    const q: LegalQuestion = {
      question_id: "de-test",
      question: "test",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
      expected_section: "§ 104a",
    };
    expect(slugMatches("legal/statutes/de/hgb/p-104a", q)).toBe(true);
    expect(slugMatches("legal/statutes/de/hgb/p-104", q)).toBe(false);
  });

  it("DE: matches § 1 Abs 2 to p-1 (sub-paragraph maps to base paragraph)", () => {
    const q: LegalQuestion = {
      question_id: "de-002",
      question: "Wer gilt als Handelsgewerbe?",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
      expected_section: "§ 1 Abs 2",
    };
    expect(slugMatches("legal/statutes/de/hgb/p-1", q)).toBe(true);
  });

  it("DE: does NOT match wrong law", () => {
    const q: LegalQuestion = {
      question_id: "de-004",
      question: "Gerichtsstand?",
      legal_area: "zpo",
      question_type: "institutional",
      jurisdiction: "de",
      answer_slug: "zpo",
      expected_section: "§ 13",
    };
    expect(slugMatches("legal/statutes/de/bgb/p-13", q)).toBe(false);
  });

  // CH: Art. N → art-N
  it("CH: matches correct article slug", () => {
    const q: LegalQuestion = {
      question_id: "ch-002",
      question: "test",
      legal_area: "or",
      question_type: "definition",
      jurisdiction: "ch",
      answer_slug: "or",
      expected_section: "Art. 62",
    };
    expect(slugMatches("legal/statutes/ch/or/art-62", q)).toBe(true);
  });

  it("CH: does NOT match wrong article from same law", () => {
    const q: LegalQuestion = {
      question_id: "ch-002",
      question: "test",
      legal_area: "or",
      question_type: "definition",
      jurisdiction: "ch",
      answer_slug: "or",
      expected_section: "Art. 62",
    };
    expect(slugMatches("legal/statutes/ch/or/art-1", q)).toBe(false);
  });

  // EU: Art. N → art-N
  it("EU: matches correct article slug", () => {
    const q: LegalQuestion = {
      question_id: "eu-001",
      question: "test",
      legal_area: "dsgvo",
      question_type: "definition",
      jurisdiction: "eu",
      answer_slug: "dsgvo",
      expected_section: "Art. 2",
    };
    expect(slugMatches("legal/statutes/eu/dsgvo/art-2", q)).toBe(true);
  });

  it("EU: does NOT match wrong article from same law", () => {
    const q: LegalQuestion = {
      question_id: "eu-001",
      question: "test",
      legal_area: "dsgvo",
      question_type: "definition",
      jurisdiction: "eu",
      answer_slug: "dsgvo",
      expected_section: "Art. 2",
    };
    expect(slugMatches("legal/statutes/eu/dsgvo/art-4", q)).toBe(false);
  });

  // AT: expected_slug (full slug)
  it("AT: matches exact expected_slug", () => {
    const q: LegalQuestion = {
      question_id: "at-001",
      question: "test",
      legal_area: "abgb",
      question_type: "definition",
      jurisdiction: "at",
      expected_slug: "legal/statutes/at/abgb/p-1295",
    };
    expect(slugMatches("legal/statutes/at/abgb/p-1295", q)).toBe(true);
  });

  it("AT: does NOT match wrong paragraph from same law", () => {
    const q: LegalQuestion = {
      question_id: "at-001",
      question: "test",
      legal_area: "abgb",
      question_type: "definition",
      jurisdiction: "at",
      expected_slug: "legal/statutes/at/abgb/p-1295",
    };
    expect(slugMatches("legal/statutes/at/abgb/p-1489", q)).toBe(false);
  });

  // Cross-jurisdictional
  it("XJ: DE question with expected_section matches paragraph", () => {
    const q: LegalQuestion = {
      question_id: "xj-002",
      question: "Schadenersatz BGB",
      legal_area: "bgb",
      question_type: "schadenersatz",
      jurisdiction: "de",
      answer_slug: "bgb",
      expected_section: "§ 823",
    };
    expect(slugMatches("legal/statutes/de/bgb/p-823", q)).toBe(true);
    expect(slugMatches("legal/statutes/de/bgb/p-1", q)).toBe(false);
  });

  // Fallback: no expected_section → law-level matching
  it("DE: falls back to law-level when no expected_section", () => {
    const q: LegalQuestion = {
      question_id: "de-fallback",
      question: "test",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
    };
    expect(slugMatches("legal/statutes/de/hgb/p-1", q)).toBe(true);
    expect(slugMatches("legal/statutes/de/hgb/p-999", q)).toBe(true);
    expect(slugMatches("legal/statutes/de/bgb/p-1", q)).toBe(false);
  });

  // slugMatchesParagraph — strict, no law-level fallback
  it("slugMatchesParagraph: returns false for wrong paragraph", () => {
    const q: LegalQuestion = {
      question_id: "de-001",
      question: "test",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
      expected_section: "§ 1",
    };
    expect(slugMatchesParagraph("legal/statutes/de/hgb/p-1", q)).toBe(true);
    expect(slugMatchesParagraph("legal/statutes/de/hgb/p-8", q)).toBe(false);
  });

  it("slugMatchesParagraph: returns false when no section available", () => {
    const q: LegalQuestion = {
      question_id: "de-fallback",
      question: "test",
      legal_area: "hgb",
      question_type: "definition",
      jurisdiction: "de",
      answer_slug: "hgb",
    };
    expect(slugMatchesParagraph("legal/statutes/de/hgb/p-1", q)).toBe(false);
  });
});
