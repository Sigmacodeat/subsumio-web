// One signing attempt: which document, which method, who started it, and the
// digest of the original PDF. The random token is the only credential used by
// the callbacks and by PDF-AS-WEB when it fetches the original.

import { randomBytes } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import type { QesMethod } from "@/lib/qes/pdf-as";

export const QES_SESSION_TTL_MS = 30 * 60 * 1000;

export interface QesSession {
  token: string;
  brainId: string;
  userId: string;
  userEmail: string;
  documentSlug: string;
  caseSlug: string;
  title: string;
  method: QesMethod;
  status: "pending" | "fetched" | "processing" | "signed" | "failed";
  originalDigest: string | null;
  signedDocumentSlug: string | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_qes_sessions (
    token text PRIMARY KEY,
    data jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`);

const memory = new Map<string, QesSession>();

export function newQesToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createQesSession(
  input: Omit<
    QesSession,
    | "token"
    | "status"
    | "originalDigest"
    | "signedDocumentSlug"
    | "error"
    | "createdAt"
    | "expiresAt"
  >
): Promise<QesSession> {
  const now = Date.now();
  const session: QesSession = {
    ...input,
    token: newQesToken(),
    status: "pending",
    originalDigest: null,
    signedDocumentSlug: null,
    error: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + QES_SESSION_TTL_MS).toISOString(),
  };
  await save(session);
  return session;
}

export async function getQesSession(token: string): Promise<QesSession | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const pool = getSharedPgPool();
  let session: QesSession | null;
  if (pool) {
    await ensureSchema();
    const { rows } = await pool.query<{ data: QesSession }>(
      "SELECT data FROM subsumio_qes_sessions WHERE token = $1",
      [token]
    );
    session = rows[0]?.data ?? null;
  } else {
    session = memory.get(token) ?? null;
  }
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now() && session.status !== "signed")
    return null;
  return session;
}

export async function updateQesSession(
  token: string,
  patch: Partial<QesSession>
): Promise<QesSession | null> {
  const current = await getQesSession(token);
  if (!current) return null;
  const next = { ...current, ...patch, token: current.token };
  await save(next);
  return next;
}

/**
 * Atomically move a session from `from` to `to` (compare-and-set). Only one
 * caller wins, so a retried or doubled completion callback cannot store the
 * signed document twice. Returns the claimed session, or null when the
 * session is missing, expired, or already in another state.
 */
export async function claimQesSession(
  token: string,
  from: QesSession["status"],
  to: QesSession["status"]
): Promise<QesSession | null> {
  const current = await getQesSession(token);
  if (!current || current.status !== from) return null;
  const pool = getSharedPgPool();
  if (!pool) {
    // Synchronous check-and-set: no await between the read and the write.
    const live = memory.get(token);
    if (!live || live.status !== from) return null;
    const next = { ...live, status: to };
    memory.set(token, next);
    return next;
  }
  await ensureSchema();
  const { rows } = await pool.query<{ data: QesSession }>(
    `UPDATE subsumio_qes_sessions
        SET data = jsonb_set(data, '{status}', to_jsonb($3::text))
      WHERE token = $1 AND data->>'status' = $2
      RETURNING data`,
    [token, from, to]
  );
  return rows[0]?.data ?? null;
}

async function save(session: QesSession): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    memory.set(session.token, session);
    return;
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_qes_sessions (token, data, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data`,
    [session.token, session, session.expiresAt]
  );
}
