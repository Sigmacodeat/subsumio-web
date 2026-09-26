/**
 * Keeping a firm's shared brain with the firm.
 *
 * A firm adopts its founder's brain (org POST), so the founder's own
 * `user.brainId` IS the firm brain. Everything that resolves "the brain this
 * person works in" falls back to `user.brainId` when the person has no firm —
 * so a founder who leaves or is removed after a change of owner would keep
 * working in the firm brain.
 *
 * Two parts, both here:
 *   - `detachFromFirm` is the only way a person leaves a firm: if their
 *     personal brain is the firm brain, they get a fresh, empty personal brain.
 *   - `isPersonalBrainOfOtherFirm` is the fail-closed check for every
 *     resolver: a personal brain that belongs to a firm the person is not a
 *     member of is never used (records from before the fix; see
 *     scripts/migrate-detached-firm-brains.ts).
 */

import { randomUUID } from "node:crypto";
import { getOrgStore, getStore, type Org, type User } from "@/lib/auth/store";

const OWNER_CACHE_TTL_MS = 60_000;
const ownerCache = new Map<string, { orgId: string | null; at: number }>();

/** The id of the firm whose shared brain `brainId` is, or null. Store errors throw. */
export async function firmOwningBrain(brainId: string): Promise<string | null> {
  const cached = ownerCache.get(brainId);
  if (cached && Date.now() - cached.at < OWNER_CACHE_TTL_MS) return cached.orgId;
  const org = await getOrgStore().getByBrainId(brainId);
  const orgId = org?.id ?? null;
  ownerCache.set(brainId, { orgId, at: Date.now() });
  return orgId;
}

/**
 * True when the person's own brain is the shared brain of a firm they are
 * not (or no longer) a member of — that brain must not be resolved for them.
 */
export async function isPersonalBrainOfOtherFirm(
  user: Pick<User, "brainId" | "orgId">
): Promise<boolean> {
  const owner = await firmOwningBrain(user.brainId);
  return owner !== null && owner !== (user.orgId ?? null);
}

export function newPersonalBrainId(): string {
  return `brain_${randomUUID().slice(0, 8)}`;
}

/**
 * Takes a person out of a firm. A founder whose personal brain is the firm
 * brain gets a new personal brain; the firm keeps its data.
 */
export async function detachFromFirm(
  user: Pick<User, "id" | "brainId">,
  org: Pick<Org, "brainId">
): Promise<User | null> {
  const patch: Partial<User> = { orgId: null };
  if (user.brainId === org.brainId) patch.brainId = newPersonalBrainId();
  return getStore().update(user.id, patch);
}

/** Tests only. */
export function _resetFirmBrainCache(): void {
  ownerCache.clear();
}
