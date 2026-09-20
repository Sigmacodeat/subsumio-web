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
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { engineHeadersForBrain } from "@/lib/engine";
import { engineStream, isEngineLLMAvailable } from "@/lib/engine-llm";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runConciergeTurnStream, type ConciergeReply, type StreamFn } from "@/lib/concierge/agent";
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

/** Answers a day across all visitors — the brake for a distributed flood that
 *  the per-IP limit cannot see. ~0.01 $ per answer, so the default caps the
 *  public chat at roughly 20 $ a day. */
const DAILY_MAX = Number(env("CONCIERGE_DAILY_MAX") || 2000);

function conciergeBrain(): string {
  return env("SUBSUMIO_CONCIERGE_BRAIN") || env("SUBSUMIO_DEMO_BRAIN") || "demo";
}

const MODEL_OPTS = {
  purpose: "website_concierge",
  tier: "reasoning" as const,
  json: true,
  maxTokens: 900,
  timeoutMs: 40_000,
};

/** One streamed completion through the engine gateway. */
const stream: StreamFn = async ({ system, messages }, onChunk) => {
  const result = await engineStream(
    engineHeadersForBrain(conciergeBrain()),
    { ...MODEL_OPTS, system, messages },
    onChunk
  );
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

    const daily = await hit("concierge:global-day", DAILY_MAX, 24 * 60 * 60_000);
    if (!daily.ok) {
      log.warn("concierge daily budget reached", { limit: DAILY_MAX });
      return Response.json({ available: false });
    }

    // Only the recent conversation: enough for follow-ups, bounded cost.
    const messages = body.messages.slice(-10);
    const question = redact(messages[messages.length - 1].content).text;
    const encoder = new TextEncoder();

    const sse = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        let final: ConciergeReply | null = null;
        try {
          for await (const event of runConciergeTurnStream(messages, stream)) {
            if (event.type === "sentence") {
              send({ type: "sentence", sentence: event.sentence });
              continue;
            }
            if (event.unavailable) {
              send({ type: "unavailable" });
              break;
            }
            final = event.reply;
            send({
              type: "final",
              replace: event.replace,
              reply: {
                sentences: event.reply.sentences,
                nextStep: event.reply.nextStep,
                suggestions: event.reply.suggestions,
                redacted: event.reply.redacted,
                profile: event.reply.profile,
              },
            });
          }
        } catch (err) {
          log.warn("concierge stream failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          send({ type: "unavailable" });
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }

        if (final) {
          const reply = final;
          void saveTurn({
            sessionId: body.sessionId,
            page: body.page ?? null,
            question,
            answer: reply.sentences.map((s) => s.text).join(" "),
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
        }
      },
    });

    return new Response(sse, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
);
