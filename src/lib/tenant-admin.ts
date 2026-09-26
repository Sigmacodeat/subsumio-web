// Operator actions on a whole firm (tenant): suspend, reactivate, change a
// member's role, hand the firm to another member. Every action keeps the
// firm administrable — there is always an active admin and an active owner.

import { getOrgStore, getStore, type KanzleiRole, type User } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";
import { closeSseConnectionsForUser } from "@/lib/realtime-bus";
import { listTenantMembers, type Tenant } from "@/lib/tenants";

export type TenantAdminError =
  | "already_suspended"
  | "not_suspended"
  | "not_a_member"
  | "member_deactivated"
  | "last_admin"
  | "owner_must_stay_admin"
  | "owner_must_stay_active"
  | "solo_practice"
  | "deletion_scheduled"
  | "data_deleted";

export class TenantAdminFailure extends Error {
  constructor(readonly code: TenantAdminError) {
    super(code);
  }
}

const MESSAGES: Record<TenantAdminError, string> = {
  already_suspended: "Die Kanzlei ist bereits gesperrt.",
  not_suspended: "Die Kanzlei ist nicht gesperrt.",
  not_a_member: "Diese Person gehört nicht zu der Kanzlei.",
  member_deactivated: "Dieses Konto ist deaktiviert.",
  last_admin: "Die Kanzlei braucht mindestens einen aktiven Admin.",
  owner_must_stay_admin: "Der Inhaber muss Admin bleiben. Wechseln Sie zuerst den Inhaber.",
  owner_must_stay_active:
    "Der Inhaber kann nicht einzeln gesperrt werden. Wechseln Sie zuerst den Inhaber oder sperren Sie die ganze Kanzlei.",
  solo_practice: "Eine Einzelkanzlei hat nur ein Konto.",
  deletion_scheduled:
    "Für diese Kanzlei ist die Löschung der Daten angesetzt. Brechen Sie zuerst die Löschung ab (cancel_deletion).",
  data_deleted:
    "Die Daten dieser Kanzlei sind gelöscht — sie kann nicht wieder freigeschaltet werden.",
};

export function tenantAdminMessage(code: TenantAdminError): string {
  return MESSAGES[code];
}

export interface SuspensionState {
  suspended: boolean;
  suspendedAt: string | null;
  reason: string | null;
}

export async function suspensionOf(tenant: Tenant): Promise<SuspensionState> {
  if (tenant.kind === "org") {
    const org = tenant.org;
    return {
      suspended: Boolean(org?.suspendedAt),
      suspendedAt: org?.suspendedAt ?? null,
      reason: org?.suspendedReason ?? null,
    };
  }
  const owner = await getStore().getById(tenant.ownerId);
  return {
    suspended: Boolean(owner?.deactivatedAt),
    suspendedAt: owner?.deactivatedAt ?? null,
    reason: null,
  };
}

export async function suspendTenant(
  tenant: Tenant,
  input: { reason: string; operatorEmail: string }
): Promise<{ signedOut: number }> {
  const now = new Date().toISOString();
  const store = getStore();
  const members = await listTenantMembers(tenant);
  const active = members.filter((m) => !m.deactivatedAt);

  if (tenant.kind === "org") {
    if (tenant.org?.suspendedAt) throw new TenantAdminFailure("already_suspended");
    await getOrgStore().update(tenant.id, {
      suspendedAt: now,
      suspendedReason: input.reason,
      suspendedBy: input.operatorEmail,
      suspendedMemberIds: active.map((m) => m.id),
    });
  } else if (active.length === 0) {
    throw new TenantAdminFailure("already_suspended");
  }

  for (const member of active) {
    await store.update(member.id, { deactivatedAt: now });
    await revokeAllSessions(member.id);
    closeSseConnectionsForUser(member.id);
  }
  return { signedOut: active.length };
}

