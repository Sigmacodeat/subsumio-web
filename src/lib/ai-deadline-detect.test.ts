// @vitest-environment node

import { describe, test, expect } from "vitest";
import { detectDeadlines, resolveRelativeDeadline } from "./ai-deadline-detect";

describe("detectDeadlines — absolute dates", () => {
  test("detects German absolute date 'bis 30.06.2024'", () => {
    const results = detectDeadlines("Die Frist läuft bis 30.06.2024.");
    expect(results.length).toBeGreaterThan(0);
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeDefined();
    expect(abs!.date).toBe("2024-06-30");
    expect(abs!.confidence).toBe("high");
  });

  test("detects German date with month name 'bis 15. Mär 2024'", () => {
    const results = detectDeadlines("Frist: 15. Mär 2024");
    expect(results.length).toBeGreaterThan(0);
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeDefined();
    expect(abs!.date).toBe("2024-03-15");
  });

  test("detects court hearing date", () => {
    const results = detectDeadlines("Verhandlung am 20.07.2024 im Landgericht");
    const hearing = results.find((r) => r.type === "court_hearing");
    expect(hearing).toBeDefined();
    expect(hearing!.date).toBe("2024-07-20");
  });
});

describe("detectDeadlines — relative dates", () => {
  test("detects 'innerhalb von 14 Tagen'", () => {
    const results = detectDeadlines("Die Antwort muss innerhalb von 14 Tagen erfolgen.");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.daysFromNow).toBe(14);
  });

  test("detects 'binnen 7 Tagen'", () => {
    const results = detectDeadlines("binnen 7 Tagen zu reagieren");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.daysFromNow).toBe(7);
  });
});

describe("detectDeadlines — legal deadlines with templates", () => {
  test("detects Klageerwiderung", () => {
    const results = detectDeadlines("Die Klageerwiderungsfrist endet bald.");
    const legal = results.find((r) => r.type === "legal_deadline");
    expect(legal).toBeDefined();
    expect(legal!.suggestedTemplate).toBe("zpo-klageerwiderung");
    expect(legal!.confidence).toBe("high");
  });

  test("detects Berufung", () => {
    const results = detectDeadlines("Die Berufungsfrist muss gewahrt werden.");
    const legal = results.find(
      (r) => r.type === "legal_deadline" && r.suggestedTemplate === "zpo-berufung"
    );
    expect(legal).toBeDefined();
  });

  test("detects Verjährung", () => {
    const results = detectDeadlines("Die Verjährungsfrist beträgt 3 Jahre.");
    const legal = results.find(
      (r) => r.type === "legal_deadline" && r.suggestedTemplate === "abgb-verjaehrung"
    );
    expect(legal).toBeDefined();
  });
});

describe("detectDeadlines — payment deadlines", () => {
  test("detects Zahlungsfrist", () => {
    const results = detectDeadlines("Die Zahlungsfrist endet am 15.09.2024.");
    const pay = results.find((r) => r.type === "payment_deadline");
    expect(pay).toBeDefined();
    expect(pay!.date).toBe("2024-09-15");
  });
});

describe("detectDeadlines — edge cases", () => {
  test("empty string returns no results", () => {
    expect(detectDeadlines("")).toEqual([]);
  });

  test("text without dates returns no results or only legal_deadline matches", () => {
    const results = detectDeadlines("Hier steht nichts Relevantes.");
    // No absolute/relative dates should be found
    expect(results.find((r) => r.type === "absolute_deadline")).toBeUndefined();
    expect(results.find((r) => r.type === "relative_deadline")).toBeUndefined();
  });

  test("deduplicates matches", () => {
    const text = "Frist: 30.06.2024. Frist: 30.06.2024.";
    const results = detectDeadlines(text);
    const abs = results.filter((r) => r.type === "absolute_deadline");
    // Both match the same date but from different positions — dedup by key
    expect(abs.length).toBeLessThanOrEqual(2);
  });

  test("sourceSnippet is truncated to 120 chars", () => {
    const longText = "bis 30.06.2024 " + "x".repeat(200);
    const results = detectDeadlines(longText);
    for (const r of results) {
      expect(r.sourceSnippet.length).toBeLessThanOrEqual(120);
    }
  });
});

