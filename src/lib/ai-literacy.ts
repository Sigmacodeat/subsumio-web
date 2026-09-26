/**
 * KI-Kompetenz-Nachweis nach Art. 4 KI-VO (EU AI Act): Die Kanzlei als
 * Betreiberin muss sicherstellen, dass ihr Personal, das KI nutzt, über
 * ausreichende KI-Kompetenz verfügt — und das belegen können. Je Mitarbeiter:
 * Datum der Schulung, Inhalt, bestätigt von. Bewusst klein: ein Nachweis ist
 * ein Eintrag, kein Kurs-Management.
 *
 * Entscheidung: Jede aktive Person mit Kanzlei-Rolle (admin/lawyer/assistant)
 * zählt als KI-Nutzer:in — KI ist Kernbestandteil jeder Arbeitsfläche, und ein
 * fehlender Nachweis soll nicht erst nach der ersten Nutzung auffallen.
 */
import { randomUUID } from "node:crypto";
import { createSchemaInit } from "@/lib/schema-init";
import { getSharedPgPool } from "@/lib/auth/store";
import { isStaffRole } from "@/lib/team-visibility";

export interface AiLiteracyRecord {
  id: string;
  brain_id: string;
  user_id: string;
  /** Training date (YYYY-MM-DD). */
  trained_on: string;
  topic: string;
  confirmed_by: string;
  recorded_by: string;
  created_at: string;
}

export interface LiteracyMember {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  deactivatedAt?: string | null;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_ai_literacy_records (
    id           TEXT PRIMARY KEY,
    brain_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    trained_on   DATE NOT NULL,
    topic        TEXT NOT NULL,
    confirmed_by TEXT NOT NULL,
    recorded_by  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_literacy_brain ON subsumio_ai_literacy_records(brain_id, user_id)`,
]);

function rowToRecord(r: Record<string, unknown>): AiLiteracyRecord {
  const d = r.trained_on;
  return {
    id: String(r.id),
    brain_id: String(r.brain_id),
    user_id: String(r.user_id),
    trained_on: d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10),
    topic: String(r.topic),
    confirmed_by: String(r.confirmed_by),
    recorded_by: String(r.recorded_by),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function listAiLiteracyRecords(brainId: string): Promise<AiLiteracyRecord[]> {
  await ensureSchema();
  const pool = getSharedPgPool();
  if (!pool) return [];
  const res = await pool.query(
    `SELECT * FROM subsumio_ai_literacy_records WHERE brain_id = $1
     ORDER BY trained_on DESC, created_at DESC LIMIT 5000`,
    [brainId]
  );
  return res.rows.map((r) => rowToRecord(r as Record<string, unknown>));
}

export async function addAiLiteracyRecord(input: {
  brainId: string;
  userId: string;
  trainedOn: string;
  topic: string;
  confirmedBy: string;
  recordedBy: string;
}): Promise<AiLiteracyRecord> {
  await ensureSchema();
  const pool = getSharedPgPool();
  if (!pool) throw new Error("No DB pool available");
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO subsumio_ai_literacy_records
       (id, brain_id, user_id, trained_on, topic, confirmed_by, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      id,
      input.brainId,
      input.userId,
      input.trainedOn,
      input.topic,
      input.confirmedBy,
      input.recordedBy,
    ]
  );
  return rowToRecord(res.rows[0] as Record<string, unknown>);
}

/** Active firm staff without any training record — the admin notice. */
export function membersWithoutRecord(
  members: LiteracyMember[],
  records: Pick<AiLiteracyRecord, "user_id">[]
): LiteracyMember[] {
  const covered = new Set(records.map((r) => r.user_id));
  return members.filter((m) => isStaffRole(m.role) && !m.deactivatedAt && !covered.has(m.id));
}

/** A spreadsheet cell that is never read as a formula. */
function cell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export (semicolon, Excel-DE) of all records, with name and e-mail. */
export function aiLiteracyCsv(records: AiLiteracyRecord[], members: LiteracyMember[]): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  const header = ["Mitarbeiter:in", "E-Mail", "Schulung am", "Inhalt", "Bestätigt von", "Erfasst"];
  const lines = records.map((r) => {
    const m = byId.get(r.user_id);
    return [
      m?.name ?? r.user_id,
      m?.email ?? "",
      r.trained_on,
      r.topic,
      r.confirmed_by,
      r.created_at.slice(0, 10),
    ]
      .map(cell)
      .join(";");
  });
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
