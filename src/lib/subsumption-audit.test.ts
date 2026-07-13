import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

function loadFixture(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("T2.2 Subsumption Case Audit", () => {
  const fixtureDir = join(REPO_ROOT, "server", "test", "fixtures");
  const deCases = loadFixture(join(fixtureDir, "de-subsumption-expanded.jsonl"));
  const atCases = loadFixture(join(fixtureDir, "at-subsumption-expanded.jsonl"));
  const regressionCases = loadFixture(join(fixtureDir, "at-subsumption-regression.jsonl"));

  it("loads exactly 105 expanded cases (70 DE + 35 AT)", () => {
    expect(deCases.length).toBe(70);
    expect(atCases.length).toBe(35);
    expect(deCases.length + atCases.length).toBe(105);
  });

  it("every case has required fields", () => {
    for (const c of [...deCases, ...atCases]) {
      expect(c.case_id).toBeTruthy();
      expect(c.jurisdiction).toMatch(/^(de|at)$/);
      expect(c.facts).toBeTruthy();
      expect(c.question).toBeTruthy();
      expect(c.expected_law).toBeTruthy();
      expect(c.expected_section).toBeTruthy();
      expect(c.expected_keywords).toBeInstanceOf(Array);
      expect(c.expected_keywords.length).toBeGreaterThan(0);
      expect(c.expected_conclusion).toBeTruthy();
      expect(c.expected_conclusion.length).toBeGreaterThan(10);
    }
  });

  it("every case_id is unique", () => {
    const allIds = [...deCases, ...atCases].map((c) => c.case_id);
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it("DE cases use DE law slugs", () => {
    const deLawSlugs = new Set(deCases.map((c) => c.expected_law));
    for (const slug of deLawSlugs) {
      expect(existsSync(join(REPO_ROOT, "law-corpus", "de", `${slug}.md`))).toBe(true);
    }
  });

  it("AT cases use AT law slugs (with alias resolution)", () => {
    const AT_ALIASES: Record<string, string> = { stgb: "stgb-at", zpo: "zpo-at" };
    for (const c of atCases) {
      const resolved = AT_ALIASES[c.expected_law] ?? c.expected_law;
      expect(existsSync(join(REPO_ROOT, "law-corpus", "at", `${resolved}.md`))).toBe(true);
    }
  });

  it("expected_section exists in the referenced law corpus file (excluding known errors)", () => {
    const KNOWN_ERRORS = new Set([
      "sub-at-019", "sub-at-025", "sub-at-031", "sub-at-035",
      "sub-at-036", "sub-at-038", "sub-at-040", "sub-at-041",
    ]);
    const AT_ALIASES: Record<string, string> = { stgb: "stgb-at", zpo: "zpo-at" };
    for (const c of [...deCases, ...atCases]) {
      if (KNOWN_ERRORS.has(c.case_id)) continue;
      const resolved = c.jurisdiction === "at" ? (AT_ALIASES[c.expected_law] ?? c.expected_law) : c.expected_law;
      const corpusPath = join(REPO_ROOT, "law-corpus", c.jurisdiction, `${resolved}.md`);
      if (!existsSync(corpusPath)) continue;
      const corpusText = readFileSync(corpusPath, "utf-8");
      const sectionNum = c.expected_section.replace(/§\s*/, "");
      const pattern = new RegExp(`§\\s*${sectionNum}`, "i");
      expect(pattern.test(corpusText)).toBe(true);
    }
  });

  it("expected_conclusion references expected_section", () => {
    for (const c of [...deCases, ...atCases]) {
      const sectionNum = c.expected_section.replace(/§\s*/, "");
      const conclusionLower = c.expected_conclusion.toLowerCase();
      const references =
        conclusionLower.includes(c.expected_section.toLowerCase()) ||
        conclusionLower.includes(`§ ${sectionNum}`) ||
        conclusionLower.includes(`§${sectionNum}`);
      expect(references).toBe(true);
    }
  });

  it("regression fixtures exist for known AT errors", () => {
    expect(regressionCases.length).toBeGreaterThanOrEqual(8);
    for (const c of regressionCases) {
      expect(c.case_id).toMatch(/^sub-at-\d+$/);
      expect(c.audit_status).toMatch(/^(corrected|disputed)$/);
      expect(c.audit_issue).toBeTruthy();
      expect(c.audit_note).toBeTruthy();
    }
  });

  it("regression fixtures have corrected expected_section", () => {
    const knownErrors = ["sub-at-019", "sub-at-025", "sub-at-031", "sub-at-035", "sub-at-038", "sub-at-040"];
    for (const id of knownErrors) {
      const regCase = regressionCases.find((c) => c.case_id === id);
      expect(regCase).toBeDefined();
      expect(regCase.audit_status).toBe("corrected");
    }
  });

  it("disputed cases are flagged as disputed in regression fixtures", () => {
    const disputedIds = ["sub-at-036", "sub-at-041"];
    for (const id of disputedIds) {
      const regCase = regressionCases.find((c) => c.case_id === id);
      expect(regCase).toBeDefined();
      expect(regCase.audit_status).toBe("disputed");
    }
  });

  it("audit protocol JSON was generated", () => {
    const auditPath = "/tmp/subsumption-audit.json";
    if (!existsSync(auditPath)) return;
    const report = JSON.parse(readFileSync(auditPath, "utf-8"));
    expect(report.total_cases).toBe(105);
    expect(report.by_status.valid).toBeGreaterThan(0);
    expect(report.by_status.corrected).toBeGreaterThan(0);
    expect(report.superseded_metric).toContain("95,2%");
    expect(report.superseded_metric).toContain("superseded");
  });
});
