import { NextRequest } from "next/server";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { handleCtiWebhook } from "@/lib/cti-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/cti/webhook — Telefonie-Webhook (Placetel, sipgate, 3CX).
 *
 * Auth: nur `Authorization: Bearer ${CTI_WEBHOOK_SECRET}`, zeitkonstant
 * verglichen. Ein `?secret=` in der URL wird NICHT angenommen — URLs landen in
 * Proxy-/Access-Logs und Browser-Verläufen. Ohne konfiguriertes Secret
 * antwortet die Route 503 — sie ist dann schlicht nicht aktiv statt
 * ungeschützt offen. Anbieter ohne frei setzbaren Header nutzen
 * `/api/cti/webhook/<token>` (CTI_WEBHOOK_PATH_TOKENS). JSON und
 * form-kodierte Bodies werden angenommen (src/lib/cti-webhook.ts).
 */
export const POST = createPublicHandler(
  {
    // Per sender IP: unauthenticated requests cannot use up the budget of
    // the telephony provider. The shared budget is counted only after the
    // token check.
    rateLimitKey: (req) => `cti-webhook:ip:${clientIp(req.headers)}`,
    rateLimitMax: 240,
    rateLimitWindowMs: 60_000,
  },
  async (req: NextRequest) => handleCtiWebhook(req, { kind: "bearer" })
);
