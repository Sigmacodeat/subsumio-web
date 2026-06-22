/**
 * Signed identity token for engine-side matter-scope enforcement.
 *
 * PROBLEM: The engine's web-api has a single shared API key. Self-asserted
 * headers (x-subsumio-matter-scope) are trivially spoofed by anyone with
 * that key. MCP calls bypass the web-api entirely.
 *
 * SOLUTION: The web-app creates a short-lived HMAC-signed token after
 * verifying the caller's identity (WhatsApp identity DB lookup, session
 * verification, etc.). The engine verifies the HMAC signature using the
 * shared SUBSUMIO_WEB_API_KEY before trusting the matter-scope claim.
 *
 * Token format: base64url(payload).base64url(hmac_sha256(payload, secret))
 * Payload: { orgId, userId, matterScope, sourceId, exp }
 *
 * This is NOT a JWT (no header, no algorithm negotiation) — a deliberate
 * simplification to avoid algorithm-confusion attacks. The signing key is
 * the same SUBSUMIO_WEB_API_KEY already shared between web-app and engine.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Matter scope: "all" (no filtering) or array of allowed case-slug prefixes. */
export type MatterScope = string[] | "all";

/** Token payload — the verified identity claims. */
export interface IdentityTokenPayload {
  /** Organization ID for audit logging. */
  orgId?: string;
  /** User ID for audit logging. */
  userId?: string;
  /** Brain/source ID — redundant with x-subsumio-source but included for integrity. */
  sourceId: string;
  /** Matter scope: "all" or array of allowed case-slug prefixes. */
  matterScope: MatterScope;
  /** Expiry timestamp (Unix seconds). Short-lived: 5 minutes max. */
  exp: number;
  /** Subsumio R3: Caller role for ACL bypass. Admin = no ACL filtering. */
  role?: string;
}

const MAX_TOKEN_AGE_SECONDS = 300; // 5 minutes
const CLOCK_SKEW_SECONDS = 30;

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/**
 * Create a signed identity token. Called by the web-app AFTER verifying
 * the caller's identity (WhatsApp identity DB lookup, session check, etc.).
 *
 * The signing key is SUBSUMIO_WEB_API_KEY — the shared secret already used
 * for web-api authentication. This means no new key management is needed.
 */
export function createIdentityToken(
  payload: Omit<IdentityTokenPayload, "exp">,
  secret: string,
  maxAgeSeconds = MAX_TOKEN_AGE_SECONDS
): string {
  const fullPayload: IdentityTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const payloadB64 = b64urlEncode(JSON.stringify(fullPayload));
  const hmac = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = b64urlEncode(hmac);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify a signed identity token. Called by the engine BEFORE trusting any
 * matter-scope claim.
 *
 * Returns the verified payload on success, or null on failure (invalid
 * signature, expired, malformed). Never throws — callers check for null.
 *
 * Timing-safe comparison prevents signature oracle attacks.
 */
export function verifyIdentityToken(token: string, secret: string): IdentityTokenPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  // Recompute the HMAC and compare in constant time
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return null;
  }

  if (expectedSig.length !== providedSig.length) return null;
  if (!timingSafeEqual(expectedSig, providedSig)) return null;

  // Signature valid — decode and validate payload
  let payload: IdentityTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  // Validate required fields
  if (typeof payload.exp !== "number") return null;
  if (typeof payload.sourceId !== "string") return null;
  if (payload.matterScope !== "all" && !Array.isArray(payload.matterScope)) return null;

  // Check expiry (with clock skew tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp + CLOCK_SKEW_SECONDS < now) return null;

  return payload;
}

/**
 * Filter search/think results by verified matter scope.
 * Pages whose slug is exactly in scope or below an allowed matter path pass
 * through. Empty arrays deny all.
 */
export function filterResultsByMatterScope<T extends { slug?: string }>(
  results: T[],
  scope: MatterScope | undefined
): T[] {
  if (!scope) return results;
  if (scope === "all") return results;
  if (scope.length === 0) return [];
  return results.filter((r) => {
    const slug = r.slug ?? "";
    return scope.some((prefix) => slug === prefix || slug.startsWith(`${prefix}/`));
  });
}
