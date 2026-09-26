import { describe, expect, it } from "bun:test";
import {
  extractCaseFactsDeterministic,
  groundLlmCaseFacts,
  groundLlmParties,
  mergeCaseFacts,
  parseEuroBetrag,
} from "../src/core/legal/case-facts.ts";

const KLAGE = `An das
Landesgericht für Zivilrechtssachen Wien
Schmerlingplatz 11, 1011 Wien

Klagende Partei: Anna Beispiel, geb. 01.01.1980, Musterstraße 1, 1010 Wien
vertreten durch: Dr. Max Anwalt, Rechtsanwalt in 1010 Wien
Beklagte Partei: Widget-Co GmbH, FN 123456a, Industriestraße 5, 1100 Wien
vertreten durch: Mag. Erika Kollegin, Rechtsanwältin in Wien

wegen: EUR 25.000,-- s.A.

KLAGE`;

const BESCHLUSS = `Bezirksgericht Innere Stadt Wien
Marxergasse 1a, 1030 Wien
GZ 12 C 345/26k - 7

Beschluss
Klagende Partei: Anna Beispiel, vertreten durch Dr. Max Anwalt
Beklagte Partei: Widget-Co GmbH
Streitwert: EUR 8.450,00`;

describe("extractCaseFactsDeterministic", () => {
  it("reads court, parties and representatives from a Klage header", () => {
    const f = extractCaseFactsDeterministic(KLAGE);
    expect(f.gericht?.value).toBe("Landesgericht für Zivilrechtssachen Wien");
    expect(f.streitwert?.value).toBe(25000);
    expect(f.parteien).toEqual([
      {
        name: "Anna Beispiel",
        role: "klagende_partei",
        vertreter: "Dr. Max Anwalt",
        method: "regex",
      },
      {
        name: "Widget-Co GmbH",
        role: "beklagte_partei",
        vertreter: "Mag. Erika Kollegin",
        method: "regex",
      },
    ]);
    expect(f.geschaeftszahl).toBeUndefined();
  });

  it("reads the labelled Geschäftszahl with Prüfbuchstabe and the Streitwert line", () => {
    const f = extractCaseFactsDeterministic(BESCHLUSS);
    expect(f.gericht?.value).toBe("Bezirksgericht Innere Stadt Wien");
    expect(f.geschaeftszahl?.value).toBe("12 C 345/26k");
    expect(f.streitwert?.value).toBe(8450);
    expect(f.parteien[0]).toMatchObject({ name: "Anna Beispiel", vertreter: "Dr. Max Anwalt" });
  });

  it("does not take prose like '1 und 2/25' for a Geschäftszahl", () => {
    expect(extractCaseFactsDeterministic("Punkt 1 und 2/25 der Vereinbarung").geschaeftszahl).toBe(
      undefined
    );
  });
});

describe("model values are grounded", () => {
  it("drops parties and facts that are not in the document", () => {
    const parties = groundLlmParties(
      ["Anna Beispiel", { name: "Erfundene AG", role: "beklagte_partei" }, { name: "" }],
      KLAGE
    );
    expect(parties.map((p) => p.name)).toEqual(["Anna Beispiel"]);
    const facts = groundLlmCaseFacts(
      { gericht: "Handelsgericht Wien", geschaeftszahl: "3 Cg 1/26a", streitwert: "EUR 25.000,--" },
      KLAGE
    );
    expect(facts.gericht).toBeUndefined();
    expect(facts.geschaeftszahl).toBeUndefined();
    expect(facts.streitwert?.value).toBe(25000);
  });

  it("regex wins over the model", () => {
    const merged = mergeCaseFacts(extractCaseFactsDeterministic(BESCHLUSS), {
      geschaeftszahl: { value: "99 C 1/26a", quote: "x", method: "llm" },
      parteien: [{ name: "Widget-Co GmbH", role: "sonstige", method: "llm" }],
    });
    expect(merged.geschaeftszahl?.value).toBe("12 C 345/26k");
    expect(merged.parteien.filter((p) => p.name === "Widget-Co GmbH")).toHaveLength(1);
  });
});

describe("parseEuroBetrag", () => {
  it.each([
    ["8.450,00", 8450],
    ["25.000,--", 25000],
    ["1200", 1200],
    ["abc", null],
  ])("%s → %p", (raw, value) => {
    expect(parseEuroBetrag(raw)).toBe(value);
  });
});
