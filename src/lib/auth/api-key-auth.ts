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

import { billingAccountFor } from "@/lib/billing/billing-account";
import { effectivePlan } from "@/lib/billing/trial";
import { hashApiKey } from "@/lib/api-keys";
import { getApiKeyStore, type StoredApiKey } from "@/lib/api-key-store";
import { getStore, getOrgStore, type Plan } from "@/lib/auth/store";
import { env } from "@/lib/env";
import { addCallerIdentity, type EngineContext } from "@/lib/engine";

import { logger } from "@/lib/logger";
const log = logger("lib/auth/api-key-auth");

const BEARER_PREFIX = "Bearer ";

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return null;
  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

export async function verifyApiKey(
  authHeader: string | null
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
  if (user.deactivatedAt) return null;

  // Resolve brainId, plan and paying account (same logic as engineContext)
  let brainId = user.brainId;
  let plan: Plan = effectivePlan(user);
  let billing = billingAccountFor(user, null);
  if (user.orgId) {
    const org = await getOrgStore().getById(user.orgId);
    if (org?.suspendedAt) return null;
    if (org) {
      brainId = org.brainId;
      billing = billingAccountFor(user, org);
      const payer = await getStore().getById(billing.ownerId);
      if (payer) plan = effectivePlan(payer);
    }
  }

  const headers: Record<string, string> = { "x-subsumio-source": brainId };
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  addCallerIdentity(headers, brainId, user);

  // Fire-and-forget: update lastUsedAt
  store
    .update(match.id, { lastUsedAt: new Date().toISOString() })
    .catch((err) =>
      log.warn(
        "[api-key-auth] Failed to update lastUsedAt:",
        err instanceof Error ? err.message : err
      )
    );

  return {
    ctx: { headers, brainId, plan, user, billing },
    key: match,
  };
}
