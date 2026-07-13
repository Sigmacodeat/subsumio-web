import { describe, test, expect } from "bun:test";
import {
  expandConceptQuery,
  findConceptMappings,
  extractSectionNumbers,
} from "../src/core/legal/concept-map.ts";

describe("concept-map", () => {
  describe("extractSectionNumbers", () => {
    test("extracts § numbers from query", () => {
      expect(extractSectionNumbers("Was regelt § 138 BGB?")).toEqual([138]);
      expect(extractSectionNumbers("§§ 823, 826 BGB")).toEqual([823]);
      expect(extractSectionNumbers("§ 823 § 826 BGB")).toEqual([823, 826]);
      expect(extractSectionNumbers("§138 BGB")).toEqual([138]);
      expect(extractSectionNumbers("Keine Paragraphen hier")).toEqual([]);
    });
  });

  describe("findConceptMappings", () => {
    test("finds DE Sittenwidrigkeit → § 138 BGB", () => {
      const results = findConceptMappings("Wer haftet bei Sittenwidrigkeit?", "de");
      expect(results.length).toBeGreaterThan(0);
      const bgb = results.find(r => r.law === "BGB");
      expect(bgb).toBeDefined();
      expect(bgb!.sections).toContain(138);
    });

    test("finds AT Sittenwidrigkeit → § 879 ABGB", () => {
      const results = findConceptMappings("Sittenwidrigkeit nach AT Recht", "at");
      expect(results.length).toBeGreaterThan(0);
      const abgb = results.find(r => r.law === "ABGB");
      expect(abgb).toBeDefined();
      expect(abgb!.sections).toContain(879);
    });

    test("finds DE Betrug → § 263 StGB", () => {
      const results = findConceptMappings("Betrug strafbar", "de");
      const stgb = results.find(r => r.law === "StGB");
      expect(stgb).toBeDefined();
      expect(stgb!.sections).toContain(263);
    });

    test("finds DE Gerichtsstand → ZPO", () => {
      const results = findConceptMappings("Gerichtsstand der unerlaubten Handlung", "de");
      const zpo = results.find(r => r.law === "ZPO");
      expect(zpo).toBeDefined();
      expect(zpo!.sections).toContain(32);
    });

    test("respects jurisdiction filter", () => {
      const deResults = findConceptMappings("Kaufmann", "de");
      expect(deResults.every(r => r.jurisdiction === "de")).toBe(true);
      const atResults = findConceptMappings("Kaufmann", "at");
      expect(atResults.every(r => r.jurisdiction === "at")).toBe(true);
    });

    test("returns empty for non-legal query", () => {
      expect(findConceptMappings("Wie ist das Wetter?", "de")).toEqual([]);
    });
  });

  describe("expandConceptQuery", () => {
    test("appends § hints for Sittenwidrigkeit", () => {
      const expanded = expandConceptQuery("Wer haftet bei Sittenwidrigkeit?", "de");
      expect(expanded).toContain("§ 138");
      expect(expanded).toContain("BGB");
      expect(expanded).toContain("Sittenwidrigkeit");
    });

    test("appends § hints for AT Verjährung", () => {
      const expanded = expandConceptQuery("Verjährung einer Forderung", "at");
      expect(expanded).toContain("§ 1489");
      expect(expanded).toContain("ABGB");
    });

    test("does not modify non-legal queries", () => {
      const original = "Wie wird das Wetter morgen?";
      expect(expandConceptQuery(original, "de")).toBe(original);
    });

    test("handles mixed concepts", () => {
      const expanded = expandConceptQuery("Betrug und Diebstahl strafbar", "de");
      expect(expanded).toContain("§ 263");
      expect(expanded).toContain("§ 242");
    });

    test("respects jurisdiction for ABGB vs BGB", () => {
      const atExpanded = expandConceptQuery("Sittenwidrigkeit", "at");
      expect(atExpanded).toContain("§ 879");
      expect(atExpanded).toContain("ABGB");
      expect(atExpanded).not.toMatch(/\bBGB\b/);

      const deExpanded = expandConceptQuery("Sittenwidrigkeit", "de");
      expect(deExpanded).toContain("§ 138");
      expect(deExpanded).toContain("BGB");
    });
  });
});
