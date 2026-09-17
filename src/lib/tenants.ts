// A tenant is a law firm as the operator sees it. Technically that is either
// an organisation (team with members) or a lawyer who works alone and never
// created a team: both own exactly one brain. The operator console and
// support access work on tenants, so a solo practice is as visible and as
// supportable as a firm with twenty members.

import { getOrgStore, getStore, type Org, type User } from "@/lib/auth/store";
import { billingUserOf } from "@/lib/billing/billing-account";

export const SOLO_TENANT_PREFIX = "solo-";

export interface Tenant {
  /** Org id, or `solo-<userId>` for a lawyer without a team. */
  id: string;
  kind: "org" | "solo";
  name: string;
  brainId: string;
  ownerId: string;
  createdAt: string;
  /** Billing owner for credits and spend caps. */
  billing: { ownerId: string; ownerType: "org" | "user" };
  org?: Org;
}

export function isSoloTenantId(id: string): boolean {
  return id.startsWith(SOLO_TENANT_PREFIX);
}

/** Portal guests and members of a team are not firms of their own. */
function isSoloFirm(user: User): boolean {
  return !user.orgId && user.role !== "client_viewer";
}

function soloTenant(user: User): Tenant {
  return {
    id: `${SOLO_TENANT_PREFIX}${user.id}`,
    kind: "solo",
    name: user.name?.trim() ? `Kanzlei ${user.name.trim()}` : user.email,
    brainId: user.brainId,
    ownerId: user.id,
    createdAt: user.createdAt,
    billing: { ownerId: user.id, ownerType: "user" },
  };
}

function orgTenant(org: Org): Tenant {
  return {
    id: org.id,
    kind: "org",
    name: org.name,
    brainId: org.brainId,
    ownerId: org.ownerId,
    createdAt: org.createdAt,
    billing: { ownerId: billingUserOf(org), ownerType: "user" },
    org,
  };
}

export async function getTenant(id: string): Promise<Tenant | null> {
  if (isSoloTenantId(id)) {
    const user = await getStore().getById(id.slice(SOLO_TENANT_PREFIX.length));
    return user && isSoloFirm(user) ? soloTenant(user) : null;
  }
  const org = await getOrgStore().getById(id);
  return org ? orgTenant(org) : null;
}

export async function listTenantMembers(tenant: Tenant): Promise<User[]> {
  if (tenant.kind === "org") return getStore().listByOrg(tenant.id);
  const user = await getStore().getById(tenant.ownerId);
  return user ? [user] : [];
}

export function tenantsFrom(orgs: Org[], users: User[]): Tenant[] {
  return [...orgs.map(orgTenant), ...users.filter(isSoloFirm).map(soloTenant)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** The tenant a user belongs to — for linking from a user to their firm. */
export function tenantIdForUser(user: Pick<User, "id" | "orgId" | "role">): string | null {
  if (user.orgId) return user.orgId;
  return user.role === "client_viewer" ? null : `${SOLO_TENANT_PREFIX}${user.id}`;
}
