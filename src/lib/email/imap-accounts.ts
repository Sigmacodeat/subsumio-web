// Connected firm mailboxes (IMAP inbound, SMTP outbound).
//
// One row per mailbox a firm connects. Passwords are encrypted at rest with the
// web app's AES-256-GCM helper (SUBSUMIO_ENCRYPTION_KEY) and are never returned
// by any API — the public shape carries no secrets. Mail fetched from these
// accounts lands in `subsumio_mail_messages` (see mailbox.ts), so it shows up
// in the matter e-mail tab and the Posteingang like any other mail.

import { randomUUID } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { decrypt, encrypt } from "@/lib/encryption";

export interface MailAccountSecrets {
  imapPassword: string;
  smtpPassword: string | null;
}

export interface MailAccount {
  id: string;
  brainId: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  folder: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  enabled: boolean;
  lastUid: number | null;
  uidValidity: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface MailAccountInput {
  label?: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPassword: string;
  folder?: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  /** Empty → reuse the IMAP password (the common case). */
  smtpPassword?: string | null;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_mail_accounts (
    id text PRIMARY KEY,
    brain_id text NOT NULL,
    label text NOT NULL DEFAULT '',
    email text NOT NULL,
    imap_host text NOT NULL,
    imap_port integer NOT NULL DEFAULT 993,
    imap_secure boolean NOT NULL DEFAULT true,
    imap_user text NOT NULL,
    imap_password_enc text NOT NULL,
    folder text NOT NULL DEFAULT 'INBOX',
    smtp_host text,
    smtp_port integer,
    smtp_secure boolean NOT NULL DEFAULT true,
    smtp_user text,
    smtp_password_enc text,
    enabled boolean NOT NULL DEFAULT true,
    last_uid bigint,
    uid_validity text,
    last_sync_at timestamptz,
    last_error text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brain_id, email)
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_mail_accounts_brain_idx ON subsumio_mail_accounts (brain_id)",
]);

function pool() {
  const p = getSharedPgPool();
  if (!p) throw new Error("mail_accounts_database_not_configured");
  return p;
}