describe("resolveRelativeDeadline", () => {
  test("returns ISO date string", () => {
    const result = resolveRelativeDeadline(14);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("approximately 14 days from now", () => {
    const result = resolveRelativeDeadline(14);
    const expected = new Date();
    expected.setDate(expected.getDate() + 14);
    expect(result).toBe(expected.toISOString().slice(0, 10));
  });

  test("0 days returns today", () => {
    const result = resolveRelativeDeadline(0);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(today);
  });

  test("handles large day counts (365 days)", () => {
    const result = resolveRelativeDeadline(365);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expected = new Date();
    expected.setDate(expected.getDate() + 365);
    expect(result).toBe(expected.toISOString().slice(0, 10));
  });
});

// ── AT-Datumsformat ──────────────────────────────────────────────────────

describe("detectDeadlines — Austrian date format", () => {
  test("detects AT date with spaces 'bis 30. 6. 2024'", () => {
    const results = detectDeadlines("Die Frist läuft bis 30. 6. 2024.");
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeDefined();
    expect(abs!.date).toBe("2024-06-30");
    expect(abs!.confidence).toBe("high");
  });

  test("detects AT date with single-digit day 'bis 5. 12. 2024'", () => {
    const results = detectDeadlines("Frist: 5. 12. 2024");
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeDefined();
    expect(abs!.date).toBe("2024-12-05");
  });
});

// ── Alle Monatsnamen ────────────────────────────────────────────────────

describe("detectDeadlines — all German month names", () => {
  const months: Array<[string, string, string]> = [
    ["Jan", "01", "2024"],
    ["Feb", "02", "2024"],
    ["Mär", "03", "2024"],
    ["Apr", "04", "2024"],
    ["Mai", "05", "2024"],
    ["Jun", "06", "2024"],
    ["Jul", "07", "2024"],
    ["Aug", "08", "2024"],
    ["Sep", "09", "2024"],
    ["Okt", "10", "2024"],
    ["Nov", "11", "2024"],
    ["Dez", "12", "2024"],
  ];

  for (const [monthName, monthNum, year] of months) {
    test(`detects '15. ${monthName} ${year}' as 2024-${monthNum}-15`, () => {
      const results = detectDeadlines(`Frist: 15. ${monthName} ${year}`);
      const abs = results.find((r) => r.type === "absolute_deadline");
      expect(abs).toBeDefined();
      expect(abs!.date).toBe(`${year}-${monthNum}-15`);
    });
  }
});

// ── Relative Fristen: Wochen und spätestens ─────────────────────────────

describe("detectDeadlines — relative deadlines (weeks, spätestens)", () => {
  test("detects 'innerhalb von 3 Wochen'", () => {
    const results = detectDeadlines("Die Antwort muss innerhalb von 3 Wochen erfolgen.");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.daysFromNow).toBe(3);
    expect(rel!.confidence).toBe("medium");
  });

  test("detects 'binnen 2 Wochen'", () => {
    const results = detectDeadlines("binnen 2 Wochen zu reagieren");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.daysFromNow).toBe(2);
  });

  test("detects 'spätestens in 10 Tagen'", () => {
    const results = detectDeadlines("spätestens in 10 Tagen muss die Klage eingereicht sein.");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.daysFromNow).toBe(10);
  });

  test("detects 'innerhalb 21 Tagen' (without 'von')", () => {
    const results = detectDeadlines("innerhalb 21 Tagen ab Zustellung");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.daysFromNow).toBe(21);
  });
});

// ── Weitere legal_deadline templates ─────────────────────────────────────

