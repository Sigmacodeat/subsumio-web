// Free trial for self-service signups.
//
// The website promises: "Solo und Kanzlei testen Sie 30 Tage mit vollem
// Funktionsumfang, ohne Kreditkarte. Wählen Sie danach keinen Tarif, endet der
// Test automatisch." (src/content/site.ts PRICING_FAQ). This module is what
// keeps that promise:
//
// - A self-service signup stores `trialEndsAt` (no card, no Stripe object).
// - Until then the account works with the Kanzlei plan (TRIAL_PLAN) wherever a
//   plan decides limits or features — resolved through `effectivePlan`, never
//   by reading `user.plan` directly.
// - After `trialEndsAt` the account is on its stored plan again ("free"), with
//   no job and no write needed. Data stays; only the limits change.
// - A paid plan always wins over the trial.

import type { Plan, User } from "@/lib/auth/store";
import { TRIAL_DAYS } from "@/lib/billing/credit-constants";

export { TRIAL_DAYS };

/** The plan a trial runs on: the full Kanzlei feature set. */
export const TRIAL_PLAN: Exclude<Plan, "free" | "enterprise"> = "team";

const DAY_MS = 24 * 60 * 60 * 1000;

/** End of a trial that starts at `now`. */
export function trialEndsAtFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString();
}

type TrialUser = Pick<User, "plan"> & { trialEndsAt?: string | null };

/** True while the account is on the free plan and its trial has not ended. */
export function isTrialActive(user: TrialUser, now: Date = new Date()): boolean {
  if (user.plan !== "free" || !user.trialEndsAt) return false;
  const end = Date.parse(user.trialEndsAt);
  return Number.isFinite(end) && now.getTime() < end;
}

/** The plan whose limits and features apply right now. */
export function effectivePlan(user: TrialUser, now: Date = new Date()): Plan {
  return isTrialActive(user, now) ? TRIAL_PLAN : user.plan;
}

/** Whole days left in an active trial (rounded up), 0 otherwise. */
export function trialDaysLeft(user: TrialUser, now: Date = new Date()): number {
  if (!isTrialActive(user, now)) return 0;
  return Math.ceil((Date.parse(user.trialEndsAt as string) - now.getTime()) / DAY_MS);
}

/** Stripe needs a trial end at least 48 hours in the future. */
const STRIPE_MIN_TRIAL_MS = 48 * 60 * 60 * 1000;

/**
 * Unix timestamp to pass as `subscription_data[trial_end]` when someone buys
 * during their trial, so the first charge falls on the day the trial would have
 * ended. Null when there is no trial left that Stripe would accept.
 */
export function stripeTrialEnd(user: TrialUser, now: Date = new Date()): number | null {
  if (!isTrialActive(user, now)) return null;
  const end = Date.parse(user.trialEndsAt as string);
  if (end - now.getTime() < STRIPE_MIN_TRIAL_MS) return null;
  return Math.floor(end / 1000);
}
