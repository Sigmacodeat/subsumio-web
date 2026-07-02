import { describe, it, expect } from "bun:test";
import {
  GATTUNGSZEICHEN_REGISTRY,
  parseGZ,
  pruefeGZKonsistenz,
  resolveGattungszeichen,
  validiereGZ,
} from "../src/core/legal/gz-validate.ts";

describe("parseGZ", () => {
  it("parses full GZ with Prüfzeichen and ON", () => {
    const p = parseGZ("10 C 125/95t - 2");
    expect(p).not.toBeNull();
    expect(p!.abteilung).toBe("10");
    expect(p!.gattungszeichen).toBe("C");
    expect(p!.aktenzahl).toBe("125");
    expect(p!.jahr).toBe("95");
    expect(p!.pruefzeichen).toBe("t");
    expect(p!.on).toBe("2");
  });

  it("parses StA-Aktenzeichen", () => {
    const p = parseGZ("39 St 116/22v");
    expect(p!.gattungszeichen).toBe("St");
    expect(p!.jahr).toBe("22");
    expect(p!.on).toBeNull();
  });

  it("parses OGH-Zahl", () => {
    const p = parseGZ("4 Ob 12/24x");
    expect(p!.gattungszeichen).toBe("Ob");
  });

  it("tolerates missing Prüfzeichen", () => {
    const p = parseGZ("39 St 116/22");
    expect(p!.pruefzeichen).toBeNull();
  });

  it("parses sub-ON numbering", () => {
    const p = parseGZ("10 C 125/95t - 40.2.6");
    expect(p!.on).toBe("40.2.6");
  });

  it("returns null on garbage", () => {
    expect(parseGZ("Beschluss vom 3.5.")).toBeNull();
    expect(parseGZ("")).toBeNull();
  });
});

describe("Gattungszeichen registry", () => {
  it("has unique Zeichen", () => {
    const keys = GATTUNGSZEICHEN_REGISTRY.map((g) => g.zeichen);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves common Registerzeichen to Verfahrenstyp", () => {
    expect(resolveGattungszeichen("C")?.verfahrenstyp).toBe("zivil");
    expect(resolveGattungszeichen("Cga")?.verfahrenstyp).toBe("arbeitsrecht");
    expect(resolveGattungszeichen("Hv")?.verfahrenstyp).toBe("straf");
    expect(resolveGattungszeichen("St")?.verfahrenstyp).toBe("straf");
    expect(resolveGattungszeichen("E")?.verfahrenstyp).toBe("exekution");
    expect(resolveGattungszeichen("S")?.verfahrenstyp).toBe("insolvenz");
    expect(resolveGattungszeichen("Ob")?.ebene).toBe("OGH");
    expect(resolveGattungszeichen("Xyz")).toBeNull();
  });
});

describe("validiereGZ", () => {
  it("valid civil GZ passes", () => {
    const v = validiereGZ("10 C 125/95t");
    expect(v.gueltig).toBe(true);
    expect(v.verfahrenstyp).toBe("zivil");
    expect(v.befunde.filter((b) => b.schwere === "fehler")).toHaveLength(0);
  });

  it("unparseable GZ is a fehler", () => {
    const v = validiereGZ("kompletter Unsinn");
    expect(v.gueltig).toBe(false);
    expect(v.befunde.some((b) => b.code === "parse_fehler")).toBe(true);
  });

  it("flags OCR confusables that break the parse", () => {
    const v = validiereGZ("1O C l25/95t"); // O statt 0, l statt 1
    expect(v.gueltig).toBe(false);
    expect(v.befunde.some((b) => b.code === "ocr_verdacht")).toBe(true);
  });

  it("unknown Gattungszeichen is a warnung, not a fehler", () => {
    const v = validiereGZ("10 Zz 125/95t");
    expect(v.gueltig).toBe(true);
    expect(v.befunde.some((b) => b.code === "gattung_unbekannt")).toBe(true);
  });

  it("verfahrenstyp mismatch is flagged", () => {
    const v = validiereGZ("39 St 116/22v", { erwarteterVerfahrenstyp: "zivil" });
    expect(v.befunde.some((b) => b.code === "verfahrenstyp_abweichung")).toBe(true);
  });

  it("missing Prüfzeichen is only a hinweis", () => {
    const v = validiereGZ("39 St 116/22");
    expect(v.gueltig).toBe(true);
    expect(v.befunde.some((b) => b.code === "pruefzeichen_fehlt")).toBe(true);
  });

  it("uppercase Prüfzeichen is an OCR warnung", () => {
    const v = validiereGZ("10 C 125/95T");
    expect(v.befunde.some((b) => b.code === "pruefzeichen_grossbuchstabe")).toBe(true);
  });

  it("pluggable Prüfzeichen algorithm can fail the GZ", () => {
    const v = validiereGZ("10 C 125/95t", { pruefzeichenAlgorithmus: () => false });
    expect(v.gueltig).toBe(false);
    expect(v.befunde.some((b) => b.code === "pruefzeichen_falsch")).toBe(true);
  });

  it("implausible year is flagged", () => {
    const v = validiereGZ("10 C 125/31t"); // 1931
    expect(v.befunde.some((b) => b.code === "jahr_unplausibel")).toBe(true);
  });
});

describe("pruefeGZKonsistenz", () => {
  it("uniform Akt is einheitlich", () => {
    const r = pruefeGZKonsistenz(["10 C 125/95t - 1", "10 C 125/95t - 2", "10 C 125/95t - 3"]);
    expect(r.einheitlich).toBe(true);
    expect(r.leitzahl).toBe("10 C 125/95t");
    expect(r.abweichungen).toHaveLength(0);
  });

  it("detects a single OCR deviation", () => {
    const r = pruefeGZKonsistenz([
      "10 C 125/95t - 1",
      "10 C 125/95t - 2",
      "10 C 126/95t - 3", // Aktenzahl 126 statt 125
    ]);
    expect(r.einheitlich).toBe(false);
    expect(r.leitzahl).toBe("10 C 125/95t");
    expect(r.abweichungen).toHaveLength(1);
    expect(r.abweichungen[0]!.raw).toContain("126");
  });

  it("unparseable entries are reported as Abweichung", () => {
    const r = pruefeGZKonsistenz(["10 C 125/95t - 1", "Müll"]);
    expect(r.einheitlich).toBe(false);
    expect(r.abweichungen.some((a) => a.grund === "nicht parsebar")).toBe(true);
  });

  it("empty input yields no Leitzahl", () => {
    const r = pruefeGZKonsistenz([]);
    expect(r.leitzahl).toBeNull();
    expect(r.einheitlich).toBe(false);
  });
});
