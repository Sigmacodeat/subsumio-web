/**
 * Roles an invite to a firm may grant (POST /api/org/invite → /api/org/join).
 * Never admin — the owner promotes afterwards. The default is the least
 * privileged staff role. The chosen role is part of the signed invite binding.
 */
import type { KanzleiRole } from "@/lib/auth/store";

export const INVITE_ROLES = [
  "lawyer",
  "assistant",
  "client_viewer",
] as const satisfies readonly KanzleiRole[];
export type InviteRole = (typeof INVITE_ROLES)[number];
export const DEFAULT_INVITE_ROLE: InviteRole = "assistant";

export function isInviteRole(value: unknown): value is InviteRole {
  return typeof value === "string" && (INVITE_ROLES as readonly string[]).includes(value);
}

/** What the invite token is bound to. */
export function inviteBinding(orgId: string, email: string, role: InviteRole | null): string {
  return role ? `${orgId}:${email}:${role}` : `${orgId}:${email}`;
}
