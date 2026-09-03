/**
 * SaaS Billing Engine — Usage metering, credit tracking, invoice generation.
 *
 * Integrates with:
 *   - saas-pricing.ts   (plan config, markup, selling prices in EUR)
 *   - model-pricing.ts  (canonical LLM cost in USD — converted to EUR)
 *   - migrate.ts v134+v135 (saas_* DB tables, EUR columns)
 *
 * Flow:
 *   1. Pipeline/operation runs → each LLM call produces token usage
 *   2. recordUsage() is called with model_id + tokens + org_id
 *   3. calculateUsageCost() computes cost_eur (our cost) + sell_eur (customer price)
 *   4. Row inserted into saas_usage_ledger (audit trail only)
 *   5. Credit deduction happens in credits.ts:deductCredits (single source
 *      for used_credit — prevents double-counting after v136 consolidation)
 *   6. At period end, billMonthlyOverage() creates saas_invoices row
 *
 * All monetary values in EUR (matches existing credit system: 1 Credit = 1 EUR).
 * Multi-tenant: every table carries org_id. No cross-org data leaks.
 */

import { calculateUsageCost, PLANS, type PlanTier, type UsageRecord } from "./saas-pricing.ts";
import type { BrainEngine } from "./engine.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  seats: number;
}

export interface RecordUsageOpts {
  org_id: string;
  user_id?: string;
  workflow_id?: string;
  workflow?: string;
  model_id: string;
  provider: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read?: number;
  is_embedding?: boolean;
}

export interface UsageLedgerRow {
  id: number;
  org_id: string;
  user_id: string | null;
  workflow_id: string | null;
  workflow: string;
  model_id: string;
  provider: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  is_embedding: boolean;
  cost_eur: number;
  sell_eur: number;
  margin_eur: number;
  plan: PlanTier;
  created_at: string;
}

// ── Engine Interface ──────────────────────────────────────────────────

/**
 * Minimal engine interface for billing queries. Both PostgresEngine and
 * PGLiteEngine satisfy this — we need executeRaw for scalar queries.
 */
export type BillingEngine = BrainEngine;

// ── Usage Recording ───────────────────────────────────────────────────

/**
 * Record a single LLM usage event and persist to saas_usage_ledger.
 * Also updates the org's credit balance for the current billing period.
 *
 * Returns the persisted cost/sell/margin in EUR.
 */
export async function recordUsage(
  engine: BillingEngine,
  opts: RecordUsageOpts
): Promise<{ cost_eur: number; sell_eur: number; margin_eur: number; plan: PlanTier }> {
  // Determine plan from org
  const orgRows = await engine.executeRaw<{ plan: PlanTier }>(
    `SELECT plan FROM saas_orgs WHERE id = $1`,
    [opts.org_id]
  );
  const plan = orgRows[0]?.plan ?? "solo";

  const record: UsageRecord = {
    model_id: opts.model_id,
    tokens_input: opts.tokens_input,
    tokens_output: opts.tokens_output,
    tokens_cache_read: opts.tokens_cache_read ?? 0,
    is_embedding: opts.is_embedding ?? false,
  };

  const breakdown = calculateUsageCost(record, plan);

  // Insert usage ledger row
  await engine.executeRaw(
    `INSERT INTO saas_usage_ledger
       (org_id, user_id, workflow_id, workflow, model_id, provider,
        tokens_input, tokens_output, tokens_cache_read, is_embedding,
        cost_eur, sell_eur, margin_eur, plan)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      opts.org_id,
      opts.user_id ?? null,
      opts.workflow_id ?? null,
      opts.workflow ?? "generic",
      opts.model_id,
      opts.provider,
      opts.tokens_input,
      opts.tokens_output,
      opts.tokens_cache_read ?? 0,
      opts.is_embedding ?? false,
      breakdown.cost_eur,
      breakdown.sell_eur,
      breakdown.margin_eur,
      plan,
    ]
  );

  // NOTE: We do NOT update saas_credit_balance.used_credit here.
  // Before the v136 credit consolidation, this function incremented
  // used_credit for metering while credits.ts:deductCredits decremented
  // subsumio_credit_balance.balance for the wallet — two separate tables,
  // no conflict. Now that both are consolidated into saas_credit_balance,
  // incrementing used_credit here would DOUBLE-COUNT: deductCredits already
  // increments used_credit when the user's query is settled. This function
  // only writes the audit trail (saas_usage_ledger) — the credit deduction
  // happens in credits.ts:deductCredits / deductTokenCredits.

  return {
    cost_eur: breakdown.cost_eur,
    sell_eur: breakdown.sell_eur,
    margin_eur: breakdown.margin_eur,
    plan,
  };
}

// ── Org Management ────────────────────────────────────────────────────

/**
 * Create a new org with a subscription.
 */
export async function createOrg(
  engine: BillingEngine,
  name: string,
  slug: string,
  plan: PlanTier,
  seats = 1
): Promise<OrgInfo> {
  const rows = await engine.executeRaw<OrgInfo>(
    `INSERT INTO saas_orgs (name, slug, plan, seats)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, slug, plan, seats`,
    [name, slug, plan, seats]
  );

  // Create initial subscription
  const now = new Date();
  // Use UTC-consistent period end (matches getPeriodEnd() helper)
  // Pre-fix: used local-time `new Date(now.getFullYear(), now.getMonth() + 1, 1)`
  // which produces a local-midnight Date — inconsistent with getPeriodEnd()'s
  // UTC midnight, causing period_end mismatch between subscription row and
  // credit balance row on servers with non-UTC TZ.
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await engine.executeRaw(
    `INSERT INTO saas_subscriptions (org_id, plan, seats, status, current_period_start, current_period_end)
     VALUES ($1, $2, $3, 'active', $4, $5)`,
    [rows[0].id, plan, seats, now, periodEnd]
  );

  return rows[0];
}

/**
 * Get org info by id.
 */
export async function getOrg(engine: BillingEngine, orgId: string): Promise<OrgInfo | null> {
  const rows = await engine.executeRaw<OrgInfo>(
    `SELECT id, name, slug, plan, seats FROM saas_orgs WHERE id = $1`,
    [orgId]
  );
  return rows[0] ?? null;
}

/**
 * Change an org's plan. Takes effect immediately.
 */
export async function changePlan(
  engine: BillingEngine,
  orgId: string,
  newPlan: PlanTier
): Promise<void> {
  await engine.executeRaw(`UPDATE saas_orgs SET plan = $2, updated_at = now() WHERE id = $1`, [
    orgId,
    newPlan,
  ]);
  await engine.executeRaw(
    `UPDATE saas_subscriptions SET plan = $2, updated_at = now()
     WHERE org_id = $1 AND status = 'active'`,
    [orgId, newPlan]
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Get the start of the current billing period (1st of current month, UTC).
 */
export function getPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Get the end of the current billing period (1st of next month, UTC).
 */
export function getPeriodEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
