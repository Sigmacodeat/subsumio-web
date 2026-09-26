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
import {
  MAIL_OAUTH_PROVIDERS,
  refreshMailOAuthToken,
  type MailOAuthProvider,
  type MailOAuthTokens,
} from "@/lib/email/mail-oauth";

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
  /** "oauth": signed in at the provider, no password stored. */
  authType: "password" | "oauth";
  oauthProvider: MailOAuthProvider | null;
  enabled: boolean;
  /** WP-4.19: two-way calendar sync via the OAuth provider's calendar API. */
  calendarSync: boolean;
  lastCalendarSyncAt: string | null;
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
  // OAuth mailboxes (Microsoft 365, Google): no password, encrypted refresh token instead.
  "ALTER TABLE subsumio_mail_accounts ALTER COLUMN imap_password_enc DROP NOT NULL",
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'password'",
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS oauth_provider text",
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS oauth_refresh_enc text",
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS oauth_access_enc text",
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS oauth_expires_at timestamptz",
  // WP-4.19 per-user calendar sync opt-in (delegated OAuth only).
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS calendar_sync boolean NOT NULL DEFAULT false",
  "ALTER TABLE subsumio_mail_accounts ADD COLUMN IF NOT EXISTS calendar_synced_at timestamptz",
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
    authType: r.auth_type === "oauth" ? "oauth" : "password",
    oauthProvider:
      r.oauth_provider === "microsoft" || r.oauth_provider === "google" ? r.oauth_provider : null,
    enabled: Boolean(r.enabled),
    calendarSync: Boolean(r.calendar_sync),
    lastCalendarSyncAt: r.calendar_synced_at
      ? new Date(r.calendar_synced_at as string).toISOString()
      : null,
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
  if (!rows[0] || !rows[0].imap_password_enc) return null;
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
       auth_type = 'password', oauth_provider = NULL, oauth_refresh_enc = NULL, oauth_access_enc = NULL,
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

