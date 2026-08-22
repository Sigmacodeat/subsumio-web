/**
 * Consumption-Based Pricing — Credit System
 * ===========================================
 *
 * Credit-Balance, Credit-Transactions, Credit-Kosten pro Operation.
 * Atomic deduction verhindert Race-Conditions und negative Balances.
 *
 * Credit-Kosten: 1 Credit = 1 EUR
 * Think=1, Document Analysis=2, Subsumption=3, Agent-Run=5
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSharedPgPool } from "@/lib/auth/store";
import { env } from "@/lib/env";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";

// Re-export client-safe constants (no Node.js deps) for backward compatibility.
// Client components should import from credit-constants.ts directly.
export {
  type CreditOperation,
  CREDIT_COSTS,
  type CreditPack,
  CREDIT_PACKS,
  getCreditPack,
} from "@/lib/billing/credit-constants";

import type { CreditOperation, CreditPack } from "@/lib/billing/credit-constants";
import { CREDIT_PACKS } from "@/lib/billing/credit-constants";

const log = logger("credits");

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const CREDITS_FILE = path.join(DATA_DIR, "credits.json");

export function creditPackByPriceId(priceId: string): CreditPack | undefined {
  for (const pack of CREDIT_PACKS) {
    const envId = env(pack.stripePriceEnv);
    if (envId && envId === priceId) return pack;
  }
  return undefined;
}

// ── Types ───────────────────────────────────────────────────────────────

export type OwnerType = "user" | "org";
export type CreditTxType = "purchase" | "consumption" | "refund" | "grant" | "expiry";

export interface CreditBalance {
  ownerId: string;
  ownerType: OwnerType;
  balance: number;
  autoReloadEnabled: boolean;
  autoReloadThreshold: number;
  autoReloadPackId: string | null;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  type: CreditTxType;
  amount: number;
  balanceAfter: number;
  operation?: string;
  caseSlug?: string;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  description?: string;
  createdAt: string;
}

export interface CaseUsageRow {
  caseSlug: string;
  totalCredits: number;
  queryCount: number;
  lastUsed: string;
}

// ── DB Schema ───────────────────────────────────────────────────────────

const ensureCreditSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_credit_balance (
    owner_id   text PRIMARY KEY,
    owner_type text NOT NULL,
    balance    numeric(12,2) NOT NULL DEFAULT 0,
    auto_reload_enabled boolean NOT NULL DEFAULT false,
    auto_reload_threshold integer NOT NULL DEFAULT 10,
    auto_reload_pack_id text,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  -- Migrate integer → numeric for token-based fractional credits (idempotent)
  ALTER TABLE subsumio_credit_balance ALTER COLUMN balance TYPE numeric(12,2) USING balance::numeric(12,2);

  CREATE TABLE IF NOT EXISTS subsumio_credit_transactions (
    id          bigserial PRIMARY KEY,
    owner_id    text NOT NULL,
    owner_type  text NOT NULL,
    type        text NOT NULL,
    amount      numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    operation   text,
    case_slug   text,
    stripe_session_id text,
    stripe_payment_intent text,
    description text,
    idempotency_key text,
    model_id    text,
    input_tokens bigint,
    cached_tokens bigint,
    output_tokens bigint,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  -- Migrate integer → numeric for token-based fractional credits (idempotent)
  ALTER TABLE subsumio_credit_transactions ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2);
  ALTER TABLE subsumio_credit_transactions ALTER COLUMN balance_after TYPE numeric(12,2) USING balance_after::numeric(12,2);
  -- Token-billing columns (idempotent)
  ALTER TABLE subsumio_credit_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
  ALTER TABLE subsumio_credit_transactions ADD COLUMN IF NOT EXISTS model_id text;
  ALTER TABLE subsumio_credit_transactions ADD COLUMN IF NOT EXISTS input_tokens bigint;
  ALTER TABLE subsumio_credit_transactions ADD COLUMN IF NOT EXISTS cached_tokens bigint;
  ALTER TABLE subsumio_credit_transactions ADD COLUMN IF NOT EXISTS cache_create_tokens bigint;
  ALTER TABLE subsumio_credit_transactions ADD COLUMN IF NOT EXISTS output_tokens bigint;

  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_owner_idx ON subsumio_credit_transactions (owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_case_idx ON subsumio_credit_transactions (case_slug);
  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_stripe_session_idx ON subsumio_credit_transactions (stripe_session_id);
  -- Idempotency: unique index prevents double-counting on retries.
  -- NULL keys are allowed (multiple non-idempotent transactions).
  CREATE UNIQUE INDEX IF NOT EXISTS subsumio_credit_tx_idempotency_idx
    ON subsumio_credit_transactions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  -- Token-usage lookup per model for dashboard
  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_model_idx
    ON subsumio_credit_transactions (owner_id, model_id, created_at DESC)
    WHERE model_id IS NOT NULL;

  -- Budget Alerts: track which threshold alerts have been sent (idempotent)
  CREATE TABLE IF NOT EXISTS subsumio_credit_alerts (
    owner_id      text NOT NULL,
    owner_type    text NOT NULL,
    threshold_pct integer NOT NULL,
    sent_at       timestamptz NOT NULL DEFAULT now(),
    balance_at_alert numeric(12,2) NOT NULL,
    PRIMARY KEY (owner_id, threshold_pct)
  );

  -- Credit Grants: track individual credit blocks with burn priority + expiry
  -- (OpenAI/Stripe best practice: promo → grant → paid burn order)
  CREATE TABLE IF NOT EXISTS subsumio_credit_grants (
    id          bigserial PRIMARY KEY,
    owner_id    text NOT NULL,
    owner_type  text NOT NULL,
    grant_type  text NOT NULL,
    amount      numeric(12,2) NOT NULL,
    remaining   numeric(12,2) NOT NULL,
    burn_priority integer NOT NULL DEFAULT 0,
    expires_at  timestamptz,
    stripe_session_id text,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS subsumio_credit_grants_owner_idx
    ON subsumio_credit_grants (owner_id, burn_priority ASC, created_at ASC)
    WHERE remaining > 0;
`);

// ── In-Memory Fallback (dev only) ───────────────────────────────────────

type MemoryBalance = CreditBalance;
interface MemoryTx extends CreditTransaction {
  seq: number;
  idempotencyKey?: string;
}

const memBalances = new Map<string, MemoryBalance>();
const memTransactions: MemoryTx[] = [];
let memTxSeq = 0;

function memKey(ownerId: string, ownerType: OwnerType): string {
  return `${ownerType}:${ownerId}`;
}

/**
 * Memory-Fallback Idempotency-Check: sucht ob ein Transaction mit diesem
 * idempotency_key schon existiert. Mirror des PG UNIQUE INDEX.
 */
function memFindByIdempotencyKey(key: string): MemoryTx | undefined {
  return memTransactions.find((t) => t.idempotencyKey === key);
}

// ── Balance ─────────────────────────────────────────────────────────────

