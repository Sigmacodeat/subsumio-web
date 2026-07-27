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

const log = logger("credits");

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const CREDITS_FILE = path.join(DATA_DIR, "credits.json");

// ── Credit Costs per Operation ──────────────────────────────────────────

export type CreditOperation =
  | "think"
  | "document_analysis"
  | "subsumption"
  | "agent"
  | "deadline_detect"
  | "frist_engine";

export const CREDIT_COSTS: Record<CreditOperation, number> = {
  think: 1,
  document_analysis: 2,
  subsumption: 3,
  agent: 5,
  deadline_detect: 1,
  frist_engine: 0,
};

// ── Credit Packs ────────────────────────────────────────────────────────

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceEur: number;
  /** Env var holding the Stripe price ID for this pack. */
  stripePriceEnv: string;
  savingsPct: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    priceEur: 49,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_50",
    savingsPct: 2,
  },
  {
    id: "standard",
    name: "Standard",
    credits: 100,
    priceEur: 89,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_100",
    savingsPct: 11,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 500,
    priceEur: 399,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_500",
    savingsPct: 20,
  },
  {
    id: "firm",
    name: "Firm",
    credits: 2000,
    priceEur: 1499,
    stripePriceEnv: "STRIPE_PRICE_CREDITS_2000",
    savingsPct: 25,
  },
];

export function getCreditPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === packId);
}

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
    balance    integer NOT NULL DEFAULT 0,
    auto_reload_enabled boolean NOT NULL DEFAULT false,
    auto_reload_threshold integer NOT NULL DEFAULT 10,
    auto_reload_pack_id text,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS subsumio_credit_transactions (
    id          bigserial PRIMARY KEY,
    owner_id    text NOT NULL,
    owner_type  text NOT NULL,
    type        text NOT NULL,
    amount      integer NOT NULL,
    balance_after integer NOT NULL,
    operation   text,
    case_slug   text,
    stripe_session_id text,
    stripe_payment_intent text,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_owner_idx ON subsumio_credit_transactions (owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_case_idx ON subsumio_credit_transactions (case_slug);
  CREATE INDEX IF NOT EXISTS subsumio_credit_tx_stripe_session_idx ON subsumio_credit_transactions (stripe_session_id);
`);

// ── In-Memory Fallback (dev only) ───────────────────────────────────────

type MemoryBalance = CreditBalance;
interface MemoryTx extends CreditTransaction {
  seq: number;
}

const memBalances = new Map<string, MemoryBalance>();
const memTransactions: MemoryTx[] = [];
let memTxSeq = 0;

function memKey(ownerId: string, ownerType: OwnerType): string {
  return `${ownerType}:${ownerId}`;
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
  }
): Promise<DeductResult> {
  if (amount <= 0) return { ok: true, balance: 0, required: 0 };

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureCreditSchema();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Atomic deduction — only succeeds if balance >= amount
        const { rows } = await client.query<{ balance: number }>(
          `UPDATE subsumio_credit_balance
           SET balance = balance - $2, updated_at = now()
           WHERE owner_id = $1 AND balance >= $2
           RETURNING balance`,
          [ownerId, amount]
        );
        if (rows.length === 0) {
          await client.query("ROLLBACK");
          const current = await getBalance(ownerId, ownerType);
          return { ok: false, balance: current.balance, required: amount };
        }
        const newBalance = rows[0].balance;
        await client.query(
          `INSERT INTO subsumio_credit_transactions (owner_id, owner_type, type, amount, balance_after, operation, case_slug)
           VALUES ($1, $2, 'consumption', $3, $4, $5, $6)`,
          [ownerId, ownerType, -amount, newBalance, opts?.operation ?? null, opts?.caseSlug ?? null]
        );
        await client.query("COMMIT");
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
