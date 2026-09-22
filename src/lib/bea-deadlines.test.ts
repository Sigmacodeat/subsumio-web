// @vitest-environment node

import { describe, test, expect } from "vitest";
import { beaDeadlineSuggestions, eebZustellungsdatum } from "./bea-deadlines";
import { berechneFristArtDE, zustellungBea } from "@/lib/legal/frist-engine-de";

describe("eebZustellungsdatum", () => {
  test("gilt am Tag nach dem Bereitstellen als zugestellt (§ 4 ERVG)", () => {
    // 2026-09-17 ist ein Donnerstag → Zustellung Freitag 18.09.
    expect(eebZustellungsdatum("2026-09-17")).toBe("2026-09-18");
  });

  test("Sonnabend-Fiktion: Bereitstellung Freitag → nächster Werktag", () => {
    // 2026-09-18 Fr bereitgestellt → 19.09. ist Sonnabend → Montag 21.09.
    expect(eebZustellungsdatum("2026-09-18")).toBe("2026-09-21");
    expect(eebZustellungsdatum("2026-09-18")).toBe(zustellungBea("2026-09-18"));
  });

  test("akzeptiert ISO-Datetime (wird auf das Datum geschnitten)", () => {
    expect(eebZustellungsdatum("2026-09-17T14:32:11.000Z")).toBe("2026-09-18");
  });

  test("ungültige oder fehlende Daten → null", () => {
    expect(eebZustellungsdatum(undefined)).toBeNull();
    expect(eebZustellungsdatum("")).toBeNull();
    expect(eebZustellungsdatum("17.09.2026")).toBeNull();
    expect(eebZustellungsdatum("not-a-date")).toBeNull();
  });
});

describe("beaDeadlineSuggestions", () => {
  const BERUFUNG_TEXT =
    "Sehr geehrte Damen und Herren, übersende das Urteil des AG Hamburg. " +
    "Die Berufungsfrist beträgt einen Monat ab Zustellung.";

  test("verankert erkannte Fristart auf dem eEB-Zustelltag (DE-Engine)", () => {
    const out = beaDeadlineSuggestions({
      text: BERUFUNG_TEXT,
      receivedDate: "2026-09-17",
      sourceLabel: "beA: Urteil AG Hamburg",
    });
    expect(out.length).toBeGreaterThanOrEqual(1);
    const berufung = out.find((s) => /berufung/i.test(s.title));
    expect(berufung).toBeDefined();
    // eEB: 17.09. bereitgestellt → 18.09. zugestellt → Berufung 1 Monat (§ 517 ZPO)
    expect(berufung!.due_date).toBe(
      berechneFristArtDE("berufung_de", zustellungBea("2026-09-17")).fristende
    );
    expect(berufung!.confirmed).toBe(false);
    expect(berufung!.urgency).toBe("high");
    expect(berufung!.source).toBe("beA: Urteil AG Hamburg");
  });

  test("relative Frist ohne Mapping wird auf den eEB-Tag verankert", () => {
    const out = beaDeadlineSuggestions({
      text: "Bitte nehmen Sie binnen zwei Wochen Stellung.",
      receivedDate: "2026-09-17",
      sourceLabel: "beA: Schriftsatz",
    });
    // eEB 18.09. + 14 Tage = 02.10.
    expect(out.some((s) => s.due_date === "2026-10-02")).toBe(true);
  });

  test("ohne eEB-Datum bleibt die relative Frist unverankert (kein Vorschlag)", () => {
    const out = beaDeadlineSuggestions({
      text: "Bitte nehmen Sie binnen zwei Wochen Stellung.",
      sourceLabel: "beA: Schriftsatz",
    });
    expect(out).toHaveLength(0);
  });

  test("absolute Daten aus dem Text kommen auch ohne eEB-Tag durch", () => {
    const out = beaDeadlineSuggestions({
      text: "Klagebeantwortung bitte bis 15.10.2026 einreichen.",
      sourceLabel: "beA: Anordnung",
    });
    expect(out.some((s) => s.due_date === "2026-10-15")).toBe(true);
  });

  test("AT-only-Templates (VwGH) erzeugen keinen DE-Registry-Vorschlag", () => {
    const out = beaDeadlineSuggestions({
      text: "Die Revision an den VwGH ist binnen der Frist einzubringen.",
      receivedDate: "2026-09-17",
      sourceLabel: "beA: Erkenntnis",
    });
    // revision_vwgh hat kein DE-Mapping und kein absolutes Datum → verworfen
    expect(out.every((s) => !/vwgh/i.test(s.title))).toBe(true);
  });

  test("keine Fristen im Text → leere Liste", () => {
    expect(
      beaDeadlineSuggestions({
        text: "Terminsbestätigung ohne jede Fristangabe.",
        receivedDate: "2026-09-17",
        sourceLabel: "beA: Info",
      })
    ).toHaveLength(0);
  });

  test("kappt auf 5 Vorschläge pro Nachricht", () => {
    const text = Array.from(
      { length: 10 },
      (_, i) => `Frist ${i + 1}: bis ${10 + i}.11.2026.`
    ).join("\n");
    const out = beaDeadlineSuggestions({
      text,
      receivedDate: "2026-09-17",
      sourceLabel: "beA: Sammelverfügung",
    });
    expect(out.length).toBeLessThanOrEqual(5);
  });
});
