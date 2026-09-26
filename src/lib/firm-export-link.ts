/**
 * Download link for a finished full firm export (Art. 20 DSGVO).
 *
 * The link carries a token signed with the auth secret and bound to the
 * admin who requested the export, the firm and the export id. It expires
 * with the export, never later than 24 hours after it was issued. The engine
 * enforces the single download (atomic claim on the export job), so a copied
 * link is useless after the first use, and it only works in the session of
 * the admin it was issued to.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/session-core";

/** One export as the engine reports it (plus the link for a ready own export). */
export interface FirmExportView {
  id: number;
  state: "queued" | "running" | "ready" | "downloaded" | "expired" | "failed";
  own: boolean;
  created_at: string;
  finished_at: string | null;
  progress: {
    phase: string | null;
    pages_total: number | null;
    pages_done: number;
    files_done: number;
  };
  pages?: number;
  files?: number;
  pages_missing?: number;
  files_missing?: number;
  complete?: boolean;
  size_bytes?: number | null;
  sha256?: string | null;
  expires_at?: string | null;
  downloaded_at?: string | null;
  download_url?: string;
  link_expires_at?: string;
}

export const FIRM_EXPORT_LINK_MAX_MS = 24 * 60 * 60 * 1000;
export const FIRM_EXPORT_DOWNLOAD_PATH = "/api/data-export/full/download";

function sign(body: string): string {
  return createHmac("sha256", `firm-export-link:${getAuthSecret()}`)
    .update(body)
    .digest("base64url");
}

export function createFirmExportToken(
  input: { userId: string; brainId: string; exportId: number; expiresAt?: string | null },
  now: number = Date.now()
): { token: string; expiresAt: string } {
  const exportExpiry = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
  const exp = Math.min(
    now + FIRM_EXPORT_LINK_MAX_MS,
    Number.isFinite(exportExpiry) ? exportExpiry : now + FIRM_EXPORT_LINK_MAX_MS
  );
  const body = Buffer.from(
    JSON.stringify({ u: input.userId, b: input.brainId, e: input.exportId, exp })
  ).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
}

export function firmExportDownloadUrl(token: string): string {
  return `${FIRM_EXPORT_DOWNLOAD_PATH}?token=${encodeURIComponent(token)}`;
}

export type FirmExportTokenCheck =
  | { ok: true; exportId: number }
  | { ok: false; reason: "invalid" | "expired" | "mismatch" };

export function verifyFirmExportToken(
  token: string | undefined | null,
  caller: { userId: string; brainId: string },
  now: number = Date.now()
): FirmExportTokenCheck {
  if (!token) return { ok: false, reason: "invalid" };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }
  let claims: { u?: unknown; b?: unknown; e?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as typeof claims;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof claims.exp !== "number" || typeof claims.e !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (claims.exp <= now) return { ok: false, reason: "expired" };
  if (claims.u !== caller.userId || claims.b !== caller.brainId) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, exportId: claims.e };
}
