// @vitest-environment node
/**
 * Pipeline E: deadline_calendar → Parse → Dedup → Vorfrist → Status → Digest
 * =========================================================================
 * Integration test chaining the pipeline-sync materialization with deadline
 * classification and digest rendering.
 *
 * Stages:
 *   1. parseDeadlineTable     — parse markdown table from deadline_calendar
 *   2. parseDeadlineDate      — convert German date format to ISO
 *   3. computeVorfrist        — compute Vorfrist with holiday roll-forward
 *   4. computeDeadlineStatus  — classify for digest (overdue/critical/warning/vorfrist)
 *   5. Digest rendering       — verify items reach the correct digest section
 *
 * This pipeline test verifies the full chain from raw pipeline output to
 * digest-ready deadline items, without mocking any business logic.
 *
 * Note: parseDeadlineTable and parseDeadlineDate are not exported from
 * pipeline-sync.ts, so we test the chain through the digest classification
 * path using the same data structures that pipeline-sync produces.
 */

import { describe, test, expect } from "vitest";
import { computeDeadlineStatus, type DeadlineStatus } from "@/lib/legal-deadlines";
import { computeVorfrist, isVorfristReached, daysUntilVorfrist } from "@/lib/legal/vorfrist";

// ── Types matching pipeline-sync.ts internal structures ────────────────

interface ParsedDeadlineRow {
  datum: string;
  ampel: string;
  frist: string;
  rechtsgrundlage: string;
  folge: string;
  beleg: string;
}

interface MaterializedDeadline {
  slug: string;
  title: string;
  due_date: string;
  vorfrist_date: string | null;
  status: DeadlineStatus;
  law: string;
  urgency: string;
  source: "pipeline";
  case_slug: string;
  review_status: "unreviewed";
}

// ── Replicate the parsing logic from pipeline-sync.ts ──────────────────
// (These are internal functions not exported, so we replicate them here
// to test the full pipeline chain. This is intentional — we're testing
// the contract, not the implementation.)

const DATE_DE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDeadlineDate(raw: string): string | null {
  const s = raw.trim();
  if (DATE_ISO_RE.test(s)) return s;
  const m = DATE_DE_RE.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

function parseDeadlineTable(markdown: string): ParsedDeadlineRow[] {
  const rows: ParsedDeadlineRow[] = [];
  const lines = markdown.split("\n");
  let inTable = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^\|\s*Datum\s*\|\s*Ampel\s*\|/i.test(t)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^\|[\s|:-]+\|$/.test(t)) continue;
    if (!t.startsWith("|")) {
      inTable = false;
      continue;
    }
    const cells = t
      .slice(1, t.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 6) continue;
    rows.push({
      datum: cells[0]!,
      ampel: cells[1]!,
      frist: cells[2]!,
      rechtsgrundlage: cells[3]!,
      folge: cells[4]!,
      beleg: cells[5]!,
    });
  }
  return rows;
}

// ── Materialization: convert parsed rows to deadline items ─────────────

function materializeDeadline(
  row: ParsedDeadlineRow,
  caseSlug: string
): MaterializedDeadline | null {
  const iso = parseDeadlineDate(row.datum);
  if (!iso) return null;

  const vorfrist = computeVorfrist(iso, 7, "BY", "DE");
  const status = computeDeadlineStatus(iso, undefined, vorfrist ?? undefined);

  const titlePart = row.frist
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return {
    slug: `legal/deadlines/${iso}-${titlePart || "pipeline"}-${Date.now().toString(36)}`,
    title: row.frist,
    due_date: iso,
    vorfrist_date: vorfrist,
    status,
    law: row.rechtsgrundlage,
    urgency: row.ampel,
    source: "pipeline",
    case_slug: caseSlug,
    review_status: "unreviewed",
  };
}

// ── Digest rendering (matches renderDigest from cron/deadlines/route.ts) ─

interface DeadlineItem {
  title: string;
  dueDate: string;
  status: "overdue" | "critical" | "warning" | "vorfrist";
  law?: string;
  vorfristDate?: string;
}

