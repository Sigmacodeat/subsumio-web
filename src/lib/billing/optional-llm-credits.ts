/**
 * Credits for an OPTIONAL model call inside a route that also works without it
 * (regex fallback in the deadline detector, rule-based memory inference).
 *
 * Such a route cannot declare `credits:` on createHandler — that would refuse
 * the whole request (incl. the free fallback) at zero balance. Instead it asks
 * here before the model call, skips the model when the balance is short, and
 * books `recordCreditConsumption` only after the model actually ran.
 */

import type { EngineContext } from "@/lib/engine";
import {
  CREDIT_COSTS,
  checkCredits,
  ensureTrialCredits,
  type CreditOperation,
} from "@/lib/billing/credits";
import { env } from "@/lib/env";

type BillableContext = Pick<EngineContext, "billing" | "demo">;

/** True when the owner can pay for `op` (demo sessions and the e2e harness always can). */
export async function canAffordOptionalLlm(
  ctx: BillableContext,
  op: CreditOperation
): Promise<boolean> {
  if (CREDIT_COSTS[op] <= 0 || ctx.demo || env("SUBSUMIO_E2E") === "1") return true;
  try {
    await ensureTrialCredits(ctx.billing.ownerId, ctx.billing.ownerType);
    const check = await checkCredits(ctx.billing.ownerId, ctx.billing.ownerType, CREDIT_COSTS[op]);
    return check.ok;
  } catch {
    // Balance unknown: skip the paid model call, the free fallback still runs.
    return false;
  }
}
