import { createSchemaInit } from "@/lib/schema-init";

/**
 * SaaS billing tables (orgs, subscriptions, usage ledger, credit balance,
 * invoices) in their CURRENT shape — the result of engine migrations
 * v134–v138 in server/src/core/migrate.ts.
 *
 * Why the web app carries this DDL too: the credits gate, trial grants and
 * Stripe sync query these tables through the auth-DB pool. In production the
 * engine and the auth store share one database, so the engine's migrations
 * create them; with a separate auth database (local dev, e2e, any split
 * install) nothing did — the first AI request failed with
 * "relation saas_credit_balance does not exist".
 *
 * Safe in either order: everything here is IF NOT EXISTS, and the engine's
 * later migrations guard their renames/constraints with IF EXISTS blocks, so
 * an engine booting against tables created here is a no-op for them.
 * When the engine changes these tables, mirror the change here.
 */
export const SAAS_SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS saas_orgs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    plan          TEXT NOT NULL DEFAULT 'solo',
    seats         INTEGER NOT NULL DEFAULT 1,
    byok_key_encrypted BYTEA,
    byok_provider TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_org_plan CHECK (plan IN ('solo','kanzlei','enterprise'))
  );

  CREATE TABLE IF NOT EXISTS saas_subscriptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES saas_orgs(id) ON DELETE CASCADE,
    plan          TEXT NOT NULL DEFAULT 'solo',
    seats         INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'active',
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT,
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_sub_status CHECK (status IN ('active','past_due','canceled','trialing','paused'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_subscriptions_org
    ON saas_subscriptions(org_id) WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS saas_usage_ledger (
    id            BIGSERIAL PRIMARY KEY,
    org_id        UUID NOT NULL REFERENCES saas_orgs(id) ON DELETE CASCADE,
    user_id       TEXT,
    workflow_id   TEXT,
    workflow      TEXT NOT NULL DEFAULT 'generic',
    model_id      TEXT NOT NULL,
    provider      TEXT NOT NULL,
    tokens_input      INTEGER NOT NULL DEFAULT 0,
    tokens_output     INTEGER NOT NULL DEFAULT 0,
    tokens_cache_read INTEGER NOT NULL DEFAULT 0,
    is_embedding      BOOLEAN NOT NULL DEFAULT FALSE,
    cost_eur      NUMERIC(12,6) NOT NULL DEFAULT 0,
    sell_eur      NUMERIC(12,6) NOT NULL DEFAULT 0,
    margin_eur    NUMERIC(12,6) NOT NULL DEFAULT 0,
    plan          TEXT NOT NULL DEFAULT 'solo',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_saas_usage_org_date ON saas_usage_ledger(org_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_saas_usage_org_model ON saas_usage_ledger(org_id, model_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS saas_credit_balance (
    org_id        UUID NOT NULL REFERENCES saas_orgs(id) ON DELETE CASCADE,
    period_start  TIMESTAMPTZ NOT NULL,
    period_end    TIMESTAMPTZ NOT NULL,
    included_credit  NUMERIC(12,2) NOT NULL DEFAULT 0,
    used_credit      NUMERIC(12,2) NOT NULL DEFAULT 0,
    overage_eur      NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    purchased_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
    auto_reload_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_reload_threshold INTEGER NOT NULL DEFAULT 10,
    auto_reload_pack_id TEXT,
    credit_limit NUMERIC(12,2),
    credit_limit_period TEXT DEFAULT 'monthly',
    allow_negative_balance BOOLEAN DEFAULT FALSE,
    max_negative_balance NUMERIC(12,2) DEFAULT 0,
    auto_reload_last_triggered_at TIMESTAMPTZ,
    PRIMARY KEY (org_id, period_start)
  );

  CREATE TABLE IF NOT EXISTS saas_invoices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES saas_orgs(id) ON DELETE CASCADE,
    period_start  TIMESTAMPTZ NOT NULL,
    period_end    TIMESTAMPTZ NOT NULL,
    seats         INTEGER NOT NULL DEFAULT 1,
    seat_subtotal_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
    included_credit_eur  NUMERIC(12,2) NOT NULL DEFAULT 0,
    usage_cost_eur    NUMERIC(12,2) NOT NULL DEFAULT 0,
    overage_cost_eur  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_eur         NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL DEFAULT 'USD',
    status        TEXT NOT NULL DEFAULT 'draft',
    stripe_invoice_id  TEXT,
    pdf_url       TEXT,
    line_items    JSONB NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at       TIMESTAMPTZ,
    CONSTRAINT chk_invoice_status CHECK (status IN ('draft','open','paid','void','uncollectible'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_invoices_org_period ON saas_invoices(org_id, period_start);
`;

/** Guarantees the SaaS billing tables exist on the auth-DB pool (once per process). */
export const ensureSaasSchema = createSchemaInit(SAAS_SCHEMA_DDL);
