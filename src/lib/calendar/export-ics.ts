/**
 * iCalendar export of the calendar view (Fristen, Verhandlungen, Termine) —
 * the downloadable file on /dashboard/calendar-export. RFC 5545: CRLF, folded
 * lines, VTIMEZONE for the Vienna-local times, UTC absolute alarm triggers.
 */
import { minutesToTime, parseTimeToMinutes, toLocalIsoDate } from "@/lib/calendar-conflicts";
import { addMinutesToWallClock } from "@/lib/calendar/wall-clock";
import { icsLines, icsUtcDateTime, VTIMEZONE_EUROPE_VIENNA } from "@/lib/ics-format";
import { zonedWallTimeToUtc } from "@/lib/datetime";

export type ExportKind = "deadline" | "hearing" | "appointment";

export interface CalendarExportEvent {
  id: string;
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  time?: string;
  durationMin?: number;
  description?: string;
  kind: ExportKind;
  isNotfrist?: boolean;
  caseLabel?: string;
  location?: string;
  vorfristDate?: string;
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toLocalIsoDate(new Date(y, m - 1, d + 1));
}

function escapeIcalText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545: Zeitangaben im Wiener Ortszeit-Kontext, ganztägige Einträge mit Folgetag als Ende. */
export function generateIcal(events: CalendarExportEvent[]): string {
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Subsumio//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Subsumio Kanzlei-Fristen",
    "X-WR-TIMEZONE:Europe/Vienna",
    ...VTIMEZONE_EUROPE_VIENNA,
  ];

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id.replace(/[^\w.-]/g, "-")}@subsumio.local`);
    const start = parseTimeToMinutes(ev.time);
    if (ev.kind !== "deadline" && start !== null) {
      const startClock = minutesToTime(start);
      // The end may roll into the next day.
      const end = addMinutesToWallClock(ev.date, startClock, ev.durationMin ?? 60);
      lines.push(`DTSTART;TZID=Europe/Vienna:${icsDate(ev.date)}T${startClock.replace(":", "")}00`);
      lines.push(`DTEND;TZID=Europe/Vienna:${icsDate(end.date)}T${end.time.replace(":", "")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(nextDay(ev.date))}`);
    }
    const prefix = ev.isNotfrist ? "Notfrist: " : ev.kind === "deadline" ? "Frist: " : "";
    lines.push(`SUMMARY:${escapeIcalText(`${prefix}${ev.title}`)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcalText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcalText(ev.location)}`);
    if (ev.kind === "deadline") {
      if (ev.vorfristDate) {
        lines.push("BEGIN:VALARM");
        // An absolute TRIGGER must be UTC (RFC 5545 §3.8.6.3): 08:00 Vienna.
        lines.push(
          `TRIGGER;VALUE=DATE-TIME:${icsUtcDateTime(zonedWallTimeToUtc(ev.vorfristDate, "08:00"))}`
        );
        lines.push("ACTION:DISPLAY");
        lines.push(`DESCRIPTION:${escapeIcalText(`Vorfrist: ${ev.title}`)}`);
        lines.push("END:VALARM");
      }
      // Zusätzlich immer eine Erinnerung zwei Tage vorher.
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-P2D");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeIcalText(`Frist: ${ev.title}`)}`);
      lines.push("END:VALARM");
    }
    lines.push(`DTSTAMP:${stamp}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${icsLines(lines)}\r\n`;
}
