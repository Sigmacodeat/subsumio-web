// @vitest-environment node
/**
 * Pipeline B: Case → Time Tracking → Invoice → RVG → Export
 * ==========================================================
 * Integration test chaining 5 modules through a real billing workflow:
 *   1. createTimeEntry      — add billable time entries to a case
 *   2. computeBillingSummary — group unbilled entries by case
 *   3. markEntriesBilled    — mark entries as billed with invoice number
 *   4. calculateRvg         — compute RVG fees from Streitwert
 *   5. generateDatevCsv     — export entries as DATEV CSV
 *
 * No vi.mock — all modules use their real implementations.
 */

import { describe, test, expect } from "vitest";
import {
  createTimeEntry,
  computeBillingSummary,
  markEntriesBilled,
  filterEntries,
  type TimeEntryWithCase,
} from "@/lib/time-tracking";
import { calculateRvg } from "@/lib/rvg";
import { generateDatevCsv, type ExportEntry, DATEV_CSV_HEADER } from "@/lib/datev-export";

// ── Fixtures ───────────────────────────────────────────────────────────

const CASE_SLUG = "legal/cases/2026-001-mueller-gmbh";
const CASE_NUMBER = "2026-001";
const CLIENT = "Müller GmbH";
const LEGAL_AREA = "Zivilrecht";
const INVOICE_NUMBER = "INV-2026-001";
const RATE = 220;

