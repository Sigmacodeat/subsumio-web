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
import { isAccountBlocked } from "@/lib/auth/account-status";
import { env } from "@/lib/env";
import { addCallerIdentity, type EngineContext } from "@/lib/engine";
import { isAddinToken, isStoredKeyUsable } from "@/lib/addin-token";

import { logger } from "@/lib/logger";
const log = logger("lib/auth/api-key-auth");

const BEARER_PREFIX = "Bearer ";

export { requiredApiKeyScope, apiKeyHasScope, type ApiKeyScope } from "./api-key-scopes";

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

  // Quick filter: API keys start with sk_live_, add-in tokens with sk_addin_.
  const addin = isAddinToken(token);
  if (!token.startsWith("sk_live_") && !addin) return null;

  const secretHash = await hashApiKey(token);
  const store = getApiKeyStore();

  const match = await store.findByHash(secretHash);
  if (!match) return null;
  // Expired or revoked keys never authenticate, and the prefix must match
  // the stored kind (an add-in token is never a permanent key).
  if (!isStoredKeyUsable(match)) return null;
  if (addin !== (match.kind === "addin")) return null;

  // Load the owner user
  const user = await getStore().getById(match.ownerId);
  // Same "may this account work right now?" rule as sessions: deactivated
  // accounts and members of a suspended firm are refused.
  if (!user || (await isAccountBlocked(user))) return null;

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
    ctx: {
      headers,
      brainId,
      plan,
      user,
      billing,
      apiKey: { id: match.id, kind: match.kind === "addin" ? "addin" : "api" },
    },
    key: match,
  };
}
