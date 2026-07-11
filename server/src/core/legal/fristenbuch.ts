/**
 * fristenbuch.ts — Kanzlei-Fristenbuch + ICS calendar export (Gap D).
 *
 * Closes the loop from extracted deadlines to the attorney's daily routine:
 *
 *   deadline-calendars/* pages (written by pipeline Layer 5)
 *     → parsed into structured entries (the writer's table format is stable)
 *     → classified via the deterministic frist-engine (ok/vorfrist/kritisch/
 *       ueberfaellig) with Vorfrist + Vier-Augen escalation flags
 *     → served as JSON (/api/legal/fristenbuch) and as an ICS feed
 *       (/api/legal/deadlines.ics) that Outlook/Google/Apple Calendar
 *       subscribe to — one VEVENT per Frist plus a Vorfrist VEVENT with
 *       VALARM, so the Kanzlei calendar carries both control dates.
 *
 * Kanzleiorganisations-Standard (standesrechtlich erwartet):
 *   - Vorfrist (Default 7 Tage, auf Werktag gezogen)
 *   - Eskalationsstufe "kritisch" ≤ 2 Werktage → Vier-Augen-Kontrolle
 *   - überfällige Fristen bleiben sichtbar bis zur Erledigung
 *
 * Pure parsing + composition; the only I/O is `engine.executeRaw`.
 */

import {
  addDays,
  istWerktag,
  klassifiziereFrist,
  parseISODate,
  vorigerWerktag,
  type FristStatus,
} from "./frist-engine.ts";

