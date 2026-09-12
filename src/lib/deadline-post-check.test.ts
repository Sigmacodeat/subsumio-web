// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  checkSingleDeadline,
  parseDeadlineCalendarPage,
  type DeadlineCheckResult,
} from "./deadline-post-check";

describe("checkSingleDeadline", () => {
  test("returns null when no matching rule found", () => {
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test Case",
      "Unbekannte Frist",
      "2026-12-01",
      "2026-11-01"
    );
    expect(result).toBeNull();
  });

  test("matches Berufung by keyword and verifies correct date", () => {
    // Berufungsfrist: 4 Wochen ab Zustellung 2026-11-01 → 2026-12-01 (deterministisch)
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test Case",
      "Berufungsfrist",
      "2026-12-01",
      "2026-11-01",
      undefined,
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("ok");
    expect(result!.discrepancyDays).toBe(0);
    expect(result!.ruleKey).toBe("zpo-berufung");
  });

  test("flags critical discrepancy when AI date is far off", () => {
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test Case",
      "Berufungsfrist",
      "2026-12-15", // Way off from 2026-12-01
      "2026-11-01",
      undefined,
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("critical");
    expect(Math.abs(result!.discrepancyDays)).toBeGreaterThan(3);
  });

  test("flags warning when AI date is slightly off (1-3 days)", () => {
    // Deterministisch: 2026-12-01, AI: 2026-12-03 (2 days off)
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test Case",
      "Berufungsfrist",
      "2026-12-03",
      "2026-11-01",
      undefined,
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("warning");
    expect(Math.abs(result!.discrepancyDays)).toBeLessThanOrEqual(3);
    expect(Math.abs(result!.discrepancyDays)).toBeGreaterThan(0);
  });

  test("matches Einspruch gegen Versäumnisurteil", () => {
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test",
      "Einspruch gegen Versäumnisurteil",
      "2026-11-15",
      "2026-11-01",
      undefined,
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
    expect(result!.ruleKey).toBe("zpo-einspruch-vu");
  });

  test("matches Revision by keyword", () => {
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test",
      "Revisionsfrist",
      "2026-11-15",
      "2026-11-01",
      undefined,
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
    expect(result!.ruleKey).toBe("zpo-revision");
  });

  test("matches by exact law citation", () => {
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test",
      "Some Frist",
      "2026-12-01", // Matches deterministic date for Berufung from 2026-11-01
      "2026-11-01",
      "§ 517 ZPO",
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
  });

  test("returns structured result with all fields", () => {
    const result = checkSingleDeadline(
      "legal/cases/test",
      "Test Case Title",
      "Berufungsfrist",
      "2026-12-01",
      "2026-11-01",
      undefined,
      undefined,
      "AT"
    );
    expect(result).not.toBeNull();
    expect(result!.caseSlug).toBe("legal/cases/test");
    expect(result!.caseTitle).toBe("Test Case Title");
    expect(result!.deadlineLabel).toBe("Berufungsfrist");
    expect(result!.aiDate).toBe("2026-12-01");
    expect(result!.deterministicDate).toBeTruthy();
    expect(result!.ruleKey).toBeTruthy();
    expect(result!.ruleLaw).toBeTruthy();
    expect(result!.startDate).toBe("2026-11-01");
    expect(result!.note).toBeTruthy();
  });
});

describe("parseDeadlineCalendarPage", () => {
  test("parses markdown table with ISO dates", () => {
    const content = `| Frist | Datum | Gesetz |
| --- | --- | --- |
| Berufungsfrist | 2026-12-01 | § 514 ZPO |
| Einspruchsfrist | 2026-11-15 | § 336 ZPO |`;

    const entries = parseDeadlineCalendarPage(content, "legal/cases/test", "Test");
    expect(entries).toHaveLength(2);
    expect(entries[0]!.label).toBe("Berufungsfrist");
    expect(entries[0]!.date).toBe("2026-12-01");
    expect(entries[0]!.law).toBe("§ 514 ZPO");
  });

  test("parses German date format (DD.MM.YYYY)", () => {
    const content = `| Frist | Datum |
| --- | --- |
| Berufung | 01.12.2026 |`;

    const entries = parseDeadlineCalendarPage(content, "test", "Test");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.date).toBe("2026-12-01");
  });

  test("skips header and separator rows", () => {
    const content = `| Frist | Datum |
| --- | --- |
| Berufung | 2026-12-01 |`;

    const entries = parseDeadlineCalendarPage(content, "test", "Test");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toBe("Berufung");
  });

  test("returns empty array for empty content", () => {
    expect(parseDeadlineCalendarPage("", "test", "Test")).toEqual([]);
  });

  test("returns empty array for non-table content", () => {
    expect(parseDeadlineCalendarPage("Just some text\nwithout tables", "test", "Test")).toEqual([]);
  });

  test("skips rows with fewer than 2 cells", () => {
    const content = `| Frist |
| --- |
| Berufung |`;

    const entries = parseDeadlineCalendarPage(content, "test", "Test");
    expect(entries).toHaveLength(0);
  });

  test("extracts start date from zustellungsdatum cell", () => {
    const content = `| Frist | Datum | Zustellung |
| --- | --- | --- |
| Berufung | 2026-12-01 | ab dem 2026-11-01 |`;

    const entries = parseDeadlineCalendarPage(content, "test", "Test");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.startDate).toBe("2026-11-01");
  });

  test("falls back to date as start when no start date found", () => {
    const content = `| Frist | Datum |
| --- | --- |
| Berufung | 2026-12-01 |`;

    const entries = parseDeadlineCalendarPage(content, "test", "Test");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.startDate).toBe("2026-12-01");
  });
});
