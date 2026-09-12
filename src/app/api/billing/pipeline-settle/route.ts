/**
 * Pipeline Settlement — Post-Pipeline Credit Reconciliation
 *
 * Wird nach Pipeline-Completion aufgerufen. Settlement:
 *   1. berechnet die tatsächlichen Kosten aus den Token-Usages
 *   2. verrechnet diese genau einmal gegen die bereits abgebuchte Reservation
 *
 * Ausschließlich die Engine darf diesen Endpunkt serverseitig aufrufen. Sie
 * authentifiziert sich über x-engine-webhook-key (ENGINE_WEBHOOK_API_KEY).
 * Browser-Settlement ist absichtlich nicht erlaubt: Nutzereingaben dürfen nie
 * Reservierungsbetrag oder Ist-Verbrauch bestimmen.
 *
 * Idempotency: pipeline_key (+ Layer-Index) verhindert Double-Settlement bei Retries.
 */

import { z } from "zod";
import { apiError, createWebhookHandler } from "@/lib/api-handler";
import type { NextRequest } from "next/server";
import {
  refundCredits,
  deductCredits,
  getBalance,
  getCreditReservation,
  checkAndSendBudgetAlert,
  type OwnerType,
} from "@/lib/billing/credits";
import {
  calculateTokenCredits,
  roundCredits,
  type TokenUsage,
} from "@/lib/billing/credit-rate-card";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { clientIp } from "@/lib/auth/rate-limit";

const tokenUsageSchema = z.object({
  modelId: z.string().min(1),
  inputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0).default(0),
  cacheCreateTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0),
});

const settleSchema = z.object({
  pipeline_key: z.string().min(1),
  case_slug: z.string().min(1),
  reserved_credits: z.number().min(0),
  token_usage: z.array(tokenUsageSchema).default([]),
  /** Optional: actual credits override (wenn schon berechnet) */
  actual_credits_override: z.number().min(0).optional(),
  /** Failed-Request Refund: Layer bei dem die Pipeline abgebrochen ist.
   * Wenn gesetzt, wird nur der anteilige Verbrauch (failed_at_layer / total_layers)
   * abgezogen — der Rest wird zurückerstattet. Wie OpenAI/Anthropic failed-request refunds. */
  failed_at_layer: z.number().int().min(1).optional(),
  /** Total Layer Count der Pipeline (für proportionale Berechnung bei failed_at_layer) */
  total_layers: z.number().int().min(1).optional(),
  owner_id: z.string().min(1),
  owner_type: z.enum(["user", "org"]),
});

type SettleBody = z.infer<typeof settleSchema>;

