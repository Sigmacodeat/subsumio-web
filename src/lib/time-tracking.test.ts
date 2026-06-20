// @vitest-environment node

import { describe, test, expect } from "vitest";
import type { TimeEntry } from "@/lib/legal-types";

/**
 * Tests für die Time-Tracking-Business-Logic.
 * Die API-Route (src/app/api/time/route.ts) delegiert an Brain-Pages,
 * aber die Berechnungs- und Filterlogik ist hier rein funktional getestet.
 */

// ── Helper functions (spiegeln die Logik aus der API-Route) ──

function filterEntries(
  entries: (TimeEntry & { case_slug?: string })[],
  opts: { billable?: boolean; unbilled?: boolean; from?: string; to?: string; lawyer?: string },
): (TimeEntry & { case_slug?: string })[] {
  let result = [...entries];
  if (opts.billable !== undefined) result = result.filter((e) => e.billable === opts.billable);
  if (opts.unbilled) result = result.filter((e) => !e.billed);
  if (opts.from) result = result.filter((e) => e.date >= opts.from!);
  if (opts.to) result = result.filter((e) => e.date <= opts.to!);
  if (opts.lawyer) {
    const lower = opts.lawyer.toLowerCase();
    result = result.filter((e) => e.lawyer?.toLowerCase().includes(lower));
  }
  return result;
}

function computeSummary(entries: TimeEntry[]): {
  total_minutes: number;
  total_hours: number;
  billable_amount: number;
} {
  const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0);
  const totalAmount = entries.reduce((sum, e) => {
    if (!e.billable) return sum;
    const hours = (e.minutes || 0) / 60;
    return sum + hours * (e.rate || 0);
  }, 0);
  return {
    total_minutes: totalMinutes,
    total_hours: Math.round((totalMinutes / 60) * 100) / 100,
    billable_amount: Math.round(totalAmount * 100) / 100,
  };
}

function createTimeEntry(input: {
  description: string;
  minutes: number;
  date: string;
  rate?: number;
  billable?: boolean;
  lawyer?: string;
  activity_type?: string;
}): TimeEntry {
  return {
    id: `time-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: input.description,
    minutes: input.minutes,
    date: input.date,
    rate: input.rate,
    billable: input.billable ?? true,
    billed: false,
    lawyer: input.lawyer,
    activity_type: input.activity_type,
  };
}

function updateEntry(
  entries: TimeEntry[],
  id: string,
  updates: Partial<TimeEntry>,
): { found: boolean; entries: TimeEntry[]; updated?: TimeEntry } {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return { found: false, entries };
  const updated = { ...entries[idx], ...updates };
  const next = [...entries];
  next[idx] = updated;
  return { found: true, entries: next, updated };
}

function deleteEntry(entries: TimeEntry[], id: string): { found: boolean; entries: TimeEntry[] } {
  const filtered = entries.filter((e) => e.id !== id);
  return {
    found: filtered.length < entries.length,
    entries: filtered,
  };
}

// ── Fixtures ──

const FIXTURE_ENTRIES: (TimeEntry & { case_slug?: string })[] = [
  { id: "t1", description: "Recherche", minutes: 60, date: "2026-01-15", rate: 200, billable: true, billed: false, lawyer: "Dr. Schmidt", activity_type: "research", case_slug: "case-1" },
  { id: "t2", description: "Klageentwurf", minutes: 120, date: "2026-01-20", rate: 250, billable: true, billed: false, lawyer: "Dr. Schmidt", activity_type: "drafting", case_slug: "case-1" },
  { id: "t3", description: "Mandantengespräch", minutes: 30, date: "2026-02-01", rate: 200, billable: true, billed: true, invoice_number: "INV-001", lawyer: "Dr. Müller", activity_type: "meeting", case_slug: "case-2" },
  { id: "t4", description: "Intern", minutes: 45, date: "2026-02-05", billable: false, billed: false, lawyer: "Dr. Schmidt", activity_type: "other", case_slug: "case-1" },
  { id: "t5", description: "Gerichtstermin", minutes: 180, date: "2026-02-10", rate: 300, billable: true, billed: false, lawyer: "Dr. Müller", activity_type: "court", case_slug: "case-2" },
];

// ── Tests ──

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
    // t1: 1h * 200 = 200
    // t2: 2h * 250 = 500
    // t3: 0.5h * 200 = 100
    // t4: non-billable → 0
    // t5: 3h * 300 = 900
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
});

describe("filterEntries", () => {
  test("filter billable only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { billable: true });
    expect(filtered).toHaveLength(4);
    expect(filtered.every((e) => e.billable)).toBe(true);
  });

  test("filter unbilled only", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { unbilled: true });
    expect(filtered).toHaveLength(4);
    expect(filtered.every((e) => !e.billed)).toBe(true);
  });

  test("filter by date range", () => {
    const filtered = filterEntries(FIXTURE_ENTRIES, { from: "2026-02-01", to: "2026-02-05" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.date >= "2026-02-01" && e.date <= "2026-02-05")).toBe(true);
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
});

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
    const entry = createTimeEntry({
      description: "Test",
      minutes: 30,
      date: "2026-03-01",
    });
    expect(entry.billable).toBe(true);
  });

  test("defaults billed to false", () => {
    const entry = createTimeEntry({
      description: "Test",
      minutes: 30,
      date: "2026-03-01",
    });
    expect(entry.billed).toBe(false);
  });
});

describe("updateEntry", () => {
  test("updates existing entry", () => {
    const entries = [{ id: "t1", description: "Old", minutes: 60, date: "2026-01-01", billable: true, billed: false }];
    const result = updateEntry(entries, "t1", { description: "New", minutes: 90 });
    expect(result.found).toBe(true);
    expect(result.updated?.description).toBe("New");
    expect(result.updated?.minutes).toBe(90);
    expect(result.entries).toHaveLength(1);
  });

  test("returns found=false for non-existent id", () => {
    const entries = [{ id: "t1", description: "Test", minutes: 60, date: "2026-01-01", billable: true, billed: false }];
    const result = updateEntry(entries, "nonexistent", { description: "New" });
    expect(result.found).toBe(false);
    expect(result.entries).toEqual(entries);
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
});

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
    expect(result.entries).toHaveLength(1);
  });

  test("empty array → found=false", () => {
    const result = deleteEntry([], "any");
    expect(result.found).toBe(false);
    expect(result.entries).toHaveLength(0);
  });
});

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
