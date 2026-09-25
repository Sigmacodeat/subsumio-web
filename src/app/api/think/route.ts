import { z } from "zod";
import { ENGINE_URL, engineHeadersWithCaseJurisdiction } from "@/lib/engine";
import { recordQuery } from "@/lib/usage";
import {
  createHandler,
  apiStream,
  apiError,
  recordQuota,
  recordCreditConsumption,
} from "@/lib/api-handler";
import { createCitationGateStream } from "@/lib/citation-gate";
import { userJurisdiction } from "@/lib/citation-gate-client";
import { interceptGuardrailStream } from "@/lib/guardrail-stream-interceptor";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";
import { mapQueryModeToEngineMode } from "@/lib/matter-context";
import { resolveModelChoice } from "@/lib/model-choice";
import { euOnlyRefusalResponse, isEuOnlyRefusal, ModelPolicyError } from "@/lib/eu-policy-refusal";
import { createHash, randomUUID } from "node:crypto";
import {
  attachUsageToBooking,
  insufficientCreditsResponse,
  refundConsumptionBooking,
} from "@/lib/billing/credits";

import { logger } from "@/lib/logger";
const log = logger("api/think");

export const maxDuration = 300;

const thinkSchema = z.object({
  query: z.string().min(1, "query_required").max(10_000, "query_too_long"),
  // Persona / tool instructions for the system prompt (kept out of retrieval).
  instructions: z.string().max(40_000).optional(),
  mode: z.enum(["conservative", "balanced", "tokenmax"]).default("balanced"),
  query_mode: z.enum(["conservative", "balanced", "deep_matter"]).default("balanced"),
  case_slug: z.string().optional(),
  /** The user's model pick from the chat (catalogue id); clamped by the firm's chat floor. */
  model: z.string().max(100).optional(),
});

/**
 * Passes the stream through untouched and, when the engine's final `usage`
 * event goes by, completes the credit booking with model and tokens. An
 * engine `error` event before any usage means no answer was delivered: the
 * up-front booking is taken back (`onFailed`, called at most once).
 */
export function meterUsage(
  stream: ReadableStream<Uint8Array>,
  bookingKey: string,
  onFailed: () => void = () => {}
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let sawUsage = false;
  let failed = false;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          if (!sawUsage && !failed && line.includes('"error"')) {
            try {
              const event = JSON.parse(line.slice(6)) as { error?: unknown };
              if (event.error) {
                failed = true;
                onFailed();
              }
            } catch {
              // not a JSON event
            }
            continue;
          }
          if (!line.includes('"usage"')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              usage?: {
                model?: string;
                input_tokens?: number;
                output_tokens?: number;
                cost_usd?: number;
              };
            };
            if (!event.usage) continue;
            sawUsage = true;
            void attachUsageToBooking(bookingKey, {
              modelId: event.usage.model ?? null,
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
            }).catch((err) =>
              log.warn("[think] usage booking failed:", err instanceof Error ? err.message : err)
            );
          } catch {
            // not the event we are looking for
          }
        }
      },
    })
  );
}

export const POST = createHandler(
  {
    action: "query.submit",
    rateTier: "heavy",
    quota: "queries",
    credits: "think",
    body: thinkSchema,
    audit: (_ctx, body) => ({
      action: "query.submit" as const,
      entityType: "query",
      details: { mode: body.mode, query_mode: body.query_mode, case_slug: body.case_slug },
    }),
  },
  async (ctx, body, _query, req) => {
    // Booked up front — and awaited, so parallel requests cannot all pass the
    // balance check and run unpaid — so an abandoned answer is still paid
    // for; the engine reports what it actually consumed at the end of the
    // stream, and the booking is completed with it (measured cost per credit,
    // not estimated). When the engine delivers no answer, it is taken back.
    const bookingKey = `think-${randomUUID()}`;
    const booking = await recordCreditConsumption(
      ctx,
      "think",
      body.case_slug,
      undefined,
      bookingKey
    );
    if (!booking.ok) {
      return insufficientCreditsResponse(booking.balance ?? 0, booking.required ?? 0);
    }
    void recordQuery(ctx.brainId);
    void recordQuota(ctx, "queries");
    let refunded = false;
    const refundBooking = () => {
      if (refunded || ctx.demo) return;
      refunded = true;
      void refundConsumptionBooking(ctx.billing.ownerId, ctx.billing.ownerType, bookingKey).catch(
        (err) => log.warn("[think] refund failed:", err instanceof Error ? err.message : err)
      );
    };

    try {
      const safeBody = sanitizeObjectStrings(body);

      const engineMode = mapQueryModeToEngineMode(body.query_mode);
      const model = await resolveModelChoice(ctx.user.id, body.model);
      const payload = {
        query: safeBody.query,
        ...(safeBody.instructions ? { instructions: safeBody.instructions } : {}),
        mode: engineMode,
        case_slug: safeBody.case_slug,
        query_mode: body.query_mode,
        ...(model ? { model } : {}),
      };

      const caseScopedHeaders = await engineHeadersWithCaseJurisdiction(
        ctx.headers,
        safeBody.case_slug
      );

      const upstream = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...caseScopedHeaders },
        body: JSON.stringify(payload),
        // The user's "Stopp" (client disconnect) ends the engine request too,
        // so the model stops generating instead of running on unseen.
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(300_000)]),
      });

      if (!upstream.ok) {
        refundBooking();
        const errBody = await upstream.json().catch(() => null);
        // "Nur EU": the engine refused a non-EU model — say so, no fallback.
        if (isEuOnlyRefusal(errBody)) return euOnlyRefusalResponse();
        return apiError("engine_error", `Engine returned ${upstream.status}`, upstream.status);
      }

      if (!upstream.body) {
        refundBooking();
        return apiError("engine_error", "Engine returned empty body", 502);
      }

      // Wrap with guardrail interceptor to capture Tier-0/Tier-1 warnings
      const jurisdiction = (ctx.user as { jurisdiction?: string } | undefined)?.jurisdiction;
      const queryHash = createHash("sha256").update(safeBody.query).digest("hex").slice(0, 16);
      const intercepted = interceptGuardrailStream(upstream.body, {
        brainId: ctx.brainId,
        userId: ctx.user.id,
        jurisdiction,
        queryHash,
        query: safeBody.query,
      });

      return apiStream(
        meterUsage(
          createCitationGateStream(intercepted, {
            fallbackJurisdiction: userJurisdiction(jurisdiction),
          }),
          bookingKey,
          refundBooking
        ),
        {
          contentType: upstream.headers.get("Content-Type") || "text/event-stream",
          aiGenerated: true,
        }
      );
    } catch (err) {
      if (err instanceof ModelPolicyError) {
        refundBooking();
        return euOnlyRefusalResponse(err.message);
      }
      log.error("[think] engine unreachable:", err instanceof Error ? err.message : String(err));
      // Aborted by the user ("Stopp"): the answer was abandoned, it stays paid.
      if (!req.signal.aborted) refundBooking();
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
