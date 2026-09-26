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

import { listEnginePages } from "@/lib/engine-pages";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { resolveFristArt } from "@/lib/legal/frist-engine";
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

export interface ExistingDeadlinePage {
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

/**
 * Mappt eine Pipeline-Fristbeschreibung + Rechtsgrundlage auf einen
 * FRISTEN_REGISTRY-Key. Dient nur der Einordnung (Fristart, Notfrist) —
 * das Datum der Pipeline ist bereits das Fristende und wird NICHT neu
 * berechnet. Eine Verjährung ohne erkennbare Dauer bleibt ohne Zuordnung.
 */
function guessFristKey(frist: string, rechtsgrundlage: string): string | null {
  const f = frist.toLowerCase();
  const r = rechtsgrundlage.toLowerCase();

  // ZPO Fristen
  if (f.includes("klagebeantwortung") || f.includes("klageerwiderung")) return "klagebeantwortung";
  if (f.includes("berufung") && !f.includes("straf")) return "berufung";
  if (f.includes("revision") && !r.includes("vwgh") && !r.includes("verwaltungsgericht"))
    return "revision";
  if (f.includes("rekurs")) return "rekurs";
  if (f.includes("wiedereinsetzung")) return "wiedereinsetzung";
  if (f.includes("einspruch") && f.includes("zahlungsbefehl")) return "einspruch_zahlungsbefehl";

  // StPO Fristen
  if (f.includes("beschwerde") && (r.includes("stpo") || f.includes("straf")))
    return "beschwerde_stpo";
  if (f.includes("berufung") && (r.includes("stpo") || f.includes("straf")))
    return "berufungsanmeldung_stpo";

  // Verwaltungsverfahren
  if (f.includes("bescheidbeschwerde") || (f.includes("beschwerde") && r.includes("vwgvg")))
    return "beschwerde_vwgvg";
  if (f.includes("vorstellung")) return "vorstellung_avg";
  if (f.includes("revision") && (r.includes("vwgh") || r.includes("verwaltungsgericht")))
    return "revision_vwgh";
  if (f.includes("beschwerde") && (r.includes("vfgh") || r.includes("verfassungsgericht")))
    return "beschwerde_vfgh";

  // Materiellrechtliche Fristen
  if (f.includes("verjährung") && (f.includes("3 jahr") || f.includes("drei jahr")))
    return "verjaehrung_kurz";
  if (f.includes("verjährung") && (f.includes("30 jahr") || f.includes("dreißig jahr")))
    return "verjaehrung_lang";

  return null;
}

/** Datum am Anfang eines Sync-Slugs `legal/deadlines/<YYYY-MM-DD>-…`. */
const SYNC_SLUG_DATE_RE = /^legal\/deadlines\/(\d{4}-\d{2}-\d{2})-/;

/**
 * Das Pipeline-Datum, aus dem eine vorhandene Sync-Seite entstanden ist:
 * `pipeline_datum`, bei älteren Seiten das Datum im Slug (der Sync hat den
 * Slug immer aus dem Pipeline-Datum gebildet, auch als er `due_date` noch
 * verschoben hat). Null für Seiten, die nicht vom Sync stammen.
 */
export function pipelineSourceDate(page: ExistingDeadlinePage): string | null {
  const fm = page.frontmatter ?? {};
  const stored = typeof fm.pipeline_datum === "string" ? fm.pipeline_datum.slice(0, 10) : "";
  if (DATE_ISO_RE.test(stored)) return stored;
  if (fm.source !== "pipeline") return null;
  return SYNC_SLUG_DATE_RE.exec(page.slug)?.[1] ?? null;
}

export interface PipelineDateRepair {
  slug: string;
  caseSlug: string;
  description: string;
  /** Verschobenes Datum, das heute als `due_date` gespeichert ist. */
  wrongDueDate: string;
  /** Fristende laut Pipeline (Akt) — der richtige Wert. */
  pipelineDate: string;
  vorfristDate: string | null;
}

/**
 * Findet Sync-Seiten, deren `due_date` noch nach der früheren, falschen
 * Logik aus dem Pipeline-Datum „berechnet“ wurde (das Pipeline-Datum wurde
 * als Zustelldatum behandelt). Nur ungeprüfte, offene Einträge: was ein
 * Mensch freigegeben, erledigt oder verworfen hat, bleibt unangetastet.
 */
export function findShiftedPipelineDeadlines(pages: ExistingDeadlinePage[]): PipelineDateRepair[] {
  const out: PipelineDateRepair[] = [];
  for (const page of pages) {
    const fm = page.frontmatter ?? {};
    if (fm.source !== "pipeline" || fm.deterministic !== true) continue;
    if ((fm.review_status ?? "unreviewed") !== "unreviewed") continue;
    const status = String(fm.status ?? "pending");
    if (status === "done" || status === "cancelled" || status === "rejected") continue;
    if (typeof fm.pipeline_datum === "string") continue; // already written by the fixed sync
    const pipelineDate = SYNC_SLUG_DATE_RE.exec(page.slug)?.[1];
    const due = String(fm.due_date ?? "").slice(0, 10);
    if (!pipelineDate || !DATE_ISO_RE.test(due) || due === pipelineDate) continue;
    out.push({
      slug: page.slug,
      caseSlug: String(fm.case_slug ?? ""),
      description: String(fm.description ?? page.title ?? ""),
      wrongDueDate: due,
      pipelineDate,
      vorfristDate: computeVorfrist(pipelineDate),
    });
  }
  return out;
}

async function fetchDeadlineCalendarPages(brainId: string): Promise<DeadlineCalendarPage[]> {
  try {
    return (await listEnginePages(engineHeadersForBrain(brainId), "deadline_calendar", 50_000, {
      timeoutMs: 30_000,
    })) as unknown as DeadlineCalendarPage[];
  } catch {
    return [];
  }
}

async function fetchExistingDeadlines(brainId: string): Promise<Map<string, ExistingDeadlinePage>> {
  try {
    const data = (await listEnginePages(engineHeadersForBrain(brainId), "legal_deadline", 50_000, {
      timeoutMs: 30_000,
    })) as unknown as ExistingDeadlinePage[];
    const map = new Map<string, ExistingDeadlinePage>();
    for (const page of data) {
      const fm = page.frontmatter ?? {};
      const caseSlug = String(fm.case_slug ?? "");
      const dueDate = String(fm.due_date ?? fm.date ?? "");
      const desc = String(fm.description ?? page.title ?? "");
      // Keyed on the due date AND on the pipeline date the page came from:
      // older sync pages carry a shifted due date, and matching only on it
      // created the same deadline again on every run.
      const dates = new Set([dueDate.slice(0, 10)]);
      const source = pipelineSourceDate(page);
      if (source) dates.add(source);
      for (const d of dates) {
        const key = dedupeKey(caseSlug, d, desc);
        if (!map.has(key)) map.set(key, page);
      }
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
 * Idempotent: deduplicates by (caseSlug, pipeline date, frist description).
 * The pipeline date is the Fristende as written in the file and becomes the
 * page's `due_date` unchanged.
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

      // Die Spalte „Datum“ ist das Fristende laut Akt (der Extraktor liest es
      // wörtlich ab und rechnet nicht, siehe writeDeadlineCalendarPage in der
      // Engine). Es wird unverändert übernommen. Früher wurde es als
      // Zustelldatum in die Frist-Engine gegeben — das verschob jede Frist um
      // ihre eigene Dauer nach hinten. Ein Zustelldatum liefert die Pipeline
      // nicht, eine Kontrollrechnung ist daher hier nicht möglich.
      const fristArt = resolveFristArt(guessFristKey(row.frist, row.rechtsgrundlage) ?? "");
      const vorfrist = computeVorfrist(iso);

      const ok = await createDeadlinePage(brainId, {
        slug,
        title: row.frist,
        content: `Pipeline-extrahierte Frist (Fristende laut Akt, nicht berechnet).\n\nRechtsgrundlage: ${row.rechtsgrundlage}\nFolge bei Versäumnis: ${row.folge}\nBeleg: ${row.beleg}`,
        frontmatter: {
          type: "legal_deadline",
          event_type: "deadline",
          due_date: iso,
          fristende: iso,
          pipeline_datum: iso,
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
          deterministic: false,
          ...(fristArt
            ? {
                frist_art: fristArt.key,
                frist_regime: fristArt.regime,
                rechtsgrundlage: fristArt.rechtsgrundlage,
                notfrist: fristArt.notfrist,
              }
            : {}),
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
