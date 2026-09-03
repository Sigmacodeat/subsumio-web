import { describe, it, expect } from "bun:test";
import {
  classifyQueryComplexity,
  tierToWorkflowId,
} from "../src/core/minions/query-complexity-router.ts";

describe("Query Complexity Router", () => {
  describe("quick queries", () => {
    it("routes 'Wann ist die Frist?' to quick", () => {
      const result = classifyQueryComplexity("Wann ist die Frist?");
      expect(result.tier).toBe("quick");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("routes 'Was besagt § 823 BGB?' to quick", () => {
      const result = classifyQueryComplexity("Was besagt § 823 BGB?");
      expect(result.tier).toBe("quick");
    });

    it("routes 'Ist die Frist verjährt?' to quick", () => {
      const result = classifyQueryComplexity("Ist die Frist verjährt?");
      expect(result.tier).toBe("quick");
    });

    it("routes short single-concept queries to quick", () => {
      const result = classifyQueryComplexity("Welches Gesetz gilt hier?");
      expect(result.tier).toBe("quick");
      expect(result.signals).toContain("no_complexity_keywords");
    });
  });

  describe("fristen_report queries", () => {
    it("routes deadline-heavy queries to fristen_report", () => {
      const result = classifyQueryComplexity(
        "Bitte prüfen Sie die Fristen und Verjährung in dieser Akte. Wann läuft die Frist ab?"
      );
      expect(result.tier).toBe("fristen_report");
      expect(result.signals.some((s) => s.includes("deadline_keywords"))).toBe(true);
    });
  });

  describe("schriftsatz queries", () => {
    it("routes drafting requests to schriftsatz", () => {
      const result = classifyQueryComplexity(
        "Ich brauche einen Schriftsatz-Entwurf für die Klageantwort."
      );
      expect(result.tier).toBe("schriftsatz");
    });

    it("routes 'Verfassen Sie ein Memorandum' to schriftsatz", () => {
      const result = classifyQueryComplexity("Verfassen Sie ein Memorandum zu diesem Fall.");
      expect(result.tier).toBe("schriftsatz");
    });
  });

  describe("full_pipeline queries", () => {
    it("routes multi-party complex queries to full_pipeline", () => {
      const result = classifyQueryComplexity(
        "Umfassende Analyse mit mehreren Parteien, Schadensersatz, Mitverschulden, Widerklage, Aufrechnung und Zurückbehaltung. Detaillierte Prüfung aller Aspekte."
      );
      expect(result.tier).toBe("full_pipeline");
    });

    it("routes large document sets to full_pipeline", () => {
      const result = classifyQueryComplexity("Analysieren Sie diesen Fall.", 75);
      expect(result.tier).toBe("full_pipeline");
      expect(result.signals.some((s) => s.includes("document_count"))).toBe(true);
    });

    it("routes very long queries to full_pipeline", () => {
      const longQuery = "a".repeat(400);
      const result = classifyQueryComplexity(longQuery);
      expect(result.tier).toBe("full_pipeline");
    });
  });

  describe("memo queries", () => {
    it("routes medium queries to memo", () => {
      const result = classifyQueryComplexity(
        "Bitte analysieren Sie die Haftungsfrage in diesem Fall und geben Sie eine Ersteinschätzung."
      );
      expect(result.tier).toBe("memo");
    });
  });

  describe("confidence and signals", () => {
    it("always returns confidence between 0 and 1", () => {
      const queries = ["Wann ist die Frist?", "a".repeat(500), "Schreiben Sie einen Schriftsatz"];
      for (const q of queries) {
        const result = classifyQueryComplexity(q);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("always returns non-empty signals array", () => {
      const result = classifyQueryComplexity("Test query");
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it("always returns reasoning string", () => {
      const result = classifyQueryComplexity("Test query");
      expect(result.reasoning.length).toBeGreaterThan(10);
    });
  });

  describe("tierToWorkflowId", () => {
    // F13 fix: "quick" used to map to "memo" — the same nine-layer workflow
    // (opponent-simulator + 3-model ensemble critic included) as any other
    // memo request. It now routes to the genuinely lightweight
    // "quick_answer" workflow instead.
    it("maps quick to quick_answer (lightweight workflow, no critic/opponent-simulator)", () => {
      expect(tierToWorkflowId("quick")).toBe("quick_answer");
    });

    it("maps memo to memo", () => {
      expect(tierToWorkflowId("memo")).toBe("memo");
    });

    it("maps fristen_report to fristen_report", () => {
      expect(tierToWorkflowId("fristen_report")).toBe("fristen_report");
    });

    it("maps schriftsatz to schriftsatz", () => {
      expect(tierToWorkflowId("schriftsatz")).toBe("schriftsatz");
    });

    it("maps full_pipeline to full_pipeline", () => {
      expect(tierToWorkflowId("full_pipeline")).toBe("full_pipeline");
    });
  });
});
