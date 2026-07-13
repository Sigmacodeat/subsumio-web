/**
 * Phase 3 — legal deadline-monitor dream phase, end-to-end (hermetic PGLite).
 *
 * The "Anwaltssekretärin" chain: a case's Fristenkalender (deadline_calendar
 * page, exactly as legal-pipeline Layer 5 writes it) → the dream monitor scans
 * it → every date is classified by the DETERMINISTIC frist-engine
 * (klassifiziereFrist: Werktage + Vorfrist), the same authority the Fristenbuch
 * uses.
 *
 * WHY this test exists: before Phase 3 the monitor scanned `type =
 * 'legal_deadline'` pages that NO producer ever writes (the pipeline writes
 * `deadline_calendar`), so the phase was dead — it always reported zero
 * deadlines. And it classified with an ad-hoc calendar-day diff (≤3d critical)
 * instead of the Werktag-aware engine, so it could disagree with the
 * Fristenbuch on the same deadline. This pins the fix: real pages, one
 * classifier.
 *
 * Expected classifications are computed by calling klassifiziereFrist directly,
 * so the assertions are self-consistent with the engine regardless of the real
 * date — `opts.today` is fixed for reproducibility.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../../src/core/pglite-engine.ts";
import { runPhaseLegalDeadlineMonitor } from "../../src/core/cycle/legal-phases.ts";
import { klassifiziereFrist, type FristStatus } from "../../src/core/legal/frist-engine.ts";
import { parseDeadlineDate } from "../../src/core/legal/fristenbuch.ts";

const TODAY = "2026-06-15"; // fixed reference date for reproducible classification

// Deadline dates (DE format, as the pipeline emits) spread across the classes.
const DEADLINES = [
  { datum: "10.06.2026", frist: "Berufungsfrist" }, // past → überfällig
  { datum: "16.06.2026", frist: "Einspruchsfrist" }, // +1 day → kritisch
  { datum: "19.06.2026", frist: "Stellungnahme" }, // a few days out
  { datum: "01.08.2026", frist: "Verhandlungstermin" }, // far → ok
];

/** Build a deadline_calendar page body exactly like writeDeadlineCalendarPage. */
function deadlineCalendarMarkdown(caseSlug: string): string {
  const lines = [
    "---",
    `title: "Fristenkalender — ${caseSlug}"`,
    "type: deadline_calendar",
    `case_ref: ${caseSlug}`,
    "---",
    "",
    "| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |",
    "|---|---|---|---|---|---|",
  ];
  for (const d of DEADLINES) {
    lines.push(`| ${d.datum} | | ${d.frist} | § 464 ZPO | Rechtsverlust | akt.pdf#1 |`);
  }
  return lines.join("\n");
}

/** Ground truth: bucket each seeded deadline by the deterministic engine. */
function expectedBuckets(): Record<FristStatus, number> {
  const buckets: Record<FristStatus, number> = { ueberfaellig: 0, kritisch: 0, vorfrist: 0, ok: 0 };
  for (const d of DEADLINES) {
    const iso = parseDeadlineDate(d.datum)!;
    buckets[klassifiziereFrist(iso, TODAY)]++;
  }
  return buckets;
}

let eng: PGLiteEngine;

beforeAll(async () => {
  eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();
  const md = deadlineCalendarMarkdown("2024-ABC-42");
  await eng.putPage("deadline-calendars/2024-ABC-42", {
    type: "deadline_calendar" as never,
    title: "Fristenkalender — 2024-ABC-42",
    compiled_truth: md,
    timeline: "",
    frontmatter: { type: "deadline_calendar", case_ref: "2024-ABC-42" },
  });
  // A second, frontmatter-shaped deadline (the ai-deadlines API route shape).
  await eng.putPage("legal/deadline/single-1", {
    type: "deadline" as never,
    title: "Rekursfrist",
    compiled_truth: "Rekurs gegen den Beschluss",
    timeline: "",
    frontmatter: { type: "deadline", due_date: "2026-06-15", status: "pending" },
  });
}, 60_000);

afterAll(async () => {
  await eng.disconnect();
});

describe("legal deadline-monitor dream phase (Phase 3)", () => {
  test("the monitor actually finds the real deadline_calendar deadlines (dead-phase fix)", async () => {
    const res = await runPhaseLegalDeadlineMonitor(eng, { today: TODAY });
    expect(res.status).not.toBe("fail");
    const d = res.details as Record<string, number>;
    // 4 table rows + 1 frontmatter deadline = 5 classified deadlines across 2 pages.
    expect(d.pages).toBe(2);
    expect(d.total).toBe(DEADLINES.length + 1);
    // Pre-fix this was always 0 (wrong page type) — the regression tripwire.
    expect(d.total).toBeGreaterThan(0);
  }, 30_000);

  test("classification matches the deterministic frist-engine exactly", async () => {
    const res = await runPhaseLegalDeadlineMonitor(eng, { today: TODAY });
    const d = res.details as Record<string, number>;
    const want = expectedBuckets();

    // The frontmatter deadline (due 2026-06-15 == today) adds one more.
    const singleStatus = klassifiziereFrist("2026-06-15", TODAY);
    want[singleStatus]++;

    expect(d.ueberfaellig).toBe(want.ueberfaellig);
    expect(d.kritisch).toBe(want.kritisch);
    expect(d.vorfrist).toBe(want.vorfrist);
    expect(d.ok).toBe(want.ok);
    // At least one überfällig + one kritisch exist in this fixture.
    expect(want.ueberfaellig).toBeGreaterThan(0);
    expect(want.kritisch).toBeGreaterThan(0);
  }, 30_000);

  test("phase warns when an überfällige or kritische Frist is present", async () => {
    const res = await runPhaseLegalDeadlineMonitor(eng, { today: TODAY });
    expect(res.status).toBe("warn");
    // Flagged list carries every non-ok deadline, earliest first, with its
    // deterministic status — this is the secretary's actionable worklist.
    const flagged = (res.details as { flagged: Array<{ status: FristStatus; due_date: string }> }).flagged;
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((f) => f.status !== "ok")).toBe(true);
    const sorted = [...flagged].sort((a, b) => a.due_date.localeCompare(b.due_date));
    expect(flagged).toEqual(sorted);
  }, 30_000);

  test("empty brain → phase is ok with zero deadlines (no false alarm)", async () => {
    const empty = new PGLiteEngine();
    await empty.connect({});
    await empty.initSchema();
    try {
      const res = await runPhaseLegalDeadlineMonitor(empty, { today: TODAY });
      expect(res.status).toBe("ok");
      expect((res.details as { total: number }).total).toBe(0);
    } finally {
      await empty.disconnect();
    }
  }, 30_000);
});
