/**
 * Engine LLM gateway client — the only way the web app talks to a model for
 * small structured tasks (memory extraction, intent parsing, deadline
 * extraction, briefing polish, transcription).
 *
 * Why: these used to call OpenRouter directly with a second API key. That
 * bypassed the engine's model tiers, budget tracking and prompt sanitiser,
 * duplicated provider config, and on Hetzner the web container has no key at
 * all — so the features silently did nothing. Now every call goes to
 * `POST /api/llm/complete` / `/api/llm/transcribe` on the engine.
 */
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger("engine-llm");

export interface EngineCompleteOptions {
  /** Short identifier for telemetry and per-purpose model overrides (models.purpose.<purpose>). */
  purpose: string;
  tier?: "utility" | "reasoning" | "deep";
  system?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Ask the model for one JSON object. Still parse with `parseJsonObject`. */
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface EngineCompleteResult {
  text: string;
  model: string;
  provider: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens?: number };
  latency_ms: number;
}

/** True when an engine is configured (SUBSUMIO_API_URL) — the engine decides whether a model is. */
export function isEngineLLMAvailable(): boolean {
  return Boolean(env("SUBSUMIO_API_URL"));
}

export async function engineComplete(
  headers: Record<string, string>,
  opts: EngineCompleteOptions
): Promise<EngineCompleteResult | null> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  try {
    const res = await fetch(`${ENGINE_URL}/api/llm/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        purpose: opts.purpose,
        tier: opts.tier ?? "utility",
        system: opts.system,
        prompt: opts.prompt,
        messages: opts.messages,
        json: opts.json === true,
        max_tokens: opts.maxTokens,
        timeout_ms: timeoutMs,
      }),
      // Give the engine's own timeout a little headroom before we give up.
      signal: AbortSignal.timeout(timeoutMs + 5_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.warn("engine completion failed", {
        purpose: opts.purpose,
        status: res.status,
        detail: detail.slice(0, 200),
      });
      return null;
    }
    return (await res.json()) as EngineCompleteResult;
  } catch (err) {
    log.warn("engine completion error", {
      purpose: opts.purpose,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface EngineTranscribeResult {
  text: string;
  language?: string;
  duration_seconds?: number;
  provider: string;
}

export async function engineTranscribe(
  headers: Record<string, string>,
  audio: {
    bytes: Uint8Array;
    mimeType?: string;
    filename?: string;
    language?: string;
    model?: string;
  }
): Promise<EngineTranscribeResult | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/llm/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        audio_base64: Buffer.from(audio.bytes).toString("base64"),
        mime_type: audio.mimeType,
        filename: audio.filename,
        language: audio.language,
        model: audio.model,
      }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.warn("engine transcription failed", { status: res.status, detail: detail.slice(0, 200) });
      return null;
    }
    return (await res.json()) as EngineTranscribeResult;
  } catch (err) {
    log.warn("engine transcription error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Parse a model reply that should be one JSON object. Tolerates code fences
 * and leading prose; returns null when nothing parses.
 */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.search(/[{[]/);
    if (start < 0) return null;
    const candidate = trimmed.slice(start);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (end < 0) return null;
    try {
      return JSON.parse(candidate.slice(0, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Streaming variant of `engineComplete` (engine: POST /api/llm/stream).
 * `onChunk` fires for every piece of text as it arrives. Returns the same
 * result as `engineComplete` once the stream ends, or null when the engine
 * does not offer the endpoint (older deployment) or the call fails — callers
 * fall back to `engineComplete` then.
 */
export async function engineStream(
  headers: Record<string, string>,
  opts: EngineCompleteOptions,
  onChunk: (text: string) => void
): Promise<EngineCompleteResult | null> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  try {
    const res = await fetch(`${ENGINE_URL}/api/llm/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...headers },
      body: JSON.stringify({
        purpose: opts.purpose,
        tier: opts.tier ?? "utility",
        system: opts.system,
        prompt: opts.prompt,
        messages: opts.messages,
        json: opts.json === true,
        max_tokens: opts.maxTokens,
        timeout_ms: timeoutMs,
      }),
      signal: AbortSignal.timeout(timeoutMs + 5_000),
    });
    if (!res.ok || !res.body) {
      log.warn("engine stream unavailable", { purpose: opts.purpose, status: res.status });
      return null;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done: EngineCompleteResult | null = null;
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as
            | { type: "text"; text: string }
            | { type: "done"; result: EngineCompleteResult }
            | { type: "error"; error: string; message?: string };
          if (event.type === "text") onChunk(event.text);
          else if (event.type === "done") done = event.result;
          else if (event.type === "error") {
            log.warn("engine stream error", { purpose: opts.purpose, error: event.error });
            return null;
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
    return done;
  } catch (err) {
    log.warn("engine stream failed", {
      purpose: opts.purpose,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
