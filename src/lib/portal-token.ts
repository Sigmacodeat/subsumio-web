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

const encoder = new TextEncoder();

export interface PortalTokenPayload {
  case_slug: string;
  exp: number; // unix seconds
}

export function getPortalSecret(): string {
  const secret = process.env.PORTAL_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new AuthError("PORTAL_TOKEN_SECRET must be set in production.", { code: "PORTAL_TOKEN_SECRET_MISSING" });
  }
  // Dev fallback: ableiten aus dem Auth-Secret, aber NICHT identisch
  return "portal-dev-" + (process.env.AUTH_SECRET || "subsumio-dev-secret-change-me").slice(0, 32);
}

export async function signPortalToken(
  caseSlug: string,
  ttlSeconds: number = 30 * 24 * 3600, // 30 Tage
): Promise<string> {
  const payload: PortalTokenPayload = {
    case_slug: caseSlug,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
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
  token: string | undefined | null,
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
        [hash],
      );
      if (rows.length > 0) {
        REVOKED.add(hash);
        return null;
      }
    } catch {
      // Fall through to signature verification
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
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function revokePortalToken(token: string): Promise<void> {
  const hash = tokenHash(token);
  REVOKED.add(hash);

  const pool = getSharedPgPool();
  if (!pool) return;
  try {
    await ensurePortalSchema();
    await pool.query(
      "INSERT INTO subsumio_portal_revocations (token_hash) VALUES ($1) ON CONFLICT DO NOTHING",
      [hash],
    );
  } catch (err) {
    console.error(`[portal-token] revocation persist failed: ${err instanceof Error ? err.message : String(err)}`);
  }
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
        [hash],
      );
      if (rows.length > 0) {
        REVOKED.add(hash);
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}
