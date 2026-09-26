/**
 * WhatsApp staff numbers act as a person, not as the firm.
 *
 * A number with a firm role (admin/lawyer/assistant) only runs firm commands
 * when it is linked to an ACTIVE user account of the same firm. Every engine
 * call is then signed with that person's identity (see runAsEngineCaller in
 * src/lib/engine.ts), so walls, matter teams and document ACLs apply exactly
 * as in the dashboard. The account decides the role — a WhatsApp identity can
 * never grant more than the person has. Deactivating or removing the account
 * ends WhatsApp access at the next message.
 */

import { getStore, type User } from "@/lib/auth/store";
import { firmBrainIdFor, type EngineCaller } from "@/lib/engine";
import type { WhatsAppIdentity } from "./types";

export const WHATSAPP_STAFF_ROLES = new Set(["admin", "lawyer", "assistant"]);

export function isWhatsAppStaffRole(role: string | undefined): boolean {
  return !!role && WHATSAPP_STAFF_ROLES.has(role);
}

export type StaffAccountResolution =
  | { ok: true; user: User; sender: WhatsAppIdentity; caller: EngineCaller }
  | {
      ok: false;
      reason: "no_linked_account" | "account_inactive" | "wrong_firm" | "role_not_staff";
    };

export interface StaffAccountDeps {
  getUser?: (id: string) => Promise<User | null>;
  firmBrainId?: (user: User) => Promise<string | null>;
}

export async function resolveStaffAccount(
  identity: WhatsAppIdentity,
  deps: StaffAccountDeps = {}
): Promise<StaffAccountResolution> {
  const getUser = deps.getUser ?? ((id: string) => getStore().getById(id));
  const firmBrainId = deps.firmBrainId ?? firmBrainIdFor;

  if (!identity.userId || identity.userLinked !== true) {
    return { ok: false, reason: "no_linked_account" };
  }
  const user = await getUser(identity.userId);
  if (!user || user.deactivatedAt) return { ok: false, reason: "account_inactive" };
  if (!isWhatsAppStaffRole(user.role)) return { ok: false, reason: "role_not_staff" };
  const brainId = await firmBrainId(user);
  if (!brainId || brainId !== identity.brainId) return { ok: false, reason: "wrong_firm" };
  if ((user.orgId || brainId) !== identity.orgId) return { ok: false, reason: "wrong_firm" };

  const sender: WhatsAppIdentity = {
    ...identity,
    role: user.role as WhatsAppIdentity["role"],
    userId: user.id,
    email: user.email,
    name: identity.name || user.name || user.email,
  };
  return {
    ok: true,
    user,
    sender,
    caller: {
      brainId,
      userId: user.id,
      role: user.role,
      orgId: user.orgId ?? null,
      matterScope: identity.matterScope,
    },
  };
}

export function staffAccountDeniedReply(): string {
  return [
    "Diese Nummer ist keinem aktiven Benutzerkonto der Kanzlei zugeordnet.",
    "Bitte wenden Sie sich an die Administration Ihrer Kanzlei.",
  ].join("\n");
}