export async function reactivateTenant(tenant: Tenant): Promise<{ restored: number }> {
  const store = getStore();
  if (tenant.kind === "solo") {
    const owner = await store.getById(tenant.ownerId);
    if (!owner?.deactivatedAt) throw new TenantAdminFailure("not_suspended");
    await store.update(owner.id, { deactivatedAt: null });
    return { restored: 1 };
  }
  const org = tenant.org;
  // A firm whose data deletion is scheduled or done stays closed: members
  // come back only through cancel_deletion (before the purge), never here.
  if (org?.dataDeletedAt) throw new TenantAdminFailure("data_deleted");
  if (org?.deletionScheduledFor) throw new TenantAdminFailure("deletion_scheduled");
  if (!org?.suspendedAt) throw new TenantAdminFailure("not_suspended");
  // Only the accounts the suspension switched off. Someone the firm itself had
  // deactivated before stays deactivated.
  const ids = org.suspendedMemberIds ?? [];
  let restored = 0;
  for (const id of ids) {
    const member = await store.getById(id);
    if (member && member.orgId === org.id && member.deactivatedAt) {
      await store.update(id, { deactivatedAt: null });
      restored += 1;
    }
  }
  await getOrgStore().update(org.id, {
    suspendedAt: null,
    suspendedReason: null,
    suspendedBy: null,
    suspendedMemberIds: null,
  });
  return { restored };
}

function activeAdmins(members: User[]): User[] {
  return members.filter((m) => !m.deactivatedAt && m.role === "admin");
}

async function memberOf(
  tenant: Tenant,
  userId: string
): Promise<{ member: User; members: User[] }> {
  const members = await listTenantMembers(tenant);
  const member = members.find((m) => m.id === userId);
  if (!member) throw new TenantAdminFailure("not_a_member");
  return { member, members };
}

export async function setMemberRole(
  tenant: Tenant,
  userId: string,
  role: KanzleiRole
): Promise<User> {
  if (tenant.kind === "solo") throw new TenantAdminFailure("solo_practice");
  const { member, members } = await memberOf(tenant, userId);
  if (member.role === role) return member;
  if (member.role === "admin" && role !== "admin") {
    if (member.id === tenant.ownerId) throw new TenantAdminFailure("owner_must_stay_admin");
    const others = activeAdmins(members).filter((m) => m.id !== member.id);
    if (others.length === 0) throw new TenantAdminFailure("last_admin");
  }
  const updated = await getStore().update(member.id, { role });
  // The session carries the role; a fresh sign-in picks up the new one.
  await revokeAllSessions(member.id);
  closeSseConnectionsForUser(member.id);
  return updated ?? member;
}

/**
 * Deactivates one member of a firm. The owner is never deactivated alone
 * (hand the firm over first, or suspend the whole firm), and the firm keeps
 * at least one active admin. A solo practice has only its owner — use
 * suspendTenant for it. Does not end the member's access by itself; callers
 * follow with revokeUserAccess.
 */
export async function assertMemberMayBeDeactivated(tenant: Tenant, userId: string): Promise<void> {
  if (tenant.kind === "solo") return;
  const { member, members } = await memberOf(tenant, userId);
  if (member.deactivatedAt) return;
  if (member.id === tenant.ownerId) throw new TenantAdminFailure("owner_must_stay_active");
  if (member.role === "admin") {
    const others = activeAdmins(members).filter((m) => m.id !== member.id);
    if (others.length === 0) throw new TenantAdminFailure("last_admin");
  }
}

export async function transferOwnership(tenant: Tenant, userId: string): Promise<void> {
  if (tenant.kind === "solo") throw new TenantAdminFailure("solo_practice");
  const { member } = await memberOf(tenant, userId);
  if (member.deactivatedAt) throw new TenantAdminFailure("member_deactivated");
  if (member.role !== "admin") {
    await getStore().update(member.id, { role: "admin" });
    await revokeAllSessions(member.id);
  }
  // The subscription stays with whoever pays; ownership is about administration.
  await getOrgStore().update(tenant.id, {
    ownerId: member.id,
    billingUserId: tenant.org?.billingUserId || tenant.org?.ownerId || tenant.ownerId,
  });
}
