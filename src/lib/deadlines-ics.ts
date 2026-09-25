/**
 * The deadline calendar as iCalendar text.
 *
 * Shared by the signed-in download (`/api/legal/deadlines.ics`) and the
 * personal subscription link (`/api/calendar/<token>/fristen.ics`), so a
 * subscribed calendar and a downloaded file always contain the same entries.
 *
 * Built from the unified Fristen read model (src/lib/fristen-read-model.ts) —
 * the same list the Fristen view shows: the engine Fristenbuch, `legal_deadline`
 * pages and the deadlines embedded in matters, deduplicated. Only OPEN
 * deadlines are exported. If any deadline source fails to load the feed
 * throws (callers answer 502), so a subscribed calendar keeps the entries it
 * already has instead of silently dropping deadlines.
 */

import { DEADLINE_SOURCES, loadFristenReadModel, type Frist } from "@/lib/fristen-read-model";
import { icsLines } from "@/lib/ics-format";

export interface FristEntry {
  /** Stable, unique event id (source + slug + deadline id). */
  uid: string;
  title?: string;
  due_date?: string;
  vorfrist_date?: string;
  case_title?: string;
  case_slug?: string;
  law?: string;
  is_notfrist?: boolean;
  /** Anything but "approved" marks the entry as not yet reviewed. */
  review_status?: string;
}

function escapeIcs(value: string): string {
  return value.replace(/[\\,;]/g, "\\$&").replace(/\r?\n/g, " ");
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** FNV-1a, base 36 — short and deterministic. */
function shortHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function uidPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Event UID from where the deadline lives, never from its date + title: two
 * matters with a "Berufung" on the same day are two events. A matter-embedded
 * deadline without a stored id falls back to a hash of its title and date.
 */
export function fristUid(f: Frist): string {
  const container = f.source_slug ?? f.case_slug ?? "";
  let id: string;
  if (f.source === "legal_deadline") id = "";
  else if (f.source === "legal_case" && f.deadline_ref?.id) id = f.deadline_ref.id;
  else if (f.source === "fristenbuch") id = shortHash(`${f.due_date}|${f.title}`);
  else id = shortHash(`${f.id}|${f.due_date}|${f.title}`);
  return [f.source, uidPart(container), uidPart(id)].filter(Boolean).join("-");
}

/** Open deadlines of the read model as calendar entries. */
export function fristenToIcsEntries(fristen: Frist[]): FristEntry[] {
  const out: FristEntry[] = [];
  const seen = new Set<string>();
  for (const f of fristen) {
    if (f.status === "done" || !f.due_date) continue;
    if (f.review_status === "rejected") continue;
    let uid = fristUid(f);
    // Belt and braces: a UID collision would make a calendar drop one event.
    if (seen.has(uid)) uid = `${uid}-${shortHash(`${f.id}|${f.title}|${f.due_date}`)}`;
    seen.add(uid);
    out.push({
      uid,
      title: f.title,
      due_date: f.due_date.slice(0, 10),
      vorfrist_date: f.vorfrist_date?.slice(0, 10),
      case_title: f.case_title,
      case_slug: f.case_slug,
      law: f.law,
      is_notfrist: f.is_notfrist === true,
      review_status: f.review_status,
    });
  }
  return out;
}

export function buildIcs(fristen: FristEntry[], calendarName = "Subsumio Fristen"): string {
  const dtstamp = stamp();
  const vevents = fristen
    .filter((f) => f.due_date)
    .flatMap((f) => {
      const due = f.due_date!.slice(0, 10);
      const unreviewed = !!f.review_status && f.review_status !== "approved";
      const prefix = `${unreviewed ? "[UNGEPRÜFT] " : ""}${f.is_notfrist ? "NOTFRIST: " : ""}`;
      const title = f.title || "Frist";
      const summary = escapeIcs(`${prefix}${title}`);
      const description = escapeIcs(
        [f.case_title || f.case_slug || "", f.law || ""].filter(Boolean).join(" · ")
      );
      const events = [
        [
          "BEGIN:VEVENT",
          `UID:${f.uid}@subsumio`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${due.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${nextDay(due).replace(/-/g, "")}`,
          `SUMMARY:${summary}`,
          description ? `DESCRIPTION:${description}` : "",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeIcs(`Frist in 2 Tagen: ${title}`)}`,
          "TRIGGER:-P2D",
          "END:VALARM",
          "END:VEVENT",
        ],
      ];
      const vorfrist = f.vorfrist_date?.slice(0, 10);
      if (vorfrist && vorfrist < due) {
        events.push([
          "BEGIN:VEVENT",
          `UID:vorfrist-${f.uid}@subsumio`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${vorfrist.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${nextDay(vorfrist).replace(/-/g, "")}`,
          `SUMMARY:${escapeIcs(`VORFRIST: ${title} — Fristende ${due}`)}`,
          description ? `DESCRIPTION:${description}` : "",
          "END:VEVENT",
        ]);
      }
      return events.map(icsLines);
    })
    .join("\r\n");

  const header = icsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Subsumio//Fristenbuch//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    // Calendar clients poll on their own schedule; the hint keeps a
    // subscription roughly an hour behind at worst.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ]);
  // vevents are already folded; every content line ends with CRLF.
  return [header, vevents, "END:VCALENDAR"].filter(Boolean).join("\r\n") + "\r\n";
}

/**
 * The calendar for one caller, as text. `headers` must already carry that
 * person's identity, so the engine applies the matter access rules. Throws
 * when a deadline source is unavailable.
 */
export async function deadlinesIcsFor(
  headers: Record<string, string>,
  caseSlug?: string
): Promise<string> {
  const { fristen, failedSources } = await loadFristenReadModel(headers, { caseFilter: caseSlug });
  const failed = failedSources.filter((src) => DEADLINE_SOURCES.includes(src));
  if (failed.length > 0) {
    throw new Error(`deadline sources unavailable: ${failed.join(", ")}`);
  }
  return buildIcs(fristenToIcsEntries(fristen));
}