export async function getBalance(ownerId: string, ownerType: OwnerType): Promise<CreditBalance> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const { rows } = await pool.query<CreditBalance>(
        `SELECT owner_id as "ownerId", owner_type as "ownerType", balance,
                auto_reload_enabled as "autoReloadEnabled",
                auto_reload_threshold as "autoReloadThreshold",
                auto_reload_pack_id as "autoReloadPackId",
                updated_at as "updatedAt"
         FROM subsumio_credit_balance WHERE owner_id = $1`,
        [ownerId]
      );
      if (rows[0]) return rows[0];
      // Create default balance row
      const default_ = {
        ownerId,
        ownerType,
        balance: 0,
        autoReloadEnabled: false,
        autoReloadThreshold: 10,
        autoReloadPackId: null,
        updatedAt: new Date().toISOString(),
      };
      await pool.query(
        `INSERT INTO subsumio_credit_balance (owner_id, owner_type, balance, auto_reload_enabled, auto_reload_threshold, auto_reload_pack_id)
         VALUES ($1, $2, 0, false, 10, NULL)
         ON CONFLICT (owner_id) DO NOTHING`,
        [ownerId, ownerType]
      );
      return default_;
    } catch (err) {
      log.error("getBalance error", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  const key = memKey(ownerId, ownerType);
  return (
    memBalances.get(key) ?? {
      ownerId,
      ownerType,
      balance: 0,
      autoReloadEnabled: false,
      autoReloadThreshold: 10,
      autoReloadPackId: null,
      updatedAt: new Date().toISOString(),
    }
  );
}

// ── Add Credits (purchase / grant / refund) ─────────────────────────────

export async function addCredits(
  ownerId: string,
  ownerType: OwnerType,
  amount: number,
  opts?: {
    type?: CreditTxType;
    stripeSessionId?: string;
    stripePaymentIntent?: string;
    description?: string;
  }
): Promise<CreditBalance> {
  const txType = opts?.type ?? "purchase";
  const pool = getSharedPgPool();

  if (pool) {
    try {
      await ensureCreditSchema();
      // Atomic: upsert balance + insert transaction in a transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO subsumio_credit_balance (owner_id, owner_type, balance)
           VALUES ($1, $2, $3)
           ON CONFLICT (owner_id)
           DO UPDATE SET balance = subsumio_credit_balance.balance + $3, updated_at = now()`,
          [ownerId, ownerType, amount]
        );
        const { rows } = await client.query<{ balance: number }>(
          "SELECT balance FROM subsumio_credit_balance WHERE owner_id = $1 FOR UPDATE",
          [ownerId]
        );
        const newBalance = rows[0]?.balance ?? amount;
        await client.query(
          `INSERT INTO subsumio_credit_transactions (owner_id, owner_type, type, amount, balance_after, stripe_session_id, stripe_payment_intent, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ownerId,
            ownerType,
            txType,
            amount,
            newBalance,
            opts?.stripeSessionId,
            opts?.stripePaymentIntent,
            opts?.description,
          ]
        );
        await client.query("COMMIT");
        return getBalance(ownerId, ownerType);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      log.error("addCredits error", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // File/memory fallback
  const key = memKey(ownerId, ownerType);
  const current = memBalances.get(key) ?? {
    ownerId,
    ownerType,
    balance: 0,
    autoReloadEnabled: false,
    autoReloadThreshold: 10,
    autoReloadPackId: null,
    updatedAt: new Date().toISOString(),
  };
  const newBalance = current.balance + amount;
  const updated: MemoryBalance = {
    ...current,
    balance: newBalance,
    updatedAt: new Date().toISOString(),
  };
  memBalances.set(key, updated);
  memTransactions.push({
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seq: memTxSeq++,
    ownerId,
    ownerType,
    type: txType,
    amount,
    balanceAfter: newBalance,
    stripeSessionId: opts?.stripeSessionId,
    stripePaymentIntent: opts?.stripePaymentIntent,
    description: opts?.description,
    createdAt: new Date().toISOString(),
  });
  await persistMemory();
  return updated;
}

// ── Deduct Credits (atomic, prevents negative balance) ──────────────────

export interface DeductResult {
  ok: boolean;
  balance: number;
  required: number;
}

export async function deductCredits(
  ownerId: string,
  ownerType: OwnerType,
  amount: number,
  opts?: {
    operation?: CreditOperation;
    caseSlug?: string;
    /** Required for retry-safe, server-side settlements. */
    idempotencyKey?: string;
  }
): Promise<DeductResult> {
  if (amount <= 0) return { ok: true, balance: 0, required: 0 };

  // Spend Cap Check (OpenAI: granular credit usage limits per user)
  const capCheck = await checkSpendCap(ownerId, ownerType, amount);
  if (!capCheck.allowed) {
    const current = await getBalance(ownerId, ownerType);
    return { ok: false, balance: current.balance, required: amount };
  }

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();

      // Negative Balance Config (OpenAI: allow short negative during processing delays)
      const negConfig = await getNegativeBalanceConfig(ownerId, ownerType);
      const allowNegative = negConfig.allowNegative;
      const maxNegative = negConfig.maxNegative;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (opts?.idempotencyKey) {
          const existing = await client.query<{ balance_after: number }>(
            `SELECT balance_after FROM subsumio_credit_transactions WHERE idempotency_key = $1`,
            [opts.idempotencyKey]
          );
          if (existing.rows[0]) {
            await client.query("ROLLBACK");
            return { ok: true, balance: existing.rows[0].balance_after, required: amount };
          }
        }
        // Atomic deduction — succeeds if balance >= amount (normal) OR
        // if allow_negative AND balance - amount >= -maxNegative (grace period)
        const { rows } = await client.query<{ balance: number }>(
          `UPDATE subsumio_credit_balance
           SET balance = balance - $2, updated_at = now()
           WHERE owner_id = $1 AND (
             balance >= $2
             ${allowNegative ? `OR (balance - $2 >= -$3 AND $3 > 0)` : ""}
           )
           RETURNING balance`,
          allowNegative ? [ownerId, amount, maxNegative] : [ownerId, amount]
        );
        if (rows.length === 0) {
          await client.query("ROLLBACK");
          const current = await getBalance(ownerId, ownerType);
          return { ok: false, balance: current.balance, required: amount };
        }
        const newBalance = rows[0].balance;
        try {
          await client.query(
            `INSERT INTO subsumio_credit_transactions
               (owner_id, owner_type, type, amount, balance_after, operation, case_slug, idempotency_key)
             VALUES ($1, $2, 'consumption', $3, $4, $5, $6, $7)`,
            [
              ownerId,
              ownerType,
              -amount,
              newBalance,
              opts?.operation ?? null,
              opts?.caseSlug ?? null,
              opts?.idempotencyKey ?? null,
            ]
          );
        } catch (insertErr: unknown) {
          // Race condition: another concurrent retry with the same idempotency_key
          // already inserted (and committed) between our SELECT and INSERT. The
          // unique index uniq_subsumio_credit_tx_idempotency_idx enforces this.
          // Rollback our balance UPDATE (which is now stale) and return the
          // winner's balance_after — the deduction already happened, just not by us.
          const pgCode = (insertErr as { code?: string }).code;
          if (pgCode === "23505" && opts?.idempotencyKey) {
            await client.query("ROLLBACK");
            const winner = await client.query<{ balance_after: number }>(
              `SELECT balance_after FROM subsumio_credit_transactions WHERE idempotency_key = $1`,
              [opts.idempotencyKey]
            );
            return {
              ok: true,
              balance: winner.rows[0]?.balance_after ?? newBalance,
              required: amount,
            };
          }
          throw insertErr;
        }
        await client.query("COMMIT");

        // Anomaly Detection (non-blocking, best-effort)
        detectSpendAnomaly(ownerId, ownerType).catch(() => {});

        return { ok: true, balance: newBalance, required: amount };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      log.error("deductCredits error", { error: err instanceof Error ? err.message : String(err) });
      return { ok: false, balance: 0, required: amount };
    }
  }

  // Memory fallback
  if (opts?.idempotencyKey) {
    const existing = memFindByIdempotencyKey(opts.idempotencyKey);
    if (existing) return { ok: true, balance: existing.balanceAfter, required: amount };
  }
  const key = memKey(ownerId, ownerType);
  const current = memBalances.get(key);
  if (!current || current.balance < amount) {
    return { ok: false, balance: current?.balance ?? 0, required: amount };
  }
  const newBalance = current.balance - amount;
  const updated: MemoryBalance = {
    ...current,
    balance: newBalance,
    updatedAt: new Date().toISOString(),
  };
  memBalances.set(key, updated);
  memTransactions.push({
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seq: memTxSeq++,
    ownerId,
    ownerType,
    type: "consumption",
    amount: -amount,
    balanceAfter: newBalance,
    operation: opts?.operation,
    caseSlug: opts?.caseSlug,
    idempotencyKey: opts?.idempotencyKey,
    createdAt: new Date().toISOString(),
  });
  await persistMemory();
  return { ok: true, balance: newBalance, required: amount };
}

// ── Check Credits (pre-flight check, no deduction) ──────────────────────

export async function checkCredits(
  ownerId: string,
  ownerType: OwnerType,
  required: number
): Promise<{ ok: boolean; balance: number; required: number }> {
  if (required <= 0) return { ok: true, balance: 0, required: 0 };
  const { balance } = await getBalance(ownerId, ownerType);
  return { ok: balance >= required, balance, required };
}

// ── Transactions ────────────────────────────────────────────────────────

export async function getTransactions(
  ownerId: string,
  ownerType: OwnerType,
  opts?: { limit?: number; offset?: number }
): Promise<CreditTransaction[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const { rows } = await pool.query<CreditTransaction>(
        `SELECT id::text, owner_id as "ownerId", owner_type as "ownerType", type,
                amount, balance_after as "balanceAfter", operation, case_slug as "caseSlug",
                stripe_session_id as "stripeSessionId", stripe_payment_intent as "stripePaymentIntent",
                description, created_at as "createdAt"
         FROM subsumio_credit_transactions
         WHERE owner_id = $1 AND owner_type = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [ownerId, ownerType, limit, offset]
      );
      return rows;
    } catch (err) {
      log.error("getTransactions error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return memTransactions
    .filter((t) => t.ownerId === ownerId && t.ownerType === ownerType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq)
    .slice(offset, offset + limit);
}

// ── Case Usage (Mandanten-Abrechnung) ───────────────────────────────────

export async function getCaseUsage(
  ownerId: string,
  ownerType: OwnerType,
  opts?: { since?: Date; until?: Date }
): Promise<CaseUsageRow[]> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const since = opts?.since ?? new Date(0);
      const until = opts?.until ?? new Date();
      const { rows } = await pool.query<CaseUsageRow>(
        `SELECT case_slug as "caseSlug",
                COALESCE(SUM(ABS(amount)), 0) as "totalCredits",
                COUNT(*) as "queryCount",
                MAX(created_at) as "lastUsed"
         FROM subsumio_credit_transactions
         WHERE owner_id = $1
           AND owner_type = $2
           AND type = 'consumption'
           AND case_slug IS NOT NULL
           AND created_at >= $3
           AND created_at <= $4
         GROUP BY case_slug
         ORDER BY totalCredits DESC`,
        [ownerId, ownerType, since, until]
      );
      return rows;
    } catch (err) {
      log.error("getCaseUsage error", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  // Memory fallback
  const filtered = memTransactions.filter(
    (t) =>
      t.ownerId === ownerId && t.ownerType === ownerType && t.type === "consumption" && t.caseSlug
  );
  const byCase = new Map<string, CaseUsageRow>();
  for (const t of filtered) {
    const slug = t.caseSlug!;
    const existing = byCase.get(slug);
    if (existing) {
      existing.totalCredits += Math.abs(t.amount);
      existing.queryCount += 1;
      if (t.createdAt > existing.lastUsed) existing.lastUsed = t.createdAt;
    } else {
      byCase.set(slug, {
        caseSlug: slug,
        totalCredits: Math.abs(t.amount),
        queryCount: 1,
        lastUsed: t.createdAt,
      });
    }
  }
  return Array.from(byCase.values()).sort((a, b) => b.totalCredits - a.totalCredits);
}

// ── Auto-Reload Settings ────────────────────────────────────────────────

export async function setAutoReload(
  ownerId: string,
  ownerType: OwnerType,
  settings: {
    enabled: boolean;
    threshold?: number;
    packId?: string | null;
  }
): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      await pool.query(
        `INSERT INTO subsumio_credit_balance (owner_id, owner_type, balance, auto_reload_enabled, auto_reload_threshold, auto_reload_pack_id)
         VALUES ($1, $2, 0, $3, $4, $5)
         ON CONFLICT (owner_id)
         DO UPDATE SET auto_reload_enabled = $3, auto_reload_threshold = $4, auto_reload_pack_id = $5, updated_at = now()`,
        [ownerId, ownerType, settings.enabled, settings.threshold ?? 10, settings.packId ?? null]
      );
    } catch (err) {
      log.error("setAutoReload error", { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  const key = memKey(ownerId, ownerType);
  const current = memBalances.get(key) ?? {
    ownerId,
    ownerType,
    balance: 0,
    autoReloadEnabled: false,
    autoReloadThreshold: 10,
    autoReloadPackId: null,
    updatedAt: new Date().toISOString(),
  };
  memBalances.set(key, {
    ...current,
    autoReloadEnabled: settings.enabled,
    autoReloadThreshold: settings.threshold ?? current.autoReloadThreshold,
    autoReloadPackId: settings.packId ?? current.autoReloadPackId,
    updatedAt: new Date().toISOString(),
  });
  await persistMemory();
}

// ── Resolve owner (user vs org) ─────────────────────────────────────────

export interface ResolvedOwner {
  ownerId: string;
  ownerType: OwnerType;
}

// ── File persistence (dev fallback) ─────────────────────────────────────

async function persistMemory(): Promise<void> {
  try {
    const data = {
      balances: Array.from(memBalances.entries()),
      transactions: memTransactions,
    };
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${CREDITS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, CREDITS_FILE);
  } catch {
    // Non-critical — memory fallback is dev-only
  }
}

// ── CSV Export for Mandanten-Abrechnung ─────────────────────────────────

export function caseUsageToCsv(rows: CaseUsageRow[]): string {
  const header = "Akte (Slug),Credits (EUR),Anzahl Queries,Letzte Nutzung\n";
  const body = rows
    .map((r) => {
      const date = new Date(r.lastUsed).toLocaleDateString("de-DE");
      return `${r.caseSlug},${r.totalCredits},${r.queryCount},${date}`;
    })
    .join("\n");
  return header + body;
}

// ── Insufficient Credits Response ───────────────────────────────────────

export function insufficientCreditsResponse(balance: number, required: number): Response {
  return Response.json(
    {
      error: "insufficient_credits",
      balance,
      required,
      message: `Insufficient credits: need ${required}, have ${balance}. Buy credits to continue.`,
    },
    { status: 402 }
  );
}

// ── Token-Based Billing (Goldstandard wie OpenAI Rate Card) ──────────────
//
// Erweitert das fixe CREDIT_COSTS-Modell um token-genaue Abrechnung:
//   - reserveCredits(): Pre-Pipeline Reservation (atomic, verhindert Overdraft)
//   - refundCredits(): Überschüssige Reservation zurückgeben
//   - deductTokenCredits(): Token-Usage → Credits berechnen + abziehen (idempotent)
//
// Idempotency-Key verhindert Double-Counting bei Retries (Stripe Best Practice).
// Siehe: src/lib/billing/credit-rate-card.ts für die Rate Card + Berechnung.

import {
  calculateTokenCredits,
  roundCredits,
  type TokenUsage,
} from "@/lib/billing/credit-rate-card";

/**
 * Reservation-Ergebnis für Pre-Pipeline Credit-Check.
 */
export interface ReservationResult {
  ok: boolean;
  reservedCredits: number;
  balanceAfterReservation: number;
  idempotencyKey: string;
}

/**
 * Credits VOR Pipeline-Start reservieren (atomic, verhindert Overdraft).
 *
 * Reservation Pattern (wie budget-tracker.ts für minion_jobs):
 *   1. Worker calls reserveCredits() BEFORE pipeline starts
 *   2. SQL UPDATE with CAS: WHERE balance >= estimatedCredits
 *   3. On success → pipeline runs
 *   4. On failure → 402 Payment Required
 *   5. After pipeline → refundCredits() for unused reservation
 *
 * @param ownerId User or Org ID
 * @param ownerType "user" | "org"
 * @param estimatedCredits Pre-Pipeline estimate (from estimatePipelineCredits)
 * @param idempotencyKey Unique key (e.g. `pipeline-{caseSlug}-{runId}`)
 */
export async function reserveCredits(
  ownerId: string,
  ownerType: OwnerType,
  estimatedCredits: number,
  idempotencyKey: string
): Promise<ReservationResult> {
  if (estimatedCredits <= 0) {
    return { ok: true, reservedCredits: 0, balanceAfterReservation: 0, idempotencyKey };
  }

  const rounded = roundCredits(estimatedCredits);
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Check idempotency: if reservation with this key already exists, return it
        const existing = await client.query<{ amount: number; balance_after: number }>(
          `SELECT amount, balance_after FROM subsumio_credit_transactions
           WHERE idempotency_key = $1 AND type = 'consumption'`,
          [idempotencyKey]
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return {
            ok: true,
            reservedCredits: Math.abs(existing.rows[0].amount),
            balanceAfterReservation: existing.rows[0].balance_after,
            idempotencyKey,
          };
        }

        // Atomic deduction — only succeeds if balance >= estimatedCredits
        const { rows } = await client.query<{ balance: number }>(
          `UPDATE subsumio_credit_balance
           SET balance = balance - $2, updated_at = now()
           WHERE owner_id = $1 AND balance >= $2
           RETURNING balance`,
          [ownerId, rounded]
        );
        if (rows.length === 0) {
          await client.query("ROLLBACK");
          const current = await getBalance(ownerId, ownerType);
          return {
            ok: false,
            reservedCredits: 0,
            balanceAfterReservation: current.balance,
            idempotencyKey,
          };
        }
        const newBalance = rows[0].balance;
        await client.query(
          `INSERT INTO subsumio_credit_transactions
             (owner_id, owner_type, type, amount, balance_after, operation, idempotency_key, description)
           VALUES ($1, $2, 'consumption', $3, $4, 'reservation', $5, $6)`,
          [ownerId, ownerType, -rounded, newBalance, idempotencyKey, `Reservation for pipeline`]
        );
        await client.query("COMMIT");
        return {
          ok: true,
          reservedCredits: rounded,
          balanceAfterReservation: newBalance,
          idempotencyKey,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      log.error("reserveCredits error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reservedCredits: 0, balanceAfterReservation: 0, idempotencyKey };
    }
  }

  // Memory fallback
  const existingMem = memFindByIdempotencyKey(idempotencyKey);
  if (existingMem) {
    return {
      ok: true,
      reservedCredits: Math.abs(existingMem.amount),
      balanceAfterReservation: existingMem.balanceAfter,
      idempotencyKey,
    };
  }
  const key = memKey(ownerId, ownerType);
  const current = memBalances.get(key);
  if (!current || current.balance < rounded) {
    return {
      ok: false,
      reservedCredits: 0,
      balanceAfterReservation: current?.balance ?? 0,
      idempotencyKey,
    };
  }
  const newBalance = roundCredits(current.balance - rounded);
  const updated: MemoryBalance = {
    ...current,
    balance: newBalance,
    updatedAt: new Date().toISOString(),
  };
  memBalances.set(key, updated);
  memTransactions.push({
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seq: memTxSeq++,
    ownerId,
    ownerType,
    type: "consumption",
    amount: -rounded,
    balanceAfter: newBalance,
    operation: "reservation",
    idempotencyKey,
    createdAt: new Date().toISOString(),
  });
  await persistMemory();
  return {
    ok: true,
    reservedCredits: rounded,
    balanceAfterReservation: newBalance,
    idempotencyKey,
  };
}

/**
 * Überschüssige Reservation zurückgeben (nach Pipeline-Ende).
 *
 * Wenn Pipeline weniger verbraucht hat als reserviert → Differenz zurück.
 * Wenn Pipeline mehr verbraucht hat → zusätzliche Abbuchung (settleReservation).
 *
 * @param actualCredits Tatsächlicher Verbrauch (from deductTokenCredits calls)
 */
export async function refundCredits(
  ownerId: string,
  ownerType: OwnerType,
  reservedCredits: number,
  actualCredits: number,
  idempotencyKey: string
): Promise<{ refunded: number; balanceAfter: number }> {
  const refund = roundCredits(Math.max(0, reservedCredits - actualCredits));
  if (refund <= 0) {
    const { balance } = await getBalance(ownerId, ownerType);
    return { refunded: 0, balanceAfter: balance };
  }

  const refundKey = `${idempotencyKey}-refund`;
  return addCreditsRefund(ownerId, ownerType, refund, refundKey);
}

/**
 * Token-Usage → Credits berechnen + abziehen (idempotent).
 *
 * Wird pro Layer-Call in der Pipeline aufgerufen. Berechnet Credits aus
 * Token-Usage + Modell-Rate (credit-rate-card.ts) und zieht atomar ab.
 *
 * @param usage Token-Usage (modelId, inputTokens, cachedInputTokens, outputTokens)
 * @param idempotencyKey Unique key (e.g. `layer-{caseSlug}-{runId}-{layerName}`)
 * @param caseSlug Optional: Akte-Slug für Mandanten-Abrechnung
 */
export interface TokenDeductResult {
  ok: boolean;
  credits: number;
  balance: number;
  idempotent: boolean; // true if already deducted with this key
}

export async function deductTokenCredits(
  ownerId: string,
  ownerType: OwnerType,
  usage: TokenUsage,
  idempotencyKey: string,
  caseSlug?: string
): Promise<TokenDeductResult> {
  const credits = calculateTokenCredits(usage);
  if (credits <= 0) {
    return { ok: true, credits: 0, balance: 0, idempotent: false };
  }

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Idempotency check: if already deducted with this key, return cached result
        const existing = await client.query<{ amount: number; balance_after: number }>(
          `SELECT amount, balance_after FROM subsumio_credit_transactions
           WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          return {
            ok: true,
            credits: Math.abs(existing.rows[0].amount),
            balance: existing.rows[0].balance_after,
            idempotent: true,
          };
        }

        // Atomic deduction
        const { rows } = await client.query<{ balance: number }>(
          `UPDATE subsumio_credit_balance
           SET balance = balance - $2, updated_at = now()
           WHERE owner_id = $1 AND balance >= $2
           RETURNING balance`,
          [ownerId, credits]
        );
        if (rows.length === 0) {
          await client.query("ROLLBACK");
          const current = await getBalance(ownerId, ownerType);
          return { ok: false, credits, balance: current.balance, idempotent: false };
        }
        const newBalance = rows[0].balance;
        await client.query(
          `INSERT INTO subsumio_credit_transactions
             (owner_id, owner_type, type, amount, balance_after, operation, case_slug,
              idempotency_key, model_id, input_tokens, cached_tokens, cache_create_tokens, output_tokens)
           VALUES ($1, $2, 'consumption', $3, $4, 'token_usage', $5, $6, $7, $8, $9, $10, $11)`,
          [
            ownerId,
            ownerType,
            -credits,
            newBalance,
            caseSlug ?? null,
            idempotencyKey,
            usage.modelId,
            usage.inputTokens,
            usage.cachedInputTokens,
            usage.cacheCreateTokens,
            usage.outputTokens,
          ]
        );
        await client.query("COMMIT");
        return { ok: true, credits, balance: newBalance, idempotent: false };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      log.error("deductTokenCredits error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, credits, balance: 0, idempotent: false };
    }
  }

  // Memory fallback
  const existingMem = memFindByIdempotencyKey(idempotencyKey);
  if (existingMem) {
    return {
      ok: true,
      credits: Math.abs(existingMem.amount),
      balance: existingMem.balanceAfter,
      idempotent: true,
    };
  }
  const key = memKey(ownerId, ownerType);
  const current = memBalances.get(key);
  if (!current || current.balance < credits) {
    return { ok: false, credits, balance: current?.balance ?? 0, idempotent: false };
  }
  const newBalance = roundCredits(current.balance - credits);
  const updated: MemoryBalance = {
    ...current,
    balance: newBalance,
    updatedAt: new Date().toISOString(),
  };
  memBalances.set(key, updated);
  memTransactions.push({
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seq: memTxSeq++,
    ownerId,
    ownerType,
    type: "consumption",
    amount: -credits,
    balanceAfter: newBalance,
    operation: "token_usage",
    caseSlug,
    idempotencyKey,
    createdAt: new Date().toISOString(),
  });
  await persistMemory();
  return { ok: true, credits, balance: newBalance, idempotent: false };
}

