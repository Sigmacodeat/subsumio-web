import { describe, it, expect } from "vitest";
import {
  extractDENormReferences,
  extractCHNormReferences,
  extractEUNormReferences,
  extractMultiJurisdictionNormReferences,
  DE_CODE_MAP,
  CH_CODE_MAP,
  EU_CODE_MAP,
} from "./multi-jurisdiction-citations.ts";

describe("multi-jurisdiction-citations", () => {
  // ── DE ─────────────────────────────────────────────────────────────────────

  describe("DE citation extraction", () => {
    it("extracts § N BGB pattern", () => {
      const body = "Der Kläger beruft sich auf § 823 Abs. 1 BGB.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].code).toBe("BGB");
      expect(refs[0].ref).toBe("823");
      expect(refs[0].jurisdiction).toBe("de");
      expect(refs[0].statuteSlug).toBe("legal/statutes/de/bgb/p-823");
    });

    it("extracts Art. N GG pattern", () => {
      const body = "Art. 2 GG garantiert die freie Entfaltung der Persönlichkeit.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].code).toBe("GG");
      expect(refs[0].ref).toBe("2");
      expect(refs[0].statuteSlug).toBe("legal/statutes/de/gg/p-2");
    });

    it("extracts multiple different statutes", () => {
      const body = "§ 823 BGB und § 211 StGB sowie Art. 2 GG sind anwendbar.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(3);
      const codes = refs.map((r) => r.code).sort();
      expect(codes).toEqual(["BGB", "GG", "StGB"]);
    });

    it("deduplicates same code+ref", () => {
      const body = "§ 823 BGB wird hier diskutiert. Auch § 823 BGB ist relevant.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
    });

    it("filters unknown codes", () => {
      const body = "§ 123 XYZG ist nicht in unserem Corpus.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(0);
    });

    it("extracts §§ with letter suffix (§ 1a BGB)", () => {
      const body = "§ 1a BGB regelt die Berechnung.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].ref).toBe("1a");
    });

    it("extracts ZPO citations", () => {
      const body = "§ 253 ZPO normiert die Klageerhebung.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].statuteSlug).toBe("legal/statutes/de/zpo/p-253");
    });

    it("extracts AO citations", () => {
      const body = "§ 370 AO definiert die Steuerhinterziehung.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].statuteSlug).toBe("legal/statutes/de/ao/p-370");
    });

    it("extracts HGB citations", () => {
      const body = "§ 343 HGB betrifft die Handelsmakler.";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].statuteSlug).toBe("legal/statutes/de/hgb/p-343");
    });
  });

  // ── CH ─────────────────────────────────────────────────────────────────────

  describe("CH citation extraction", () => {
    it("extracts Art. N OR pattern", () => {
      const body = "Art. 41 OR regelt die unerlaubte Handlung.";
      const refs = extractCHNormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].code).toBe("OR");
      expect(refs[0].ref).toBe("41");
      expect(refs[0].jurisdiction).toBe("ch");
      expect(refs[0].statuteSlug).toBe("legal/statutes/ch/or/art-41");
    });

    it("extracts Art. N ZGB pattern", () => {
      const body = "Art. 2 ZGB handelt vom guten Glauben.";
      const refs = extractCHNormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].statuteSlug).toBe("legal/statutes/ch/zgb/art-2");
    });

    it("extracts Art. N StGB pattern", () => {
      const body = "Art. 122 StGB definiert die Tötung.";
      const refs = extractCHNormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].statuteSlug).toBe("legal/statutes/ch/stgb/art-122");
    });

    it("uses art- prefix for CH", () => {
      const body = "Art. 41 OR";
      const refs = extractCHNormReferences(body);
      expect(refs[0].statuteSlug).toContain("/art-");
    });

    it("deduplicates", () => {
      const body = "Art. 41 OR wird erwähnt. Art. 41 OR erneut.";
      const refs = extractCHNormReferences(body);
      expect(refs).toHaveLength(1);
    });

    it("filters unknown CH codes", () => {
      const body = "Art. 99 XYZG ist nicht bekannt.";
      const refs = extractCHNormReferences(body);
      expect(refs).toHaveLength(0);
    });
  });

  // ── EU ─────────────────────────────────────────────────────────────────────

  describe("EU citation extraction", () => {
    it("extracts Art. N DSGVO pattern", () => {
      const body = "Art. 5 DSGVO regelt die Grundsätze der Verarbeitung.";
      const refs = extractEUNormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].code).toBe("DSGVO");
      expect(refs[0].ref).toBe("5");
      expect(refs[0].jurisdiction).toBe("eu");
      expect(refs[0].statuteSlug).toBe("legal/statutes/eu/dsgvo/art-5");
    });

    it("extracts Art. N Abs. M DSGVO", () => {
      const body = "Art. 6 Abs. 1 DSGVO legt die Rechtmäßigkeit fest.";
      const refs = extractEUNormReferences(body);
      expect(refs).toHaveLength(1);
      expect(refs[0].ref).toBe("6");
    });

    it("filters unknown EU regulations", () => {
      const body = "Art. 99 XYZRL ist nicht bekannt.";
      const refs = extractEUNormReferences(body);
      expect(refs).toHaveLength(0);
    });
  });

  // ── Unified ────────────────────────────────────────────────────────────────

  describe("unified extraction", () => {
    it("routes to DE extractor", () => {
      const body = "§ 823 BGB";
      const refs = extractMultiJurisdictionNormReferences(body, "de");
      expect(refs).toHaveLength(1);
      expect(refs[0].jurisdiction).toBe("de");
    });

    it("routes to CH extractor", () => {
      const body = "Art. 41 OR";
      const refs = extractMultiJurisdictionNormReferences(body, "ch");
      expect(refs).toHaveLength(1);
      expect(refs[0].jurisdiction).toBe("ch");
    });

    it("routes to EU extractor", () => {
      const body = "Art. 5 DSGVO";
      const refs = extractMultiJurisdictionNormReferences(body, "eu");
      expect(refs).toHaveLength(1);
      expect(refs[0].jurisdiction).toBe("eu");
    });

    it("returns empty for unknown jurisdiction", () => {
      const refs = extractMultiJurisdictionNormReferences("§ 1 BGB", "fr");
      expect(refs).toHaveLength(0);
    });
  });

  // ── Code Maps ──────────────────────────────────────────────────────────────

  describe("code maps", () => {
    it("DE_CODE_MAP has key statutes", () => {
      expect(DE_CODE_MAP.BGB).toBe("bgb");
      expect(DE_CODE_MAP.StGB).toBe("stgb");
      expect(DE_CODE_MAP.ZPO).toBe("zpo");
      expect(DE_CODE_MAP.GG).toBe("gg");
      expect(DE_CODE_MAP.AO).toBe("ao");
    });

    it("CH_CODE_MAP has key statutes", () => {
      expect(CH_CODE_MAP.OR).toBe("or");
      expect(CH_CODE_MAP.ZGB).toBe("zgb");
      expect(CH_CODE_MAP.StGB).toBe("stgb");
    });

    it("EU_CODE_MAP has key regulations", () => {
      expect(EU_CODE_MAP.DSGVO).toBe("dsgvo");
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty body", () => {
      expect(extractDENormReferences("")).toHaveLength(0);
      expect(extractCHNormReferences("")).toHaveLength(0);
      expect(extractEUNormReferences("")).toHaveLength(0);
    });

    it("handles body with no citations", () => {
      const body = "Dies ist ein Text ohne Zitate.";
      expect(extractDENormReferences(body)).toHaveLength(0);
    });

    it("handles body with many citations", () => {
      const body =
        "§ 1 BGB § 2 BGB § 3 BGB § 4 BGB § 5 BGB § 6 BGB § 7 BGB § 8 BGB § 9 BGB § 10 BGB";
      const refs = extractDENormReferences(body);
      expect(refs).toHaveLength(10);
    });
  });
});
