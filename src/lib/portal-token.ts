/**
 * Mandanten-Portal Token — stateless, zeitlich begrenzt, HMAC-SHA256-signiert.
 * Ein Token berechtigt zum LESENDEN Zugriff auf genau EINE Akte.
 * Kein Session-Cookie, kein Login-Formular. Der Link IST die Berechtigung.
 */

import { b64url, b64urlDecode, b64urlDecodeUtf8, hmacKey } from "./auth/session";
import { getSharedPgPool } from "./auth/store";
import { createHash } from "node:crypto";
import { AuthError } from "@/lib/errors";
import { createSchemaInit } from "@/lib/schema-init";

import { logger } from "@/lib/logger";
const log = logger("lib/portal-token");

const encoder = new TextEncoder();

export interface PortalTokenPayload {
  case_slug: string;
  brain_id?: string;
  exp: number; // unix seconds
  /** Issued-at (unix seconds). Older tokens lack it — they predate the field. */
  iat?: number;
}

/** Default TTL — also the expiry↔issue proxy for pre-`iat` tokens. */
const DEFAULT_TTL_SECONDS = 30 * 24 * 3600;

export function getPortalSecret(): string {
  const secret = process.env.PORTAL_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && process.env.SUBSUMIO_E2E !== "1") {
    throw new AuthError("PORTAL_TOKEN_SECRET must be set in production.", {
      code: "PORTAL_TOKEN_SECRET_MISSING",
    });
  }
  // Dev fallback: ableiten aus dem Auth-Secret, aber NICHT identisch
  return "portal-dev-" + (process.env.AUTH_SECRET || "subsumio-dev-secret-change-me").slice(0, 32);
}

export async function signPortalToken(
  caseSlug: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  brainId?: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: PortalTokenPayload = {
    case_slug: caseSlug,
    ...(brainId ? { brain_id: brainId } : {}),
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const key = await hmacKey(getPortalSecret());
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64url(sig)}`;
}

// --- Revocation store (Postgres in production, in-memory in dev) ---

const REVOKED = new Set<string>();

const ensurePortalSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_portal_revocations (
    token_hash text PRIMARY KEY,
    revoked_at timestamptz NOT NULL DEFAULT now()
  )
`);

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyPortalToken(
  token: string | undefined | null
): Promise<PortalTokenPayload | null> {
  if (!token) return null;
  if (token !== token.trim()) return null;

  // Check revocation (Postgres in prod, in-memory in dev)
  const hash = tokenHash(token);
  if (REVOKED.has(hash)) return null;

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensurePortalSchema();
      const { rows } = await pool.query(
        "SELECT 1 FROM subsumio_portal_revocations WHERE token_hash = $1",
        [hash]
      );
      if (rows.length > 0) {
        REVOKED.add(hash);
        return null;
      }
    } catch (err) {
      // Fail closed: if the revocation list cannot be read, a revoked link
      // must not open the portal. The client retries once the DB is back.
      log.error(
        `[portal-token] revocation check failed, refusing token: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await hmacKey(getPortalSecret());
    const sigBin = b64urlDecode(sigPart);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(b64urlDecodeUtf8(body)) as PortalTokenPayload;
    if (!payload.case_slug || !payload.exp) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function revokePortalToken(token: string): Promise<void> {
  await revokePortalTokenHash(tokenHash(token));
}

/**
 * Revoke by the stored hash — the firm only keeps hashes in its link
 * registry (src/lib/portal-links.ts), never the raw token.
 */
export async function revokePortalTokenHash(hash: string): Promise<void> {
  REVOKED.add(hash);

  const pool = getSharedPgPool();
  if (!pool) return;
  try {
    await ensurePortalSchema();
    await pool.query(
      "INSERT INTO subsumio_portal_revocations (token_hash) VALUES ($1) ON CONFLICT DO NOTHING",
      [hash]
    );
  } catch (err) {
    log.error(
      `[portal-token] revocation persist failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export { tokenHash as portalTokenHash };

/**
 * Was this token issued before the matter's link reset
 * (`portal_links_reset_at` on the case frontmatter)? "Revoke all links" sets
 * that cutoff so even links missing from the registry — issued before the
 * registry existed — die. Tokens without `iat` are treated as ancient.
 */
export function isPortalTokenSuperseded(
  payload: PortalTokenPayload,
  resetAt: string | undefined | null
): boolean {
  if (!resetAt) return false;
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset)) return false;
  const issuedAt =
    typeof payload.iat === "number" && Number.isFinite(payload.iat)
      ? payload.iat * 1000
      : (payload.exp - DEFAULT_TTL_SECONDS) * 1000;
  return issuedAt < reset;
}

export async function isPortalTokenRevoked(token: string): Promise<boolean> {
  const hash = tokenHash(token);
  if (REVOKED.has(hash)) return true;

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensurePortalSchema();
      const { rows } = await pool.query(
        "SELECT 1 FROM subsumio_portal_revocations WHERE token_hash = $1",
        [hash]
      );
      if (rows.length > 0) {
        REVOKED.add(hash);
        return true;
      }
    } catch (err) {
      // Fail closed: an unreadable revocation list counts as revoked.
      log.error(
        `[portal-token] revocation check failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return true;
    }
  }
  return false;
}