function rowToAccount(r: Record<string, unknown>): MailAccount {
  return {
    id: String(r.id),
    brainId: String(r.brain_id),
    label: String(r.label ?? ""),
    email: String(r.email),
    imapHost: String(r.imap_host),
    imapPort: Number(r.imap_port),
    imapSecure: Boolean(r.imap_secure),
    imapUser: String(r.imap_user),
    folder: String(r.folder ?? "INBOX"),
    smtpHost: r.smtp_host ? String(r.smtp_host) : null,
    smtpPort: r.smtp_port == null ? null : Number(r.smtp_port),
    smtpSecure: Boolean(r.smtp_secure),
    smtpUser: r.smtp_user ? String(r.smtp_user) : null,
    enabled: Boolean(r.enabled),
    lastUid: r.last_uid == null ? null : Number(r.last_uid),
    uidValidity: r.uid_validity ? String(r.uid_validity) : null,
    lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at as string).toISOString() : null,
    lastError: r.last_error ? String(r.last_error) : null,
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listMailAccounts(brainId: string): Promise<MailAccount[]> {
  await ensureSchema();
  const { rows } = await pool().query(
    "SELECT * FROM subsumio_mail_accounts WHERE brain_id = $1 ORDER BY created_at ASC",
    [brainId]
  );
  return rows.map(rowToAccount);
}

/** Every enabled account across all firms — cron only. */
export async function listEnabledMailAccounts(): Promise<MailAccount[]> {
  await ensureSchema();
  const { rows } = await pool().query(
    "SELECT * FROM subsumio_mail_accounts WHERE enabled = true ORDER BY last_sync_at ASC NULLS FIRST"
  );
  return rows.map(rowToAccount);
}

export async function getMailAccount(brainId: string, id: string): Promise<MailAccount | null> {
  await ensureSchema();
  const { rows } = await pool().query(
    "SELECT * FROM subsumio_mail_accounts WHERE brain_id = $1 AND id = $2",
    [brainId, id]
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

/** First enabled account of the firm that can send (SMTP configured). */
export async function getSendingAccount(brainId: string): Promise<MailAccount | null> {
  if (!getSharedPgPool()) return null;
  await ensureSchema();
  const { rows } = await pool().query(
    `SELECT * FROM subsumio_mail_accounts
      WHERE brain_id = $1 AND enabled = true AND smtp_host IS NOT NULL
      ORDER BY created_at ASC LIMIT 1`,
    [brainId]
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function getMailAccountSecrets(id: string): Promise<MailAccountSecrets | null> {
  await ensureSchema();
  const { rows } = await pool().query(
    "SELECT imap_password_enc, smtp_password_enc FROM subsumio_mail_accounts WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;
  const imapPassword = await decrypt(String(rows[0].imap_password_enc));
  if (!imapPassword) return null;
  const smtpPassword = rows[0].smtp_password_enc
    ? await decrypt(String(rows[0].smtp_password_enc))
    : null;
  return { imapPassword, smtpPassword: smtpPassword ?? imapPassword };
}

export async function createMailAccount(
  brainId: string,
  userId: string,
  input: MailAccountInput
): Promise<MailAccount> {
  await ensureSchema();
  const imapEnc = await encrypt(input.imapPassword);
  if (!imapEnc) throw new Error("mail_account_password_required");
  const smtpEnc = input.smtpPassword ? await encrypt(input.smtpPassword) : null;
  const { rows } = await pool().query(
    `INSERT INTO subsumio_mail_accounts
      (id, brain_id, label, email, imap_host, imap_port, imap_secure, imap_user, imap_password_enc,
       folder, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_enc, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (brain_id, email) DO UPDATE SET
       label = EXCLUDED.label,
       imap_host = EXCLUDED.imap_host, imap_port = EXCLUDED.imap_port,
       imap_secure = EXCLUDED.imap_secure, imap_user = EXCLUDED.imap_user,
       imap_password_enc = EXCLUDED.imap_password_enc, folder = EXCLUDED.folder,
       smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port,
       smtp_secure = EXCLUDED.smtp_secure, smtp_user = EXCLUDED.smtp_user,
       smtp_password_enc = EXCLUDED.smtp_password_enc,
       enabled = true, last_error = NULL, updated_at = now()
     RETURNING *`,
    [
      randomUUID(),
      brainId,
      (input.label ?? "").trim() || input.email,
      input.email.trim().toLowerCase(),
      input.imapHost.trim(),
      input.imapPort,
      input.imapSecure,
      input.imapUser.trim(),
      imapEnc,
      (input.folder ?? "INBOX").trim() || "INBOX",
      input.smtpHost?.trim() || null,
      input.smtpHost ? (input.smtpPort ?? 465) : null,
      input.smtpSecure ?? true,
      input.smtpHost ? input.smtpUser?.trim() || input.imapUser.trim() : null,
      smtpEnc,
      userId,
    ]
  );
  return rowToAccount(rows[0]);
}

export async function setMailAccountEnabled(
  brainId: string,
  id: string,
  enabled: boolean
): Promise<MailAccount | null> {
  await ensureSchema();
  const { rows } = await pool().query(
    `UPDATE subsumio_mail_accounts SET enabled = $3, updated_at = now()
      WHERE brain_id = $1 AND id = $2 RETURNING *`,
    [brainId, id, enabled]
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function deleteMailAccount(brainId: string, id: string): Promise<boolean> {
  await ensureSchema();
  const res = await pool().query(
    "DELETE FROM subsumio_mail_accounts WHERE brain_id = $1 AND id = $2",
    [brainId, id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function recordSyncResult(
  id: string,
  result: { lastUid?: number | null; uidValidity?: string | null; error?: string | null }
): Promise<void> {
  await ensureSchema();
  await pool().query(
    `UPDATE subsumio_mail_accounts SET
       last_uid = COALESCE($2, last_uid),
       uid_validity = COALESCE($3, uid_validity),
       last_error = $4,
       last_sync_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, result.lastUid ?? null, result.uidValidity ?? null, result.error ?? null]
  );
}
