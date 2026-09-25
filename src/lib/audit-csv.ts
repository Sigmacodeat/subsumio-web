/**
 * CSV export of the audit protocol.
 *
 * - RFC 4180: every field quoted, embedded quotes doubled, CRLF line ends.
 * - Spreadsheet formula neutralisation: a value starting with = + - @ (or a
 *   tab / carriage return) is prefixed with ' so Excel/LibreOffice treat it
 *   as text, never as a formula (slugs, names and details are user-controlled).
 * - Timestamps in Vienna local time with explicit UTC offset — the protocol is
 *   read by Austrian firms and auditors, not in UTC.
 */
import type { AuditEntry } from "@/lib/audit-labels";

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** "25.09.2026 00:30:00 (UTC+02:00)" — Europe/Vienna wall clock + offset. */
export function formatViennaTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const parts = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const offset = get("timeZoneName").replace("GMT", "UTC") || "UTC";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}:${get("second")} (${offset === "UTC" ? "UTC+00:00" : offset})`;
}

export const AUDIT_CSV_HEADER = [
  "Zeitpunkt (Wien)",
  "Aktion",
  "Bezeichnung",
  "Datensatz",
  "Kennung",
  "Benutzer",
  "Angaben",
];

export function buildAuditCsv(
  entries: readonly AuditEntry[],
  labels: {
    action: (action: string) => string;
    entity: (entityType: string | undefined) => string;
  }
): string {
  const lines = [AUDIT_CSV_HEADER.map(csvField).join(",")];
  for (const e of entries) {
    lines.push(
      [
        formatViennaTimestamp(e.timestamp),
        e.action,
        labels.action(e.action),
        labels.entity(e.entityType),
        e.entityId ?? "",
        e.userEmail ?? "",
        e.details ? JSON.stringify(e.details) : "",
      ]
        .map(csvField)
        .join(",")
    );
  }
  // BOM so Excel opens UTF-8 (Umlaute) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
