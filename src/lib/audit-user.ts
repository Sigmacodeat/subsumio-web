/**
 * Audit entries for account events (login, logout, 2FA, password reset …)
 * that run without a resolved handler context. They belong in the firm's own
 * protocol — the same brain the user works in — not in the shared system
 * chain, and they always carry who acted.
 */
import { logAudit, SYSTEM_BRAIN, type AuditAction, type LogAuditOptions } from "@/lib/audit";
import { firmBrainIdFor } from "@/lib/engine";
import { getOrgStore, type User } from "@/lib/auth/store";

/** The firm brain for a user; falls back to the personal brain if the lookup fails. */
export async function auditBrainForUser(user: Pick<User, "brainId" | "orgId">): Promise<string> {
  try {
    return (await firmBrainIdFor(user)) ?? user.brainId;
  } catch {
    return user.brainId;
  }
}

/** The firm brain of an organisation; SYSTEM_BRAIN when it cannot be resolved. */
export async function auditBrainForOrg(orgId: string | null | undefined): Promise<string> {
  if (!orgId) return SYSTEM_BRAIN;
  try {
    return (await getOrgStore().getById(orgId))?.brainId ?? SYSTEM_BRAIN;
  } catch {
    return SYSTEM_BRAIN;
  }
}

export async function logUserAudit(
  action: AuditAction,
  entityType: string,
  user: Pick<User, "id" | "email" | "brainId" | "orgId">,
  opts: Omit<LogAuditOptions, "brainId" | "userId" | "userEmail"> = {}
): Promise<void> {
  const brainId = await auditBrainForUser(user);
  await logAudit(action, entityType, {
    ...opts,
    brainId,
    userId: user.id,
    userEmail: user.email,
  });
}