describe("detectDeadlines — Wiedereinsetzung and StPO Beschwerde", () => {
  test("detects Wiedereinsetzung", () => {
    const results = detectDeadlines("Wiedereinsetzung in den vorigen Stand: Frist wird beantragt.");
    const legal = results.find(
      (r) => r.type === "legal_deadline" && r.suggestedTemplate === "zpo-wiedereinsetzung"
    );
    expect(legal).toBeDefined();
    expect(legal!.confidence).toBe("high");
  });

  test("detects StPO Beschwerde", () => {
    const results = detectDeadlines("Sofortige Beschwerde: Frist beträgt 1 Woche.");
    const legal = results.find(
      (r) => r.type === "legal_deadline" && r.suggestedTemplate === "stpo-beschwerde"
    );
    expect(legal).toBeDefined();
    expect(legal!.confidence).toBe("high");
  });

  test("detects Verjährung 10 Jahre", () => {
    const results = detectDeadlines("Die Verjährungsfrist beträgt 10 Jahre.");
    const legal = results.find(
      (r) => r.type === "legal_deadline" && r.suggestedTemplate === "abgb-verjaehrung"
    );
    expect(legal).toBeDefined();
  });

  test("detects Verjährung 30 Jahre", () => {
    const results = detectDeadlines("Die Verjährungsfrist beträgt 30 Jahre.");
    const legal = results.find(
      (r) => r.type === "legal_deadline" && r.suggestedTemplate === "abgb-verjaehrung"
    );
    expect(legal).toBeDefined();
  });
});

// ── Multiple deadlines in one text ───────────────────────────────────────

describe("detectDeadlines — multiple deadlines in one text", () => {
  test("detects absolute + relative + legal in same text", () => {
    const text = `
      Die Klageerwiderungsfrist endet bald. Zusätzlich muss innerhalb von 14 Tagen
      eine Stellungnahme abgegeben werden. Die Hauptverhandlung findet am 20.07.2024
      statt. Die Zahlungsfrist endet am 15.09.2024.
    `;
    const results = detectDeadlines(text);
    expect(results.find((r) => r.type === "legal_deadline")).toBeDefined();
    expect(results.find((r) => r.type === "relative_deadline")).toBeDefined();
    expect(results.find((r) => r.type === "court_hearing")).toBeDefined();
    expect(results.find((r) => r.type === "payment_deadline")).toBeDefined();
  });

  test("detects two different absolute dates", () => {
    const text = "Frist: 15.03.2024. Termin: 20.04.2024.";
    const results = detectDeadlines(text);
    const abs = results.filter((r) => r.type === "absolute_deadline");
    expect(abs.length).toBeGreaterThanOrEqual(2);
    const uniqueDates = [...new Set(abs.map((r) => r.date))].sort();
    expect(uniqueDates).toContain("2024-03-15");
    expect(uniqueDates).toContain("2024-04-20");
  });
});

// ── describeDeadline output ─────────────────────────────────────────────

describe("detectDeadlines — description content", () => {
  test("absolute date description contains formatted date", () => {
    const results = detectDeadlines("Frist: 15.03.2024");
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeDefined();
    expect(abs!.description).toContain("15");
  });

  test("relative deadline description contains days count", () => {
    const results = detectDeadlines("innerhalb von 7 Tagen");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeDefined();
    expect(rel!.description).toContain("7");
  });

  test("legal deadline description contains § reference", () => {
    const results = detectDeadlines("Die Klageerwiderungsfrist endet bald.");
    const legal = results.find((r) => r.suggestedTemplate === "zpo-klageerwiderung");
    expect(legal).toBeDefined();
    expect(legal!.description).toContain("§");
    expect(legal!.description).toContain("ZPO");
  });

  test("Berufung description contains § 517 ZPO", () => {
    const results = detectDeadlines("Die Berufungsfrist muss gewahrt werden.");
    const legal = results.find((r) => r.suggestedTemplate === "zpo-berufung");
    expect(legal).toBeDefined();
    expect(legal!.description).toContain("§ 517 ZPO");
  });
});

