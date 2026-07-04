/**
 * pipeline-sync.ts — Materializes pipeline-extracted deadlines into
 * `legal_deadline` pages so they reach the reminder infrastructure.
 *
 * The Engine pipeline (Layer 5 + 5b) extracts deadlines with Sonnet and
 * validates them against statutory paragraphs. The results land in
 * `deadline_calendar` pages (slug pattern `deadline-calendars/*`).
 * Those pages are only read by the chronology builder — the daily digest,
 * topbar notifications, calendar export and the deadlines page all read
 * `legal_deadline` + `legal_case` pages exclusively.
 *
 * This sync step closes that gap: it reads `deadline_calendar` pages from
 * the Engine, parses their markdown tables, deduplicates against existing
 * `legal_deadline` pages, and creates new `legal_deadline` pages with
 * `review_status: "unreviewed"` and `source: "pipeline"`.
 *
 * Called from the daily cron before collecting deadlines, and optionally
 * on-demand from the dashboard.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { computeVorfrist } from "@/lib/legal/vorfrist";

interface DeadlineCalendarPage {
  slug: string;
  compiled_truth: string | null;
  frontmatter: Record<string, unknown> | null;
}

interface ParsedDeadlineRow {
  datum: string;
  ampel: string;
  frist: string;
  rechtsgrundlage: string;
  folge: string;
  beleg: string;
}

interface ExistingDeadlinePage {
  slug: string;
  title?: string;
  frontmatter: Record<string, unknown> | null;
}

export interface SyncResult {
  scanned: number;
  created: number;
  skipped: number;
  errors: number;
}

const DATE_DE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDeadlineDate(raw: string): string | null {
  const s = raw.trim();
  if (DATE_ISO_RE.test(s)) return s;
  const m = DATE_DE_RE.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

/**
 * Parse the markdown table written by the pipeline's deadline writer:
 *   | Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
 */
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

function dedupeKey(caseSlug: string, datum: string, frist: string): string {
  return `${caseSlug}|${datum}|${frist.toLowerCase().slice(0, 60)}`;
}

async function fetchDeadlineCalendarPages(brainId: string): Promise<DeadlineCalendarPage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=deadline_calendar&limit=500`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data as DeadlineCalendarPage[];
  } catch {
    return [];
  }
}

async function fetchExistingDeadlines(brainId: string): Promise<Map<string, ExistingDeadlinePage>> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_deadline&limit=500`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return new Map();
    const map = new Map<string, ExistingDeadlinePage>();
    for (const page of data as ExistingDeadlinePage[]) {
      const fm = page.frontmatter ?? {};
      const caseSlug = String(fm.case_slug ?? "");
      const dueDate = String(fm.due_date ?? fm.date ?? "");
      const desc = String(fm.description ?? page.title ?? "");
      const key = dedupeKey(caseSlug, dueDate.slice(0, 10), desc);
      if (!map.has(key)) map.set(key, page);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function createDeadlinePage(
  brainId: string,
  payload: {
    slug: string;
    title: string;
    frontmatter: Record<string, unknown>;
    content: string;
  }
): Promise<boolean> {
  try {
    const headers = engineHeadersForBrain(brainId);
    headers["Content-Type"] = "application/json";
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sync pipeline-extracted deadlines from `deadline_calendar` pages into
 * `legal_deadline` pages. This is the critical bridge that makes
 * pipeline-detected deadlines visible to the daily digest, topbar
 * notifications, calendar export and the deadlines page.
 *
 * Idempotent: deduplicates by (caseSlug, datum, frist description).
 * Only creates new pages — never modifies or deletes existing ones.
 */
export async function syncPipelineDeadlines(brainId: string): Promise<SyncResult> {
  const result: SyncResult = { scanned: 0, created: 0, skipped: 0, errors: 0 };

  const [calendarPages, existingMap] = await Promise.all([
    fetchDeadlineCalendarPages(brainId),
    fetchExistingDeadlines(brainId),
  ]);

  for (const page of calendarPages) {
    const caseSlug = page.slug.replace(/^deadline-calendars\//, "");
    const rows = parseDeadlineTable(page.compiled_truth ?? "");
    for (const row of rows) {
      result.scanned++;
      const iso = parseDeadlineDate(row.datum);
      if (!iso) {
        result.skipped++;
        continue;
      }
      const key = dedupeKey(caseSlug, iso, row.frist);
      if (existingMap.has(key)) {
        result.skipped++;
        continue;
      }

      const titlePart = row.frist
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      const slug = `legal/deadlines/${iso}-${titlePart || "pipeline"}-${Date.now().toString(36)}`;
      const vorfrist = computeVorfrist(iso);

      const ok = await createDeadlinePage(brainId, {
        slug,
        title: row.frist,
        content: `Pipeline-extrahierte Frist.\n\nRechtsgrundlage: ${row.rechtsgrundlage}\nFolge bei Versäumnis: ${row.folge}\nBeleg: ${row.beleg}`,
        frontmatter: {
          type: "legal_deadline",
          event_type: "deadline",
          due_date: iso,
          vorfrist_date: vorfrist,
          description: row.frist,
          status: "pending",
          review_status: "unreviewed",
          source: "pipeline",
          case_slug: caseSlug,
          law: row.rechtsgrundlage,
          urgency: row.ampel,
          pipeline_beleg: row.beleg,
          pipeline_folge: row.folge,
          created_at: new Date().toISOString(),
        },
      });

      if (ok) {
        result.created++;
        existingMap.set(key, { slug, frontmatter: null });
      } else {
        result.errors++;
      }
    }
  }

  return result;
}
