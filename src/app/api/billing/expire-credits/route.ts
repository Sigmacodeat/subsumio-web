/**
 * Credit Expiry Cron API — lässt abgelaufene Credits verfallen.
 *
 * POST /api/billing/expire-credits   — admin-only (manuell via Dashboard)
 * GET  /api/billing/expire-credits   — cron-only (via CRON_SECRET)
 *
 * Wird täglich via Vercel Cron aufgerufen (GET + Authorization: Bearer CRON_SECRET).
 * Wie OpenAI: gekaufte Credits verfallen nach 1 Jahr.
 */

import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { expireCredits } from "@/lib/billing/credits";
import { validateCronAuth } from "@/lib/cron-auth";
import type { NextRequest } from "next/server";

// ── GET: Vercel Cron (Authorization: Bearer CRON_SECRET) ────────────────

export async function GET(req: NextRequest) {
  // Cron auth: timing-safe Bearer check + rate limiting (shared with /api/cron/*)
  const authError = await validateCronAuth(req);
  if (authError) return authError;

  const result = await expireCredits();

  return NextResponse.json({
    ok: true,
    ...result,
    message:
      result.expiredGrants > 0
        ? `${result.expiredCredits.toFixed(2)} € aus ${result.expiredGrants} Grants verfallen`
        : "Keine abgelaufenen Credits",
  });
}

// ── POST: Admin-only (manuell via Dashboard) ────────────────────────────

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    audit: (ctx, _body, _query, _req) => ({
      action: "billing.credit_refund" as const,
      entityType: "billing",
      details: { cron: "expire-credits", triggeredBy: ctx.user.email },
    }),
  },
  async (_ctx, _body, _query, _req) => {
    const result = await expireCredits();

    return Response.json({
      ok: true,
      ...result,
      message:
        result.expiredGrants > 0
          ? `${result.expiredCredits.toFixed(2)} € aus ${result.expiredGrants} Grants verfallen`
          : "Keine abgelaufenen Credits",
    });
  }
);
