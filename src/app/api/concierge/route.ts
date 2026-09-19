// Website concierge — one chat turn (docs/blueprints/VERTRIEBS-AGENT.md).
//
// Public, no session. Rate-limited per IP. The model is reached only through
// the engine's LLM gateway (model tiers, budget, provider policy), billed to a
// dedicated brain that holds no firm data. Every answer goes through the claim
// check (src/lib/concierge/claim-check.ts) before it is returned. The turn is
// logged without IP, with personal data redacted.

import { NextRequest } from "next/server";
import { z } from "zod";
import { createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { engineHeadersForBrain } from "@/lib/engine";
import { engineComplete, isEngineLLMAvailable } from "@/lib/engine-llm";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runConciergeTurn, type CompleteFn } from "@/lib/concierge/agent";
import { redact } from "@/lib/concierge/redact";
import { saveTurn } from "@/lib/concierge/store";

const log = logger("api/concierge");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  page: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(16)
    .refine((m) => m[m.length - 1]?.role === "user", "last_message_must_be_user"),
});

function conciergeBrain(): string {
  return env("SUBSUMIO_CONCIERGE_BRAIN") || env("SUBSUMIO_DEMO_BRAIN") || "demo";
}

const complete: CompleteFn = async ({ system, messages }) => {
  const result = await engineComplete(engineHeadersForBrain(conciergeBrain()), {
    purpose: "website_concierge",
    tier: "reasoning",
    system,
    messages,
    json: true,
    maxTokens: 900,
    timeoutMs: 40_000,
  });
  return result ? { text: result.text, model: result.model } : null;
};

export const POST = createPublicHandler(
  {
    body: bodySchema,
    rateLimitKey: (req: NextRequest) => `concierge:${clientIp(req.headers)}`,
    rateLimitMax: 60,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (_req, body) => {
    if (env("CONCIERGE_DISABLED") === "1" || !isEngineLLMAvailable()) {
      return Response.json({ available: false });
    }

    // Only the recent conversation: enough for follow-ups, bounded cost.
    const messages = body.messages.slice(-10);
    const reply = await runConciergeTurn(messages, complete);
    if (!reply) {
      log.warn("concierge turn failed (model unavailable or unparseable)");
      return Response.json({ available: false });
    }

    const question = redact(messages[messages.length - 1].content).text;
    const answer = reply.sentences.map((s) => s.text).join(" ");
    void saveTurn({
      sessionId: body.sessionId,
      page: body.page ?? null,
      question,
      answer,
      sources: [...new Set(reply.sentences.flatMap((s) => s.sources.map((x) => x.id)))],
      intent: reply.intent,
      nextStep: reply.nextStep,
      dropped: reply.dropped,
      redacted: reply.redacted,
      model: reply.model,
      unanswered:
        reply.intent !== "smalltalk" &&
        reply.intent !== "legal_question" &&
        !reply.sentences.some((s) => s.sources.length > 0),
    }).catch((err) =>
      log.warn("concierge turn log failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    );

    return Response.json({
      available: true,
      reply: {
        sentences: reply.sentences,
        nextStep: reply.nextStep,
        suggestions: reply.suggestions,
        redacted: reply.redacted,
        profile: reply.profile,
      },
    });
  }
);
