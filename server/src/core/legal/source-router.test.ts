import { describe, it, expect } from "vitest";
import {
  classifySourceTypes,
  extractStichtag,
  clarifyJurisdiction,
  routeSources,
  sourceTypeToIds,
  type SourceType,
} from "./source-router.ts";

describe("Source Router v2", () => {
  // ── classifySourceTypes ──

  describe("classifySourceTypes", () => {
    it("detects statute signals", () => {
      const result = classifySourceTypes("Was sagt § 433 BGB?");
      expect(result.sourceTypes).toContain("statute");
      expect(result.reasoning.statute).toBeDefined();
      expect(result.confident).toBe(true);
    });

    it("detects judgement signals", () => {
      const result = classifySourceTypes("Wie hat der BGH dazu entschieden?");
      expect(result.sourceTypes).toContain("judgement");
    });

    it("detects OGH (Austrian supreme court)", () => {
      const result = classifySourceTypes("OGH 7 Ob 123/22 — Urteil");
      expect(result.sourceTypes).toContain("judgement");
    });

    it("detects EuGH signals", () => {
      const result = classifySourceTypes("EuGH, Urteil vom 5.6.2023");
      expect(result.sourceTypes).toContain("judgement");
    });

    it("detects materials signals", () => {
      const result = classifySourceTypes("Was sagen die Gesetzesmaterialien zur Reform?");
      expect(result.sourceTypes).toContain("materials");
    });

    it("detects admin practice signals", () => {
      const result = classifySourceTypes("Gibt es einen Erlass dazu?");
      expect(result.sourceTypes).toContain("admin_practice");
    });

    it("detects firm knowledge with active case", () => {
      const result = classifySourceTypes("Was steht in unserer Akte?", {
        hasActiveCase: true,
      });
      expect(result.sourceTypes).toContain("firm_knowledge");
    });

    it("detects firm knowledge signals without active case", () => {
      const result = classifySourceTypes("Haben wir ein Memo dazu?");
      expect(result.sourceTypes).toContain("firm_knowledge");
    });

    it("defaults to statute + judgement when no signal", () => {
      const result = classifySourceTypes("Wie funktioniert das rechtlich?");
      expect(result.sourceTypes).toContain("statute");
      expect(result.sourceTypes).toContain("judgement");
      expect(result.confident).toBe(false);
    });

    it("detects multiple source types", () => {
      const result = classifySourceTypes("BGH Urteil zu § 433 BGB — was sagen die Materialien?");
      expect(result.sourceTypes).toContain("statute");
      expect(result.sourceTypes).toContain("judgement");
      expect(result.sourceTypes).toContain("materials");
    });
  });

  // ── extractStichtag ──

  describe("extractStichtag", () => {
    it("extracts 'Stand DD.MM.YYYY'", () => {
      const result = extractStichtag("Wie ist die Rechtslage Stand 01.01.2024?");
      expect(result.asOfDate).toBe("2024-01-01");
      expect(result.explicit).toBe(true);
      expect(result.source).toBe("user");
    });

    it("extracts 'nach dem Stand vom DD.MM.YYYY'", () => {
      const result = extractStichtag("nach dem Stand vom 15.03.2023");
      expect(result.asOfDate).toBe("2023-03-15");
      expect(result.explicit).toBe(true);
    });

    it("extracts 'Stand YYYY' as end of year", () => {
      const result = extractStichtag("Stand 2020");
      expect(result.asOfDate).toBe("2020-12-31");
      expect(result.explicit).toBe(true);
    });

    it("extracts 'im Jahr YYYY'", () => {
      const result = extractStichtag("Wie war es im Jahr 2019?");
      expect(result.asOfDate).toBe("2019-12-31");
      expect(result.explicit).toBe(true);
    });

    it("falls back to case date", () => {
      const result = extractStichtag("Wie ist die Rechtslage?", "2022-06-15");
      expect(result.asOfDate).toBe("2022-06-15");
      expect(result.explicit).toBe(false);
      expect(result.source).toBe("case");
    });

    it("defaults to today when no date found", () => {
      const result = extractStichtag("Wie ist die Rechtslage?");
      expect(result.asOfDate).toBeDefined();
      expect(result.explicit).toBe(false);
      expect(result.source).toBe("default");
    });

    it("handles 2-digit year in German date", () => {
      const result = extractStichtag("Stand 01.01.24");
      expect(result.asOfDate).toBe("2024-01-01");
    });
  });

  // ── clarifyJurisdiction ──

  describe("clarifyJurisdiction", () => {
    it("uses explicit jurisdiction when provided", () => {
      const result = clarifyJurisdiction("Was sagt § 433 BGB?", "DE");
      expect(result.jurisdiction).toBe("DE");
      expect(result.ambiguous).toBe(false);
    });

    it("detects DE from BGB", () => {
      const result = clarifyJurisdiction("Was sagt § 433 BGB?");
      expect(result.jurisdiction).toBe("DE");
      expect(result.ambiguous).toBe(false);
    });

    it("detects AT from ABGB", () => {
      const result = clarifyJurisdiction("Was sagt § 1053 ABGB?");
      expect(result.jurisdiction).toBe("AT");
      expect(result.ambiguous).toBe(false);
    });

    it("detects CH from OR", () => {
      const result = clarifyJurisdiction("Was sagt Art. 127 OR?");
      expect(result.jurisdiction).toBe("CH");
      expect(result.ambiguous).toBe(false);
    });

    it("detects EU from DSGVO", () => {
      const result = clarifyJurisdiction("Was sagt die DSGVO?");
      expect(result.jurisdiction).toBe("EU");
      expect(result.ambiguous).toBe(false);
    });

    it("detects ambiguity from ZPO without context", () => {
      const result = clarifyJurisdiction("Was sagt § 253 ZPO?");
      expect(result.ambiguous).toBe(true);
      expect(result.candidates).toContain("DE");
      expect(result.candidates).toContain("AT");
      expect(result.candidates).toContain("CH");
      expect(result.clarificationQuestion).toBeDefined();
      expect(result.collisionStatutes).toContain("ZPO");
    });

    it("resolves collision when DE-specific statute also mentioned", () => {
      const result = clarifyJurisdiction("Was sagt § 253 ZPO im Verhältnis zum BGB?");
      expect(result.jurisdiction).toBe("DE");
      expect(result.ambiguous).toBe(false);
    });

    it("resolves collision when AT-specific statute also mentioned", () => {
      const result = clarifyJurisdiction("Was sagt § 253 ZPO im Verhältnis zum ABGB?");
      expect(result.jurisdiction).toBe("AT");
      expect(result.ambiguous).toBe(false);
    });

    it("detects KSchG collision between AT and DE", () => {
      const result = clarifyJurisdiction("Was sagt das KSchG?");
      expect(result.ambiguous).toBe(true);
      expect(result.candidates).toContain("AT");
      expect(result.candidates).toContain("DE");
      expect(result.collisionStatutes).toContain("KSchG");
    });

    it("returns null jurisdiction when no signal", () => {
      const result = clarifyJurisdiction("Wie funktioniert das?");
      expect(result.jurisdiction).toBeNull();
      expect(result.ambiguous).toBe(false);
      expect(result.candidates).toEqual([]);
    });

    it("EU is additive — DE + EU stays DE", () => {
      const result = clarifyJurisdiction("Was sagt der BGH zur DSGVO?");
      expect(result.jurisdiction).toBe("DE");
      expect(result.ambiguous).toBe(false);
    });
  });

  // ── sourceTypeToIds ──

  describe("sourceTypeToIds", () => {
    it("maps statute to law source for DE", () => {
      const ids = sourceTypeToIds("statute", "DE");
      expect(ids).toEqual(["law-de"]);
    });

    it("maps statute to granular AT law sources (v0.46: law-at has 0 pages)", () => {
      const ids = sourceTypeToIds("statute", "AT");
      // v0.46: AT statutes are in granular sources, not the empty "law-at"
      expect(ids).toContain("law-at-normen");
      expect(ids).toContain("law-at-landesrecht");
      expect(ids).toContain("law-at");
      // Should NOT include judikatur sources
      expect(ids).not.toContain("law-at-judikatur");
    });

    it("maps judgement to granular AT judikatur sources (v0.46)", () => {
      const ids = sourceTypeToIds("judgement", "AT");
      // v0.46: AT judikatur is split across multiple court sources
      expect(ids).toContain("law-at-judikatur");
      expect(ids).toContain("law-at-judikatur-ogh");
      expect(ids).toContain("law-at-judikatur-vwgh");
      // Should NOT include statute sources
      expect(ids).not.toContain("law-at-normen");
    });

    it("maps judgement to law-de for DE", () => {
      const ids = sourceTypeToIds("judgement", "DE");
      expect(ids).toEqual(["law-de"]);
    });

    it("maps firm_knowledge to own source", () => {
      const ids = sourceTypeToIds("firm_knowledge", "DE", "brain_abc");
      expect(ids).toEqual(["brain_abc"]);
    });

    it("maps all to multiple sources including EU", () => {
      const ids = sourceTypeToIds("all", "DE", "brain_abc");
      expect(ids).toContain("law-de");
      expect(ids).toContain("law-eu");
      expect(ids).toContain("brain_abc");
    });

    it("returns empty for statute without jurisdiction", () => {
      const ids = sourceTypeToIds("statute", undefined);
      expect(ids).toEqual([]);
    });
  });

  // ── routeSources (integration) ──

  describe("routeSources", () => {
    it("full routing for a DE statute query", () => {
      const result = routeSources({
        query: "Was sagt § 433 BGB?",
        jurisdiction: "DE",
        ownSourceId: "brain_abc",
      });
      expect(result.sourceTypes).toContain("statute");
      expect(result.jurisdiction).toBe("DE");
      expect(result.needsClarification).toBe(false);
      expect(result.stichtag.source).toBe("default");
      const statuteMapping = result.sourceMappings.find((m) => m.sourceType === "statute");
      expect(statuteMapping?.sourceIds).toEqual(["law-de"]);
    });

    it("detects ambiguity in full routing", () => {
      const result = routeSources({
        query: "Was sagt § 253 ZPO?",
        ownSourceId: "brain_abc",
      });
      expect(result.needsClarification).toBe(true);
      expect(result.clarificationQuestion).toBeDefined();
    });

    it("extracts Stichtag in full routing", () => {
      const result = routeSources({
        query: "Wie ist die Rechtslage Stand 01.07.2020?",
        jurisdiction: "DE",
      });
      expect(result.stichtag.asOfDate).toBe("2020-07-01");
      expect(result.stichtag.explicit).toBe(true);
    });

    it("includes firm_knowledge when active case", () => {
      const result = routeSources({
        query: "Was sagt § 433 BGB und was steht in unserer Akte?",
        jurisdiction: "DE",
        hasActiveCase: true,
        ownSourceId: "brain_abc",
      });
      expect(result.sourceTypes).toContain("firm_knowledge");
      const firmMapping = result.sourceMappings.find((m) => m.sourceType === "firm_knowledge");
      expect(firmMapping?.sourceIds).toEqual(["brain_abc"]);
    });
  });
});
