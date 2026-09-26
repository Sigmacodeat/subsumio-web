/**
 * think-Rechtsmodus: Zitierbeispiele folgen der Rechtsordnung der Akte, der
 * archivierte Steuermodus schaltet sich nicht mehr selbst ein, und die
 * AT-Kollisionsliste nennt das GmbH-Gesetz mit seinem richtigen Kürzel (GmbHG).
 */
import { describe, it, expect } from "bun:test";
import { buildThinkSystemPrompt, legalCitationStyle } from "../src/core/think/prompt.ts";
import { detectThinkModes } from "../src/core/think/index.ts";

describe("Zitierbeispiele je Rechtsordnung", () => {
  it("AT-Akte: ABGB/OGH/RIS-Justiz statt BGB/BGH", () => {
    const p = buildThinkSystemPrompt({ legalMode: true, jurisdiction: "AT" });
    expect(p).toContain("ABGB");
    expect(p).toContain("OGH");
    expect(p).toContain("RIS-Justiz");
    expect(p).not.toContain("§ 823 BGB");
    expect(p).not.toContain("BGH, Urteil");
    expect(p).not.toContain("XII ZR 123/21");
  });

  it("DE-Akte behält das BGB/BGH-Format", () => {
    const p = buildThinkSystemPrompt({ legalMode: true, jurisdiction: "DE" });
    expect(p).toContain("§ 823 BGB");
    expect(p).toContain("BGH, Urteil vom");
  });

  it("CH-Akte: OR/BGer", () => {
    const s = legalCitationStyle("ch");
    expect(s.statute).toContain("OR");
    expect(s.caseLaw).toContain("BGer");
  });

  it("ohne Rechtsordnung: AT und DE nebeneinander", () => {
    const s = legalCitationStyle(undefined);
    expect(s.statute).toContain("ABGB");
    expect(s.statute).toContain("BGB");
  });

  it("AT-Kollisionsliste: GmbHG statt 'GmbHH'", () => {
    const p = buildThinkSystemPrompt({ legalMode: true, jurisdiction: "AT" });
    expect(p).not.toContain("GmbHH");
    expect(p).toContain("GmbHG = GmbH-Gesetz (Österreich)");
  });
});

describe("Steuermodus nur auf ausdrücklichen Wunsch", () => {
  const taxPages = [
    { slug: "law/de/estg", type: "law" },
    { slug: "law/ch/dbg", type: "law" },
  ];

  it("Treffer aus dem Steuerkorpus schalten den Steuermodus nicht ein", () => {
    expect(detectThinkModes({}, taxPages).taxMode).toBe(false);
    expect(detectThinkModes({ legalMode: true }, taxPages).taxMode).toBe(false);
  });

  it("ausdrückliches taxMode bleibt möglich", () => {
    expect(detectThinkModes({ taxMode: true }, []).taxMode).toBe(true);
  });

  it("Rechtsmodus-Automatik unverändert", () => {
    expect(detectThinkModes({}, [{ slug: "legal/statutes/at/abgb/p-1295", type: "law" }]).legalMode).toBe(true);
    expect(detectThinkModes({}, [{ slug: "people/alice-example", type: "person" }]).legalMode).toBe(false);
  });
});
