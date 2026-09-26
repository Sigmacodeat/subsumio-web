// Which firm sent an SMS: provider message id (Twilio SID) → brain + phone
// hash. The delivery-status callback carries only the SID; without this index
// the status could not be filed under the sending firm. Only the phone hash is
// stored, never the raw number.

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_sms_outbound (
    sid text PRIMARY KEY,
    brain_id text NOT NULL,
    to_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`);

const memory = new Map<string, { brainId: string; toHash: string; at: number }>();

export async function recordSmsOutbound(
  sid: string,
  brainId: string,
  toHash: string
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    memory.set(sid, { brainId, toHash, at: Date.now() });
    return;
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_sms_outbound (sid, brain_id, to_hash) VALUES ($1, $2, $3)
     ON CONFLICT (sid) DO NOTHING`,
    [sid, brainId, toHash]
  );
}

export async function lookupSmsOutbound(
  sid: string
): Promise<{ brainId: string; toHash: string } | null> {
  const pool = getSharedPgPool();
  if (!pool) {
    const hit = memory.get(sid);
    if (!hit || Date.now() - hit.at > RETENTION_MS) return null;
    return { brainId: hit.brainId, toHash: hit.toHash };
  }
  await ensureSchema();
  const { rows } = await pool.query<{ brain_id: string; to_hash: string }>(
    `SELECT brain_id, to_hash FROM subsumio_sms_outbound
      WHERE sid = $1 AND created_at > now() - interval '30 days'`,
    [sid]
  );
  return rows[0] ? { brainId: rows[0].brain_id, toHash: rows[0].to_hash } : null;
}