const baseEntry = (overrides: Partial<TimeEntryWithCase> = {}): TimeEntryWithCase => ({
  id: `time-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  description: "Recherche zum Lieferverzug",
  minutes: 60,
  date: "2026-01-20",
  rate: RATE,
  billable: true,
  billed: false,
  lawyer: "Dr. Schmidt",
  activity_type: "research",
  case_slug: CASE_SLUG,
  ...overrides,
});

// ── Pipeline ───────────────────────────────────────────────────────────

describe("Pipeline B: Case → Time → Invoice → RVG → DATEV Export", () => {
  test("full pipeline: time entries through DATEV export", () => {
    // ── Stage 1: Create time entries ──────────────────────────────────
    const e1 = createTimeEntry({
      description: "Recherche Lieferverzug",
      minutes: 90,
      date: "2026-01-20",
      rate: RATE,
      billable: true,
      lawyer: "Dr. Schmidt",
      activity_type: "research",
    });
    const e2 = createTimeEntry({
      description: "Klageschrift Entwurf",
      minutes: 120,
      date: "2026-01-22",
      rate: RATE,
      billable: true,
      lawyer: "Dr. Schmidt",
      activity_type: "drafting",
    });
    const e3 = createTimeEntry({
      description: "Gerichtstermin Vorbereitung",
      minutes: 45,
      date: "2026-01-25",
      rate: RATE,
      billable: true,
      lawyer: "Dr. Schmidt",
      activity_type: "court",
    });

    const entries: TimeEntryWithCase[] = [e1, e2, e3].map(
      (e): TimeEntryWithCase => ({
        ...e,
        case_slug: CASE_SLUG,
      })
    );

    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.billed === false)).toBe(true);

    // ── Stage 2: Compute billing summary ──────────────────────────────
    const summary = computeBillingSummary(entries, RATE);

    expect(summary.total_unbilled_entries).toBe(3);
    expect(summary.total_unbilled_minutes).toBe(255);
    expect(summary.total_unbilled_hours).toBeCloseTo(4.25, 1);

    const expectedAmount = Math.round(4.25 * RATE * 100) / 100;
    expect(summary.total_unbilled_amount).toBe(expectedAmount);

    expect(summary.by_case).toHaveLength(1);
    expect(summary.by_case[0].case_slug).toBe(CASE_SLUG);
    expect(summary.by_case[0].entry_count).toBe(3);

    // ── Stage 3: Mark entries as billed ───────────────────────────────
    const entryIds = entries.map((e) => e.id);
    const billedResult = markEntriesBilled(entries, entryIds, INVOICE_NUMBER);

    expect(billedResult.updated).toBe(3);
    expect(billedResult.not_found).toHaveLength(0);
    expect(billedResult.entries.every((e) => e.billed === true)).toBe(true);
    expect(billedResult.entries.every((e) => e.invoice_number === INVOICE_NUMBER)).toBe(true);

    // ── Stage 4: Calculate RVG fees ───────────────────────────────────
    const rvg = calculateRvg(50_000);

    expect(rvg.streitwert).toBe(50_000);
    expect(rvg.basisGebuehr).toBeGreaterThan(300);
    expect(rvg.verfahrensgebuehr).toBeGreaterThan(rvg.terminsgebuehr);
    expect(rvg.summeBrutto).toBeGreaterThan(rvg.summeNetto);
    expect(rvg.mwst).toBeGreaterThan(0);

    // Verify fee is plausible for 50k Streitwert
    expect(rvg.summeBrutto).toBeGreaterThan(1000);
    expect(rvg.summeBrutto).toBeLessThan(10000);

    // ── Stage 5: Generate DATEV CSV ───────────────────────────────────
    const exportEntries: ExportEntry[] = billedResult.entries.map((e) => ({
      id: e.id,
      date: e.date,
      caseNumber: CASE_NUMBER,
      description: e.description,
      hours: (e.minutes || 0) / 60,
      rate: e.rate || RATE,
      amount: Math.round(((e.minutes || 0) / 60) * (e.rate || RATE) * 100) / 100,
      client: CLIENT,
      legalArea: LEGAL_AREA,
      invoiceNumber: INVOICE_NUMBER,
      kind: "time" as const,
    }));

    const csv = generateDatevCsv(
      exportEntries,
      {
        datevKontenrahmen: "SKR03",
        datevBeraterNr: "12345",
        datevMandantenNr: "67890",
        ustId: "DE123456789",
        country: "DE",
      },
      "2026-01-01",
      "2026-12-31"
    );

    // CSV should have header + 3 data rows
    const lines = csv.split("\n");
    expect(lines[0]).toBe(DATEV_CSV_HEADER);
    expect(lines.length).toBe(4); // header + 3 entries

    // Each data row should contain the invoice number and case number
    for (let i = 1; i <= 3; i++) {
      expect(lines[i]).toContain(INVOICE_NUMBER);
      expect(lines[i]).toContain(CASE_NUMBER);
      expect(lines[i]).toContain(CLIENT);
      expect(lines[i]).toContain("Honorar");
    }
  });

  test("pipeline: non-billable entries excluded from billing summary and export", () => {
    const billable = baseEntry({ id: "t-billable", billable: true });
    const nonBillable = baseEntry({
      id: "t-nonbillable",
      billable: false,
      description: "Interne Besprechung",
    });

    const entries = [billable, nonBillable];

    // Filter: only billable
    const filtered = filterEntries(entries, { billable: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("t-billable");

    // Billing summary: only billable & unbilled
    const summary = computeBillingSummary(entries, RATE);
    expect(summary.total_unbilled_entries).toBe(1);

    // Export: non-billable should not appear
    const exportEntries: ExportEntry[] = [
      {
        id: billable.id,
        date: billable.date,
        caseNumber: CASE_NUMBER,
        description: billable.description,
        hours: 1,
        rate: RATE,
        amount: RATE,
        client: CLIENT,
        legalArea: LEGAL_AREA,
        invoiceNumber: INVOICE_NUMBER,
        kind: "time",
      },
    ];

    const csv = generateDatevCsv(exportEntries, null, "2026-01-01", "2026-12-31");
    const lines = csv.split("\n");
    expect(lines.length).toBe(2); // header + 1 entry
    expect(lines[1]).toContain("Honorar");
  });

  test("pipeline: RVG fee progression is monotonic across Streitwerte", () => {
    const streitwerte = [500, 1000, 5000, 10_000, 25_000, 50_000, 100_000, 500_000];
    const fees = streitwerte.map((s) => calculateRvg(s).basisGebuehr);

    for (let i = 1; i < fees.length; i++) {
      expect(fees[i]).toBeGreaterThan(fees[i - 1]);
    }
  });

  test("pipeline: DATEV export respects date range filter", () => {
    const entries: ExportEntry[] = [
      {
        id: "e1",
        date: "2026-01-15",
        caseNumber: CASE_NUMBER,
        description: "Januar Arbeit",
        hours: 2,
        rate: RATE,
        amount: 440,
        client: CLIENT,
        legalArea: LEGAL_AREA,
        invoiceNumber: INVOICE_NUMBER,
        kind: "time",
      },
      {
        id: "e2",
        date: "2026-06-15",
        caseNumber: CASE_NUMBER,
        description: "Juni Arbeit",
        hours: 3,
        rate: RATE,
        amount: 660,
        client: CLIENT,
        legalArea: LEGAL_AREA,
        invoiceNumber: INVOICE_NUMBER,
        kind: "time",
      },
    ];

    // Q1 only
    const q1Csv = generateDatevCsv(entries, null, "2026-01-01", "2026-03-31");
    const q1Lines = q1Csv.split("\n");
    expect(q1Lines.length).toBe(2); // header + 1
    expect(q1Lines[1]).toContain("Januar");

    // Full year
    const fullCsv = generateDatevCsv(entries, null, "2026-01-01", "2026-12-31");
    const fullLines = fullCsv.split("\n");
    expect(fullLines.length).toBe(3); // header + 2
  });

  test("pipeline: AT country uses 20% VAT in DATEV export", () => {
    const entries: ExportEntry[] = [
      {
        id: "e1",
        date: "2026-03-01",
        caseNumber: "AT-001",
        description: "AT Arbeit",
        hours: 1,
        rate: 200,
        amount: 200,
        client: "Austrian Client",
        legalArea: "Vertragsrecht",
        invoiceNumber: "INV-AT-001",
        kind: "time",
      },
    ];

    const csv = generateDatevCsv(
      entries,
      { country: "AT", datevKontenrahmen: "SKR49" },
      "2026-01-01",
      "2026-12-31"
    );

    // AT should use Steuerkennzeichen "20"
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain(";20;");
  });
});
