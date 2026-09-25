import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { runThink, type ThinkLLMClient } from "../src/core/think/index.ts";

/**
 * A streamed answer whose caller went away ("Stopp", tab closed) must not
 * trigger the non-streaming fallback — that would pay for a second, unseen
 * answer. Without an abort the fallback still rescues a failed stream.
 */
let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  await engine.putPage("cases/acme-example", {
    title: "Acme example matter",
    type: "legal_case",
    compiled_truth: "Acme example matter has one open deadline.",
  });
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

function countingClient(): { client: ThinkLLMClient; calls: () => number } {
  let n = 0;
  const client: ThinkLLMClient = {
    create: async () => {
      n++;
      return {
        id: "stub",
        type: "message",
        role: "assistant",
        model: "stub",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
        },
        content: [
          { type: "text", text: '{"answer":"stub","citations":[],"gaps":[]}', citations: null },
        ],
      } as never;
    },
  };
  return { client, calls: () => n };
}

describe("runThink abort", () => {
  test("aborted caller: no fallback model call after the stream fails", async () => {
    const { client, calls } = countingClient();
    const ac = new AbortController();
    ac.abort();
    await expect(
      runThink(engine, {
        question: "Which deadlines does the Acme example matter have?",
        client,
        remote: false,
        onStreamChunk: () => {},
        abortSignal: ac.signal,
      })
    ).rejects.toBeDefined();
    expect(calls()).toBe(0);
  });

  test("without abort the fallback still answers when streaming fails", async () => {
    const { client, calls } = countingClient();
    const result = await runThink(engine, {
      question: "Which deadlines does the Acme example matter have?",
      client,
      remote: false,
      onStreamChunk: () => {},
    });
    expect(calls()).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.startsWith("STREAM_FAILED_FALLBACK"))).toBe(true);
  });
});