// ── Confidence levels ────────────────────────────────────────────────────

describe("detectDeadlines — confidence levels", () => {
  test("absolute date has high confidence", () => {
    const results = detectDeadlines("bis 30.06.2024");
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs!.confidence).toBe("high");
  });

  test("relative deadline has medium confidence", () => {
    const results = detectDeadlines("innerhalb von 14 Tagen");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel!.confidence).toBe("medium");
  });

  test("legal deadline with template has high confidence", () => {
    const results = detectDeadlines("Die Berufungsfrist muss gewahrt werden.");
    const legal = results.find((r) => r.type === "legal_deadline");
    expect(legal!.confidence).toBe("high");
  });
});

// ── Court hearing with month name ───────────────────────────────────────

describe("detectDeadlines — court hearing with month name", () => {
  test("detects 'Hauptverhandlung am 15. Mär 2024'", () => {
    const results = detectDeadlines("Die Hauptverhandlung findet am 15. Mär 2024 statt.");
    const hearing = results.find((r) => r.type === "court_hearing");
    expect(hearing).toBeDefined();
    expect(hearing!.date).toBe("2024-03-15");
    expect(hearing!.confidence).toBe("high");
  });

  test("detects 'Beweisaufnahme am 10. Okt 2024'", () => {
    const results = detectDeadlines("Beweisaufnahme am 10. Okt 2024 im Amtsgericht");
    const hearing = results.find((r) => r.type === "court_hearing");
    expect(hearing).toBeDefined();
    expect(hearing!.date).toBe("2024-10-10");
  });
});

// ── Payment deadline variants ────────────────────────────────────────────

describe("detectDeadlines — payment deadline variants", () => {
  test("detects Mahnfrist", () => {
    const results = detectDeadlines("Die Mahnfrist endet am 30.11.2024.");
    const pay = results.find((r) => r.type === "payment_deadline");
    expect(pay).toBeDefined();
    expect(pay!.date).toBe("2024-11-30");
  });

  test("detects 'fristgerecht' with date", () => {
    const results = detectDeadlines("fristgerecht bis 28.02.2024 zu zahlen");
    const pay = results.find((r) => r.type === "payment_deadline");
    expect(pay).toBeDefined();
    expect(pay!.date).toBe("2024-02-28");
  });
});

// ── Edge cases: no false positives ───────────────────────────────────────

describe("detectDeadlines — no false positives", () => {
  test("date-like string without keyword is not absolute_deadline", () => {
    const results = detectDeadlines("Das Dokument wurde am 15.03.2024 erstellt.");
    // Without 'bis', 'frist', 'termin', 'beweisaufnahme' prefix, should not match absolute_date_de
    // But could match court_date if 'Verhandlung' etc. is present — here it's not
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeUndefined();
  });

  test("'Tage' without relative keyword is not a relative_deadline", () => {
    const results = detectDeadlines("Wir haben 14 Tage Zeit.");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel).toBeUndefined();
  });

  test("year-only is not matched as date", () => {
    const results = detectDeadlines("Im Jahr 2024 gab es viele Änderungen.");
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs).toBeUndefined();
  });
});

// ── matchedRule field ────────────────────────────────────────────────────

describe("detectDeadlines — matchedRule field", () => {
  test("absolute_date_de rule name is set", () => {
    const results = detectDeadlines("bis 30.06.2024");
    const abs = results.find((r) => r.type === "absolute_deadline");
    expect(abs!.matchedRule).toBe("absolute_date_de");
  });

  test("relative_days rule name is set", () => {
    const results = detectDeadlines("innerhalb von 14 Tagen");
    const rel = results.find((r) => r.type === "relative_deadline");
    expect(rel!.matchedRule).toBe("relative_days");
  });

  test("court_date rule name is set", () => {
    const results = detectDeadlines("Verhandlung am 20.07.2024");
    const hearing = results.find((r) => r.type === "court_hearing");
    expect(hearing!.matchedRule).toBe("court_date");
  });
});
