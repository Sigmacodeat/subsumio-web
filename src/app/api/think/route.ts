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
import { createHash, randomUUID } from "node:crypto";
import { attachUsageToBooking } from "@/lib/billing/credits";

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
  model: z.string().optional(),
});

/**
 * Passes the stream through untouched and, when the engine's final `usage`
 * event goes by, completes the credit booking with model and tokens.
 */
function meterUsage(
  stream: ReadableStream<Uint8Array>,
  bookingKey: string
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || !line.includes('"usage"')) continue;
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
  async (ctx, body, _query, _req) => {
    void recordQuery(ctx.brainId);
    void recordQuota(ctx, "queries");
    // Booked up front so an abandoned answer is still paid for; the engine
    // reports what it actually consumed at the end of the stream, and the
    // booking is completed with it (measured cost per credit, not estimated).
    const bookingKey = `think-${randomUUID()}`;
    void recordCreditConsumption(ctx, "think", body.case_slug, undefined, bookingKey);

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
        signal: AbortSignal.timeout(300_000),
      });

      if (!upstream.ok) {
        return apiError("engine_error", `Engine returned ${upstream.status}`, upstream.status);
      }

      if (!upstream.body) {
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
          bookingKey
        ),
        {
          contentType: upstream.headers.get("Content-Type") || "text/event-stream",
          aiGenerated: true,
        }
      );
    } catch (err) {
      log.error("[think] engine unreachable:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
