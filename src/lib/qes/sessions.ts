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

/**
 * Atomically claim a session for completion (fetched/failed → processing).
 * Returns the claimed session, or null when it is in another state — e.g.
 * a parallel invoke-app-url callback already claimed it. Single UPDATE on
 * Postgres; the in-memory fallback mutates synchronously, so two callers
 * can never both win.
 */
export async function claimQesCompletion(token: string): Promise<QesSession | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const pool = getSharedPgPool();
  if (!pool) {
    const session = memory.get(token);
    if (!session) return null;
    if (session.status !== "fetched" && session.status !== "failed") return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) return null;
    const next = { ...session, status: "processing" as const };
    memory.set(token, next);
    return next;
  }
  await ensureSchema();
  const { rows } = await pool.query<{ data: QesSession }>(
    `UPDATE subsumio_qes_sessions
       SET data = jsonb_set(data, '{status}', '"processing"')
     WHERE token = $1
       AND data->>'status' IN ('fetched', 'failed')
       AND expires_at > now()
     RETURNING data`,
    [token]
  );
  return rows[0]?.data ?? null;
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
