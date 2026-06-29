/**
 * Dunning — Zahlungsausfall-Management
 *
 * Verwaltet den Eskalationsprozess bei fehlgeschlagenen Stripe-Zahlungen:
 * Failure 1 → Warning-Email
 * Failure 2 → Grace-Period, Plan → past_due
 * Failure 3 → Suspension, Plan → suspended
 * Success  → Reset, Plan → active
 */

import { getStore, getSharedPgPool, type Plan } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";

const log = logger("dunning");

export interface DunningState {
  orgId: string;
  failureCount: number;
  firstFailedAt: string | null;
  lastFailedAt: string | null;
  nextRetryAt: string | null;
  status: "ok" | "past_due" | "suspended";
  preDunningPlan?: string | null;
}

// ── Schema ────────────────────────────────────────────────────────────

const ensureDunningSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_dunning_state (
    org_id       text PRIMARY KEY,
    failure_count int NOT NULL DEFAULT 0,
    first_failed_at timestamptz,
    last_failed_at  timestamptz,
    next_retry_at   timestamptz,
    status       text NOT NULL DEFAULT 'ok',
    pre_dunning_plan text,
    updated_at   timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE subsumio_dunning_state ADD COLUMN IF NOT EXISTS pre_dunning_plan text;
`);

// ── In-Memory Fallback ────────────────────────────────────────────────

const inMemoryDunning = new Map<string, DunningState>();

// ── Core Functions ────────────────────────────────────────────────────

export async function getDunningState(orgId: string): Promise<DunningState> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureDunningSchema();
      const result = await pool.query<DunningState>(
        `SELECT org_id as "orgId", failure_count as "failureCount",
                first_failed_at as "firstFailedAt", last_failed_at as "lastFailedAt",
                next_retry_at as "nextRetryAt", status,
                pre_dunning_plan as "preDunningPlan"
         FROM subsumio_dunning_state WHERE org_id = $1`,
        [orgId]
      );
      if (result.rows[0]) return result.rows[0];
    } catch (err) {
      log.error("getDunningState error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return (
    inMemoryDunning.get(orgId) ?? {
      orgId,
      failureCount: 0,
      firstFailedAt: null,
      lastFailedAt: null,
      nextRetryAt: null,
      status: "ok",
    }
  );
}

export async function incrementFailure(
  orgId: string,
  nextRetryAt: Date | null
): Promise<DunningState> {
  const now = new Date().toISOString();
  const nextRetryIso = nextRetryAt?.toISOString() ?? null;
  const current = await getDunningState(orgId);
  const newCount = current.failureCount + 1;
  const newStatus: DunningState["status"] =
    newCount >= 3 ? "suspended" : newCount >= 2 ? "past_due" : "ok";

  const updated: DunningState = {
    orgId,
    failureCount: newCount,
    firstFailedAt: current.firstFailedAt ?? now,
    lastFailedAt: now,
    nextRetryAt: nextRetryIso,
    status: newStatus,
  };

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureDunningSchema();
      await pool.query(
        `INSERT INTO subsumio_dunning_state (org_id, failure_count, first_failed_at, last_failed_at, next_retry_at, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (org_id) DO UPDATE SET
           failure_count = $2, last_failed_at = $4,
           next_retry_at = $5, status = $6, updated_at = now()`,
        [orgId, newCount, updated.firstFailedAt, now, nextRetryIso, newStatus]
      );
    } catch (err) {
      log.error("incrementFailure DB error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  inMemoryDunning.set(orgId, updated);
  return updated;
}

export async function resetFailure(orgId: string): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureDunningSchema();
      await pool.query(
        `INSERT INTO subsumio_dunning_state (org_id, failure_count, status, updated_at)
         VALUES ($1, 0, 'ok', now())
         ON CONFLICT (org_id) DO UPDATE SET
           failure_count = 0, status = 'ok',
           first_failed_at = NULL, last_failed_at = NULL,
           next_retry_at = NULL, updated_at = now()`,
        [orgId]
      );
    } catch (err) {
      log.error("resetFailure DB error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  inMemoryDunning.delete(orgId);
}

export async function applyDunningToPlan(orgId: string, dunningState: DunningState): Promise<void> {
  if (dunningState.status === "ok") return;
  const store = getStore();
  const user = await store.getById(orgId);
  if (!user) return;

  const planMap: Record<DunningState["status"], Plan> = {
    ok: user.plan, // no change
    past_due: "past_due" as Plan,
    suspended: "suspended" as Plan,
  };
  const newPlan = planMap[dunningState.status];
  if (newPlan && newPlan !== user.plan) {
    // Save the original plan before overwriting, so reactivation can restore it
    const originalPlan = user.plan;
    await store.update(orgId, { plan: newPlan });

    const pool = getSharedPgPool();
    if (pool) {
      try {
        await ensureDunningSchema();
        await pool.query(
          `UPDATE subsumio_dunning_state SET pre_dunning_plan = $2 WHERE org_id = $1`,
          [orgId, originalPlan]
        );
      } catch (err) {
        log.error("applyDunningToPlan: failed to save preDunningPlan", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // Also update in-memory store
    const memState = inMemoryDunning.get(orgId);
    if (memState) {
      inMemoryDunning.set(orgId, { ...memState, preDunningPlan: originalPlan });
    }
  }
}

/** Format a dunning notification email body */
export function buildDunningEmailBody(
  orgName: string,
  failureCount: number,
  nextRetryDate: Date | null,
  billingPortalUrl?: string
): { subject: string; body: string } {
  const retryStr = nextRetryDate
    ? `am ${nextRetryDate.toLocaleDateString("de-AT", { day: "2-digit", month: "long", year: "numeric" })}`
    : "demnächst";

  if (failureCount === 1) {
    return {
      subject: "Subsumio: Zahlungsproblem — bitte Zahlungsmittel prüfen",
      body: `Sehr geehrte Damen und Herren,\n\ndie Zahlung für Ihr Subsumio-Abonnement (${orgName}) war leider nicht erfolgreich.\n\nWir versuchen die Zahlung ${retryStr} erneut. Bitte stellen Sie sicher, dass Ihr Zahlungsmittel gültig ist.\n\n${billingPortalUrl ? `Zahlungsmittel aktualisieren: ${billingPortalUrl}\n\n` : ""}Mit freundlichen Grüßen,\nIhr Subsumio-Team`,
    };
  }
  if (failureCount === 2) {
    return {
      subject: "Subsumio: Zweiter Zahlungsversuch fehlgeschlagen — Account im Grace-Period",
      body: `Sehr geehrte Damen und Herren,\n\ndie Zahlung für Ihr Subsumio-Abonnement (${orgName}) ist nun zweimal fehlgeschlagen. Ihr Account befindet sich im Grace-Period.\n\nBitte aktualisieren Sie Ihr Zahlungsmittel bis zum ${retryStr}, um eine Unterbrechung des Service zu vermeiden.\n\n${billingPortalUrl ? `Zahlungsmittel aktualisieren: ${billingPortalUrl}\n\n` : ""}Mit freundlichen Grüßen,\nIhr Subsumio-Team`,
    };
  }
  return {
    subject: "Subsumio: Account gesperrt — Zahlung nicht erfolgreich",
    body: `Sehr geehrte Damen und Herren,\n\nIhr Subsumio-Account (${orgName}) wurde aufgrund mehrerer fehlgeschlagener Zahlungsversuche gesperrt.\n\nBitte kontaktieren Sie uns unter billing@subsum.io oder aktualisieren Sie Ihr Zahlungsmittel, um den Account zu reaktivieren.\n\n${billingPortalUrl ? `Account reaktivieren: ${billingPortalUrl}\n\n` : ""}Mit freundlichen Grüßen,\nIhr Subsumio-Team`,
  };
}

export function buildReactivationEmailBody(orgName: string): { subject: string; body: string } {
  return {
    subject: "Subsumio: Zahlung erfolgreich — Account reaktiviert",
    body: `Sehr geehrte Damen und Herren,\n\nIhre Zahlung für Subsumio (${orgName}) war erfolgreich. Ihr Account ist wieder vollständig aktiv.\n\nVielen Dank für Ihr Vertrauen.\n\nMit freundlichen Grüßen,\nIhr Subsumio-Team`,
  };
}
