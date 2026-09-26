/**
 * Webhook retry — delivers queued outgoing webhook events again.
 *
 * GET /api/cron/webhook-retry  (cron-only, CRON_SECRET)
 *
 * A delivery that failed transiently is queued by dispatchWebhookEvent and
 * retried here with exponential backoff (1 min, 5 min, 30 min, 2 h; five
 * attempts in total). Claimed rows are leased, so overlapping runs do not
 * deliver an event twice.
 */
import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { retryDueWebhookDeliveries } from "@/lib/webhook-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function webhookRetryHandler(_req: NextRequest): Promise<Response> {
  const stats = await retryDueWebhookDeliveries(50);
  return NextResponse.json({ ok: true, ...stats });
}

export const GET = createCronHandler(webhookRetryHandler);
