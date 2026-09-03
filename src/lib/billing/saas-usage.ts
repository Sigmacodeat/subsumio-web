/**
 * SaaS Usage Analytics — Internal cost/margin tracking from saas_usage_ledger.
 *
 * Queries the saas_* tables (created by server/src/core/migrate.ts v134)
 * from the web app's shared Postgres pool. These tables are written to by
 * server/src/core/billing.ts:recordUsage() during pipeline settlement.
 *
 * This is SEPARATE from the credit-based billing in credits.ts:
 *   - credits.ts → customer-facing (deducts credits from user balance)
 *   - saas-usage.ts → internal analytics (tracks our cost vs selling price)
 *
 * Admin-only: exposes cost_eur (what we pay), sell_eur (what customer pays),
 * margin_eur (our profit) for profitability monitoring.
 */

import { getSharedPgPool } from "@/lib/auth/store";

export interface SaaSUsageByModel {
  model_id: string;
  provider: string;
  total_tokens_input: number;
  total_tokens_output: number;
  total_tokens_cache_read: number;
  total_cost_eur: number;
  total_sell_eur: number;
  total_margin_eur: number;
  call_count: number;
}

export interface SaaSUsageByWorkflow {
  workflow: string;
  total_cost_eur: number;
  total_sell_eur: number;
  total_margin_eur: number;
  call_count: number;
}

export interface SaaSUsageOverview {
  byModel: SaaSUsageByModel[];
  byWorkflow: SaaSUsageByWorkflow[];
  totals: {
    total_cost_eur: number;
    total_sell_eur: number;
    total_margin_eur: number;
    total_calls: number;
    total_tokens_input: number;
    total_tokens_output: number;
    margin_pct: number;
  };
}

export interface SaaSUsageQueryOpts {
  since?: Date;
  until?: Date;
  orgId?: string;
}

/**
 * Get SaaS usage aggregated by model.
 */
export async function getSaaSUsageByModel(
  opts: SaaSUsageQueryOpts = {}
): Promise<SaaSUsageByModel[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.since) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(opts.since);
  }
  if (opts.until) {
    conditions.push(`created_at < $${paramIdx++}`);
    params.push(opts.until);
  }
  if (opts.orgId) {
    conditions.push(`org_id = $${paramIdx++}`);
    params.push(opts.orgId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT
       model_id,
       provider,
       SUM(tokens_input) AS total_tokens_input,
       SUM(tokens_output) AS total_tokens_output,
       SUM(tokens_cache_read) AS total_tokens_cache_read,
       SUM(cost_eur) AS total_cost_eur,
       SUM(sell_eur) AS total_sell_eur,
       SUM(margin_eur) AS total_margin_eur,
       COUNT(*) AS call_count
     FROM saas_usage_ledger
     ${where}
     GROUP BY model_id, provider
     ORDER BY total_sell_eur DESC`,
    params
  );

  return result.rows.map((r) => ({
    model_id: r.model_id,
    provider: r.provider,
    total_tokens_input: Number(r.total_tokens_input ?? 0),
    total_tokens_output: Number(r.total_tokens_output ?? 0),
    total_tokens_cache_read: Number(r.total_tokens_cache_read ?? 0),
    total_cost_eur: Number(r.total_cost_eur ?? 0),
    total_sell_eur: Number(r.total_sell_eur ?? 0),
    total_margin_eur: Number(r.total_margin_eur ?? 0),
    call_count: Number(r.call_count ?? 0),
  }));
}

/**
 * Get SaaS usage aggregated by workflow.
 */
export async function getSaaSUsageByWorkflow(
  opts: SaaSUsageQueryOpts = {}
): Promise<SaaSUsageByWorkflow[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.since) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(opts.since);
  }
  if (opts.until) {
    conditions.push(`created_at < $${paramIdx++}`);
    params.push(opts.until);
  }
  if (opts.orgId) {
    conditions.push(`org_id = $${paramIdx++}`);
    params.push(opts.orgId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT
       workflow,
       SUM(cost_eur) AS total_cost_eur,
       SUM(sell_eur) AS total_sell_eur,
       SUM(margin_eur) AS total_margin_eur,
       COUNT(*) AS call_count
     FROM saas_usage_ledger
     ${where}
     GROUP BY workflow
     ORDER BY total_sell_eur DESC`,
    params
  );

  return result.rows.map((r) => ({
    workflow: r.workflow,
    total_cost_eur: Number(r.total_cost_eur ?? 0),
    total_sell_eur: Number(r.total_sell_eur ?? 0),
    total_margin_eur: Number(r.total_margin_eur ?? 0),
    call_count: Number(r.call_count ?? 0),
  }));
}

