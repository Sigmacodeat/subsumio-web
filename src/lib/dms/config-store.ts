// DMS connection of a firm (one per brain).
//
// Same storage pattern as the firm mailboxes (src/lib/email/imap-accounts.ts):
// the API key is encrypted at rest with the web app's AES-256-GCM helper
// (SUBSUMIO_ENCRYPTION_KEY) and never leaves the server — the public shape
// only says whether a key is stored.

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { decrypt, encrypt } from "@/lib/encryption";
import { isDmsProvider, type DMSProvider, type DMSSettings } from "./index";

/** What the settings page may see — no secrets. */
export interface DmsConfigPublic {
  provider: DMSProvider;
  baseUrl: string;
  hasApiKey: boolean;
  sharepointSiteId: string | null;
  sharepointDriveId: string | null;
  boxFolderId: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface DmsConfigInput {
  provider: DMSProvider;
  baseUrl?: string | null;
  /** Empty/absent on an update → keep the stored key. */
  apiKey?: string | null;
  sharepointSiteId?: string | null;
  sharepointDriveId?: string | null;
  boxFolderId?: string | null;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_dms_configs (
    brain_id text PRIMARY KEY,
    provider text NOT NULL,
    base_url text NOT NULL DEFAULT '',
    api_key_enc text NOT NULL,
    sharepoint_site_id text,
    sharepoint_drive_id text,
    box_folder_id text,
    created_by text,
    updated_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]);

function pool() {
  const p = getSharedPgPool();
  if (!p) throw new Error("dms_config_database_not_configured");
  return p;
}

const PRIVATE_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home.arpa"];

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * The DMS endpoint a firm enters is fetched server-side, so only public
 * HTTPS endpoints are accepted: no plain HTTP, no embedded credentials, no
 * loopback/private/link-local addresses or internal host names.
 * Returns the normalised URL (no trailing slash) or an error code.
 */
export function validateDmsBaseUrl(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (u.protocol !== "https:") return { ok: false, error: "https_required" };
  if (u.username || u.password) return { ok: false, error: "credentials_in_url" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".")) return { ok: false, error: "private_host" };
  if (host === "localhost" || PRIVATE_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: "private_host" };
  }
  // IPv6 literals ([::1], [fd00::…], …) are not needed for a hosted DMS.
  if (host.startsWith("[") || host.includes(":")) return { ok: false, error: "private_host" };
  if (isPrivateIPv4(host)) return { ok: false, error: "private_host" };
  u.hash = "";
  u.search = "";
  return { ok: true, url: u.toString().replace(/\/+$/, "") };
}

function rowToPublic(r: Record<string, unknown>): DmsConfigPublic | null {
  if (!isDmsProvider(r.provider)) return null;
  return {
    provider: r.provider,
    baseUrl: String(r.base_url ?? ""),
    hasApiKey: Boolean(r.api_key_enc),
    sharepointSiteId: r.sharepoint_site_id ? String(r.sharepoint_site_id) : null,
    sharepointDriveId: r.sharepoint_drive_id ? String(r.sharepoint_drive_id) : null,
    boxFolderId: r.box_folder_id ? String(r.box_folder_id) : null,
    updatedBy: r.updated_by ? String(r.updated_by) : null,
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

/** The firm's DMS connection for the settings page — never includes the key. */
export async function getDmsConfig(brainId: string): Promise<DmsConfigPublic | null> {
  await ensureSchema();
  const { rows } = await pool().query("SELECT * FROM subsumio_dms_configs WHERE brain_id = $1", [
    brainId,
  ]);
  return rows[0] ? rowToPublic(rows[0]) : null;
}

/**
 * Decrypted connector settings of this firm, or null when the firm has none.
 * A stored row that cannot be read (unknown provider, undecryptable key)
 * throws — the caller must fail closed instead of falling back.
 */
export async function getDmsSettingsForBrain(brainId: string): Promise<DMSSettings | null> {
  if (!getSharedPgPool()) return null;
  await ensureSchema();
  const { rows } = await pool().query("SELECT * FROM subsumio_dms_configs WHERE brain_id = $1", [
    brainId,
  ]);
  const r = rows[0];
  if (!r) return null;
  if (!isDmsProvider(r.provider)) throw new Error("dms_config_unreadable");
  const apiKey = await decrypt(String(r.api_key_enc ?? ""));
  if (!apiKey) throw new Error("dms_config_unreadable");
  return {
    provider: r.provider,
    baseUrl: String(r.base_url ?? ""),
    apiKey,
    sharepointSiteId: r.sharepoint_site_id ? String(r.sharepoint_site_id) : null,
    sharepointDriveId: r.sharepoint_drive_id ? String(r.sharepoint_drive_id) : null,
    boxFolderId: r.box_folder_id ? String(r.box_folder_id) : null,
  };
}

/** Create or replace the firm's DMS connection. The key is stored encrypted. */
export async function saveDmsConfig(
  brainId: string,
  userId: string,
  input: DmsConfigInput
): Promise<DmsConfigPublic> {
  await ensureSchema();
  const apiKeyEnc = input.apiKey ? await encrypt(input.apiKey) : null;
  if (!apiKeyEnc) {
    // Update without a new key: keep the stored one — but only if there is one.
    const { rows } = await pool().query(
      "SELECT api_key_enc FROM subsumio_dms_configs WHERE brain_id = $1",
      [brainId]
    );
    if (!rows[0]?.api_key_enc) throw new Error("dms_api_key_required");
  }
  const { rows } = await pool().query(
    `INSERT INTO subsumio_dms_configs
      (brain_id, provider, base_url, api_key_enc, sharepoint_site_id, sharepoint_drive_id,
       box_folder_id, created_by, updated_by)
     VALUES ($1,$2,$3,COALESCE($4,''),$5,$6,$7,$8,$8)
     ON CONFLICT (brain_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       base_url = EXCLUDED.base_url,
       api_key_enc = COALESCE($4, subsumio_dms_configs.api_key_enc),
       sharepoint_site_id = EXCLUDED.sharepoint_site_id,
       sharepoint_drive_id = EXCLUDED.sharepoint_drive_id,
       box_folder_id = EXCLUDED.box_folder_id,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [
      brainId,
      input.provider,
      (input.baseUrl ?? "").trim(),
      apiKeyEnc,
      input.sharepointSiteId?.trim() || null,
      input.sharepointDriveId?.trim() || null,
      input.boxFolderId?.trim() || null,
      userId,
    ]
  );
  const saved = rowToPublic(rows[0]);
  if (!saved) throw new Error("dms_config_unreadable");
  return saved;
}

/** Disconnect: removes the stored credentials. Imported documents stay in the brain. */
export async function deleteDmsConfig(brainId: string): Promise<boolean> {
  await ensureSchema();
  const res = await pool().query("DELETE FROM subsumio_dms_configs WHERE brain_id = $1", [brainId]);
  return (res.rowCount ?? 0) > 0;
}