export interface FristenbuchEngine {
  executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface FristenbuchEintrag {
  case_slug: string;
  /** ISO date of the deadline (parsed from the calendar page). */
  datum: string;
  frist: string;
  rechtsgrundlage: string;
  folge_bei_versaeumnis: string;
  beleg_on: string;
  /** Pipeline-Ampel wie extrahiert (rot/gelb/gruen). */
  ampel: string;
  /** Deterministic classification relative to `heute`. */
  status: FristStatus;
  /** Kanzlei-Vorfrist (Werktag, 7 Tage vor der Frist). */
  vorfrist: string;
  /** true → Vier-Augen-Eskalation fällig (kritisch/ueberfaellig). */
  eskalation: boolean;
}

export interface Fristenbuch {
  heute: string;
  eintraege: FristenbuchEintrag[];
  zusammenfassung: {
    gesamt: number;
    ueberfaellig: number;
    kritisch: number;
    vorfrist: number;
    ok: number;
    unparsebar: number;
  };
}

// ── Deadline page parsing ───────────────────────────────────

/** Deadline-calendar table row shape as written by writeDeadlineCalendarPage. */
export interface ParsedDeadlineRow {
  datum: string;
  ampel: string;
  frist: string;
  rechtsgrundlage: string;
  folge: string;
  beleg: string;
}

const DATE_DE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse "28.05.2024" or ISO into ISO; null when not a real date. */
export function parseDeadlineDate(raw: string): string | null {
  const s = raw.trim();
  if (DATE_ISO_RE.test(s)) {
    try {
      parseISODate(s);
      return s;
    } catch {
      return null;
    }
  }
  const m = DATE_DE_RE.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  try {
    parseISODate(iso);
    return iso;
  } catch {
    return null;
  }
}

/**
 * Parse the markdown table written by the pipeline's deadline writer:
 *   | Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
 */
export function parseDeadlineTable(markdown: string): ParsedDeadlineRow[] {
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
    if (/^\|[\s|:-]+\|$/.test(t)) continue; // separator row
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

// ── Fristenbuch assembly ────────────────────────────────────

export async function ladeFristenbuch(
  engine: FristenbuchEngine,
  opts: { heute: string; sourceId?: string; caseSlug?: string; vorfristTage?: number }
): Promise<Fristenbuch> {
  const heute = opts.heute;
  parseISODate(heute); // validate
  const vorfristTage = opts.vorfristTage ?? 7;

  const conds: string[] = [
    "deleted_at IS NULL",
    "type = 'deadline_calendar'",
    "slug LIKE 'deadline-calendars/%'",
  ];
  const params: string[] = [];
  if (opts.sourceId && opts.sourceId !== "default") {
    params.push(opts.sourceId);
    conds.push(`source_id = $${params.length}`);
  }
  if (opts.caseSlug) {
    params.push(`deadline-calendars/${opts.caseSlug}`);
    conds.push(`slug = $${params.length}`);
  }

  const pages = await engine.executeRaw<{
    slug: string;
    compiled_truth: string | null;
    frontmatter: Record<string, unknown> | null;
  }>(
    `SELECT slug, compiled_truth, frontmatter FROM pages WHERE ${conds.join(" AND ")} ORDER BY slug`,
    params
  );

  const eintraege: FristenbuchEintrag[] = [];
  let unparsebar = 0;

  for (const page of pages) {
    const caseSlug = page.slug.replace(/^deadline-calendars\//, "");
    const rows = parseDeadlineTable(page.compiled_truth ?? "");
    for (const row of rows) {
      const iso = parseDeadlineDate(row.datum);
      if (!iso) {
        unparsebar++;
        continue;
      }
      const status = klassifiziereFrist(iso, heute, vorfristTage);
      let vorfrist = addDays(iso, -vorfristTage);
      if (!istWerktag(vorfrist)) vorfrist = vorigerWerktag(vorfrist);
      eintraege.push({
        case_slug: caseSlug,
        datum: iso,
        frist: row.frist,
        rechtsgrundlage: row.rechtsgrundlage,
        folge_bei_versaeumnis: row.folge,
        beleg_on: row.beleg,
        ampel: row.ampel,
        status,
        vorfrist,
        eskalation: status === "kritisch" || status === "ueberfaellig",
      });
    }
  }

  // Sort: überfällig zuerst, dann nach Datum aufsteigend
  const order: Record<FristStatus, number> = { ueberfaellig: 0, kritisch: 1, vorfrist: 2, ok: 3 };
  eintraege.sort((a, b) => order[a.status] - order[b.status] || a.datum.localeCompare(b.datum));

  return {
    heute,
    eintraege,
    zusammenfassung: {
      gesamt: eintraege.length,
      ueberfaellig: eintraege.filter((e) => e.status === "ueberfaellig").length,
      kritisch: eintraege.filter((e) => e.status === "kritisch").length,
      vorfrist: eintraege.filter((e) => e.status === "vorfrist").length,
      ok: eintraege.filter((e) => e.status === "ok").length,
      unparsebar,
    },
  };
}

// ── ICS export ──────────────────────────────────────────────

/** Escape text per RFC 5545 §3.3.11. */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines to 75 octets per RFC 5545 §3.1 (simple char-based fold). */
function icsFold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Build the ICS feed: one all-day VEVENT per Frist (with VALARM at 09:00
 * two days prior) plus one Vorfrist VEVENT, so both control dates land in
 * the Kanzlei calendar. Deterministic given (fristenbuch, dtstamp).
 */
export function baueIcs(
  buch: Fristenbuch,
  opts?: { kalenderName?: string; dtstamp?: string }
): string {
  const dtstamp = (opts?.dtstamp ?? `${buch.heute}T000000Z`).replace(/[-:]/g, "");
  const name = opts?.kalenderName ?? "Subsumio Fristenbuch";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Subsumio//Fristenbuch//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`,
  ];

  for (const e of buch.eintraege) {
    const uidBase = `${e.case_slug}-${e.datum}-${e.frist}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const statusTag =
      e.status === "ueberfaellig"
        ? "ÜBERFÄLLIG"
        : e.status === "kritisch"
          ? "KRITISCH"
          : e.status === "vorfrist"
            ? "VORFRIST ERREICHT"
            : "";
    const summary = `${statusTag ? `[${statusTag}] ` : ""}FRIST: ${e.frist} (${e.case_slug})`;
    const description =
      `Akte: ${e.case_slug}\nRechtsgrundlage: ${e.rechtsgrundlage}\n` +
      `Folge bei Versäumnis: ${e.folge_bei_versaeumnis}\nBeleg: ${e.beleg_on}\n` +
      `Vorfrist: ${e.vorfrist}`;

    // Hauptfrist (all-day)
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:frist-${uidBase}@subsumio`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.datum)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(e.datum, 1))}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push(`CATEGORIES:FRIST,${icsEscape(e.status.toUpperCase())}`);
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${icsEscape(`Frist in 2 Tagen: ${e.frist}`)}`);
    lines.push("TRIGGER:-P2D");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");

    // Vorfrist (all-day, eigener Termin im Kanzlei-Kalender)
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:vorfrist-${uidBase}@subsumio`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.vorfrist)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(e.vorfrist, 1))}`);
    lines.push(
      `SUMMARY:${icsEscape(`VORFRIST: ${e.frist} (${e.case_slug}) — Hauptfrist ${e.datum}`)}`
    );
    lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push("CATEGORIES:VORFRIST");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