/** WP-4.19: opt an OAuth mailbox in/out of two-way calendar sync. */
export async function setCalendarSync(
  brainId: string,
  id: string,
  enabled: boolean
): Promise<MailAccount | null> {
  await ensureSchema();
  const { rows } = await pool().query(
    `UPDATE subsumio_mail_accounts SET calendar_sync = $3, updated_at = now()
      WHERE brain_id = $1 AND id = $2 AND auth_type = 'oauth' RETURNING *`,
    [brainId, id, enabled]
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

/** Enabled OAuth accounts that opted into calendar sync — cron only. */
export async function listCalendarSyncAccounts(): Promise<MailAccount[]> {
  await ensureSchema();
  const { rows } = await pool().query(
    `SELECT * FROM subsumio_mail_accounts
      WHERE enabled = true AND auth_type = 'oauth' AND calendar_sync = true
      ORDER BY calendar_synced_at ASC NULLS FIRST`
  );
  return rows.map(rowToAccount);
}

export async function recordCalendarSyncResult(id: string, error: string | null): Promise<void> {
  await ensureSchema();
  await pool().query(
    `UPDATE subsumio_mail_accounts SET calendar_synced_at = now(), last_error = $2, updated_at = now()
      WHERE id = $1`,
    [id, error]
  );
}

/** A calendar sync that failed as a whole: keeps the last successful time. */
export async function recordCalendarSyncError(id: string, error: string): Promise<void> {
  await ensureSchema();
  await pool().query(
    `UPDATE subsumio_mail_accounts SET last_error = $2, updated_at = now() WHERE id = $1`,
    [id, error.slice(0, 500)]
  );
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

/** Connect (or reconnect) a mailbox that signed in at its provider. */
export async function createOAuthMailAccount(
  brainId: string,
  userId: string,
  provider: MailOAuthProvider,
  email: string,
  tokens: MailOAuthTokens
): Promise<MailAccount> {
  await ensureSchema();
  if (!tokens.refreshToken) throw new Error("mail_oauth_refresh_token_missing");
  const cfg = MAIL_OAUTH_PROVIDERS[provider];
  const refreshEnc = await encrypt(tokens.refreshToken);
  const accessEnc = await encrypt(tokens.accessToken);
  const address = email.trim().toLowerCase();
  const { rows } = await pool().query(
    `INSERT INTO subsumio_mail_accounts
      (id, brain_id, label, email, imap_host, imap_port, imap_secure, imap_user, folder,
       smtp_host, smtp_port, smtp_secure, smtp_user, auth_type, oauth_provider,
       oauth_refresh_enc, oauth_access_enc, oauth_expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,993,true,$4,'INBOX',$6,$7,$8,$4,'oauth',$9,$10,$11,$12,$13)
     ON CONFLICT (brain_id, email) DO UPDATE SET
       imap_host = EXCLUDED.imap_host, imap_port = 993, imap_secure = true, imap_user = EXCLUDED.imap_user,
       smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_secure = EXCLUDED.smtp_secure,
       smtp_user = EXCLUDED.smtp_user, auth_type = 'oauth', oauth_provider = EXCLUDED.oauth_provider,
       oauth_refresh_enc = EXCLUDED.oauth_refresh_enc, oauth_access_enc = EXCLUDED.oauth_access_enc,
       oauth_expires_at = EXCLUDED.oauth_expires_at, imap_password_enc = NULL, smtp_password_enc = NULL,
       enabled = true, last_error = NULL, updated_at = now()
     RETURNING *`,
    [
      randomUUID(),
      brainId,
      address,
      address,
      cfg.imapHost,
      cfg.smtpHost,
      cfg.smtpPort,
      cfg.smtpPort === 465,
      provider,
      refreshEnc,
      accessEnc,
      tokens.expiresAt,
      userId,
    ]
  );
  return rowToAccount(rows[0]);
}

export type MailAccountAuth =
  | { type: "password"; imapPassword: string; smtpPassword: string }
  | { type: "oauth"; accessToken: string };

/**
 * Credentials for one IMAP/SMTP session. OAuth access tokens are refreshed when
 * they have less than two minutes left; a rotated refresh token is stored.
 */
export async function getMailAccountAuth(account: MailAccount): Promise<MailAccountAuth | null> {
  if (account.authType === "password") {
    const secrets = await getMailAccountSecrets(account.id);
    return secrets
      ? {
          type: "password",
          imapPassword: secrets.imapPassword,
          smtpPassword: secrets.smtpPassword ?? secrets.imapPassword,
        }
      : null;
  }
  if (!account.oauthProvider) return null;
  await ensureSchema();
  const { rows } = await pool().query(
    "SELECT oauth_refresh_enc, oauth_access_enc, oauth_expires_at FROM subsumio_mail_accounts WHERE id = $1",
    [account.id]
  );
  const row = rows[0];
  if (!row?.oauth_refresh_enc) return null;
  const expiresAt = row.oauth_expires_at ? new Date(row.oauth_expires_at as string).getTime() : 0;
  if (row.oauth_access_enc && expiresAt - Date.now() > 120_000) {
    const cached = await decrypt(String(row.oauth_access_enc));
    if (cached) return { type: "oauth", accessToken: cached };
  }
  const refreshToken = await decrypt(String(row.oauth_refresh_enc));
  if (!refreshToken) return null;
  const fresh = await refreshMailOAuthToken(account.oauthProvider, refreshToken);
  await pool().query(
    `UPDATE subsumio_mail_accounts SET
       oauth_access_enc = $2, oauth_expires_at = $3,
       oauth_refresh_enc = COALESCE($4, oauth_refresh_enc), updated_at = now()
     WHERE id = $1`,
    [
      account.id,
      await encrypt(fresh.accessToken),
      fresh.expiresAt,
      fresh.refreshToken ? await encrypt(fresh.refreshToken) : null,
    ]
  );
  return { type: "oauth", accessToken: fresh.accessToken };
}