/**
 * Helper: Credits zurückgeben mit Idempotency-Key.
 */
async function addCreditsRefund(
  ownerId: string,
  ownerType: OwnerType,
  amount: number,
  idempotencyKey: string
): Promise<{ refunded: number; balanceAfter: number }> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Idempotency check
        const existing = await client.query<{ amount: number }>(
          `SELECT amount FROM subsumio_credit_transactions WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          const { balance } = await getBalance(ownerId, ownerType);
          return { refunded: 0, balanceAfter: balance };
        }
        await client.query(
          `UPDATE subsumio_credit_balance SET balance = balance + $2, updated_at = now() WHERE owner_id = $1`,
          [ownerId, amount]
        );
        const { rows } = await client.query<{ balance: number }>(
          "SELECT balance FROM subsumio_credit_balance WHERE owner_id = $1 FOR UPDATE",
          [ownerId]
        );
        const newBalance = rows[0]?.balance ?? amount;
        await client.query(
          `INSERT INTO subsumio_credit_transactions
             (owner_id, owner_type, type, amount, balance_after, operation, idempotency_key, description)
           VALUES ($1, $2, 'refund', $3, $4, 'reservation_refund', $5, $6)`,
          [ownerId, ownerType, amount, newBalance, idempotencyKey, `Refund unused reservation`]
        );
        await client.query("COMMIT");
        return { refunded: amount, balanceAfter: newBalance };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      log.error("addCreditsRefund error", {
        error: err instanceof Error ? err.message : String(err),
      });
      const { balance } = await getBalance(ownerId, ownerType);
      return { refunded: 0, balanceAfter: balance };
    }
  }
  // Memory fallback
  const existingMem = memFindByIdempotencyKey(idempotencyKey);
  if (existingMem) {
    return { refunded: 0, balanceAfter: existingMem.balanceAfter };
  }
  const key = memKey(ownerId, ownerType);
  const current = memBalances.get(key);
  if (current) {
    const newBalance = roundCredits(current.balance + amount);
    memBalances.set(key, { ...current, balance: newBalance, updatedAt: new Date().toISOString() });
    memTransactions.push({
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      seq: memTxSeq++,
      ownerId,
      ownerType,
      type: "refund",
      amount,
      balanceAfter: newBalance,
      operation: "reservation_refund",
      idempotencyKey,
      createdAt: new Date().toISOString(),
    });
    await persistMemory();
    return { refunded: amount, balanceAfter: newBalance };
  }
  return { refunded: 0, balanceAfter: 0 };
}

/**
 * Token-Usage pro Owner + Modell abrufen (für Dashboard).
 */
export interface TokenUsageRow {
  modelId: string;
  totalCredits: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalCacheCreateTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

export async function getTokenUsageByModel(
  ownerId: string,
  ownerType: OwnerType,
  opts?: { since?: Date; until?: Date }
): Promise<TokenUsageRow[]> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const since = opts?.since ?? new Date(0);
      const until = opts?.until ?? new Date();
      const { rows } = await pool.query<TokenUsageRow>(
        `SELECT model_id as "modelId",
                COALESCE(SUM(ABS(amount)), 0) as "totalCredits",
                COALESCE(SUM(input_tokens), 0) as "totalInputTokens",
                COALESCE(SUM(cached_tokens), 0) as "totalCachedTokens",
                COALESCE(SUM(cache_create_tokens), 0) as "totalCacheCreateTokens",
                COALESCE(SUM(output_tokens), 0) as "totalOutputTokens",
                COUNT(*) as "callCount"
         FROM subsumio_credit_transactions
         WHERE owner_id = $1 AND owner_type = $2
           AND model_id IS NOT NULL
           AND created_at >= $3 AND created_at <= $4
         GROUP BY model_id
         ORDER BY totalCredits DESC`,
        [ownerId, ownerType, since, until]
      );
      return rows;
    } catch (err) {
      log.error("getTokenUsageByModel error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return [];
}

// ── Admin: Tenant-wide Token Usage Overview ────────────────────────────────

export interface AdminUserUsageRow {
  ownerId: string;
  ownerType: OwnerType;
  totalCredits: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalCacheCreateTokens: number;
  totalOutputTokens: number;
  callCount: number;
  lastActivity: Date | null;
}

export interface AdminModelUsageRow {
  modelId: string;
  totalCredits: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalCacheCreateTokens: number;
  totalOutputTokens: number;
  callCount: number;
  uniqueUsers: number;
}

export interface AdminDailyTrendRow {
  date: string; // YYYY-MM-DD
  totalCredits: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface AdminTokenUsageOverview {
  perUser: AdminUserUsageRow[];
  perModel: AdminModelUsageRow[];
  dailyTrend: AdminDailyTrendRow[];
  totals: {
    totalCredits: number;
    totalInputTokens: number;
    totalCachedTokens: number;
    totalCacheCreateTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    uniqueUsers: number;
    cacheHitRate: number;
  };
}

/**
 * Admin Overview über Token-Usage aller Tenant-User.
 * Wie OpenAI's Global Admin Console Analytics.
 */
export async function getAdminTokenUsageOverview(opts?: {
  since?: Date;
  until?: Date;
  days?: number;
}): Promise<AdminTokenUsageOverview> {
  const pool = getSharedPgPool();
  const since = opts?.since ?? new Date(Date.now() - (opts?.days ?? 30) * 24 * 60 * 60 * 1000);
  const until = opts?.until ?? new Date();

  if (!pool) {
    return {
      perUser: [],
      perModel: [],
      dailyTrend: [],
      totals: {
        totalCredits: 0,
        totalInputTokens: 0,
        totalCachedTokens: 0,
        totalCacheCreateTokens: 0,
        totalOutputTokens: 0,
        totalCalls: 0,
        uniqueUsers: 0,
        cacheHitRate: 0,
      },
    };
  }

  try {
    await ensureCreditSchema();

    const [perUserRes, perModelRes, dailyRes] = await Promise.all([
      pool.query<AdminUserUsageRow>(
        `SELECT owner_id as "ownerId",
                owner_type as "ownerType",
                COALESCE(SUM(ABS(amount)), 0) as "totalCredits",
                COALESCE(SUM(input_tokens), 0) as "totalInputTokens",
                COALESCE(SUM(cached_tokens), 0) as "totalCachedTokens",
                COALESCE(SUM(cache_create_tokens), 0) as "totalCacheCreateTokens",
                COALESCE(SUM(output_tokens), 0) as "totalOutputTokens",
                COUNT(*) as "callCount",
                MAX(created_at) as "lastActivity"
         FROM subsumio_credit_transactions
         WHERE model_id IS NOT NULL
           AND created_at >= $1 AND created_at <= $2
         GROUP BY owner_id, owner_type
         ORDER BY totalCredits DESC
         LIMIT 100`,
        [since, until]
      ),
      pool.query<AdminModelUsageRow>(
        `SELECT model_id as "modelId",
                COALESCE(SUM(ABS(amount)), 0) as "totalCredits",
                COALESCE(SUM(input_tokens), 0) as "totalInputTokens",
                COALESCE(SUM(cached_tokens), 0) as "totalCachedTokens",
                COALESCE(SUM(cache_create_tokens), 0) as "totalCacheCreateTokens",
                COALESCE(SUM(output_tokens), 0) as "totalOutputTokens",
                COUNT(*) as "callCount",
                COUNT(DISTINCT owner_id) as "uniqueUsers"
         FROM subsumio_credit_transactions
         WHERE model_id IS NOT NULL
           AND created_at >= $1 AND created_at <= $2
         GROUP BY model_id
         ORDER BY totalCredits DESC`,
        [since, until]
      ),
      pool.query<AdminDailyTrendRow>(
        `SELECT DATE(created_at) as "date",
                COALESCE(SUM(ABS(amount)), 0) as "totalCredits",
                COUNT(*) as "totalCalls",
                COALESCE(SUM(input_tokens), 0) as "totalInputTokens",
                COALESCE(SUM(output_tokens), 0) as "totalOutputTokens"
         FROM subsumio_credit_transactions
         WHERE model_id IS NOT NULL
           AND created_at >= $1 AND created_at <= $2
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [since, until]
      ),
    ]);

    const totalCredits = perUserRes.rows.reduce((s, r) => s + r.totalCredits, 0);
    const totalInputTokens = perUserRes.rows.reduce((s, r) => s + r.totalInputTokens, 0);
    const totalCachedTokens = perUserRes.rows.reduce((s, r) => s + r.totalCachedTokens, 0);
    const totalCacheCreateTokens = perUserRes.rows.reduce(
      (s, r) => s + r.totalCacheCreateTokens,
      0
    );
    const totalOutputTokens = perUserRes.rows.reduce((s, r) => s + r.totalOutputTokens, 0);
    const totalCalls = perUserRes.rows.reduce((s, r) => s + r.callCount, 0);

    return {
      perUser: perUserRes.rows,
      perModel: perModelRes.rows,
      dailyTrend: dailyRes.rows,
      totals: {
        totalCredits: Math.round(totalCredits * 100) / 100,
        totalInputTokens,
        totalCachedTokens,
        totalCacheCreateTokens,
        totalOutputTokens,
        totalCalls,
        uniqueUsers: perUserRes.rows.length,
        cacheHitRate:
          totalInputTokens + totalCachedTokens > 0
            ? totalCachedTokens / (totalInputTokens + totalCachedTokens)
            : 0,
      },
    };
  } catch (err) {
    log.error("getAdminTokenUsageOverview error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      perUser: [],
      perModel: [],
      dailyTrend: [],
      totals: {
        totalCredits: 0,
        totalInputTokens: 0,
        totalCachedTokens: 0,
        totalCacheCreateTokens: 0,
        totalOutputTokens: 0,
        totalCalls: 0,
        uniqueUsers: 0,
        cacheHitRate: 0,
      },
    };
  }
}

