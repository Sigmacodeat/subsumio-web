/**
 * Switching on the firm-wide 2FA requirement applies at once: every member
 * without their own second factor is signed out everywhere, and their next
 * sign-in carries must2fa (login route), which confines them to the 2FA setup.
 * Without this, running sessions (up to 30 days) went on without a second
 * factor.
 */
import { getStore, type User } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";

import { logger } from "@/lib/logger";
const log = logger("lib/auth/two-factor-enforce");

/** Was the requirement just switched on by this settings write? */
export function turnsOnTwoFactorRequirement(
  incoming: Record<string, unknown> | null | undefined,
  stored: Record<string, unknown> | null | undefined
): boolean {
  return incoming?.require2FA === true && stored?.require2FA !== true;
}

/** Signs out every member of the actor's firm (or the actor alone) without 2FA. */
export async function enforceFirmTwoFactorNow(actor: Pick<User, "id" | "orgId">): Promise<number> {
  const store = getStore();
  const members = actor.orgId
    ? await store.listByOrg(actor.orgId)
    : [await store.getById(actor.id)].filter((u): u is User => Boolean(u));
  let signedOut = 0;
  for (const m of members) {
    if (m.twoFactorEnabled || m.deactivatedAt) continue;
    try {
      await revokeAllSessions(m.id);
      signedOut++;
    } catch (err) {
      log.error(
        `[2fa] sessions of ${m.id} not ended:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  return signedOut;
}
