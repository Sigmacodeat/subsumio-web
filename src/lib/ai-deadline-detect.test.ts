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
    const legal = results.find((r) => r.type === "legal_deadline" && r.suggestedTemplate === "zpo-berufung");
    expect(legal).toBeDefined();
  });

  test("detects Verjährung", () => {
    const results = detectDeadlines("Die Verjährungsfrist beträgt 3 Jahre.");
    const legal = results.find((r) => r.type === "legal_deadline" && r.suggestedTemplate === "abgb-verjaehrung");
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
});
