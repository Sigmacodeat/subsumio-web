/**
 * Utility completions — the single LLM gateway for small structured tasks.
 *
 * The web app used to call OpenRouter directly (memory extraction, WhatsApp
 * intent parsing, LLM deadline extraction, briefing polish) with its own key:
 * a second provider path with no model tiers, no budget tracking, no prompt
 * sanitising, and — on Hetzner — no key at all in the web container, so those
 * features silently did nothing. Every such call now goes through this
 * function via `POST /api/llm/complete`: model resolved by tier (or the
 * per-purpose config key `models.purpose.<purpose>`), the same gateway as
 * `think`, the same injection sanitiser, and usage returned to the caller.
 */
import type { BrainEngine } from "../engine.ts";
import {
  chat,
  chatStream,
  getChatModel,
  isAvailable,
  type ChatMessage,
  type ChatResult,
} from "./gateway.ts";
import { resolveModel, type ModelTier } from "../model-config.ts";
import { sanitizePromptInput } from "../think/sanitize.ts";

export interface UtilityCompletionRequest {
  purpose: string;
  tier?: "utility" | "reasoning" | "deep";
  system?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  /** Ask for a single JSON object (instruction only; callers still parse defensively). */
  json?: boolean;
  max_tokens?: number;
  timeout_ms?: number;
}

export interface UtilityCompletionResult {
  text: string;
  model: string;
  provider: string;
  stop_reason: ChatResult["stopReason"];
  usage: ChatResult["usage"];
  latency_ms: number;
  purpose: string;
  tier: ModelTier;
}

export class UtilityCompletionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "UtilityCompletionError";
  }
}

const JSON_INSTRUCTION =
  "Antworte ausschließlich mit einem einzigen gültigen JSON-Objekt — ohne Erklärtext, ohne Markdown-Zäune.";

export function normalizeUtilityRequest(body: Record<string, unknown>): {
  purpose: string;
  tier: ModelTier;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
} {
  const purpose = typeof body.purpose === "string" ? body.purpose.trim().slice(0, 64) : "";
  if (!purpose || !/^[a-z0-9_.-]+$/i.test(purpose)) {
    throw new UtilityCompletionError(
      400,
      "missing_purpose",
      "purpose is required (a-z, 0-9, _ . -)"
    );
  }
  const tier: ModelTier =
    body.tier === "reasoning" || body.tier === "deep" || body.tier === "subagent"
      ? body.tier
      : "utility";
  const rawSystem = typeof body.system === "string" ? body.system : "";
  const wantJson = body.json === true;
  const systemParts = [
    rawSystem.trim() ? sanitizePromptInput(rawSystem, 20_000).text : "",
    wantJson ? JSON_INSTRUCTION : "",
  ].filter(Boolean);
  const system = systemParts.length ? systemParts.join("\n\n") : undefined;

  const rawMessages: unknown[] = Array.isArray(body.messages)
    ? body.messages
    : typeof body.prompt === "string"
      ? [{ role: "user", content: body.prompt }]
      : [];
  const messages: ChatMessage[] = rawMessages
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        typeof m === "object" &&
        typeof (m as { role?: unknown }).role === "string" &&
        typeof (m as { content?: unknown }).content === "string" &&
        (m as { content: string }).content.trim().length > 0
    )
    .slice(-20)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: sanitizePromptInput(m.content, 60_000).text,
    }));
  if (messages.length === 0) {
    throw new UtilityCompletionError(400, "missing_prompt", "prompt or messages[] is required");
  }
  const maxTokens = Math.min(4096, Math.max(16, Math.trunc(Number(body.max_tokens)) || 800));
  const timeoutMs = Math.min(
    120_000,
    Math.max(1_000, Math.trunc(Number(body.timeout_ms)) || 30_000)
  );
  return { purpose, tier, system, messages, maxTokens, timeoutMs };
}

export async function runUtilityCompletion(
  engine: BrainEngine | null,
  body: Record<string, unknown>
): Promise<UtilityCompletionResult> {
  const req = normalizeUtilityRequest(body);
  if (!isAvailable("chat")) {
    throw new UtilityCompletionError(503, "llm_not_configured", "No chat model configured");
  }
  const model = await resolveModel(engine, {
    tier: req.tier,
    configKey: `models.purpose.${req.purpose}`,
    fallback: getChatModel(),
  });
  const started = Date.now();
  let result: ChatResult;
  try {
    result = await chat({
      model,
      system: req.system,
      messages: req.messages,
      maxTokens: req.maxTokens,
      abortSignal: AbortSignal.timeout(req.timeoutMs),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new UtilityCompletionError(504, "llm_timeout", `LLM call exceeded ${req.timeoutMs}ms`);
    }
    throw e;
  }
  return {
    text: result.text,
    model: result.model,
    provider: result.providerId,
    stop_reason: result.stopReason,
    usage: result.usage,
    latency_ms: Date.now() - started,
    purpose: req.purpose,
    tier: req.tier,
  };
}

/**
 * Same contract as runUtilityCompletion, but the text arrives in pieces.
 * Callers that show the answer while it is being written (the website
 * concierge) use this; everything else keeps the single-shot version.
 */
export async function* streamUtilityCompletion(
  engine: BrainEngine | null,
  body: Record<string, unknown>
): AsyncGenerator<
  { type: "text"; text: string } | { type: "done"; result: UtilityCompletionResult }
> {
  const req = normalizeUtilityRequest(body);
  if (!isAvailable("chat")) {
    throw new UtilityCompletionError(503, "llm_not_configured", "No chat model configured");
  }
  const model = await resolveModel(engine, {
    tier: req.tier,
    configKey: `models.purpose.${req.purpose}`,
    fallback: getChatModel(),
  });
  const started = Date.now();
  let text = "";
  try {
    for await (const event of chatStream({
      model,
      system: req.system,
      messages: req.messages,
      maxTokens: req.maxTokens,
      abortSignal: AbortSignal.timeout(req.timeoutMs),
    })) {
      if (event.type === "text") {
        text += event.text;
        yield { type: "text", text: event.text };
      } else if (event.type === "done") {
        yield {
          type: "done",
          result: {
            text: event.result.text || text,
            model: event.result.model,
            provider: event.result.providerId,
            stop_reason: event.result.stopReason,
            usage: event.result.usage,
            latency_ms: Date.now() - started,
            purpose: req.purpose,
            tier: req.tier,
          },
        };
      }
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new UtilityCompletionError(504, "llm_timeout", `LLM call exceeded ${req.timeoutMs}ms`);
    }
    throw e;
  }
}
