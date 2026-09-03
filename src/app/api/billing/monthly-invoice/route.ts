/**
 * Monthly Invoice Cron — erstellt saas_invoices für den vergangenen Monat.
 *
 * GET /api/billing/monthly-invoice  (Cron-only, via CRON_SECRET)
 *
 * Wird am 1. jedes Monats aufgerufen (Vercel Cron / Supabase pg_cron / extern).
 * Für jede aktive Org:
 *   1. Aggregiert usage aus saas_usage_ledger
 *   2. Berechnet overage = max(0, usageSell - includedCredit)
 *   3. Erstellt saas_invoices Row (interne Aufzeichnung)
 *
 * Auth: Vercel Cron sendet Authorization: Bearer <CRON_SECRET>.
 * Keine Session-Auth (Cron-Job hat keine Browser-Session).
 */

import { NextResponse } from "next/server";
import { billMonthlyOverage, resetMonthlyPeriod } from "@/lib/billing/saas-billing-sync";
import { validateCronAuth } from "@/lib/cron-auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Overlap protection: timestamp of the last cron run start.
// Prevents double-execution when Vercel reuses warm instances.
let lastRunAt: number | null = null;

export async function GET(req: NextRequest) {
  // Cron auth: timing-safe Bearer check + rate limiting (shared with /api/cron/*)
  const authError = await validateCronAuth(req);
  if (authError) return authError;

  // Overlap protection: if the previous run is still in progress,
  // skip this run. Monthly invoice runs on the 1st of each month —
  // if it takes longer than the cron interval, a second run would
  // double-process (resetMonthlyPeriod is idempotent, but wasteful).
  if (lastRunAt && Date.now() - lastRunAt < 10 * 60 * 1000) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "previous run still in progress",
      lockAge: `${Math.round((Date.now() - lastRunAt) / 1000)}s`,
    });
  }
  lastRunAt = Date.now();

  // 1. Reset monthly period: create new saas_credit_balance rows for the
  //    new month with included credits + carry over purchased_credit.
  const reset = await resetMonthlyPeriod();

  // 2. Bill overage for the PREVIOUS month (now that new period is set up).
  const billing = await billMonthlyOverage();

  // Release the overlap lock
  lastRunAt = null;

  return NextResponse.json({
    success: true,
    period: new Date().toISOString().slice(0, 7),
    reset: { orgs: reset.orgs, rows: reset.rows },
    billing: { orgs: billing.orgs, invoices: billing.invoices },
  });
}
