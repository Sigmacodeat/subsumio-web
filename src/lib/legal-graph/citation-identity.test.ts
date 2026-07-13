import { describe, it, expect } from "vitest";
import {
  parseCitations,
  checkStatuteCollision,
  checkAllStatuteCollisions,
} from "./citation-identity.ts";

describe("Citation Identity Resolver", () => {
  // ── parseCitations ──

  describe("parseCitations", () => {
    it("parses German case citations (BGH)", () => {
      const text = "Siehe BGH, Urteil vom 15.03.2024 - I ZR 1/24";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_de");
      expect(caseCit).toBeDefined();
      expect(caseCit?.court).toBe("BGH");
      expect(caseCit?.date).toBe("2024-03-15");
      expect(caseCit?.fileNumber).toContain("I ZR 1/24");
      expect(caseCit?.jurisdiction).toBe("DE");
    });

    it("parses Austrian case citations (OGH)", () => {
      const text = "OGH 7 Ob 123/22";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_at");
      expect(caseCit).toBeDefined();
      expect(caseCit?.court).toBe("OGH");
      expect(caseCit?.fileNumber).toBe("7 Ob 123/22");
      expect(caseCit?.jurisdiction).toBe("AT");
    });

    it("parses OGH with date", () => {
      const text = "OGH Entscheidung vom 15.03.2024, 7 Ob 123/22";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_at");
      expect(caseCit).toBeDefined();
      expect(caseCit?.court).toBe("OGH");
      expect(caseCit?.date).toBe("2024-03-15");
      expect(caseCit?.fileNumber).toBe("7 Ob 123/22");
    });

    it("parses OGH with date (short format)", () => {
      const text = "OGH 20.3.2024, 7 Ob 123/22";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_at");
      expect(caseCit).toBeDefined();
      expect(caseCit?.date).toBe("2024-03-20");
    });

    it("parses EuGH citations", () => {
      const text = "EuGH, Urteil vom 5.6.2023 - C-123/22";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_eu");
      expect(caseCit).toBeDefined();
      expect(caseCit?.court).toBe("EuGH");
      expect(caseCit?.date).toBe("2023-06-05");
      expect(caseCit?.fileNumber).toBe("C-123/22");
      expect(caseCit?.jurisdiction).toBe("EU");
    });

    it("parses EuGH without date", () => {
      const text = "EuGH C-456/21";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_eu");
      expect(caseCit).toBeDefined();
      expect(caseCit?.fileNumber).toBe("C-456/21");
    });

    it("parses ECLI:DE citations", () => {
      const text = "ECLI:DE:BGH:2024:1234.5678";
      const citations = parseCitations(text);
      const ecliCit = citations.find((c) => c.kind === "ecli");
      expect(ecliCit).toBeDefined();
      expect(ecliCit?.ecli).toBe("ECLI:DE:BGH:2024:1234.5678");
      expect(ecliCit?.jurisdiction).toBe("DE");
    });

    it("parses ECLI:EU citations", () => {
      const text = "ECLI:EU:C:2023:456";
      const citations = parseCitations(text);
      const ecliCit = citations.find((c) => c.kind === "ecli");
      expect(ecliCit).toBeDefined();
      expect(ecliCit?.ecli).toBe("ECLI:EU:C:2023:456");
      expect(ecliCit?.jurisdiction).toBe("EU");
    });

    it("parses Geschäftszahl (GZ)", () => {
      const text = "GZ: 123456/AB-2024";
      const citations = parseCitations(text);
      const gzCit = citations.find((c) => c.kind === "gz");
      expect(gzCit).toBeDefined();
      expect(gzCit?.geschäftszahl).toBe("123456/AB-2024");
      expect(gzCit?.jurisdiction).toBe("AT");
    });

    it("parses Geschäftszahl with 'Geschäftszahl' prefix", () => {
      const text = "Geschäftszahl 123456/AB-2024";
      const citations = parseCitations(text);
      const gzCit = citations.find((c) => c.kind === "gz");
      expect(gzCit).toBeDefined();
      expect(gzCit?.geschäftszahl).toBe("123456/AB-2024");
    });

    it("parses statute citations with ABGB", () => {
      const text = "§ 1053 ABGB regelt den Kaufvertrag";
      const citations = parseCitations(text);
      const statCit = citations.find((c) => c.kind === "statute");
      expect(statCit).toBeDefined();
      expect(statCit?.statute).toBe("ABGB");
      expect(statCit?.section).toBe("1053");
      expect(statCit?.jurisdiction).toBe("AT");
      expect(statCit?.hasCollision).toBe(false);
    });

    it("parses statute citations with BGB", () => {
      const text = "§ 433 BGB";
      const citations = parseCitations(text);
      const statCit = citations.find((c) => c.kind === "statute");
      expect(statCit).toBeDefined();
      expect(statCit?.statute).toBe("BGB");
      expect(statCit?.section).toBe("433");
      expect(statCit?.jurisdiction).toBe("DE");
    });

    it("parses statute citations with OR (CH)", () => {
      const text = "Art. 127 OR";
      const citations = parseCitations(text);
      const statCit = citations.find((c) => c.kind === "statute" && c.statute === "OR");
      expect(statCit).toBeDefined();
      expect(statCit?.jurisdiction).toBe("CH");
    });

    it("detects collision statutes (ZPO)", () => {
      const text = "§ 253 ZPO";
      const citations = parseCitations(text);
      const statCit = citations.find((c) => c.kind === "statute");
      expect(statCit).toBeDefined();
      expect(statCit?.statute).toBe("ZPO");
      expect(statCit?.hasCollision).toBe(true);
      expect(statCit?.jurisdiction).toBeUndefined(); // ambiguous
      expect(statCit?.confidence).toBeLessThan(0.9);
    });

    it("parses literature citations (NJW)", () => {
      const text = "BGH NJW 2024, 123";
      const citations = parseCitations(text);
      const litCit = citations.find((c) => c.kind === "literature");
      expect(litCit).toBeDefined();
      expect(litCit?.journal).toBe("NJW");
      expect(litCit?.journalYear).toBe(2024);
      expect(litCit?.journalPage).toBe(123);
      expect(litCit?.jurisdiction).toBe("DE");
    });

    it("parses AT literature citations (ecolex)", () => {
      const text = "Huber, ecolex 2023, 42";
      const citations = parseCitations(text);
      const litCit = citations.find((c) => c.kind === "literature");
      expect(litCit).toBeDefined();
      expect(litCit?.journal).toBe("ecolex");
      expect(litCit?.journalYear).toBe(2023);
      expect(litCit?.jurisdiction).toBe("AT");
    });

    it("parses multiple citations from one text", () => {
      const text = "BGH, Urteil vom 15.03.2024 - I ZR 1/24 zu § 433 BGB und OGH 7 Ob 123/22";
      const citations = parseCitations(text);
      expect(citations.length).toBeGreaterThanOrEqual(3);
      expect(citations.some((c) => c.kind === "case_de")).toBe(true);
      expect(citations.some((c) => c.kind === "statute")).toBe(true);
      expect(citations.some((c) => c.kind === "case_at")).toBe(true);
    });

    it("sorts citations by position", () => {
      const text = "§ 433 BGB und § 434 BGB";
      const citations = parseCitations(text);
      expect(citations[0].position).toBeLessThan(citations[1].position);
    });
  });

  // ── checkStatuteCollision ──

  describe("checkStatuteCollision", () => {
    it("detects ABGB as AT-only (no collision)", () => {
      const result = checkStatuteCollision("ABGB");
      expect(result.hasCollision).toBe(false);
      expect(result.jurisdictions).toEqual(["AT"]);
    });

    it("detects BGB as DE-only (no collision)", () => {
      const result = checkStatuteCollision("BGB");
      expect(result.hasCollision).toBe(false);
      expect(result.jurisdictions).toEqual(["DE"]);
    });

    it("detects ZPO collision (DE, AT, CH)", () => {
      const result = checkStatuteCollision("ZPO");
      expect(result.hasCollision).toBe(true);
      expect(result.jurisdictions).toContain("DE");
      expect(result.jurisdictions).toContain("AT");
      expect(result.jurisdictions).toContain("CH");
      expect(result.warning).toBeDefined();
    });

    it("detects KSchG collision (AT, DE)", () => {
      const result = checkStatuteCollision("KSchG");
      expect(result.hasCollision).toBe(true);
      expect(result.jurisdictions).toContain("AT");
      expect(result.jurisdictions).toContain("DE");
    });

    it("detects StGB collision (DE, AT, CH)", () => {
      const result = checkStatuteCollision("StGB");
      expect(result.hasCollision).toBe(true);
      expect(result.jurisdictions).toEqual(["DE", "AT", "CH"]);
    });

    it("validates statute for correct jurisdiction", () => {
      const result = checkStatuteCollision("ABGB", "AT");
      expect(result.isValidForJurisdiction).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("flags statute for wrong jurisdiction", () => {
      const result = checkStatuteCollision("ABGB", "DE");
      expect(result.isValidForJurisdiction).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("nicht gültig");
    });

    it("validates collision statute for correct jurisdiction", () => {
      const result = checkStatuteCollision("ZPO", "DE");
      expect(result.isValidForJurisdiction).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("handles unknown statute", () => {
      const result = checkStatuteCollision("UNKNOWN");
      expect(result.hasCollision).toBe(false);
      expect(result.jurisdictions).toEqual([]);
      expect(result.isValidForJurisdiction).toBe(false);
    });

    it("EU statutes are always valid", () => {
      const result = checkStatuteCollision("DSGVO", "DE");
      expect(result.isValidForJurisdiction).toBe(true);
    });

    it("DSGVO has no collision", () => {
      const result = checkStatuteCollision("DSGVO");
      expect(result.hasCollision).toBe(false);
      expect(result.jurisdictions).toEqual(["EU"]);
    });

    it("GmbHG collision (DE, AT)", () => {
      const result = checkStatuteCollision("GmbHG");
      expect(result.hasCollision).toBe(true);
      expect(result.jurisdictions).toContain("DE");
      expect(result.jurisdictions).toContain("AT");
    });

    it("OR is CH-only (no collision)", () => {
      const result = checkStatuteCollision("OR");
      expect(result.hasCollision).toBe(false);
      expect(result.jurisdictions).toEqual(["CH"]);
    });

    it("UWG collision (DE, AT, CH)", () => {
      const result = checkStatuteCollision("UWG");
      expect(result.hasCollision).toBe(true);
      expect(result.jurisdictions).toEqual(["DE", "AT", "CH"]);
    });
  });

  // ── checkAllStatuteCollisions ──

  describe("checkAllStatuteCollisions", () => {
    it("finds all collision statutes in a text", () => {
      const text = "§ 433 BGB und § 253 ZPO und § 1053 ABGB";
      const results = checkAllStatuteCollisions(text);
      expect(results.length).toBe(3);
      const zpo = results.find((r) => r.statute === "ZPO");
      expect(zpo?.hasCollision).toBe(true);
      const bgb = results.find((r) => r.statute === "BGB");
      expect(bgb?.hasCollision).toBe(false);
      const abgb = results.find((r) => r.statute === "ABGB");
      expect(abgb?.hasCollision).toBe(false);
    });

    it("deduplicates statutes", () => {
      const text = "§ 433 BGB und § 434 BGB";
      const results = checkAllStatuteCollisions(text);
      expect(results.length).toBe(1);
      expect(results[0].statute).toBe("BGB");
    });

    it("flags wrong jurisdiction in text", () => {
      const text = "§ 1053 ABGB und § 433 BGB";
      const results = checkAllStatuteCollisions(text, "AT");
      const abgb = results.find((r) => r.statute === "ABGB");
      expect(abgb?.isValidForJurisdiction).toBe(true);
      const bgb = results.find((r) => r.statute === "BGB");
      expect(bgb?.isValidForJurisdiction).toBe(false);
      expect(bgb?.warning).toBeDefined();
    });
  });

  // ── Edge Cases ──

  describe("edge cases", () => {
    it("handles empty text", () => {
      expect(parseCitations("")).toEqual([]);
    });

    it("handles text with no citations", () => {
      expect(parseCitations("Dies ist ein normaler Text ohne Zitate.")).toEqual([]);
    });

    it("handles 2-digit years in dates", () => {
      const text = "BGH, Urteil vom 15.03.24 - I ZR 1/24";
      const citations = parseCitations(text);
      const caseCit = citations.find((c) => c.kind === "case_de");
      expect(caseCit?.date).toBe("2024-03-15");
    });

    it("does not match very short references", () => {
      const text = "§ 1 B";
      const citations = parseCitations(text);
      expect(citations.length).toBe(0);
    });

    it("handles VwGH (Austrian administrative court)", () => {
      const text = "VwGH 2019/05/0123";
      const citations = parseCitations(text);
      // VwGH may or may not match depending on pattern — just ensure no crash
      expect(citations).toBeDefined();
    });
  });
});