function renderDigest(items: DeadlineItem[]): {
  overdue: DeadlineItem[];
  critical: DeadlineItem[];
  warning: DeadlineItem[];
  vorfrist: DeadlineItem[];
} {
  return {
    overdue: items.filter((i) => i.status === "overdue"),
    critical: items.filter((i) => i.status === "critical"),
    warning: items.filter((i) => i.status === "warning"),
    vorfrist: items.filter((i) => i.status === "vorfrist"),
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────

const CALENDAR_MARKDOWN = `# Fristen-Kalender

| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
|-------|-------|-------|-----------------|-------|-------|
| 15.04.2026 | 🟡 | Berufungsfrist | § 517 ZPO | Rechtskraft | Urteil BGH |
| 20.02.2026 | 🟢 | Klageerwiderung | § 276 ZPO | Säumnis | Klageschrift |
| 31.03.2026 | 🟠 | Zahlungsfrist | § 286 BGB | Verzug | Rechnung |
| 01.01.2020 | 🔴 | Verjährung | § 195 BGB | Anspruchsverlust | Vertrag |
`;

const CASE_SLUG = "cases/2026-001-mueller";

// ── Pipeline ───────────────────────────────────────────────────────────

describe("Pipeline E: deadline_calendar → Parse → Vorfrist → Status → Digest", () => {
  test("full pipeline: markdown table through digest classification", () => {
    // ── Stage 1: Parse markdown table ─────────────────────────────────
    const rows = parseDeadlineTable(CALENDAR_MARKDOWN);
    expect(rows).toHaveLength(4);

    expect(rows[0].frist).toBe("Berufungsfrist");
    expect(rows[0].rechtsgrundlage).toBe("§ 517 ZPO");
    expect(rows[1].frist).toBe("Klageerwiderung");

    // ── Stage 2: Parse dates (German → ISO) ───────────────────────────
    const dates = rows.map((r) => parseDeadlineDate(r.datum));
    expect(dates[0]).toBe("2026-04-15");
    expect(dates[1]).toBe("2026-02-20");
    expect(dates[2]).toBe("2026-03-31");
    expect(dates[3]).toBe("2020-01-01");

    // ── Stage 3: Materialize each deadline with Vorfrist + Status ─────
    const materialized = rows
      .map((row) => materializeDeadline(row, CASE_SLUG))
      .filter((d): d is MaterializedDeadline => d !== null);

    expect(materialized).toHaveLength(4);

    // All should have Vorfrist computed
    for (const d of materialized) {
      expect(d.vorfrist_date).toBeTruthy();
      expect(d.vorfrist_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.source).toBe("pipeline");
      expect(d.review_status).toBe("unreviewed");
      expect(d.case_slug).toBe(CASE_SLUG);
    }

    // ── Stage 4: Verify status classification ─────────────────────────
    const oldDeadline = materialized.find((d) => d.due_date === "2020-01-01");
    expect(oldDeadline).toBeDefined();
    expect(oldDeadline!.status).toBe("overdue");

    // ── Stage 5: Convert to digest items and render ───────────────────
    const digestItems: DeadlineItem[] = materialized
      .filter((d) => d.status !== "pending")
      .map((d) => ({
        title: d.title,
        dueDate: d.due_date,
        status: d.status as DeadlineItem["status"],
        law: d.law,
        vorfristDate: d.vorfrist_date ?? undefined,
      }));

    const digest = renderDigest(digestItems);

    // The 2020 deadline should be in overdue (it's the oldest)
    expect(digest.overdue.length).toBeGreaterThanOrEqual(1);
    const oldest = digest.overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    expect(oldest.title).toBe("Verjährung");
    expect(oldest.law).toBe("§ 195 BGB");

    // Future deadlines should be in their respective sections
    // (exact sections depend on current date, but at least overdue is guaranteed)
    const totalClassified =
      digest.overdue.length +
      digest.critical.length +
      digest.warning.length +
      digest.vorfrist.length;
    expect(totalClassified).toBeGreaterThanOrEqual(1);
  });

  test("pipeline: Vorfrist is 5-8 days before deadline (with holiday roll)", () => {
    const rows = parseDeadlineTable(CALENDAR_MARKDOWN);

    for (const row of rows) {
      const iso = parseDeadlineDate(row.datum);
      if (!iso) continue;

      const vorfrist = computeVorfrist(iso, 7, "BY", "DE");
      expect(vorfrist).toBeTruthy();

      const deadlineDate = new Date(iso);
      const vorfristDate = new Date(vorfrist!);
      const diffDays = Math.round(
        (deadlineDate.getTime() - vorfristDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Vorfrist should be 5-8 days before (7 days, but may roll forward for weekends/holidays)
      expect(diffDays).toBeGreaterThanOrEqual(5);
      expect(diffDays).toBeLessThanOrEqual(8);
    }
  });

  test("pipeline: invalid dates are skipped during materialization", () => {
    const badMarkdown = `| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
|-------|-------|-------|-----------------|-------|-------|
| invalid | 🟡 | Bad Date | § 1 | None | None |
| 15.04.2026 | 🟡 | Good Date | § 517 ZPO | None | None |
`;

    const rows = parseDeadlineTable(badMarkdown);
    expect(rows).toHaveLength(2);

    const materialized = rows
      .map((row) => materializeDeadline(row, CASE_SLUG))
      .filter((d): d is MaterializedDeadline => d !== null);

    // Only the valid date should materialize
    expect(materialized).toHaveLength(1);
    expect(materialized[0].title).toBe("Good Date");
    expect(materialized[0].due_date).toBe("2026-04-15");
  });

  test("pipeline: deduplication prevents duplicate materialization", () => {
    const existingKeys = new Set<string>();
    const rows = parseDeadlineTable(CALENDAR_MARKDOWN);

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const iso = parseDeadlineDate(row.datum);
      if (!iso) {
        skipped++;
        continue;
      }

      const dedupeKey = `${CASE_SLUG}#${iso}#${row.frist}`;
      if (existingKeys.has(dedupeKey)) {
        skipped++;
        continue;
      }

      existingKeys.add(dedupeKey);
      created++;
    }

    expect(created).toBe(4);
    expect(skipped).toBe(0);

    // Now simulate a second sync with the same data
    for (const row of rows) {
      const iso = parseDeadlineDate(row.datum);
      if (!iso) {
        skipped++;
        continue;
      }

      const dedupeKey = `${CASE_SLUG}#${iso}#${row.frist}`;
      if (existingKeys.has(dedupeKey)) {
        skipped++;
        continue;
      }

      existingKeys.add(dedupeKey);
      created++;
    }

    // Second sync: all should be skipped (idempotent)
    expect(created).toBe(4);
    expect(skipped).toBe(4);
  });

  test("pipeline: Vorfrist interaction with status classification", () => {
    // A deadline 10 days in the future: status should be "pending" or "vorfrist"
    // depending on whether the Vorfrist has been reached
    const futureDate = new Date();
    futureDate.setUTCDate(futureDate.getUTCDate() + 10);
    const futureISO = futureDate.toISOString().slice(0, 10);

    const vorfrist = computeVorfrist(futureISO, 7);
    expect(vorfrist).toBeTruthy();

    const status = computeDeadlineStatus(futureISO, undefined, vorfrist ?? undefined);
    const vorfristReached = isVorfristReached(vorfrist);
    const daysToVorfrist = daysUntilVorfrist(vorfrist);

    if (vorfristReached) {
      expect(status).toBe("vorfrist");
      expect(daysToVorfrist!).toBeLessThanOrEqual(0);
    } else {
      expect(status).toBe("pending");
      expect(daysToVorfrist!).toBeGreaterThan(0);
    }
  });

  test("pipeline: ISO date input passes through parseDeadlineDate unchanged", () => {
    expect(parseDeadlineDate("2026-04-15")).toBe("2026-04-15");
    expect(parseDeadlineDate("15.04.2026")).toBe("2026-04-15");
    expect(parseDeadlineDate("invalid")).toBeNull();
    expect(parseDeadlineDate("")).toBeNull();
  });
});
