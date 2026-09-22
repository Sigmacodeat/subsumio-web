// @vitest-environment node

import { describe, expect, test } from "vitest";

import { calculateJvegSachverstaendiger, calculateJvegZeuge, JvegInputError } from "./jveg";

describe("calculateJvegZeuge — §§ 19–22 JVEG", () => {
  test("Zeitversäumnis: 4 €/h, begonnene Stunde voll", () => {
    const r = calculateJvegZeuge({ stunden: 2.5 });
    expect(r.stunden).toBe(3);
    expect(r.zeitversaeumnis).toBe(12);
    expect(r.gesamt).toBe(12);
  });

  test("Verdienstausfall schlägt Zeitversäumnis; Deckel 25 €/h", () => {
    const r = calculateJvegZeuge({ stunden: 4, bruttoverdienstProStunde: 40 });
    expect(r.verdienstausfall).toBe(100); // 25 × 4
    expect(r.zeitversaeumnis).toBe(0);
  });

  test("Haushaltsführung wenn kein Verdienstausfall", () => {
    const r = calculateJvegZeuge({ stunden: 3, haushaltsfuehrung: true });
    expect(r.haushaltsfuehrung).toBe(42);
    expect(r.zeitversaeumnis).toBe(0);
  });

  test("Fahrtkosten Kfz 0,42 €/km", () => {
    const r = calculateJvegZeuge({ stunden: 1, fahrtKm: 50 });
    expect(r.fahrtkosten).toBe(21);
    expect(r.gesamt).toBe(25);
  });

  test("mehr als 10 Stunden/Tag → Fehler", () => {
    expect(() => calculateJvegZeuge({ stunden: 11 })).toThrow(JvegInputError);
  });
});

describe("calculateJvegSachverstaendiger — § 9 JVEG Anlage 1", () => {
  test("Honorargruppe M1 = 75 €/h", () => {
    const r = calculateJvegSachverstaendiger({ honorargruppe: "M1", stunden: 10 });
    expect(r.honorar).toBe(750);
    expect(r.gesamtNetto).toBe(750);
  });

  test("M13 = 160 €/h", () => {
    const r = calculateJvegSachverstaendiger({ honorargruppe: "M13", stunden: 5 });
    expect(r.honorar).toBe(800);
  });

  test("Auslagenpauschale § 12: 10 %, max 75 €", () => {
    const klein = calculateJvegSachverstaendiger({
      honorargruppe: "M1",
      stunden: 4,
      auslagenpauschale: true,
    });
    expect(klein.auslagenpauschale).toBe(30);
    const gross = calculateJvegSachverstaendiger({
      honorargruppe: "M13",
      stunden: 10,
      auslagenpauschale: true,
    });
    expect(gross.auslagenpauschale).toBe(75);
  });

  test("unbekannte Gruppe wirft", () => {
    expect(() => calculateJvegSachverstaendiger({ honorargruppe: "M99", stunden: 1 })).toThrow(
      JvegInputError
    );
  });
});
