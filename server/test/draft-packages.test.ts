import { describe, it, expect } from "bun:test";
import {
  LEGACY_AT_PACKAGE,
  STATIC_PACKAGES_DE,
  detectParteirolle,
  resolveDraftPackages,
} from "../src/core/legal/draft-packages.ts";

describe("resolveDraftPackages", () => {
  it("backward compatible: AT + straf returns the legacy flagship set", () => {
    const pkgs = resolveDraftPackages({ jurisdiction: "at", verfahrenstyp: "straf" });
    expect(pkgs).toEqual(LEGACY_AT_PACKAGE);
  });

  it("backward compatible: no opts at all returns the legacy set", () => {
    expect(resolveDraftPackages()).toEqual(LEGACY_AT_PACKAGE);
  });

  it("backward compatible: AT + sonstiges returns the legacy set", () => {
    const pkgs = resolveDraftPackages({ jurisdiction: "at", verfahrenstyp: "sonstiges" });
    expect(pkgs).toEqual(LEGACY_AT_PACKAGE);
  });

  it("zivil + klaeger: Mahnklage, Klage, Kostenverzeichnis — keine Amtshaftung", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "zivil",
      parteirolle: "klaeger",
    });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("mahnklage");
    expect(types).toContain("klage_entwurf");
    expect(types).toContain("kostenverzeichnis");
    expect(types).toContain("beweisantrag");
    expect(types).not.toContain("ahg_antrag");
    expect(types).not.toContain("strafantrag");
    expect(types).not.toContain("klagebeantwortung");
  });

  it("zivil + beklagter: Klagebeantwortung + Einspruch + Einreden", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "zivil",
      parteirolle: "beklagter",
    });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("klagebeantwortung");
    expect(types).toContain("einspruch_zahlungsbefehl");
    expect(types).toContain("einreden_katalog");
    expect(types).toContain("kostenverzeichnis");
    expect(types).not.toContain("mahnklage");
  });

  it("zivil + unbekannt: bereitet beide Richtungen vor", () => {
    const pkgs = resolveDraftPackages({ jurisdiction: "at", verfahrenstyp: "zivil" });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("mahnklage");
    expect(types).toContain("klagebeantwortung");
    // Versand-Checkliste genau einmal, am Ende
    expect(types.filter((t) => t === "versand_checkliste")).toHaveLength(1);
    expect(types[types.length - 1]).toBe("versand_checkliste");
  });

  it("arbeitsrecht: ASGG-Varianten je Rolle", () => {
    const k = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "arbeitsrecht",
      parteirolle: "klaeger",
    });
    expect(k.map((p) => p.type)).toContain("asg_klage");
    const b = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "arbeitsrecht",
      parteirolle: "beklagter",
    });
    expect(b.map((p) => p.type)).toContain("klagebeantwortung");
  });

  it("verwaltungsrecht: VwGVG-Paket unabhängig von der Rolle", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "verwaltungsrecht",
      parteirolle: "klaeger",
    });
    const types = pkgs.map((p) => p.type);
    expect(types).toContain("beschwerde_vwgvg");
    expect(types).toContain("saeumnisbeschwerde");
    expect(types).toContain("revision_vwgh_vorpruefung");
  });

  it("DE/CH/EU keep their static sets regardless of Verfahrenstyp", () => {
    expect(
      resolveDraftPackages({ jurisdiction: "de", verfahrenstyp: "zivil", parteirolle: "beklagter" })
    ).toEqual(STATIC_PACKAGES_DE);
  });

  it("every package set has unique types and a Versand-Checkliste", () => {
    const combos: Array<Parameters<typeof resolveDraftPackages>[0]> = [
      { jurisdiction: "at", verfahrenstyp: "zivil", parteirolle: "klaeger" },
      { jurisdiction: "at", verfahrenstyp: "zivil", parteirolle: "beklagter" },
      { jurisdiction: "at", verfahrenstyp: "zivil", parteirolle: "unbekannt" },
      { jurisdiction: "at", verfahrenstyp: "arbeitsrecht", parteirolle: "klaeger" },
      { jurisdiction: "at", verfahrenstyp: "arbeitsrecht", parteirolle: "beklagter" },
      { jurisdiction: "at", verfahrenstyp: "verwaltungsrecht" },
      { jurisdiction: "at", verfahrenstyp: "straf" },
    ];
    for (const combo of combos) {
      const pkgs = resolveDraftPackages(combo);
      const types = pkgs.map((p) => p.type);
      expect(new Set(types).size).toBe(types.length);
      expect(types).toContain("versand_checkliste");
    }
  });

  it("Kostenverzeichnis-Paket verbietet dem LLM das Selberrechnen", () => {
    const pkgs = resolveDraftPackages({
      jurisdiction: "at",
      verfahrenstyp: "zivil",
      parteirolle: "klaeger",
    });
    const kv = pkgs.find((p) => p.type === "kostenverzeichnis");
    expect(kv?.hinweis).toContain("RECHNE KEINE");
  });
});

describe("detectParteirolle", () => {
  const entities = [
    { name: "Max Mustermann", role: "opfer" },
    { name: "Firma Gegner GmbH", role: "beschuldigter" },
    { name: "Dr. Anwalt", role: "anwalt" },
  ];

  it("explicit override wins", () => {
    expect(detectParteirolle(entities, { parteirolle: "beklagter" })).toBe("beklagter");
  });

  it("client with Kläger-side role → klaeger", () => {
    expect(detectParteirolle(entities, { client: "Max Mustermann" })).toBe("klaeger");
  });

  it("client with Beklagten-side role → beklagter", () => {
    expect(detectParteirolle(entities, { client: "Firma Gegner GmbH" })).toBe("beklagter");
  });

  it("partial name match works (case-insensitive)", () => {
    expect(detectParteirolle(entities, { client: "mustermann" })).toBe("klaeger");
  });

  it("no client / no match → unbekannt", () => {
    expect(detectParteirolle(entities)).toBe("unbekannt");
    expect(detectParteirolle(entities, { client: "Unbekannte Person" })).toBe("unbekannt");
  });

  it("zivile Rollenbegriffe werden erkannt", () => {
    expect(
      detectParteirolle([{ name: "Alice Example", role: "klaegerin" }], { client: "Alice Example" })
    ).toBe("klaeger");
    expect(
      detectParteirolle([{ name: "Widget Co", role: "beklagte partei" }], { client: "Widget Co" })
    ).toBe("beklagter");
  });
});
