import { describe, expect, it } from "vitest";
import { matchName, nearlyEqual, normaliseName, tokens } from "./match";
import type { SanctionsEntry } from "./eu-list";

const entry = (over: Partial<SanctionsEntry> & { names: string[] }): SanctionsEntry => ({
  reference: "EU.1.1",
  entityType: "person",
  primaryName: over.names[0],
  birthDates: [],
  countries: [],
  programmes: ["SYR"],
  ...over,
});

const list: SanctionsEntry[] = [
  entry({ names: ["Saddam Hussein Al-Tikriti", "Abu Ali"], birthDates: ["1937-04-28"] }),
  entry({ names: ["Ramzan Kadyrov", "Ramzan Akhmatovich Kadyrov"], birthDates: ["1976-10-05"] }),
  entry({ names: ["Bank Rossiya"], entityType: "enterprise", programmes: ["UKR"] }),
  entry({ names: ["Müller"], entityType: "person" }),
];

describe("Namensaufbereitung", () => {
  it("vereinheitlicht Umlaute, Akzente und Titel", () => {
    expect(normaliseName("Mag. Anna Müller-Öhler")).toBe("mag anna mueller oehler");
    expect(normaliseName("José Ángel")).toBe("jose angel");
    expect(tokens("Dr. Anna von Müller")).toEqual(["anna", "mueller"]);
  });

  it("erkennt einen Tippfehler, aber keine anderen Namen", () => {
    expect(nearlyEqual("kadyrov", "kadyrow")).toBe(true);
    expect(nearlyEqual("hussein", "husein")).toBe(true);
    expect(nearlyEqual("mayer", "meier")).toBe(false);
    expect(nearlyEqual("berg", "burg")).toBe(false);
  });
});

describe("Abgleich mit der Sanktionsliste", () => {
  it("findet den exakten Namen und nennt Programm und Geburtsdatum", () => {
    const [hit] = matchName("Ramzan Kadyrov", list);
    expect(hit).toMatchObject({
      matchedName: "Ramzan Kadyrov",
      kind: "exact",
      score: 1,
      programmes: ["SYR"],
      birthDates: ["1976-10-05"],
    });
  });

  it("findet umgedrehte Reihenfolge, Zwischennamen und Schreibvarianten", () => {
    expect(matchName("Kadyrov, Ramzan", list)[0]?.kind).toBe("exact");
    expect(matchName("Ramzan Akhmatovich Kadyrov", list)[0]?.score).toBe(1);
    expect(matchName("Ramzan Kadyrow", list)[0]?.kind).toBe("strong");
    expect(matchName("Saddam Husein Al Tikriti", list)[0]?.reference).toBe("EU.1.1");
  });

  it("bestätigt mit Geburtsdatum und schwächt bei abweichendem ab", () => {
    expect(matchName("Ramzan Kadyrov", list, { birthDate: "1976-10-05" })[0].score).toBe(1);
    const other = matchName("Ramzan Kadyrov", list, { birthDate: "1990-01-01" })[0];
    expect(other.score).toBeLessThan(1);
    expect(other.kind).not.toBe("exact");
  });

  it("meldet keine Treffer für gewöhnliche Kanzleinamen", () => {
    expect(matchName("Mag. Anna Berger", list)).toEqual([]);
    expect(matchName("Muster Werk GmbH", list)).toEqual([]);
    expect(matchName("Ramzan Ivanov", list)).toEqual([]);
  });

  it("meldet einen einzelnen Nachnamen nur gegen eine gleichnamige Listung", () => {
    expect(matchName("Müller", list)[0]?.matchedName).toBe("Müller");
    // "Kadyrov" alone must not match the two-part listing.
    expect(matchName("Kadyrov", list)).toEqual([]);
  });

  it("findet Unternehmen", () => {
    const [hit] = matchName("Bank Rossiya", list);
    expect(hit).toMatchObject({ entityType: "enterprise", kind: "exact" });
  });
});
