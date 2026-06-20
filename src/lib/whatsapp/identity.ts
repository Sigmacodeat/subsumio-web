/**
 * Permission-aware WhatsApp sender resolution (Paket 33, P0-SECR-002).
 *
 * Replaces the env-only {@link resolveSender} with a DB-backed lookup that the
 * inbound webhook calls before doing anything with a message. The security
 * contract:
 *
 *   - Production NEVER trusts env defaults. An unknown / suspended / revoked
 *     number resolves to `null` (deny). No `WHATSAPP_DEFAULT_BRAIN_ID` fallback.
 *   - Non-production keeps the legacy env binding as a fallback so local/dev
 *     setups work without seeding the identity store.
 *
 * Returns a {@link WhatsAppIdentity} (superset of WhatsAppSenderBinding), so all
 * existing webhook handlers keep working unchanged while gaining the security
 * fields (`orgId`, `matterScope`, `status`, `verifiedAt`).
 */

import { normalizePhone, type WhatsAppIdentity } from "./types";
import { phoneHash, loadAllowedSenders } from "./verify";
import { getWhatsAppIdentityStore } from "./identity-store";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolve an inbound phone number to an active, authorized identity.
 *
 * @returns the active identity, or `null` if the sender is unknown, not active,
 *   or (in production) not present in the identity store.
 */
export async function resolveSenderIdentity(phone: string): Promise<WhatsAppIdentity | null> {
  const normalized = normalizePhone(phone);
  const hash = phoneHash(normalized);

  const stored = await getWhatsAppIdentityStore().getByPhoneHash(hash);
  if (stored) {
    if (stored.status !== "active") return null;
    // Carry the normalized phone so handlers can reply; storage never holds it.
    return { ...stored, phone: normalized };
  }

  // Not in the store: production denies; dev falls back to the legacy env binding.
  if (isProd()) return null;

  const legacy = loadAllowedSenders().find((s) => s.phone === normalized);
  if (!legacy) return null;

  const now = new Date().toISOString();
  return {
    ...legacy,
    phone: normalized,
    id: `env:${hash.slice(0, 12)}`,
    orgId: legacy.brainId,
    phoneHash: hash,
    matterScope: "all",
    status: "active",
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Is `matterRef` within this identity's matter scope?
 * `"all"` grants every matter (role-scoped, no per-matter restriction).
 *
 * NOTE: this is the local scope gate. Full permission-aware retrieval against the
 * Matter Context API Contract (Paket 31) layers on top of this once that lands.
 */
export function identityCanAccessMatter(
  identity: Pick<WhatsAppIdentity, "matterScope">,
  matterRef: string
): boolean {
  if (identity.matterScope === "all") return true;
  return identity.matterScope.includes(matterRef);
}
