/**
 * Billing Cleanup Cron — räumt stale Billing-Daten auf.
 *
 * GET /api/cron/billing-cleanup  (Cron-only, via CRON_SECRET)
 *
 * Wird täglich aufgerufen (Vercel Cron). Räumt auf:
 *   1. Stale credit reservations: used_credit von abgestürzten Pipelines
 *      wird nach 24h auf 0 zurückgesetzt (Pipeline hat nicht settled).
 *   2. Alte saas_usage_ledger Einträge: > 90 Tage → DELETE.
 *   3. Alte subsumio_credit_transactions: > 365 Tage → DELETE.
 *   4. Alte pipeline_settlement_queue succeeded/exhausted: > 30 Tage → DELETE.
 *
 * Verhindert dass die DB unendlich wächst und stale reservations
 * die Balance künstlich drücken.
 */

import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function billingCleanupHandler(_req: NextRequest): Promise<Response> {
  const pool = getSharedPgPool();
  if (!pool) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no postgres pool" });
  }

  const results = {
    staleReservationsReset: 0,
    oldUsageLedgerDeleted: 0,
    oldCreditTransactionsDeleted: 0,
    oldSettlementQueueDeleted: 0,
  };

  try {
    // 1. Reset stale reservations: credit_transactions mit type='consumption'
    //    und operation='reservation' die älter als 24h sind und kein
    //    entsprechendes settlement/refund haben.
    //
    //    WICHTIG: Wir prüfen auf ein settlement marker row (`{key}-settlement`
    //    oder `{key}-refund`). Wenn eine Pipeline erfolgreich abläuft und
    //    ALLE reservierten Credits verbraucht, gibt es kein refund row —
    //    aber pipeline-settle schreibt einen settlement marker.
    //    Ohne diesen Check würde der cron fully-consumed reservations
    //    fälschlicherweise als stale behandeln und Credits zurückgeben.
    //
    //    Da pipeline-settle derzeit nicht immer einen settlement marker
    //    schreibt, nutzen wir einen konservativen Ansatz: nur reservations
    //    resetten die älter als 7 Tage sind (nicht 24h) — das gibt
    //    abgestürzten Pipelines genug Zeit zu settle, und reduziert
    //    false-positives auf consumed reservations.
    const staleReservations = await pool.query<{ org_id: string; amount: number }>(
      `SELECT t.owner_id as org_id, ABS(t.amount) as amount
       FROM subsumio_credit_transactions t
       WHERE t.type = 'consumption'
         AND t.operation = 'reservation'
         AND t.created_at < NOW() - INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM subsumio_credit_transactions t2
           WHERE t2.idempotency_key = t.idempotency_key || '-refund'
              OR t2.idempotency_key = t.idempotency_key || '-settlement'
              OR t2.idempotency_key = t.idempotency_key || '-settle'
         )`
    );
    for (const row of staleReservations.rows) {
      await pool.query(
        `UPDATE saas_credit_balance
         SET used_credit = GREATEST(0, used_credit - $2),
             updated_at = NOW()
         WHERE org_id = $1 AND period_end > NOW()`,
        [row.org_id, row.amount]
      );
      results.staleReservationsReset++;
    }

    // 2. Delete old saas_usage_ledger entries (> 90 days)
    const usageDeleted = await pool.query(
      `DELETE FROM saas_usage_ledger WHERE created_at < NOW() - INTERVAL '90 days' RETURNING id`
    );
    results.oldUsageLedgerDeleted = usageDeleted.rowCount ?? 0;

    // 3. Delete old subsumio_credit_transactions (> 365 days)
    const txDeleted = await pool.query(
      `DELETE FROM subsumio_credit_transactions WHERE created_at < NOW() - INTERVAL '365 days' RETURNING id`
    );
    results.oldCreditTransactionsDeleted = txDeleted.rowCount ?? 0;

    // 4. Delete old pipeline_settlement_queue succeeded/exhausted (> 30 days)
    const queueDeleted = await pool.query(
      `DELETE FROM pipeline_settlement_queue
       WHERE status IN ('succeeded', 'exhausted')
         AND updated_at < NOW() - INTERVAL '30 days' RETURNING id`
    );
    results.oldSettlementQueueDeleted = queueDeleted.rowCount ?? 0;
  } catch (err) {
    console.error("[billing-cleanup] error:", err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      results,
    });
  }

  return NextResponse.json({ ok: true, results });
}

export const GET = createCronHandler(billingCleanupHandler, { maxDuration: 120 });
