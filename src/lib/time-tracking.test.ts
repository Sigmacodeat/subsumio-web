// @vitest-environment node

import { describe, test, expect } from "vitest";
import type { TimeEntry } from "@/lib/legal-types";
import {
  filterEntries,
  computeSummary,
  computeBillingSummary,
  markEntriesBilled,
  groupByCase,
  createTimeEntry,
  updateEntry,
  deleteEntry,
  type TimeEntryWithCase,
} from "@/lib/time-tracking";

// ── Fixtures ──

const FIXTURE_ENTRIES: TimeEntryWithCase[] = [
  { id: "t1", description: "Recherche", minutes: 60, date: "2026-01-15", rate: 200, billable: true, billed: false, lawyer: "Dr. Schmidt", activity_type: "research", case_slug: "case-1" },
  { id: "t2", description: "Klageentwurf", minutes: 120, date: "2026-01-20", rate: 250, billable: true, billed: false, lawyer: "Dr. Schmidt", activity_type: "drafting", case_slug: "case-1" },
  { id: "t3", description: "Mandantengespräch", minutes: 30, date: "2026-02-01", rate: 200, billable: true, billed: true, invoice_number: "INV-001", lawyer: "Dr. Müller", activity_type: "meeting", case_slug: "case-2" },
  { id: "t4", description: "Intern", minutes: 45, date: "2026-02-05", billable: false, billed: false, lawyer: "Dr. Schmidt", activity_type: "other", case_slug: "case-1" },
  { id: "t5", description: "Gerichtstermin", minutes: 180, date: "2026-02-10", rate: 300, billable: true, billed: false, lawyer: "Dr. Müller", activity_type: "court", case_slug: "case-2" },
];

// ── computeSummary ──

describe("computeSummary", () => {
  test("calculates total minutes correctly", () => {
    const summary = computeSummary(FIXTURE_ENTRIES);
    expect(summary.total_minutes).toBe(60 + 120 + 30 + 45 + 180);
  });

  test("calculates total hours rounded to 2 decimals", () => {
    const summary = computeSummary(FIXTURE_ENTRIES);
    expect(summary.total_hours).toBe(Math.round((435 / 60) * 100) / 100);
  });

  test("calculates billable amount only for billable entries", () => {
    const summary = computeSummary(FIXTURE_ENTRIES);
    expect(summary.billable_amount).toBe(1700);
  });

  test("empty entries → zero summary", () => {
    const summary = computeSummary([]);
    expect(summary.total_minutes).toBe(0);
    expect(summary.total_hours).toBe(0);
    expect(summary.billable_amount).toBe(0);
  });

  test("all non-billable → zero billable amount", () => {
    const summary = computeSummary([{ id: "x", description: "intern", minutes: 60, date: "2026-01-01", billable: false, billed: false }]);
    expect(summary.billable_amount).toBe(0);
    expect(summary.total_minutes).toBe(60);
  });

  test("entry without rate → 0 in billable amount", () => {
    const summary = computeSummary([{ id: "x", description: "pro-bono", minutes: 60, date: "2026-01-01", billable: true, billed: false }]);
    expect(summary.billable_amount).toBe(0);
  });

  test("minutes=0 → contributes 0 to summary", () => {
    const summary = computeSummary([{ id: "x", description: "zero", minutes: 0, date: "2026-01-01", billable: true, billed: false, rate: 200 }]);
    expect(summary.total_minutes).toBe(0);
    expect(summary.billable_amount).toBe(0);
  });
});

// ── filterEntries ──

describe("filterEntries", () => {
  test("filter billable only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { billable: true });
    expect(filtered).toHaveLength(4);
    expect(filtered.every((e) => e.billable)).toBe(true);
  });

  test("filter non-billable only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { billable: false });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("t4");
  });

  test("filter unbilled only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { unbilled: true });
    expect(filtered).toHaveLength(4);
    expect(filtered.every((e) => !e.billed)).toBe(true);
  });

  test("filter by date range", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { from: "2026-02-01", to: "2026-02-05" });
    expect(filtered).toHaveLength(2);
  });

  test("filter by lawyer (case-insensitive)", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { lawyer: "schmidt" });
    expect(filtered).toHaveLength(3);
    expect(filtered.every((e) => e.lawyer === "Dr. Schmidt")).toBe(true);
  });

  test("combined filters: billable + unbilled + lawyer", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { billable: true, unbilled: true, lawyer: "Müller" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("t5");
  });

  test("no filters → all entries", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, {});
    expect(filtered).toHaveLength(5);
  });

  test("filter with from only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { from: "2026-02-01" });
    expect(filtered).toHaveLength(3);
  });

  test("filter with to only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { to: "2026-01-31" });
    expect(filtered).toHaveLength(2);
  });

  test("empty entries → empty result", () => {
    const filtered = filterEntries([], { billable: true });
    expect(filtered).toHaveLength(0);
  });
});

