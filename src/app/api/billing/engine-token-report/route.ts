/**
 * Engine Token Webhook — server-side Token-Logging vom Engine.
 *
 * POST /api/billing/engine-token-report
 *
 * Wird vom Subsumio Engine nach jedem LLM-Call aufgerufen.
 * Liefert token-genaue Live-Telemetrie. Die finanzielle Verrechnung erfolgt
 * ausschließlich beim serverseitigen Pipeline-Settlement gegen die Reserve.
 *
 * Auth: Engine API Key (ENGINE_WEBHOOK_API_KEY env var).
 * NICHT via createHandler — das ist ein Machine-to-Machine Webhook
 * mit eigener Auth, nicht User-Session-basiert.
 *
 * Body:
 *   {
 *     pipeline_key: string,      // Idempotency key für Pipeline
 *     case_slug: string,
 *     owner_id: string,
 *     owner_type: "user" | "org",
 *     layer: number,             // Layer-Nummer
 *     model_id: string,          // z.B. "claude-haiku-4-5"
 *     input_tokens: number,
 *     cached_input_tokens: number,
 *     cache_create_tokens: number,
 *     output_tokens: number
 *   }
 */

import { z } from "zod";
import { calculateTokenCredits, type TokenUsage } from "@/lib/billing/credit-rate-card";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { timingSafeCompare } from "@/lib/crypto-utils";

const engineReportSchema = z.object({
  pipeline_key: z.string().min(1),
  case_slug: z.string().optional().default(""),
  owner_id: z.string().min(1),
  owner_type: z.enum(["user", "org"]),
  layer: z.number().int().min(1),
  model_id: z.string().min(1),
  input_tokens: z.number().int().min(0),
  cached_input_tokens: z.number().int().min(0).default(0),
  cache_create_tokens: z.number().int().min(0).default(0),
  output_tokens: z.number().int().min(0),
});

export async function POST(req: Request) {
  // Auth: Engine Webhook API Key
  const expectedKey = process.env.ENGINE_WEBHOOK_API_KEY;
  if (!expectedKey) {
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearerKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  const webhookKey = req.headers.get("x-engine-webhook-key") ?? "";
  const providedKey = bearerKey || webhookKey;
  if (!providedKey || !timingSafeCompare(providedKey, expectedKey)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof engineReportSchema>;
  try {
    const raw = await req.json();
    body = engineReportSchema.parse(raw);
  } catch (err) {
    return Response.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : "parse error" },
      { status: 400 }
    );
  }

  const usage: TokenUsage = {
    modelId: body.model_id,
    inputTokens: body.input_tokens,
    cachedInputTokens: body.cached_input_tokens,
    cacheCreateTokens: body.cache_create_tokens,
    outputTokens: body.output_tokens,
  };

  const credits = calculateTokenCredits(usage);

  // Real-time SSE Broadcast für Live-Usage (wie OpenAI streaming usage)
  // Frontend-PipelineProgressCard hört auf "pipeline.token_usage" Event
  broadcastSseEvent(body.owner_id, "pipeline.token_usage", {
    pipeline_key: body.pipeline_key,
    case_slug: body.case_slug,
    layer: body.layer,
    model_id: body.model_id,
    input_tokens: body.input_tokens,
    cached_input_tokens: body.cached_input_tokens,
    cache_create_tokens: body.cache_create_tokens,
    output_tokens: body.output_tokens,
    credits,
    cumulative: true,
  });

  return Response.json({
    ok: true,
    credits,
    layer: body.layer,
    model_id: body.model_id,
  });
}
