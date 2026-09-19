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
import { createHash } from "node:crypto";

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
    void recordCreditConsumption(ctx, "think", body.case_slug);

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
        createCitationGateStream(intercepted, {
          fallbackJurisdiction: userJurisdiction(jurisdiction),
        }),
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
