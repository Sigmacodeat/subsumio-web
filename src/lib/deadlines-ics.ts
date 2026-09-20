/**
 * The deadline calendar as iCalendar text.
 *
 * Shared by the signed-in download (`/api/legal/deadlines.ics`) and the
 * personal subscription link (`/api/calendar/<token>/fristen.ics`), so a
 * subscribed calendar and a downloaded file always contain the same entries.
 * The engine's own feed is preferred; if it has nothing, the events are built
 * from the matters in the brain.
 */

import { ENGINE_URL } from "@/lib/engine";

export interface FristEntry {
  title?: string;
  due_date?: string;
  case_title?: string;
  case_slug?: string;
}

type Headers = Record<string, string>;

function escapeIcs(value: string): string {
  return value.replace(/[\\,;]/g, "\\$&").replace(/\r?\n/g, " ");
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

export function buildIcs(fristen: FristEntry[], calendarName = "Subsumio Fristen"): string {
  const vevents = fristen
    .filter((f) => f.due_date)
    .map((f) => {
      const dtstart = f.due_date!.replace(/-/g, "");
      const summary = escapeIcs(f.title || "Frist");
      const description = escapeIcs(f.case_title || f.case_slug || "");
      return [
        "BEGIN:VEVENT",
        `UID:${dtstart}-${summary.slice(0, 20)}@subsumio`,
        `DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `SUMMARY:${summary}`,
        description ? `DESCRIPTION:${description}` : "",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
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
    vevents,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Deadlines from the matters in the brain (fallback when the engine feed is empty). */
export async function collectFristenFromBrain(
  headers: Headers,
  caseFilter?: string
): Promise<FristEntry[]> {
  const fristen: FristEntry[] = [];

  const fetchPagesByType = async (type: string) => {
    const url = new URL(`${ENGINE_URL}/api/pages`);
    url.searchParams.set("type", type);
    url.searchParams.set("limit", "300");
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(15_000) });
    // An unreachable brain must not look like "no deadlines": a subscribed
    // calendar would quietly empty itself. The caller answers 502 instead, and
    // the calendar keeps the entries it already has.
    if (!res.ok) throw new Error(`engine pages ${res.status}`);
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  };

  const [deadlinePages, casePages] = await Promise.all([
    fetchPagesByType("legal_deadline"),
    fetchPagesByType("legal_case"),
  ]);

  for (const page of deadlinePages) {
    const fm = (page as { frontmatter?: Record<string, unknown> }).frontmatter ?? {};
    const dueDate = String(fm.due_date ?? fm.date ?? "");
    if (!dueDate) continue;
    if (caseFilter && fm.case_slug !== caseFilter) continue;
    fristen.push({
      title: String(fm.description ?? fm.title ?? "Frist"),
      due_date: dueDate.slice(0, 10),
      case_slug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
      case_title: typeof fm.case_title === "string" ? fm.case_title : undefined,
    });
  }

  for (const page of casePages) {
    if (caseFilter && (page as { slug?: string }).slug !== caseFilter) continue;
    const fm = ((page as { frontmatter?: Record<string, unknown> }).frontmatter ?? {}) as {
      deadlines?: Array<{ title?: string; due_date?: string }>;
    };
    for (const d of fm.deadlines ?? []) {
      if (!d.due_date) continue;
      fristen.push({
        title: d.title || "Frist",
        due_date: d.due_date.slice(0, 10),
        case_slug: (page as { slug?: string }).slug,
        case_title: (page as { title?: string }).title,
      });
    }
  }

  return fristen;
}

/**
 * The calendar for one caller, as text. `headers` must already carry that
 * person's identity, so the engine applies the matter access rules.
 */
export async function deadlinesIcsFor(headers: Headers, caseSlug?: string): Promise<string> {
  const url = `${ENGINE_URL}/api/legal/deadlines.ics${
    caseSlug ? `?case=${encodeURIComponent(caseSlug)}` : ""
  }`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const ics = await res.text();
      if (ics.includes("BEGIN:VEVENT")) return ics;
    }
  } catch {
    // Engine feed unavailable — fall through to the brain pages.
  }
  return buildIcs(await collectFristenFromBrain(headers, caseSlug));
}