/** Settlement core for the authenticated engine webhook. */
async function runSettlement(
  ownerId: string,
  ownerType: OwnerType,
  body: SettleBody,
  userEmail?: string
): Promise<Response> {
  const reservation = await getCreditReservation(ownerId, ownerType, body.pipeline_key);
  if (!reservation) {
    return apiError(
      "reservation_not_found",
      "Keine passende Credit-Reservation für diese Pipeline gefunden",
      404
    );
  }
  if (roundCredits(body.reserved_credits) !== reservation.reservedCredits) {
    return apiError(
      "reservation_mismatch",
      "Der übermittelte Reservierungsbetrag stimmt nicht mit dem Ledger überein",
      409
    );
  }
  const reservedCredits = reservation.reservedCredits;

  // Die Reservation ist bereits beim Start vom Guthaben abgezogen. Deshalb
  // dürfen die einzelnen LLM-Calls hier nicht nochmals abgebucht werden.
  // Wir berechnen nur den Ist-Verbrauch und erstatten danach den Rest zurück.
  let actualCredits = 0;
  const usageResults: Array<{ modelId: string; credits: number }> = [];

  if (body.actual_credits_override !== undefined) {
    actualCredits = body.actual_credits_override;
  } else if (body.token_usage.length > 0) {
    // Token-genaue Verrechnung: nur für tatsächlich ausgeführte Layer.
    for (let i = 0; i < body.token_usage.length; i++) {
      const usage = body.token_usage[i]!;
      const credits = calculateTokenCredits(usage as TokenUsage);
      actualCredits += credits;
      usageResults.push({ modelId: usage.modelId, credits });
    }
  } else if (body.failed_at_layer !== undefined && body.total_layers !== undefined) {
    // Failed-Request Refund: proportionale Berechnung
    // Pipeline brach bei Layer N von M ab → nur N/M der Reservation wird abgezogen
    const proportion = body.failed_at_layer / body.total_layers;
    actualCredits = reservedCredits * proportion;
  } else {
    // Fallback: volle Reservation (sollte nicht vorkommen wenn Engine angeschlossen)
    actualCredits = reservedCredits;
  }

  actualCredits = roundCredits(actualCredits);

  // Eine Schätzung darf nicht dazu führen, dass Mehrverbrauch kostenlos
  // bleibt. Der Differenzbetrag wird genau einmal und retry-sicher belastet.
  const overage = roundCredits(Math.max(0, actualCredits - reservedCredits));
  if (overage > 0) {
    const overageResult = await deductCredits(ownerId, ownerType, overage, {
      operation: "agent",
      caseSlug: body.case_slug,
      idempotencyKey: `${body.pipeline_key}-overage`,
    });
    if (!overageResult.ok) {
      return Response.json(
        { error: "settlement_overage_unpaid", required: overage, balance: overageResult.balance },
        { status: 402 }
      );
    }
  }

  // 2. Refund unused reservation (überschüssige Credits zurück).
  const refund = await refundCredits(
    ownerId,
    ownerType,
    reservedCredits,
    actualCredits,
    body.pipeline_key
  );

  // 3. Settlement marker — always write a transaction row so the
  // billing-cleanup cron can distinguish settled pipelines from
  // stale/crashed ones. Without this, fully-consumed pipelines
  // (refund=0) would be falsely treated as stale after 7 days.
  // The marker has amount=0 so it doesn't affect the balance.
  try {
    const { getSharedPgPool } = await import("@/lib/auth/store");
    const pool = getSharedPgPool();
    if (pool) {
      await pool.query(
        `INSERT INTO subsumio_credit_transactions
           (owner_id, owner_type, type, amount, balance_after, operation, idempotency_key, description)
         VALUES ($1, $2, 'consumption', 0, $3, 'settlement', $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          ownerId,
          ownerType,
          refund.balanceAfter,
          `${body.pipeline_key}-settlement`,
          `Pipeline-Settlement: ${body.case_slug}`,
        ]
      );
    }
  } catch {
    // best-effort — don't fail the settlement over the marker
  }

  const { balance } = await getBalance(ownerId, ownerType);

  // Budget Alert prüfen (50%/75%/90% wie OpenAI) — non-blocking
  if (userEmail) {
    checkAndSendBudgetAlert(ownerId, ownerType, userEmail, balance).catch(() => {
      // best-effort, ignore errors
    });
  }

  return Response.json({
    ok: true,
    pipeline_key: body.pipeline_key,
    case_slug: body.case_slug,
    reserved_credits: reservedCredits,
    actual_credits: Math.round(actualCredits * 100) / 100,
    refunded_credits: refund.refunded,
    balance_after: balance,
    token_usage: usageResults,
    overage_credits: overage,
    failed_at_layer: body.failed_at_layer,
    total_layers: body.total_layers,
  });
}

export const POST = createWebhookHandler(
  {
    body: settleSchema,
    audit: (body) => ({
      action: "billing.credit_consumption" as const,
      entityType: "billing",
      entityId: body.pipeline_key,
      details: { caseSlug: body.case_slug, ownerType: body.owner_type },
    }),
    rateLimitKey: (req) => `engine:pipeline-settle:${clientIp(req.headers)}`,
    rateLimitMax: 1_000,
    rateLimitWindowMs: 60_000,
  },
  async (body, req: NextRequest): Promise<Response> => {
    const expectedKey = process.env.ENGINE_WEBHOOK_API_KEY;
    const providedKey = req.headers.get("x-engine-webhook-key") ?? "";

    if (!expectedKey || !providedKey || !timingSafeCompare(providedKey, expectedKey)) {
      return apiError("unauthorized", "Ungültige Engine-Authentifizierung", 401);
    }

    return runSettlement(body.owner_id, body.owner_type as OwnerType, body);
  }
);
