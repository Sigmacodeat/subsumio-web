/**
 * Pipeline Settlement — Post-Pipeline Credit Reconciliation
 *
 * Wird nach Pipeline-Completion aufgerufen. Settlement:
 *   1. berechnet die tatsächlichen Kosten aus den Token-Usages
 *   2. verrechnet diese genau einmal gegen die bereits abgebuchte Reservation
 *
 * Zwei Aufrufer, zwei Auth-Wege:
 *   - Die Engine ruft server-seitig auf (kein Browser-Tab, keine Session) —
 *     authentifiziert über den x-engine-webhook-key Header (ENGINE_WEBHOOK_API_KEY),
 *     denselben Mechanismus wie /api/billing/engine-token-report. owner_id/
 *     owner_type kommen dann aus dem Body, weil es keine ctx.user gibt.
 *   - Ein Browser-Client (Legacy-Fallback) ruft mit Session-Auth auf; ownerId
 *     kommt dann aus ctx.user, nicht aus dem Body (ein Client darf sich nicht
 *     selbst als beliebigen owner_id ausgeben).
 *
 * Idempotency: pipeline_key (+ Layer-Index) verhindert Double-Settlement bei Retries.
 */

import { z } from "zod";
import { createHandler, apiError, type RouteContext } from "@/lib/api-handler";
import type { NextRequest } from "next/server";
import {
  refundCredits,
  deductCredits,
  getBalance,
  checkAndSendBudgetAlert,
  type OwnerType,
} from "@/lib/billing/credits";
import {
  calculateTokenCredits,
  roundCredits,
  type TokenUsage,
} from "@/lib/billing/credit-rate-card";
import { timingSafeCompare } from "@/lib/crypto-utils";

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
  /** Nur für den Engine-Webhook-Pfad: es gibt keine ctx.user, also muss der
   *  Owner explizit mitgeschickt werden. Vom Session-Pfad ignoriert. */
  owner_id: z.string().min(1).optional(),
  owner_type: z.enum(["user", "org"]).optional(),
});

type SettleBody = z.infer<typeof settleSchema>;

/** Shared settlement core — used by both the webhook path and the session path. */
async function runSettlement(
  ownerId: string,
  ownerType: OwnerType,
  body: SettleBody,
  userEmail?: string
): Promise<Response> {
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
    actualCredits = body.reserved_credits * proportion;
  } else {
    // Fallback: volle Reservation (sollte nicht vorkommen wenn Engine angeschlossen)
    actualCredits = body.reserved_credits;
  }

  actualCredits = roundCredits(actualCredits);

  // Eine Schätzung darf nicht dazu führen, dass Mehrverbrauch kostenlos
  // bleibt. Der Differenzbetrag wird genau einmal und retry-sicher belastet.
  const overage = roundCredits(Math.max(0, actualCredits - body.reserved_credits));
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
    body.reserved_credits,
    actualCredits,
    body.pipeline_key
  );

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
    reserved_credits: body.reserved_credits,
    actual_credits: Math.round(actualCredits * 100) / 100,
    refunded_credits: refund.refunded,
    balance_after: balance,
    token_usage: usageResults,
    overage_credits: overage,
    failed_at_layer: body.failed_at_layer,
    total_layers: body.total_layers,
  });
}

/** Session-authenticated fallback path (legacy browser caller). */
const sessionSettle = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    body: settleSchema,
    audit: (ctx, body, _query, _req) => ({
      action: "billing.credit_consumption" as const,
      entityType: "billing",
      details: { pipelineKey: body.pipeline_key, caseSlug: body.case_slug, user: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;
    return runSettlement(ownerId, ownerType, body, ctx.user.email);
  }
);

export async function POST(req: NextRequest, routeContext: RouteContext): Promise<Response> {
  const expectedKey = process.env.ENGINE_WEBHOOK_API_KEY;
  const providedKey = req.headers.get("x-engine-webhook-key") ?? "";

  if (expectedKey && providedKey && timingSafeCompare(providedKey, expectedKey)) {
    // Engine webhook path — no user session, owner comes from the body.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError("invalid_body", "Ungültiger JSON-Body", 400);
    }
    const parsed = settleSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("invalid_body", parsed.error.message, 400);
    }
    const body = parsed.data;
    if (!body.owner_id || !body.owner_type) {
      return apiError(
        "missing_owner",
        "owner_id und owner_type sind für den Engine-Webhook-Pfad erforderlich",
        400
      );
    }
    return runSettlement(body.owner_id, body.owner_type as OwnerType, body);
  }

  // No (or wrong) webhook key — fall back to session auth.
  return sessionSettle(req, routeContext);
}
