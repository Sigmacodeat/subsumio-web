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

import { normalizePhone, type WhatsAppIdentity, type WhatsAppMember } from "./types";
import { phoneHash, loadAllowedSenders } from "./verify";
import { getWhatsAppIdentityStore } from "./identity-store";
import { getStore } from "@/lib/auth/store";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { engineHeadersForBrainWithMatterScope, firmBrainIdFor } from "@/lib/engine";
import type { EngineSenderScope } from "@/lib/engine-client";

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
    return withMember({ ...stored, phone: normalized }, stored.memberUserId);
  }

  // Not in the store: production denies; dev falls back to the legacy env binding.
  if (isProd()) return null;

  const legacy = loadAllowedSenders().find((s) => s.phone === normalized);
  if (!legacy) return null;

  const now = new Date().toISOString();
  // The env binding names its user explicitly per number (dev only).
  return withMember(
    {
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
    },
    legacy.userId
  );
}

/** Roles that are firm staff on WhatsApp (everyone else is a client/intake contact). */
export function isStaffWhatsAppRole(role: WhatsAppIdentity["role"] | undefined): boolean {
  return role !== "client" && role !== "external" && role !== "intake";
}

const FIRM_STAFF_ROLES = new Set(["admin", "lawyer", "assistant"]);

/**
 * The firm member a staff number belongs to, checked now: the account exists,
 * is active, works in this number's brain and holds a staff role. Anything else
 * — or a lookup error — yields no member (fail-closed).
 */
async function resolveMember(
  identity: WhatsAppIdentity,
  memberUserId: string | undefined
): Promise<WhatsAppMember | null> {
  if (!memberUserId || !isStaffWhatsAppRole(identity.role)) return null;
  try {
    const user = await getStore().getById(memberUserId);
    if (!user || user.deletedAt || (await isAccountBlocked(user))) return null;
    // The member must work in the brain this number is bound to (firm brain
    // for a team member; null when the firm is suspended).
    if ((await firmBrainIdFor(user)) !== identity.brainId) return null;
    if (!FIRM_STAFF_ROLES.has(user.role)) return null;
    return { userId: user.id, role: user.role, orgId: user.orgId ?? null };
  } catch {
    return null;
  }
}

async function withMember(
  identity: WhatsAppIdentity,
  memberUserId: string | undefined
): Promise<WhatsAppIdentity> {
  const copy: WhatsAppIdentity = { ...identity };
  delete copy.member;
  const member = await resolveMember(copy, memberUserId);
  return member ? { ...copy, member } : copy;
}

/** Reply for a staff number that is not bound to a firm member (KI4-04). */
export const UNBOUND_STAFF_REPLY =
  "Diese WhatsApp-Nummer ist noch keinem Kanzleimitglied zugeordnet. Akten- und " +
  "Wissensabfragen sind deshalb gesperrt. Bitte lassen Sie die Nummer in Subsumio " +
  "unter „WhatsApp“ Ihrem Benutzerkonto zuordnen.";

/**
 * Engine scope for a staff sender: the number's matter scope, signed for the
 * member who owns it. Throws when there is no member — callers must gate on
 * `sender.member` first; this is the backstop, not the gate.
 */
export function whatsAppEngineScope(sender: WhatsAppIdentity): EngineSenderScope {
  if (!sender.member) {
    throw new Error("whatsapp_sender_without_member");
  }
  return {
    matterScope: sender.matterScope,
    caller: {
      userId: sender.member.userId,
      role: sender.member.role,
      orgId: sender.member.orgId,
    },
  };
}

/** Engine headers for a staff sender (see {@link whatsAppEngineScope}). */
export function whatsAppEngineHeaders(sender: WhatsAppIdentity): Record<string, string> {
  const scope = whatsAppEngineScope(sender);
  return engineHeadersForBrainWithMatterScope(sender.brainId, scope.matterScope, scope.caller);
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