// ── createTimeEntry ──

describe("createTimeEntry", () => {
  test("creates entry with all fields", () => {
    const entry = createTimeEntry({
      description: "Recherche",
      minutes: 90,
      date: "2026-03-01",
      rate: 220,
      billable: true,
      lawyer: "Dr. Schmidt",
      activity_type: "research",
    });
    expect(entry.description).toBe("Recherche");
    expect(entry.minutes).toBe(90);
    expect(entry.date).toBe("2026-03-01");
    expect(entry.rate).toBe(220);
    expect(entry.billable).toBe(true);
    expect(entry.billed).toBe(false);
    expect(entry.lawyer).toBe("Dr. Schmidt");
    expect(entry.activity_type).toBe("research");
    expect(entry.id).toMatch(/^time-\d+-/);
  });

  test("defaults billable to true", () => {
    const entry = createTimeEntry({ description: "Test", minutes: 30, date: "2026-03-01" });
    expect(entry.billable).toBe(true);
  });

  test("defaults billed to false", () => {
    const entry = createTimeEntry({ description: "Test", minutes: 30, date: "2026-03-01" });
    expect(entry.billed).toBe(false);
  });

  test("can create non-billable entry", () => {
    const entry = createTimeEntry({ description: "Intern", minutes: 30, date: "2026-03-01", billable: false });
    expect(entry.billable).toBe(false);
  });

  test("generates unique IDs", () => {
    const e1 = createTimeEntry({ description: "A", minutes: 30, date: "2026-03-01" });
    const e2 = createTimeEntry({ description: "B", minutes: 30, date: "2026-03-01" });
    expect(e1.id).not.toBe(e2.id);
  });
});

// ── updateEntry ──

describe("updateEntry", () => {
  test("updates existing entry", () => {
    const entries = [{ id: "t1", description: "Old", minutes: 60, date: "2026-01-01", billable: true, billed: false }];
    const result = updateEntry(entries, "t1", { description: "New", minutes: 90 });
    expect(result.found).toBe(true);
    expect(result.updated?.description).toBe("New");
    expect(result.updated?.minutes).toBe(90);
  });

  test("returns found=false for non-existent id", () => {
    const entries = [{ id: "t1", description: "Test", minutes: 60, date: "2026-01-01", billable: true, billed: false }];
    const result = updateEntry(entries, "nonexistent", { description: "New" });
    expect(result.found).toBe(false);
  });

  test("preserves other entries", () => {
    const entries = [
      { id: "t1", description: "A", minutes: 60, date: "2026-01-01", billable: true, billed: false },
      { id: "t2", description: "B", minutes: 30, date: "2026-01-02", billable: true, billed: false },
    ];
    const result = updateEntry(entries, "t1", { description: "Updated" });
    expect(result.entries[1].description).toBe("B");
    expect(result.entries[0].description).toBe("Updated");
  });

  test("marks as billed with invoice number", () => {
    const entries = [{ id: "t1", description: "Test", minutes: 60, date: "2026-01-01", billable: true, billed: false }];
    const result = updateEntry(entries, "t1", { billed: true, invoice_number: "INV-2026-001" });
    expect(result.updated?.billed).toBe(true);
    expect(result.updated?.invoice_number).toBe("INV-2026-001");
  });

  test("partial update preserves non-updated fields", () => {
    const entries = [{ id: "t1", description: "Original", minutes: 60, date: "2026-01-01", billable: true, billed: false, rate: 200 }];
    const result = updateEntry(entries, "t1", { minutes: 90 });
    expect(result.updated?.description).toBe("Original");
    expect(result.updated?.minutes).toBe(90);
    expect(result.updated?.rate).toBe(200);
  });
});

// ── deleteEntry ──

describe("deleteEntry", () => {
  test("removes entry by id", () => {
    const entries = [
      { id: "t1", description: "A", minutes: 60, date: "2026-01-01", billable: true, billed: false },
      { id: "t2", description: "B", minutes: 30, date: "2026-01-02", billable: true, billed: false },
    ];
    const result = deleteEntry(entries, "t1");
    expect(result.found).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("t2");
  });

  test("returns found=false for non-existent id", () => {
    const entries = [{ id: "t1", description: "A", minutes: 60, date: "2026-01-01", billable: true, billed: false }];
    const result = deleteEntry(entries, "nonexistent");
    expect(result.found).toBe(false);
  });

  test("empty array → found=false", () => {
    const result = deleteEntry([], "any");
    expect(result.found).toBe(false);
  });
});