/**
 * Get full SaaS usage overview (by model + by workflow + totals).
 */
export async function getSaaSUsageOverview(
  opts: SaaSUsageQueryOpts = {}
): Promise<SaaSUsageOverview> {
  const [byModel, byWorkflow] = await Promise.all([
    getSaaSUsageByModel(opts),
    getSaaSUsageByWorkflow(opts),
  ]);

  const totalCost = byModel.reduce((s, r) => s + r.total_cost_eur, 0);
  const totalSell = byModel.reduce((s, r) => s + r.total_sell_eur, 0);
  const totalMargin = byModel.reduce((s, r) => s + r.total_margin_eur, 0);
  const totalCalls = byModel.reduce((s, r) => s + r.call_count, 0);
  const totalInput = byModel.reduce((s, r) => s + r.total_tokens_input, 0);
  const totalOutput = byModel.reduce((s, r) => s + r.total_tokens_output, 0);

  return {
    byModel,
    byWorkflow,
    totals: {
      total_cost_eur: Math.round(totalCost * 100) / 100,
      total_sell_eur: Math.round(totalSell * 100) / 100,
      total_margin_eur: Math.round(totalMargin * 100) / 100,
      total_calls: totalCalls,
      total_tokens_input: totalInput,
      total_tokens_output: totalOutput,
      margin_pct: totalSell > 0 ? Math.round((totalMargin / totalSell) * 10000) / 100 : 0,
    },
  };
}

// ── Invoices ──────────────────────────────────────────────────────────

export interface SaaSInvoiceSummary {
  id: string;
  org_id: string;
  period_start: string;
  period_end: string;
  seats: number;
  seat_subtotal_eur: number;
  included_credit_eur: number;
  usage_cost_eur: number;
  overage_cost_eur: number;
  total_eur: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

/**
 * List invoices for an org (or all orgs if orgId is null).
 */
export async function listSaaSInvoices(orgId?: string, limit = 50): Promise<SaaSInvoiceSummary[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];

  const params: unknown[] = [];
  let where = "";
  if (orgId) {
    params.push(orgId);
    where = `WHERE org_id = $1`;
  }

  const result = await pool.query(
    `SELECT
       id,
       org_id,
       period_start::text,
       period_end::text,
       seats,
       seat_subtotal_eur,
       included_credit_eur,
       usage_cost_eur,
       overage_cost_eur,
       total_eur,
       status,
       created_at::text,
       paid_at::text
     FROM saas_invoices
     ${where}
     ORDER BY period_start DESC
     LIMIT ${limit}`,
    params
  );

  return result.rows.map((r) => ({
    id: r.id,
    org_id: r.org_id,
    period_start: r.period_start,
    period_end: r.period_end,
    seats: r.seats,
    seat_subtotal_eur: Number(r.seat_subtotal_eur),
    included_credit_eur: Number(r.included_credit_eur),
    usage_cost_eur: Number(r.usage_cost_eur),
    overage_cost_eur: Number(r.overage_cost_eur),
    total_eur: Number(r.total_eur),
    status: r.status,
    created_at: r.created_at,
    paid_at: r.paid_at,
  }));
}

/**
 * Get a single invoice with line items.
 */
export async function getSaaSInvoice(
  invoiceId: string
): Promise<(SaaSInvoiceSummary & { line_items: unknown[]; currency: string }) | null> {
  const pool = getSharedPgPool();
  if (!pool) return null;

  const result = await pool.query(
    `SELECT
       id, org_id, period_start::text, period_end::text,
       seats, seat_subtotal_eur, included_credit_eur, usage_cost_eur, overage_cost_eur,
       total_eur, status, currency, line_items, created_at::text, paid_at::text
     FROM saas_invoices WHERE id = $1`,
    [invoiceId]
  );

  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id,
    org_id: r.org_id,
    period_start: r.period_start,
    period_end: r.period_end,
    seats: r.seats,
    seat_subtotal_eur: Number(r.seat_subtotal_eur),
    included_credit_eur: Number(r.included_credit_eur),
    usage_cost_eur: Number(r.usage_cost_eur),
    overage_cost_eur: Number(r.overage_cost_eur),
    total_eur: Number(r.total_eur),
    status: r.status,
    currency: r.currency,
    line_items: r.line_items ?? [],
    created_at: r.created_at,
    paid_at: r.paid_at,
  };
}