// ── Budget Alerts (50%/75%/90% wie OpenAI) ──────────────────────────────────

export interface BudgetAlertResult {
  triggered: boolean;
  threshold?: number;
  balance: number;
  peakBalance: number;
}

/**
 * Prüft nach jeder Transaktion ob ein Budget-Alert fällig ist.
 * Alerts bei 50%, 75%, 90% des Peak-Balances (höchster Stand im letzten Jahr).
 * Idempotent: jeder Threshold wird nur einmal pro Abwärtstrend gesendet.
 *
 * Wie OpenAI's "Your credit balance is below 50%" Email.
 */
export async function checkAndSendBudgetAlert(
  ownerId: string,
  ownerType: OwnerType,
  userEmail: string,
  currentBalance: number
): Promise<BudgetAlertResult> {
  const pool = getSharedPgPool();
  if (!pool) return { triggered: false, balance: currentBalance, peakBalance: currentBalance };

  try {
    await ensureCreditSchema();

    // Peak-Balance = höchste balance_after im letzten Jahr
    const { rows } = await pool.query<{ peak: number }>(
      `SELECT COALESCE(MAX(balance_after), 0) as "peak"
       FROM subsumio_credit_transactions
       WHERE owner_id = $1 AND owner_type = $2
         AND created_at >= NOW() - INTERVAL '365 days'`,
      [ownerId, ownerType]
    );
    const peak = Number(rows[0]?.peak ?? currentBalance);
    if (peak <= 0) return { triggered: false, balance: currentBalance, peakBalance: peak };

    const thresholds = [50, 75, 90];
    for (const pct of thresholds) {
      const thresholdBalance = peak * (1 - pct / 100);
      if (currentBalance <= thresholdBalance) {
        // Check if already sent for this threshold (idempotent)
        const { rows: existing } = await pool.query(
          `SELECT 1 FROM subsumio_credit_alerts
           WHERE owner_id = $1 AND threshold_pct = $2
             AND sent_at >= NOW() - INTERVAL '7 days'`,
          [ownerId, pct]
        );
        if (existing.length > 0) continue; // already sent recently

        // Record alert
        await pool.query(
          `INSERT INTO subsumio_credit_alerts (owner_id, owner_type, threshold_pct, balance_at_alert)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (owner_id, threshold_pct) DO UPDATE
             SET sent_at = NOW(), balance_at_alert = EXCLUDED.balance_at_alert`,
          [ownerId, ownerType, pct, currentBalance]
        );

        // Send email (best-effort, non-blocking)
        const { sendMail, isMailConfigured } = await import("@/lib/mail");
        if (isMailConfigured()) {
          const pctLabel = pct === 50 ? "50%" : pct === 75 ? "75%" : "90%";
          sendMail({
            to: userEmail,
            subject: `Subsumio — Credit-Stand unter ${pctLabel}`,
            text: `Ihr Credit-Stand ist auf ${currentBalance.toFixed(2)} € gefallen — das sind weniger als ${pctLabel} Ihres Höchststandes (${peak.toFixed(2)} €).\n\nSie können unter https://subsumio.com/dashboard/billing neue Credits kaufen oder Auto-Reload aktivieren.\n\nIhr Subsumio-Team`,
            html: `<p>Ihr Credit-Stand ist auf <strong>${currentBalance.toFixed(2)} €</strong> gefallen — das sind weniger als ${pctLabel} Ihres Höchststandes (${peak.toFixed(2)} €).</p><p><a href="https://subsumio.com/dashboard/billing">Credits aufladen</a> oder Auto-Reload aktivieren.</p>`,
          }).catch(() => {
            // best-effort, ignore errors
          });
        }

        log.info("budget_alert_sent", { ownerId, threshold: pct, balance: currentBalance, peak });
        return { triggered: true, threshold: pct, balance: currentBalance, peakBalance: peak };
      }
    }

    return { triggered: false, balance: currentBalance, peakBalance: peak };
  } catch (err) {
    log.error("checkAndSendBudgetAlert error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { triggered: false, balance: currentBalance, peakBalance: currentBalance };
  }
}

// ── Credit Expiry (1 Jahr wie OpenAI) ───────────────────────────────────────

export interface ExpiryResult {
  expiredCredits: number;
  expiredGrants: number;
}

/**
 * Lässt abgelaufene Credit-Grants verfallen.
 * Wie OpenAI: gekaufte Credits verfallen nach 1 Jahr.
 * Wird via Cron-Job (z.B. täglich) oder manuell via API aufgerufen.
 */
export async function expireCredits(): Promise<ExpiryResult> {
  const pool = getSharedPgPool();
  if (!pool) return { expiredCredits: 0, expiredGrants: 0 };

  try {
    await ensureCreditSchema();

    // Find expired grants with remaining balance
    const { rows } = await pool.query<{
      id: string;
      owner_id: string;
      owner_type: string;
      remaining: number;
      description: string;
    }>(
      `SELECT id, owner_id, owner_type, remaining, description
       FROM subsumio_credit_grants
       WHERE expires_at IS NOT NULL
         AND expires_at < NOW()
         AND remaining > 0`,
      []
    );

    let expiredCredits = 0;
    for (const grant of rows) {
      // Deduct from balance
      await pool.query(
        `UPDATE subsumio_credit_balance
         SET balance = balance - $3, updated_at = NOW()
         WHERE owner_id = $1 AND owner_type = $2`,
        [grant.owner_id, grant.owner_type, grant.remaining]
      );

      // Record expiry transaction
      await pool.query(
        `INSERT INTO subsumio_credit_transactions (owner_id, owner_type, type, amount, balance_after, description, idempotency_key)
         VALUES ($1, $2, 'expiry', $3,
           (SELECT balance FROM subsumio_credit_balance WHERE owner_id = $1 AND owner_type = $2),
           $4, $5)`,
        [
          grant.owner_id,
          grant.owner_type,
          -grant.remaining,
          `Credit-Ablauf: ${grant.description ?? "Gekaufte Credits"}`,
          `expiry-grant-${grant.id}`,
        ]
      );

      // Mark grant as fully consumed
      await pool.query(`UPDATE subsumio_credit_grants SET remaining = 0 WHERE id = $1`, [grant.id]);

      expiredCredits += Number(grant.remaining);
    }

    if (rows.length > 0) {
      log.info("credits_expired", { expiredGrants: rows.length, expiredCredits });
    }

    return { expiredCredits, expiredGrants: rows.length };
  } catch (err) {
    log.error("expireCredits error", { error: err instanceof Error ? err.message : String(err) });
    return { expiredCredits: 0, expiredGrants: 0 };
  }
}

// ── Credit Burn Order (Promo > Grant > Paid) ────────────────────────────────

export interface CreditGrant {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  grantType: "promotional" | "grant" | "paid";
  amount: number;
  remaining: number;
  burnPriority: number;
  expiresAt: Date | null;
  description: string;
}

/**
 * Verbucht einen Credit-Kauf als neues Grant.
 * Burn Priority: promotional (0) > grant (1) > paid (2)
 * Wie Stripe/OpenAI Best Practice: Promo-Credits werden zuerst verbraucht.
 */
export async function addCreditGrant(
  ownerId: string,
  ownerType: OwnerType,
  grantType: "promotional" | "grant" | "paid",
  amount: number,
  opts?: { expiresAt?: Date; stripeSessionId?: string; description?: string }
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  try {
    await ensureCreditSchema();
    const burnPriority = grantType === "promotional" ? 0 : grantType === "grant" ? 1 : 2;
    const expiresAt = opts?.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 Jahr default

    await pool.query(
      `INSERT INTO subsumio_credit_grants (owner_id, owner_type, grant_type, amount, remaining, burn_priority, expires_at, stripe_session_id, description)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)`,
      [
        ownerId,
        ownerType,
        grantType,
        amount,
        burnPriority,
        expiresAt,
        opts?.stripeSessionId ?? null,
        opts?.description ?? `${grantType} credits`,
      ]
    );
  } catch (err) {
    log.error("addCreditGrant error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Listet alle aktiven Credit-Grants eines Owners (sortiert nach Burn-Priority).
 */
export async function getCreditGrants(
  ownerId: string,
  ownerType: OwnerType
): Promise<CreditGrant[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];

  try {
    await ensureCreditSchema();
    const { rows } = await pool.query<CreditGrant>(
      `SELECT id, owner_id as "ownerId", owner_type as "ownerType",
              grant_type as "grantType", amount, remaining, burn_priority as "burnPriority",
              expires_at as "expiresAt", description
       FROM subsumio_credit_grants
       WHERE owner_id = $1 AND owner_type = $2 AND remaining > 0
       ORDER BY burn_priority ASC, created_at ASC`,
      [ownerId, ownerType]
    );
    return rows.map((r) => ({
      ...r,
      id: String(r.id),
      amount: Number(r.amount),
      remaining: Number(r.remaining),
      expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
    }));
  } catch (err) {
    log.error("getCreditGrants error", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ── Anomaly Detection (Spend-Spike Circuit-Breaker) ─────────────────────────
// Stripe Best Practice: Circuit-Breaker bei 10x Spend-Spike.
// Vergleicht Credit-Verbrauch der letzten Stunde mit 7-Tage-Durchschnitt.
// Bei >10x Spike → Alert + optional Block (für orgs mit spend_cap_enabled).

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  spikeMultiplier: number;
  hourlySpend: number;
  weeklyAvgHourlySpend: number;
  action: "allow" | "alert" | "block";
}

/**
 * Erkennt Spend-Spikes: vergleicht letzte Stunde mit 7-Tage-Schnitt.
 * Wie Stripe's Anomaly Detection + OpenAI's spend monitoring.
 */
export async function detectSpendAnomaly(
  ownerId: string,
  ownerType: OwnerType,
  opts?: { spikeThreshold?: number; blockThreshold?: number }
): Promise<AnomalyDetectionResult> {
  const pool = getSharedPgPool();
  const spikeThreshold = opts?.spikeThreshold ?? 10; // 10x = anomaly
  const blockThreshold = opts?.blockThreshold ?? 20; // 20x = block

  if (!pool) {
    return {
      isAnomaly: false,
      spikeMultiplier: 0,
      hourlySpend: 0,
      weeklyAvgHourlySpend: 0,
      action: "allow",
    };
  }

  try {
    await ensureCreditSchema();

    const { rows } = await pool.query<{ hourly: number; weekly_avg: number }>(
      `SELECT
         COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour' AND amount < 0), 0) as "hourly",
         COALESCE(AVG(hourly_sum) FILTER (WHERE hour_block >= NOW() - INTERVAL '7 days'), 0) as "weekly_avg"
       FROM (
         SELECT
           DATE_TRUNC('hour', created_at) as hour_block,
           SUM(ABS(amount)) as hourly_sum
         FROM subsumio_credit_transactions
         WHERE owner_id = $1 AND owner_type = $2 AND amount < 0
           AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE_TRUNC('hour', created_at)
       ) sub`,
      [ownerId, ownerType]
    );

    const hourlySpend = Number(rows[0]?.hourly ?? 0);
    const weeklyAvgHourlySpend = Number(rows[0]?.weekly_avg ?? 0);

    // Avoid division by zero — if no history, allow
    if (weeklyAvgHourlySpend < 0.01) {
      return {
        isAnomaly: false,
        spikeMultiplier: 0,
        hourlySpend,
        weeklyAvgHourlySpend,
        action: "allow",
      };
    }

    const spikeMultiplier = hourlySpend / weeklyAvgHourlySpend;
    const isAnomaly = spikeMultiplier >= spikeThreshold;

    let action: "allow" | "alert" | "block" = "allow";
    if (spikeMultiplier >= blockThreshold) action = "block";
    else if (isAnomaly) action = "alert";

    if (isAnomaly) {
      log.warn("spend_anomaly_detected", {
        ownerId,
        spikeMultiplier: Math.round(spikeMultiplier * 10) / 10,
        hourlySpend,
        weeklyAvgHourlySpend,
        action,
      });
    }

    return { isAnomaly, spikeMultiplier, hourlySpend, weeklyAvgHourlySpend, action };
  } catch (err) {
    log.error("detectSpendAnomaly error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      isAnomaly: false,
      spikeMultiplier: 0,
      hourlySpend: 0,
      weeklyAvgHourlySpend: 0,
      action: "allow",
    };
  }
}

// ── Spend Caps per User ─────────────────────────────────────────────────────
// OpenAI: Admins können Credit-Limits pro User/Gruppe setzen.
// Wir: credit_limit in subsumio_credit_balance + Admin-UI.

export interface SpendCap {
  ownerId: string;
  ownerType: OwnerType;
  creditLimit: number | null; // null = unlimited
  period: "daily" | "weekly" | "monthly" | "total";
  spentInPeriod: number;
}

/**
 * Setzt ein Credit-Limit für einen User (Admin-Funktion).
 * Wie OpenAI's granular credit usage limits für custom roles.
 */
export async function setSpendCap(
  ownerId: string,
  ownerType: OwnerType,
  creditLimit: number | null,
  period: "daily" | "weekly" | "monthly" | "total" = "monthly"
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  try {
    await ensureCreditSchema();
    // Add credit_limit column if not exists (idempotent)
    await pool.query(
      `ALTER TABLE subsumio_credit_balance ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2)`
    );
    await pool.query(
      `ALTER TABLE subsumio_credit_balance ADD COLUMN IF NOT EXISTS credit_limit_period text DEFAULT 'monthly'`
    );

    await pool.query(
      `UPDATE subsumio_credit_balance
       SET credit_limit = $3, credit_limit_period = $4, updated_at = NOW()
       WHERE owner_id = $1 AND owner_type = $2`,
      [ownerId, ownerType, creditLimit, period]
    );
  } catch (err) {
    log.error("setSpendCap error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Prüft ob ein User sein Spend-Cap erreicht hat.
 * Gibt true zurück wenn der User noch Credits ausgeben darf.
 */
export async function checkSpendCap(
  ownerId: string,
  ownerType: OwnerType,
  amount: number
): Promise<{ allowed: boolean; cap: SpendCap | null }> {
  const pool = getSharedPgPool();
  if (!pool) return { allowed: true, cap: null };

  try {
    await ensureCreditSchema();

    // Get credit_limit + period
    const { rows } = await pool.query<{ credit_limit: number | null; credit_limit_period: string }>(
      `SELECT credit_limit, credit_limit_period
       FROM subsumio_credit_balance
       WHERE owner_id = $1 AND owner_type = $2`,
      [ownerId, ownerType]
    );

    const limit = rows[0]?.credit_limit;
    if (!limit || limit <= 0) return { allowed: true, cap: null };

    const period = (rows[0]?.credit_limit_period ?? "monthly") as
      | "daily"
      | "weekly"
      | "monthly"
      | "total";
    const interval =
      period === "daily"
        ? "1 day"
        : period === "weekly"
          ? "7 days"
          : period === "monthly"
            ? "30 days"
            : "100 years";

    // Sum spent in period
    const { rows: spentRows } = await pool.query<{ total: number }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as "total"
       FROM subsumio_credit_transactions
       WHERE owner_id = $1 AND owner_type = $2 AND amount < 0
         AND created_at >= NOW() - INTERVAL '${interval}'`,
      [ownerId, ownerType]
    );

    const spentInPeriod = Number(spentRows[0]?.total ?? 0);
    const allowed = spentInPeriod + amount <= limit;

    return {
      allowed,
      cap: { ownerId, ownerType, creditLimit: Number(limit), period, spentInPeriod },
    };
  } catch (err) {
    log.error("checkSpendCap error", { error: err instanceof Error ? err.message : String(err) });
    return { allowed: true, cap: null };
  }
}

// ── Negative Balance (kurz negativ bei processing delays) ───────────────────
// OpenAI: erlaubt kurz negativ während processing delays, wird später ausgeglichen.
// Wir: allow_negative_balance flag + Grace Period (max -50€ für 24h).

export interface NegativeBalanceConfig {
  allowNegative: boolean;
  maxNegative: number; // z.B. -50.00
  gracePeriodHours: number; // z.B. 24
}

export async function getNegativeBalanceConfig(
  ownerId: string,
  ownerType: OwnerType
): Promise<NegativeBalanceConfig> {
  const pool = getSharedPgPool();
  if (!pool) return { allowNegative: false, maxNegative: 0, gracePeriodHours: 0 };

  try {
    await ensureCreditSchema();
    await pool.query(
      `ALTER TABLE subsumio_credit_balance ADD COLUMN IF NOT EXISTS allow_negative_balance boolean DEFAULT false`
    );
    await pool.query(
      `ALTER TABLE subsumio_credit_balance ADD COLUMN IF NOT EXISTS max_negative_balance numeric(12,2) DEFAULT 0`
    );

    const { rows } = await pool.query<{
      allow_negative_balance: boolean;
      max_negative_balance: number;
    }>(
      `SELECT allow_negative_balance, max_negative_balance
       FROM subsumio_credit_balance
       WHERE owner_id = $1 AND owner_type = $2`,
      [ownerId, ownerType]
    );

    return {
      allowNegative: rows[0]?.allow_negative_balance ?? false,
      maxNegative: Number(rows[0]?.max_negative_balance ?? 0),
      gracePeriodHours: 24,
    };
  } catch {
    return { allowNegative: false, maxNegative: 0, gracePeriodHours: 0 };
  }
}

export async function setNegativeBalanceConfig(
  ownerId: string,
  ownerType: OwnerType,
  allowNegative: boolean,
  maxNegative: number
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  try {
    await ensureCreditSchema();
    await pool.query(
      `ALTER TABLE subsumio_credit_balance ADD COLUMN IF NOT EXISTS allow_negative_balance boolean DEFAULT false`
    );
    await pool.query(
      `ALTER TABLE subsumio_credit_balance ADD COLUMN IF NOT EXISTS max_negative_balance numeric(12,2) DEFAULT 0`
    );

    await pool.query(
      `UPDATE subsumio_credit_balance
       SET allow_negative_balance = $3, max_negative_balance = $4, updated_at = NOW()
       WHERE owner_id = $1 AND owner_type = $2`,
      [ownerId, ownerType, allowNegative, maxNegative]
    );
  } catch (err) {
    log.error("setNegativeBalanceConfig error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
