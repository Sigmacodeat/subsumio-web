// Who pays for what a person does in Subsumio.
//
// One rule for the whole app: credits, trial, reservations, spend caps and
// budget alerts belong to the firm's PAYING ACCOUNT — the user who holds the
// subscription. For a lawyer working alone that is themselves; for a team it
// is the firm's billing user (by default the founder). Members of a team draw
// from that same pool.
//
// Before, a team drew from a separate pool keyed by the organisation id,
// which only ever received the trial grant (subscriptions land on the paying
// user), and a Stripe checkout wrote its billing id into `user.orgId`, the
// field that means team membership.

import type { OwnerType } from "@/lib/billing/credits";
import type { Org, User } from "@/lib/auth/store";

export interface BillingAccount {
  ownerId: string;
  ownerType: OwnerType;
}

/** The paying user of a firm. */
export function billingUserOf(org: Pick<Org, "ownerId" | "billingUserId">): string {
  return org.billingUserId || org.ownerId;
}

/**
 * `org` is the user's resolved team, or null when they work alone or their
 * `orgId` does not point to a real firm.
 */
export function billingAccountFor(
  user: Pick<User, "id">,
  org: Pick<Org, "ownerId" | "billingUserId"> | null
): BillingAccount {
  return { ownerId: org ? billingUserOf(org) : user.id, ownerType: "user" };
}
