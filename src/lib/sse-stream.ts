/**
 * Shared SSE stream consumer utility.
 *
 * Eliminates 4 copies of the same ReadableStream → SSE event parsing pattern
 * across api.ts, legal-chat/actions.ts, and whatsapp-natural-chat.ts.
 *
 * All callers now get consistent error handling: on reader failure (network
 * drop, AbortSignal, etc.) the reader is cancelled before re-throwing,
 * preventing leaked stream locks and unhandled promise rejections.
 */

/**
 * Callback for each SSE `data:` event.
 *
 * @param data The raw payload string after `data: ` (may be JSON or `[DONE]`).
 * @param parsed The parsed JSON object if the payload is valid JSON, otherwise undefined.
 */
export interface SSEEventCallback {
  (data: string, parsed: Record<string, unknown> | undefined): void;
}

/**
 * Consume a Server-Sent Events stream from a Response body.
 *
 * Reads chunks from the ReadableStream, splits on SSE line boundaries,
 * and invokes `onEvent` for each `data:` line. Handles:
 *   - Buffer accumulation across chunk boundaries
 *   - Final buffer flush after stream ends
 *   - Reader cancellation on error (prevents leaked stream locks)
 *   - AbortSignal propagation (re-throws AbortError)
 *
 * @param body The ReadableStream<Uint8Array> from `res.body`.
 * @param onEvent Called for each `data:` event. `data` is the raw string;
 *                `parsed` is the JSON.parse result if valid, else undefined.
 * @throws {Error} Whatever the reader throws (AbortError, TypeError, etc.)
 *                 — but only after cancelling the reader.
 */
export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: SSEEventCallback
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          handleDataLine(line.slice(6), onEvent);
        }
      }
    }
    // Flush remaining buffer
    if (buffer.startsWith("data: ")) {
      handleDataLine(buffer.slice(6), onEvent);
    }
  } catch (err) {
    // AbortError, TypeError (network drop), or any reader failure —
    // cancel the reader to release the stream lock before re-throwing.
    await reader.cancel().catch(() => {});
    throw err;
  }
}

/**
 * Parse a single SSE data line and invoke the callback.
 * Exported for testing.
 */
export function handleDataLine(raw: string, onEvent: SSEEventCallback): void {
  if (raw === "[DONE]") {
    onEvent(raw, undefined);
    return;
  }
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Non-JSON payload — caller decides what to do via the `data` arg
  }
  onEvent(raw, parsed);
}

/** What a think stream finally says, after the engine's own verification. */
export interface SSEAnswer {
  /** The answer to show: the verified `final_answer` when the engine sent one,
   *  otherwise the concatenated streamed chunks. */
  answer: string;
  /** True when `final_answer` replaced the streamed draft. */
  revised: boolean;
  /** Why the engine replaced the draft (citation_guardrail, retrieval_failed, …). */
  revisionReason?: string;
  /** Engine warning codes from the final event (GUARDRAIL_*, RETRIEVAL_FAILED, …). */
  warnings: string[];
}

/**
 * Consume a think SSE stream into the answer the engine stands behind.
 *
 * The engine streams its FIRST draft as `chunk` events, then runs the
 * citation guardrail / cross-verify and — when the verified text differs —
 * sends `final_answer` in the final event (see
 * server/src/core/think/final-answer.ts). That text replaces the draft,
 * exactly as the browser path in api.ts does; it also carries the engine's
 * own notes ("Suche nicht erreichbar", "Zitate nicht belegt").
 *
 * @param body The ReadableStream from `res.body`.
 * @param onChunk Optional callback for each streamed draft chunk.
 */
export async function collectSSEAnswer(
  body: ReadableStream<Uint8Array>,
  onChunk?: (chunk: string) => void
): Promise<SSEAnswer> {
  let streamed = "";
  let finalAnswer: string | undefined;
  let revisionReason: string | undefined;
  const warnings: string[] = [];
  await consumeSSEStream(body, (data, parsed) => {
    if (data === "[DONE]" || !parsed) return;
    if (typeof parsed.chunk === "string") {
      streamed += parsed.chunk;
      onChunk?.(parsed.chunk);
    }
    if (typeof parsed.final_answer === "string" && parsed.final_answer) {
      finalAnswer = parsed.final_answer;
      if (typeof parsed.revision_reason === "string") revisionReason = parsed.revision_reason;
    }
    if (Array.isArray(parsed.warnings)) {
      for (const w of parsed.warnings) if (typeof w === "string") warnings.push(w);
    }
  });
  return finalAnswer !== undefined
    ? { answer: finalAnswer, revised: true, revisionReason, warnings }
    : { answer: streamed, revised: false, warnings };
}

/**
 * Consume an SSE stream and return the final answer text.
 *
 * Convenience wrapper over {@link collectSSEAnswer} for callers that only
 * need the text. A `final_answer` event replaces the streamed chunks.
 *
 * @param body The ReadableStream from `res.body`.
 * @param onChunk Optional callback for each chunk as it arrives.
 * @returns The answer string.
 */
export async function collectSSEChunks(
  body: ReadableStream<Uint8Array>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  return (await collectSSEAnswer(body, onChunk)).answer;
}