// ── computeBillingSummary ──

describe("computeBillingSummary", () => {
  test("groups unbilled billable entries by case", () => {
    const summary = computeBillingSummary(FIXTURE_ENTRIES);
    expect(summary.by_case).toHaveLength(2);

    const case1 = summary.by_case.find((c) => c.case_slug === "case-1");
    expect(case1).toBeDefined();
    expect(case1!.entry_count).toBe(2);
    expect(case1!.total_minutes).toBe(180);
    expect(case1!.billable_amount).toBe(700);

    const case2 = summary.by_case.find((c) => c.case_slug === "case-2");
    expect(case2).toBeDefined();
    expect(case2!.entry_count).toBe(1);
    expect(case2!.billable_amount).toBe(900);
  });

  test("excludes already billed entries", () => {
    const summary = computeBillingSummary(FIXTURE_ENTRIES);
    expect(summary.total_unbilled_entries).toBe(3);
  });

  test("excludes non-billable entries", () => {
    const summary = computeBillingSummary(FIXTURE_ENTRIES);
    const case1 = summary.by_case.find((c) => c.case_slug === "case-1");
    expect(case1!.entries.every((e) => e.billable !== false)).toBe(true);
  });

  test("calculates totals correctly", () => {
    const summary = computeBillingSummary(FIXTURE_ENTRIES);
    expect(summary.total_unbilled_minutes).toBe(360);
    expect(summary.total_unbilled_hours).toBe(6);
    expect(summary.total_unbilled_amount).toBe(1600);
  });

  test("sorts by_case by billable_amount descending", () => {
    const summary = computeBillingSummary(FIXTURE_ENTRIES);
    expect(summary.by_case[0].billable_amount).toBeGreaterThanOrEqual(summary.by_case[1].billable_amount);
  });

  test("uses default_rate when entry has no rate", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "No rate", minutes: 60, date: "2026-01-01", billable: true, billed: false, case_slug: "case-1" },
    ];
    const summary = computeBillingSummary(entries, 150);
    expect(summary.by_case[0].billable_amount).toBe(150);
  });

  test("entry with no rate and no default → 0 amount", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "No rate", minutes: 60, date: "2026-01-01", billable: true, billed: false, case_slug: "case-1" },
    ];
    const summary = computeBillingSummary(entries);
    expect(summary.by_case[0].billable_amount).toBe(0);
  });

  test("empty entries → empty summary", () => {
    const summary = computeBillingSummary([]);
    expect(summary.total_unbilled_entries).toBe(0);
    expect(summary.total_unbilled_minutes).toBe(0);
    expect(summary.total_unbilled_amount).toBe(0);
    expect(summary.by_case).toHaveLength(0);
  });

  test("all entries already billed → empty summary", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "Billed", minutes: 60, date: "2026-01-01", billable: true, billed: true, invoice_number: "INV-001", case_slug: "case-1" },
    ];
    const summary = computeBillingSummary(entries);
    expect(summary.total_unbilled_entries).toBe(0);
    expect(summary.by_case).toHaveLength(0);
  });

  test("entries without case_slug grouped under _unknown", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "No case", minutes: 60, date: "2026-01-01", billable: true, billed: false, rate: 200 },
    ];
    const summary = computeBillingSummary(entries);
    expect(summary.by_case).toHaveLength(1);
    expect(summary.by_case[0].case_slug).toBe("_unknown");
  });

  test("multiple cases with different amounts", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "A", minutes: 30, date: "2026-01-01", billable: true, billed: false, rate: 200, case_slug: "case-a" },
      { id: "t2", description: "B", minutes: 60, date: "2026-01-02", billable: true, billed: false, rate: 300, case_slug: "case-b" },
      { id: "t3", description: "C", minutes: 120, date: "2026-01-03", billable: true, billed: false, rate: 250, case_slug: "case-a" },
    ];
    const summary = computeBillingSummary(entries);
    expect(summary.by_case).toHaveLength(2);
    expect(summary.by_case[0].case_slug).toBe("case-a");
    expect(summary.by_case[0].billable_amount).toBe(600);
    expect(summary.by_case[1].case_slug).toBe("case-b");
    expect(summary.by_case[1].billable_amount).toBe(300);
  });
});

// ── markEntriesBilled ──

