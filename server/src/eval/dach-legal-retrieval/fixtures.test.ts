import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

const FIXTURE_DIR = "test/fixtures";

interface LegalQuestion {
  question_id: string;
  question: string;
  legal_area: string;
  question_type: string;
  jurisdiction?: string;
  answer_slug?: string;
  expected_section?: string;
  expected_slug?: string;
}

function loadFixture(filename: string): LegalQuestion[] {
  const path = `${FIXTURE_DIR}/${filename}`;
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LegalQuestion);
}

function countTotal(): number {
  return (
    loadFixture("de-legal-retrieval.jsonl").length +
    loadFixture("at-legal-retrieval.jsonl").length +
    loadFixture("ch-legal-retrieval.jsonl").length +
    loadFixture("eu-legal-retrieval.jsonl").length +
    loadFixture("cross-jurisdictional-retrieval.jsonl").length
  );
}

describe("dach-legal-retrieval-v2 fixtures", () => {
  it("has 200+ total questions across all jurisdictions", () => {
    const total = countTotal();
    expect(total).toBeGreaterThanOrEqual(200);
  });

  it("has 130 DE questions", () => {
    const de = loadFixture("de-legal-retrieval.jsonl");
    expect(de.length).toBe(130);
    expect(de[0].question_id).toBe("de-001");
    expect(de[129].question_id).toBe("de-130");
  });

  it("has 80 AT questions", () => {
    const at = loadFixture("at-legal-retrieval.jsonl");
    expect(at.length).toBe(80);
    expect(at[0].question_id).toBe("at-001");
    expect(at[79].question_id).toBe("at-080");
  });

  it("has 40 CH questions", () => {
    const ch = loadFixture("ch-legal-retrieval.jsonl");
    expect(ch.length).toBe(40);
    expect(ch[0].question_id).toBe("ch-001");
    expect(ch[39].question_id).toBe("ch-040");
  });

  it("has 30 EU questions", () => {
    const eu = loadFixture("eu-legal-retrieval.jsonl");
    expect(eu.length).toBe(30);
    expect(eu[0].question_id).toBe("eu-001");
    expect(eu[29].question_id).toBe("eu-030");
  });

  it("has 25 cross-jurisdictional questions", () => {
    const xj = loadFixture("cross-jurisdictional-retrieval.jsonl");
    expect(xj.length).toBe(25);
    expect(xj[0].question_id).toBe("xj-001");
    expect(xj[24].question_id).toBe("xj-025");
  });

  it("all questions have required fields", () => {
    const all = [
      ...loadFixture("de-legal-retrieval.jsonl"),
      ...loadFixture("at-legal-retrieval.jsonl"),
      ...loadFixture("ch-legal-retrieval.jsonl"),
      ...loadFixture("eu-legal-retrieval.jsonl"),
      ...loadFixture("cross-jurisdictional-retrieval.jsonl"),
    ];
    for (const q of all) {
      expect(q.question_id).toBeTruthy();
      expect(q.question).toBeTruthy();
      expect(q.legal_area).toBeTruthy();
      expect(q.question_type).toBeTruthy();
      // Either answer_slug or expected_slug must be present
      expect(q.answer_slug || q.expected_slug).toBeTruthy();
    }
  });

  it("all question_ids are unique", () => {
    const all = [
      ...loadFixture("de-legal-retrieval.jsonl"),
      ...loadFixture("at-legal-retrieval.jsonl"),
      ...loadFixture("ch-legal-retrieval.jsonl"),
      ...loadFixture("eu-legal-retrieval.jsonl"),
      ...loadFixture("cross-jurisdictional-retrieval.jsonl"),
    ];
    const ids = new Set(all.map((q) => q.question_id));
    expect(ids.size).toBe(all.length);
  });

  it("CH questions have jurisdiction field", () => {
    const ch = loadFixture("ch-legal-retrieval.jsonl");
    for (const q of ch) {
      expect(q.jurisdiction).toBe("ch");
    }
  });

  it("EU questions have jurisdiction field", () => {
    const eu = loadFixture("eu-legal-retrieval.jsonl");
    for (const q of eu) {
      expect(q.jurisdiction).toBe("eu");
    }
  });

  it("cross-jurisdictional questions have jurisdiction field", () => {
    const xj = loadFixture("cross-jurisdictional-retrieval.jsonl");
    for (const q of xj) {
      expect(q.jurisdiction).toBeTruthy();
      expect(["at", "de", "ch", "eu"]).toContain(q.jurisdiction);
    }
  });

  it("DE questions cover diverse legal areas", () => {
    const de = loadFixture("de-legal-retrieval.jsonl");
    const areas = new Set(de.map((q) => q.legal_area));
    expect(areas.size).toBeGreaterThanOrEqual(10);
  });

  it("AT questions cover diverse legal areas", () => {
    const at = loadFixture("at-legal-retrieval.jsonl");
    const areas = new Set(at.map((q) => q.legal_area));
    expect(areas.size).toBeGreaterThanOrEqual(10);
  });

  it("CH questions cover diverse legal areas", () => {
    const ch = loadFixture("ch-legal-retrieval.jsonl");
    const areas = new Set(ch.map((q) => q.legal_area));
    expect(areas.size).toBeGreaterThanOrEqual(6);
  });

  it("EU questions cover diverse legal areas", () => {
    const eu = loadFixture("eu-legal-retrieval.jsonl");
    const areas = new Set(eu.map((q) => q.legal_area));
    expect(areas.size).toBeGreaterThanOrEqual(5);
  });

  it("cross-jurisdictional questions cover multiple jurisdictions", () => {
    const xj = loadFixture("cross-jurisdictional-retrieval.jsonl");
    const jurisdictions = new Set(xj.map((q) => q.jurisdiction));
    expect(jurisdictions.size).toBeGreaterThanOrEqual(3);
  });

  it("DE questions have answer_slug format (not expected_slug)", () => {
    const de = loadFixture("de-legal-retrieval.jsonl");
    for (const q of de) {
      expect(q.answer_slug).toBeTruthy();
      expect(q.expected_slug).toBeUndefined();
    }
  });

  it("AT questions have expected_slug format (not answer_slug)", () => {
    const at = loadFixture("at-legal-retrieval.jsonl");
    for (const q of at) {
      expect(q.expected_slug).toBeTruthy();
      expect(q.answer_slug).toBeUndefined();
    }
  });

  it("CH and EU questions have answer_slug format", () => {
    const ch = loadFixture("ch-legal-retrieval.jsonl");
    const eu = loadFixture("eu-legal-retrieval.jsonl");
    for (const q of [...ch, ...eu]) {
      expect(q.answer_slug).toBeTruthy();
    }
  });
});
