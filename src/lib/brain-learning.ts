/**
 * Firm setting "Kanzlei-Gehirn lernt mit" — web side (source of truth).
 *
 * Stored per firm: on the org for teams, on the user for a lawyer working
 * alone (same place as the other firm-wide settings, see src/lib/auth/store.ts).
 * undefined means ON — the default every firm had before the setting existed.
 *
 * What it controls, and where each part is enforced, is documented in
 * docs/architecture/BRAIN_LEARNING.md. Nothing here is model training: the
 * setting only decides whether the firm's own knowledge base is extended
 * automatically.
 *
 * The engine learns the value only from this server: the settings route
 * pushes it with the firm's own server-set engine headers, and the nightly
 * dream cron sends the complete list of switched-off firms. A browser never
 * supplies the flag.
 */

import { getOrgStore, getStore, type Org, type User } from "@/lib/auth/store";

/** undefined/null/true → on; only an explicit false switches learning off. */
export function isLearningOn(value: boolean | null | undefined): boolean {
  return value !== false;
}

export interface FirmLearningState {
  enabled: boolean;
  /** Where the value lives: the team's org, or the solo lawyer's own account. */
  scope: "org" | "solo";
  org: Org | null;
}

/** The learning state of the firm `user` works in. */
export async function firmLearningState(
  user: Pick<User, "orgId" | "brainLearning">
): Promise<FirmLearningState> {
  if (user.orgId) {
    const org = await getOrgStore().getById(user.orgId);
    if (org) return { enabled: isLearningOn(org.brainLearning), scope: "org", org };
  }
  return { enabled: isLearningOn(user.brainLearning), scope: "solo", org: null };
}

/** Convenience for route handlers that only need the boolean. */
export async function isFirmLearningEnabled(
  user: Pick<User, "orgId" | "brainLearning">
): Promise<boolean> {
  return (await firmLearningState(user)).enabled;
}

/**
 * Brain ids (engine source ids) of every firm that switched learning off.
 * Teams: the org's brain. Solo lawyers: their own brain. A member's personal
 * value is ignored while they belong to a firm (the firm decides).
 */
export async function learningDisabledBrainIds(): Promise<string[]> {
  const out = new Set<string>();
  const orgs = await getOrgStore().list();
  const orgIds = new Set(orgs.map((o) => o.id));
  for (const org of orgs) {
    if (!isLearningOn(org.brainLearning)) out.add(org.brainId);
  }
  for (const user of await getStore().list()) {
    // A dangling orgId (firm gone) means the person works alone.
    const solo = !user.orgId || !orgIds.has(user.orgId);
    if (solo && !isLearningOn(user.brainLearning)) out.add(user.brainId);
  }
  return [...out];
}
