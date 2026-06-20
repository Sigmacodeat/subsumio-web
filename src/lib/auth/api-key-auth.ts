/**
 * API Key Authentication — resolves a Bearer token (sk_live_...) to an
 * EngineContext, allowing external clients (Outlook Add-in, Zapier, etc.)
 * to authenticate without a browser session cookie.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Hash it (SHA-256) and look up in ApiKeyStore
 * 3. Verify key is active
 * 4. Load the owner user → build EngineContext
 * 5. Update lastUsedAt (fire-and-forget)
 */

import { hashApiKey } from "@/lib/api-keys";
import { getApiKeyStore, type StoredApiKey } from "@/lib/api-key-store";
import { getStore, getOrgStore, type Plan } from "@/lib/auth/store";
import { env } from "@/lib/env";
import type { EngineContext } from "@/lib/engine";

const BEARER_PREFIX = "Bearer ";

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return null;
  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

export async function verifyApiKey(
  authHeader: string | null,
): Promise<{ ctx: EngineContext; key: StoredApiKey } | null> {
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  // Quick filter: API keys start with sk_live_
  if (!token.startsWith("sk_live_")) return null;

  const secretHash = await hashApiKey(token);
  const store = getApiKeyStore();

  const match = await store.findByHash(secretHash);
  if (!match) return null;

  // Load the owner user
  const user = await getStore().getById(match.ownerId);
  if (!user) return null;

  // Resolve brainId + plan (same logic as engineContext)
  let brainId = user.brainId;
  let plan: Plan = user.plan;
  if (user.orgId) {
    const org = await getOrgStore().getById(user.orgId);
    if (org) {
      brainId = org.brainId;
      const owner = await getStore().getById(org.ownerId);
      if (owner) plan = owner.plan;
    }
  }

  const headers: Record<string, string> = { "x-subsumio-source": brainId };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;

  // Fire-and-forget: update lastUsedAt
  store
    .update(match.id, { lastUsedAt: new Date().toISOString() })
    .catch(() => {});

  return {
    ctx: { headers, brainId, plan, user },
    key: match,
  };
}
