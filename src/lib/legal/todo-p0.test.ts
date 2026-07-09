/**
 * todo-p0.test.ts — Tests for P0 TODOs 1, 3, 4.
 *
 * TODO 1: Kanonisches Fristen-Domänenmodell — date field deprecated, due_date canonical
 * TODO 3: Notfrist-Enforcement — server-side guard rejects done without second_check
 * TODO 4: ERV-Zustelldatum in computeDueDate
 */
import { describe, it, expect } from "vitest";
import {
  computeDueDate,
  calculateDeadline,
  computeDeadlineStatus,
  timelineToDeadline,
  DEADLINE_RULES,
} from "@/lib/legal-deadlines";
import { canonicalDeadlineDate } from "@/lib/legal-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── TODO 1: Kanonisches Fristen-Domänenmodell ──────────────────

describe("TODO 1: Canonical Fristen-Domänenmodell", () => {
  it("canonicalDeadlineDate returns due_date when present", () => {
    expect(canonicalDeadlineDate({ due_date: "2026-07-15", date: "2026-07-10" })).toBe(
      "2026-07-15"
    );
  });

  it("canonicalDeadlineDate falls back to date when due_date absent", () => {
    expect(canonicalDeadlineDate({ date: "2026-07-10" })).toBe("2026-07-10");
  });

  it("canonicalDeadlineDate returns undefined when neither present", () => {
    expect(canonicalDeadlineDate({})).toBeUndefined();
  });

  it("calculateDeadline no longer writes deprecated date field", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const result = calculateDeadline(rule, "2026-07-01");
    expect(result.due_date).toBeDefined();
    expect(result.date).toBeUndefined();
  });

  it("timelineToDeadline no longer writes deprecated date field", () => {
    const result = timelineToDeadline(
      { id: "t1", date: "2026-07-15", title: "Test", type: "deadline" },
      "test"
    );
    expect(result.due_date).toBe("2026-07-15");
    expect(result.date).toBeUndefined();
  });

  it("DeadlineEntry type has date field removed (canonical due_date only)", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/legal-types.ts"), "utf-8");
    expect(source).toContain("canonicalDeadlineDate");
    // date field should no longer be in DeadlineEntry interface
    expect(source).not.toContain("@deprecated");
    expect(source).toContain("Canonical deadline date. The only date field");
  });
});

// ── TODO 3: Notfrist-Enforcement ───────────────────────────────

describe("TODO 3: Notfrist-Enforcement server-side guard", () => {
  it("server-side guard code exists in pages/[...slug] route", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/pages/[...slug]/route.ts"),
      "utf-8"
    );
    expect(source).toContain("notfrist_second_check_required");
    expect(source).toContain("is_notfrist");
    expect(source).toContain("second_check_required");
    expect(source).toContain("second_check_at");
    expect(source).toContain("second_check_by");
  });

  it("DeadlineQuickCreateDialog has Notfrist + Vier-Augen dialog", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/legal/DeadlineQuickCreateDialog.tsx"),
      "utf-8"
    );
    expect(source).toContain("is_notfrist");
    expect(source).toContain("second_check_required");
    expect(source).toContain("Vier-Augen");
  });

  it("deadlines page has Vier-Augen confirmation flow", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/dashboard/deadlines/page.tsx"),
      "utf-8"
    );
    expect(source).toContain("secondCheckTarget");
    expect(source).toContain("confirmSecondCheck");
    expect(source).toContain("second_check_at");
  });

  it("server-side guard also checks deadlines array within legal_case pages", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/pages/[...slug]/route.ts"),
      "utf-8"
    );
    // Case 2: guard must inspect fm.deadlines[] for status:done on notfrist items
    expect(source).toContain("Array.isArray(fm.deadlines)");
    expect(source).toContain('dl.status === "done"');
    expect(source).toContain("dl.is_notfrist === true");
    expect(source).toContain("dl.second_check_by");
    expect(source).toContain("dl.second_check_at");
  });
});

// ── TODO 4: ERV-Zustelldatum in computeDueDate ─────────────────

describe("TODO 4: ERV-Zustelldatum in Fristberechnung", () => {
  it("computeDueDate accepts ervZustelldatum parameter", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const result = computeDueDate(rule, "2026-07-01", undefined, undefined, "2026-07-05");
    // Should calculate from 2026-07-05 (ERV), not 2026-07-01
    expect(result.dueDate).toBeDefined();
    expect(result.note).toContain("ERV-Zustelldatum");
    expect(result.note).toContain("§ 173 ZPO");
  });

  it("ERV-Zustelldatum shifts the start date for calculation", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-verteidigungsanzeige")!;
    // 14 days from 2026-07-01 = 2026-07-15
    const withoutErv = computeDueDate(rule, "2026-07-01");
    // 14 days from 2026-07-10 (ERV) = 2026-07-24
    const withErv = computeDueDate(rule, "2026-07-01", undefined, undefined, "2026-07-10");
    expect(withErv.dueDate).not.toBe(withoutErv.dueDate);
    // July 10 + 14 days = July 24 (Friday, no shift needed)
    expect(withErv.dueDate).toBe("2026-07-24");
  });

  it("ERV note shows discrepancy when startDate differs", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const result = computeDueDate(rule, "2026-07-01", undefined, undefined, "2026-07-10");
    expect(result.note).toContain("statt 2026-07-01");
  });

  it("ERV note does not show discrepancy when startDate matches", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const result = computeDueDate(rule, "2026-07-10", undefined, undefined, "2026-07-10");
    expect(result.note).toContain("ERV-Zustelldatum");
    expect(result.note).not.toContain("statt");
  });

  it("computeDeadlineStatus already handles ERV-Zustelldatum (E3)", () => {
    // ERV in future → pending (service not effected yet)
    const status = computeDeadlineStatus("2026-07-15", undefined, undefined, "2026-12-01");
    expect(status).toBe("pending");
  });
});