describe("markEntriesBilled", () => {
  test("marks specified entries as billed", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, ["t1", "t2"], "INV-2026-001");
    expect(result.updated).toBe(2);
    expect(result.not_found).toHaveLength(0);

    const t1 = result.entries.find((e) => e.id === "t1");
    const t2 = result.entries.find((e) => e.id === "t2");
    expect(t1?.billed).toBe(true);
    expect(t1?.invoice_number).toBe("INV-2026-001");
    expect(t2?.billed).toBe(true);
    expect(t2?.invoice_number).toBe("INV-2026-001");
  });

  test("does not modify non-specified entries", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, ["t1"], "INV-2026-001");
    const t5 = result.entries.find((e) => e.id === "t5");
    expect(t5?.billed).toBe(false);
    expect(t5?.invoice_number).toBeUndefined();
  });

  test("reports not_found for non-existent ids", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, ["t1", "nonexistent"], "INV-2026-001");
    expect(result.updated).toBe(1);
    expect(result.not_found).toContain("nonexistent");
  });

  test("all ids not found → updated=0", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, ["x1", "x2"], "INV-2026-001");
    expect(result.updated).toBe(0);
    expect(result.not_found).toHaveLength(2);
  });

  test("empty id list → updated=0, no changes", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, [], "INV-2026-001");
    expect(result.updated).toBe(0);
    expect(result.entries).toEqual(FIXTURE_ENTRIES);
  });

  test("preserves entry fields other than billed/invoice_number", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, ["t1"], "INV-2026-001");
    const t1 = result.entries.find((e) => e.id === "t1");
    expect(t1?.description).toBe("Recherche");
    expect(t1?.minutes).toBe(60);
    expect(t1?.rate).toBe(200);
    expect(t1?.lawyer).toBe("Dr. Schmidt");
  });

  test("already billed entry can be re-marked", () => {
    const result = markEntriesBilled(FIXTURE_ENTRIES, ["t3"], "INV-2026-002");
    const t3 = result.entries.find((e) => e.id === "t3");
    expect(t3?.billed).toBe(true);
    expect(t3?.invoice_number).toBe("INV-2026-002");
    expect(result.updated).toBe(1);
  });

  test("empty entries array → updated=0", () => {
    const result = markEntriesBilled([], ["t1"], "INV-2026-001");
    expect(result.updated).toBe(0);
    expect(result.not_found).toContain("t1");
  });
});

// ── groupByCase ──

describe("groupByCase", () => {
  test("groups entries by case_slug", () => {
    const grouped = groupByCase(FIXTURE_ENTRIES);
    expect(grouped.size).toBe(2);
    expect(grouped.get("case-1")).toHaveLength(3);
    expect(grouped.get("case-2")).toHaveLength(2);
  });

  test("strips case_slug from grouped entries", () => {
    const grouped = groupByCase(FIXTURE_ENTRIES);
    const case1Entries = grouped.get("case-1")!;
    expect(case1Entries.every((e) => !("case_slug" in e))).toBe(true);
  });

  test("entries without case_slug → _unknown", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "No case", minutes: 60, date: "2026-01-01", billable: true, billed: false },
    ];
    const grouped = groupByCase(entries);
    expect(grouped.get("_unknown")).toHaveLength(1);
  });

  test("empty entries → empty map", () => {
    const grouped = groupByCase([]);
    expect(grouped.size).toBe(0);
  });

  test("single case → single group", () => {
    const entries: TimeEntryWithCase[] = [
      { id: "t1", description: "A", minutes: 60, date: "2026-01-01", billable: true, billed: false, case_slug: "case-x" },
      { id: "t2", description: "B", minutes: 30, date: "2026-01-02", billable: true, billed: false, case_slug: "case-x" },
    ];
    const grouped = groupByCase(entries);
    expect(grouped.size).toBe(1);
    expect(grouped.get("case-x")).toHaveLength(2);
  });
});

// ── TimeEntry type contract ──

describe("TimeEntry type contract", () => {
  test("TimeEntry has required fields", () => {
    const entry: TimeEntry = {
      id: "test-1",
      description: "Test",
      minutes: 60,
      date: "2026-01-01",
      billable: true,
      billed: false,
    };
    expect(entry.id).toBeDefined();
    expect(entry.description).toBeDefined();
    expect(entry.minutes).toBeDefined();
    expect(entry.date).toBeDefined();
  });

  test("TimeEntry optional fields can be undefined", () => {
    const entry: TimeEntry = {
      id: "test-1",
      description: "Test",
      minutes: 60,
      date: "2026-01-01",
    };
    expect(entry.rate).toBeUndefined();
    expect(entry.billable).toBeUndefined();
    expect(entry.billed).toBeUndefined();
    expect(entry.lawyer).toBeUndefined();
    expect(entry.invoice_number).toBeUndefined();
  });
});
