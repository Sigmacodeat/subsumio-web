import { describe, it, expect } from "vitest";
import { resolveRelativeDate, expandRelativeDates, hasRelativeDates } from "./relative-date";

// Fixed "now" for deterministic tests: 2026-07-13 (a Monday)
const NOW = new Date("2026-07-13T10:00:00+02:00");

describe("resolveRelativeDate", () => {
  it("resolves 'heute'", () => {
    expect(resolveRelativeDate("heute", NOW)).toBe("2026-07-13");
  });

  it("resolves 'morgen'", () => {
    expect(resolveRelativeDate("morgen", NOW)).toBe("2026-07-14");
  });

  it("resolves 'übermorgen' and 'uebermorgen'", () => {
    expect(resolveRelativeDate("übermorgen", NOW)).toBe("2026-07-15");
    expect(resolveRelativeDate("uebermorgen", NOW)).toBe("2026-07-15");
  });

  it("resolves 'gestern'", () => {
    expect(resolveRelativeDate("gestern", NOW)).toBe("2026-07-12");
  });

  it("resolves 'in 3 tagen'", () => {
    expect(resolveRelativeDate("in 3 tagen", NOW)).toBe("2026-07-16");
  });

  it("resolves 'in 2 wochen'", () => {
    expect(resolveRelativeDate("in 2 wochen", NOW)).toBe("2026-07-27");
  });

  it("resolves 'in 1 monat'", () => {
    expect(resolveRelativeDate("in 1 monat", NOW)).toBe("2026-08-13");
  });

  it("resolves 'nächste woche'", () => {
    expect(resolveRelativeDate("nächste woche", NOW)).toBe("2026-07-20");
  });

  it("resolves 'naechste woche' (ae variant)", () => {
    expect(resolveRelativeDate("naechste woche", NOW)).toBe("2026-07-20");
  });

  it("resolves 'nächster monat'", () => {
    expect(resolveRelativeDate("nächster monat", NOW)).toBe("2026-08-13");
  });

  it("resolves 'monatsende'", () => {
    expect(resolveRelativeDate("monatsende", NOW)).toBe("2026-07-31");
  });

  it("resolves 'anfang des monats'", () => {
    expect(resolveRelativeDate("anfang des monats", NOW)).toBe("2026-07-01");
  });

  it("resolves bare weekday 'montag' (next Monday from Monday = +7)", () => {
    // Monday 2026-07-13 → next Monday is 2026-07-20
    expect(resolveRelativeDate("montag", NOW)).toBe("2026-07-20");
  });

  it("resolves 'freitag' (next Friday from Monday)", () => {
    // Monday 2026-07-13 → Friday is 2026-07-17
    expect(resolveRelativeDate("freitag", NOW)).toBe("2026-07-17");
  });

  it("resolves 'nächster montag'", () => {
    // "nächster montag" from Monday → next Monday = 2026-07-20
    expect(resolveRelativeDate("nächster montag", NOW)).toBe("2026-07-20");
  });

  it("resolves 'am freitag' (from Monday)", () => {
    // Monday 2026-07-13 → Friday = 2026-07-17
    expect(resolveRelativeDate("am freitag", NOW)).toBe("2026-07-17");
  });

  it("passes through ISO dates", () => {
    expect(resolveRelativeDate("2026-07-15", NOW)).toBe("2026-07-15");
  });

  it("passes through DD.MM.YYYY dates", () => {
    expect(resolveRelativeDate("15.07.2026", NOW)).toBe("2026-07-15");
  });

  it("passes through DD.MM.YY dates", () => {
    expect(resolveRelativeDate("15.07.26", NOW)).toBe("2026-07-15");
  });

  it("returns null for unrecognized text", () => {
    expect(resolveRelativeDate("irgendein text", NOW)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveRelativeDate("", NOW)).toBeNull();
  });
});

describe("expandRelativeDates", () => {
  it("replaces 'morgen' in a sentence", () => {
    const result = expandRelativeDates("Termin morgen um 10 Uhr", NOW);
    expect(result).toBe("Termin 2026-07-14 um 10 Uhr");
  });

  it("replaces 'heute' in a sentence", () => {
    const result = expandRelativeDates("Frist heute", NOW);
    expect(result).toBe("Frist 2026-07-13");
  });

  it("replaces 'übermorgen' in a sentence", () => {
    const result = expandRelativeDates("Termin übermorgen 14:00", NOW);
    expect(result).toBe("Termin 2026-07-15 14:00");
  });

  it("replaces 'in 3 tagen'", () => {
    const result = expandRelativeDates("Frist in 3 tagen", NOW);
    expect(result).toBe("Frist 2026-07-16");
  });

  it("replaces 'nächste woche'", () => {
    const result = expandRelativeDates("Termin nächste Woche", NOW);
    expect(result).toBe("Termin 2026-07-20");
  });

  it("replaces 'freitag' in a sentence (from Monday)", () => {
    const result = expandRelativeDates("Termin freitag 14:00 Verhandlung", NOW);
    expect(result).toBe("Termin 2026-07-17 14:00 Verhandlung");
  });

  it("replaces multiple relative dates in one text", () => {
    const result = expandRelativeDates("Frist heute, Termin morgen, Verhandlung freitag", NOW);
    expect(result).toContain("2026-07-13"); // heute (Monday)
    expect(result).toContain("2026-07-14"); // morgen (Tuesday)
    expect(result).toContain("2026-07-17"); // freitag (Friday)
  });

  it("does not replace 'morgens' (adverb)", () => {
    const result = expandRelativeDates("ich arbeite morgens", NOW);
    expect(result).toBe("ich arbeite morgens");
  });

  it("does not modify text without relative dates", () => {
    const text = "Termin 15.07.2026 14:00 Verhandlung";
    expect(expandRelativeDates(text, NOW)).toBe(text);
  });

  it("handles 'am montag' (from Monday → next Monday)", () => {
    const result = expandRelativeDates("Termin am montag 10:00", NOW);
    expect(result).toBe("Termin 2026-07-20 10:00");
  });

  it("handles 'monatsende'", () => {
    const result = expandRelativeDates("Frist bis monatsende", NOW);
    expect(result).toBe("Frist bis 2026-07-31");
  });
});

describe("hasRelativeDates", () => {
  it("detects 'morgen'", () => {
    expect(hasRelativeDates("Termin morgen")).toBe(true);
  });

  it("detects 'heute'", () => {
    expect(hasRelativeDates("Frist heute")).toBe(true);
  });

  it("detects 'nächste woche'", () => {
    expect(hasRelativeDates("Termin nächste Woche")).toBe(true);
  });

  it("detects 'in 3 tagen'", () => {
    expect(hasRelativeDates("Frist in 3 tagen")).toBe(true);
  });

  it("detects bare weekday 'freitag'", () => {
    expect(hasRelativeDates("Termin freitag 14:00")).toBe(true);
  });

  it("returns false for plain dates", () => {
    expect(hasRelativeDates("Termin 15.07.2026 14:00")).toBe(false);
  });

  it("returns false for unrelated text", () => {
    expect(hasRelativeDates("Wie geht es dir?")).toBe(false);
  });

  it("does not false-positive on 'morgens'", () => {
    expect(hasRelativeDates("ich arbeite morgens")).toBe(false);
  });
});
