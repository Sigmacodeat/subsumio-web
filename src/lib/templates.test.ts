import { describe, expect, it } from "vitest";
import {
  extractVariableKeys,
  fillTemplate,
  hasUnfilledVariables,
  resolveKnownVariables,
} from "@/lib/templates";

describe("extractVariableKeys", () => {
  it("finds every unique {{key}} in order", () => {
    expect(extractVariableKeys("Sehr geehrte/r {{mandant}}, betreffend {{aktenzeichen}}.")).toEqual(
      ["mandant", "aktenzeichen"]
    );
  });

  it("deduplicates repeated keys", () => {
    expect(extractVariableKeys("{{az}} ... {{az}}")).toEqual(["az"]);
  });

  it("ignores malformed braces", () => {
    expect(extractVariableKeys("{{ }} {not a var}")).toEqual([]);
  });

  it("returns an empty array for a body without variables", () => {
    expect(extractVariableKeys("Plain text.")).toEqual([]);
  });
});

describe("fillTemplate", () => {
  it("replaces known variables and leaves unknown ones as the literal placeholder", () => {
    const out = fillTemplate("Hallo {{mandant}}, Az {{az}}.", { mandant: "Frau Muster" });
    expect(out).toBe("Hallo Frau Muster, Az {{az}}.");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(fillTemplate("{{ mandant }}", { mandant: "X" })).toBe("X");
  });

  it("treats an empty value the same as missing (keeps the placeholder)", () => {
    expect(fillTemplate("{{mandant}}", { mandant: "  " })).toBe("{{mandant}}");
  });
});

describe("hasUnfilledVariables", () => {
  it("detects a remaining placeholder", () => {
    expect(hasUnfilledVariables("Az {{az}}")).toBe(true);
  });
  it("returns false once everything is filled", () => {
    expect(hasUnfilledVariables("Az 123")).toBe(false);
  });
});

describe("resolveKnownVariables", () => {
  it("maps case fields to their German variable synonyms", () => {
    const vars = resolveKnownVariables(
      {
        client_name: "Frau Muster",
        opponent_name: "Beispiel GmbH",
        case_number: "26-0001",
        court_name: "BG Innere Stadt",
        own_lawyer_name: "Dr. Anwalt",
        dispute_value: 21200,
        title: "Muster ./. Beispiel",
      },
      null
    );
    expect(vars.mandant).toBe("Frau Muster");
    expect(vars.mandant_name).toBe("Frau Muster");
    expect(vars.gegner).toBe("Beispiel GmbH");
    expect(vars.aktenzeichen).toBe("26-0001");
    expect(vars.az).toBe("26-0001");
    expect(vars.gericht).toBe("BG Innere Stadt");
    expect(vars.anwalt).toBe("Dr. Anwalt");
    // The thousands separator de-AT formats with differs by ICU data
    // (period vs. narrow no-break space) between runtimes — assert on the
    // parts that must hold regardless, not the exact separator glyph.
    expect(vars.streitwert).toMatch(/^21.200,00 €$/);
    expect(vars.akte).toBe("Muster ./. Beispiel");
  });

  it("maps Kanzlei settings", () => {
    const vars = resolveKnownVariables(null, {
      kanzleiName: "Muster Rechtsanwälte",
      anwaltName: "",
      ustId: "ATU12345678",
      stundensatz: "200",
      abrechnungstakt: "15",
      zahlungszielTage: "14",
      rechnungFooter: "",
      tarifModell: "custom",
      rechtsgebietSaetze: {},
      street: "Ringstraße 1",
      zip: "1010",
      city: "Wien",
    });
    expect(vars.kanzlei_name).toBe("Muster Rechtsanwälte");
    expect(vars.kanzlei_adresse).toBe("Ringstraße 1, 1010 Wien");
    expect(vars.kanzlei_uid).toBe("ATU12345678");
  });

  it("always fills the date, even without case or Kanzlei data", () => {
    const vars = resolveKnownVariables(null, null);
    expect(vars.datum).toBeTruthy();
    expect(vars.heute).toBe(vars.datum);
  });
});
