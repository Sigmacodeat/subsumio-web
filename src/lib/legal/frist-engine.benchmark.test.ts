/**
 * Fristen-Extraktion Benchmark — CI-runnable version.
 *
 * Mirrors the expected values from server/src/eval/fristen-extraction/run.ts
 * but as a vitest test that runs without any external dependencies (no engine,
 * no DB, no API). This is the release gate for the deterministic frist-engine.
 *
 * Tests:
 *   - 5 case-file deadlines (Berufung, Bescheidbeschwerde, Widerspruch)
 *   - 2 verhandlungsfreie Zeit edge cases (§ 222 ZPO Hemmung)
 *   - Vorfrist computation for each
 */

import { describe, test, expect } from "vitest";
import {
  berechneFristAuto,
  klassifiziereFrist,
  istWerktag,
  naechsterWerktag,
} from "@/lib/legal/frist-engine";

describe("Fristen-Extraktion Benchmark (CI Release Gate)", () => {
  describe("Case-file deadlines", () => {
    test("Müller gegen Huber — Berufungsfrist 4 Wochen ab 20.03.2026", () => {
      const result = berechneFristAuto("berufung", "2026-03-20");
      expect(result.fristende).toBe("2026-04-17");
      expect(result.vorfrist).toBe("2026-04-10");
      expect(result.art.key).toBe("berufung");
      expect(result.art.rechtsgrundlage).toBe("§ 464 Abs 1 ZPO");
      expect(result.kalendertage).toBe(28);
    });

    test("Schwarz gegen Wagner — Bescheidbeschwerde 4 Wochen ab 16.03.2026 (ERV folgender Werktag)", () => {
      const result = berechneFristAuto("beschwerde_vwgvg", "2026-03-16");
      expect(result.fristende).toBe("2026-04-13");
      // Vorfrist: 7 Tage vor 13.4. = 6.4. (Ostermontag!) → zurück auf Fr 3.4.
      expect(result.vorfrist).toBe("2026-04-03");
      expect(result.art.regime).toBe("avg");
    });

    test("Pichler gegen Gemeinde — Bescheidbeschwerde ab Zustellung ohne Nachweis 17.02.2026", () => {
      const result = berechneFristAuto("beschwerde_vwgvg", "2026-02-17");
      expect(result.fristende).toBe("2026-03-17");
      expect(result.vorfrist).toBe("2026-03-10");
    });

    test("Eberhard gegen Versicherung — Berufungsfrist 4 Wochen ab 08.04.2026", () => {
      const result = berechneFristAuto("berufung", "2026-04-08");
      expect(result.fristende).toBe("2026-05-06");
      expect(result.vorfrist).toBe("2026-04-29");
    });

    test("Reiter gegen Bank — Widerspruch Versäumungsurteil 14 Tage ab 22.05.2026", () => {
      const result = berechneFristAuto("widerspruch_versaeumungsurteil", "2026-05-22");
      expect(result.fristende).toBe("2026-06-05");
      expect(result.vorfrist).toBe("2026-05-29");
      expect(result.art.rechtsgrundlage).toBe("§ 397a Abs 1 ZPO");
    });
  });

  describe("Verhandlungsfreie Zeit (§ 222 ZPO) edge cases", () => {
    test("Berufung zugestellt in Sommer-vhfZ (20.07.2026) — Hemmung um Rest", () => {
      const result = berechneFristAuto("berufung", "2026-07-20");
      // Fristbeginn in vhfZ (15.07.–17.08.)
      // Rest bis 17.08. = 28 Tage; roh = 20.7.+28 = 17.8.; +28 = 14.9. (Montag)
      expect(result.fristende).toBe("2026-09-14");
      expect(result.vorfrist).toBe("2026-09-07");
      expect(result.hinweise.some((h) => h.includes("verhandlungsfreie"))).toBe(true);
    });

    test("Berufung zugestellt vor vhfZ, vhfZ fällt in Fristenlauf (01.07.2026)", () => {
      const result = berechneFristAuto("berufung", "2026-07-01");
      // roh = 29.7.; 15.7. liegt in [2.7., 29.7.]
      // → +34 Tage = 1.9.2026 (Dienstag)
      expect(result.fristende).toBe("2026-09-01");
      expect(result.vorfrist).toBe("2026-08-25");
      expect(result.hinweise.some((h) => h.includes("ganze Dauer"))).toBe(true);
    });
  });

  describe("Fristenbuch-Klassifikation (Ampel)", () => {
    test("ueberfaellig — Fristende liegt vor heute", () => {
      expect(klassifiziereFrist("2020-01-01", "2026-07-12")).toBe("ueberfaellig");
    });

    test("kritisch — ≤ 2 Werktage bis Fristende", () => {
      // 2026-07-14 is Tuesday, 2026-07-13 is Monday → 1 Werktag
      expect(klassifiziereFrist("2026-07-14", "2026-07-13")).toBe("kritisch");
    });

    test("ok — mehr als 7 Tage bis Fristende", () => {
      expect(klassifiziereFrist("2026-12-31", "2026-07-12")).toBe("ok");
    });
  });

  describe("Werktag-Logik", () => {
    test("Samstag ist kein Werktag", () => {
      // 2026-07-11 is Saturday
      expect(istWerktag("2026-07-11")).toBe(false);
    });

    test("Sonntag ist kein Werktag", () => {
      // 2026-07-12 is Sunday
      expect(istWerktag("2026-07-12")).toBe(false);
    });

    test("Nationalfeiertag (26.10.) ist kein Werktag", () => {
      expect(istWerktag("2026-10-26")).toBe(false);
    });

    test("naechsterWerktag nach Samstag ist Montag", () => {
      // 2026-07-11 is Saturday → next workday is Monday 2026-07-13
      expect(naechsterWerktag("2026-07-11")).toBe("2026-07-13");
    });
  });

  describe("FRISTEN_REGISTRY completeness", () => {
    test("all 20 Fristarten are resolvable", () => {
      const keys = [
        "klagebeantwortung",
        "einspruch_zahlungsbefehl",
        "berufung",
        "berufungsbeantwortung",
        "revision",
        "rekurs",
        "revisionsrekurs",
        "widerspruch_versaeumungsurteil",
        "wiedereinsetzung",
        "einspruch_rechtsverletzung_stpo",
        "beschwerde_stpo",
        "berufungsanmeldung_stpo",
        "berufungsausfuehrung_stpo",
        "beschwerde_vwgvg",
        "revision_vwgh",
        "beschwerde_vfgh",
        "vorstellung_avg",
        "verjaehrung_kurz",
        "verjaehrung_lang",
        "gewaehrleistung_beweglich",
      ];
      for (const key of keys) {
        const result = berechneFristAuto(key, "2026-01-15");
        expect(result.art.key).toBe(key);
        expect(result.fristende).toBeTruthy();
        expect(result.vorfrist).toBeTruthy();
      }
    });
  });
});
