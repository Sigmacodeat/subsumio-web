/**
 * Amazon Bedrock recipe + gateway factory. Drives the real
 * `createBedrockAnthropic` request path (signing, URL, body transform,
 * response parsing) against a stub fetch — no AWS call, no credentials.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { withEnv } from "../helpers/with-env.ts";
import { getRecipe } from "../../src/core/ai/recipes/index.ts";
import { resolveRecipe } from "../../src/core/ai/model-resolver.ts";
import { classifyCapabilities } from "../../src/core/ai/capabilities.ts";
import {
  __setBedrockFetchForTests,
  chat,
  configureGateway,
  isAvailable,
  resetGateway,
} from "../../src/core/ai/gateway.ts";
import {
  BEDROCK_EU_MODELS,
  bedrockRoutingScope,
  hasBedrockCredentials,
  resolveBedrockRegion,
} from "../../src/core/ai/bedrock-config.ts";
import { AIConfigError } from "../../src/core/ai/errors.ts";
import { chatStream } from "../../src/core/ai/gateway.ts";
import { EventStreamCodec } from "@smithy/eventstream-codec";
import { fromUtf8, toUtf8 } from "@smithy/util-utf8";

/** Encode Anthropic stream events as a Bedrock InvokeModelWithResponseStream body. */
function bedrockEventStream(events: unknown[]): Response {
  const codec = new EventStreamCodec(toUtf8, fromUtf8);
  const frames = events.map((ev) =>
    codec.encode({
      headers: {
        ":message-type": { type: "string", value: "event" },
        ":event-type": { type: "string", value: "chunk" },
        ":content-type": { type: "string", value: "application/json" },
      },
      body: fromUtf8(JSON.stringify({ bytes: Buffer.from(JSON.stringify(ev)).toString("base64") })),
    })
  );
  const total = frames.reduce((n, f) => n + f.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const f of frames) {
    out.set(f, off);
    off += f.length;
  }
  return new Response(out, {
    status: 200,
    headers: { "content-type": "application/vnd.amazon.eventstream" },
  });
}

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, any>;
}

function anthropicResponse(content: unknown[], stop_reason = "end_turn"): Response {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content,
      stop_reason,
      stop_sequence: null,
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 3,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function stubFetch(captured: Captured[], response: () => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    captured.push({ url, headers, body });
    return response();
  }) as unknown as typeof fetch;
}

const SIGV4_ENV = {
  AWS_ACCESS_KEY_ID: "AKIATESTTESTTEST",
  AWS_SECRET_ACCESS_KEY: "secretsecretsecretsecret",
};

describe("bedrock recipe shape", () => {
  test("registered as native-bedrock with chat + expansion, no embedding", () => {
    const r = getRecipe("bedrock")!;
    expect(r).toBeDefined();
    expect(r.implementation).toBe("native-bedrock");
    expect(r.tier).toBe("native");
    expect(r.touchpoints.embedding).toBeUndefined();
    expect(r.touchpoints.chat!.supports_tools).toBe(true);
    expect(r.touchpoints.chat!.supports_prompt_cache).toBe(true);
    expect(r.touchpoints.chat!.models).toEqual([
      "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      "eu.anthropic.claude-sonnet-5",
      "eu.anthropic.claude-opus-5",
    ]);
  });

  test("friendly aliases resolve to the EU inference profiles", () => {
    expect(resolveRecipe("bedrock:claude-sonnet-5").parsed.modelId).toBe(BEDROCK_EU_MODELS.sonnet5);
    expect(resolveRecipe("bedrock:claude-opus-5").parsed.modelId).toBe(BEDROCK_EU_MODELS.opus5);
    expect(resolveRecipe("bedrock:claude-haiku-4-5").parsed.modelId).toBe(
      BEDROCK_EU_MODELS.haiku45
    );
    // colon inside the Bedrock id survives provider:model parsing
    const p = resolveRecipe(`bedrock:${BEDROCK_EU_MODELS.haiku45}`).parsed;
    expect(p.providerId).toBe("bedrock");
    expect(p.modelId).toBe(BEDROCK_EU_MODELS.haiku45);
  });

  test("subagent capability verdict is ok (tools + prompt cache)", () => {
    expect(classifyCapabilities(`bedrock:${BEDROCK_EU_MODELS.haiku45}`)).toBe("ok");
  });

  test("credentials: key pair or Bedrock API key", () => {
    expect(hasBedrockCredentials({})).toBe(false);
    expect(hasBedrockCredentials({ AWS_ACCESS_KEY_ID: "a" })).toBe(false);
    expect(hasBedrockCredentials(SIGV4_ENV)).toBe(true);
    expect(hasBedrockCredentials({ AWS_BEARER_TOKEN_BEDROCK: "t" })).toBe(true);
  });

  test("region defaults to eu-central-1", () => {
    expect(resolveBedrockRegion({})).toBe("eu-central-1");
    expect(resolveBedrockRegion({ AWS_REGION: "eu-west-1" })).toBe("eu-west-1");
  });

  test("routing scope parsing", () => {
    expect(bedrockRoutingScope("eu.anthropic.claude-sonnet-5")).toEqual({ kind: "geo", geo: "eu" });
    expect(bedrockRoutingScope("global.anthropic.claude-opus-5")).toEqual({
      kind: "geo",
      geo: "global",
    });
    expect(bedrockRoutingScope("anthropic.claude-opus-5")).toEqual({ kind: "in_region" });
    expect(
      bedrockRoutingScope("arn:aws:bedrock:eu-central-1:1:application-inference-profile/x")
    ).toEqual({
      kind: "unknown",
    });
  });
});

describe("gateway → Bedrock (stubbed fetch)", () => {
  beforeEach(() => resetGateway());
  afterEach(() => {
    __setBedrockFetchForTests(null);
    resetGateway();
  });

  test("isAvailable follows hasCredentials, not auth_env.required", () => {
    configureGateway({ chat_model: `bedrock:${BEDROCK_EU_MODELS.sonnet5}`, env: {} });
    expect(isAvailable("chat")).toBe(false);
    configureGateway({
      chat_model: `bedrock:${BEDROCK_EU_MODELS.sonnet5}`,
      env: { AWS_BEARER_TOKEN_BEDROCK: "tok" },
    });
    expect(isAvailable("chat")).toBe(true);
  });

  test("missing credentials → AIConfigError, no request", async () => {
    const captured: Captured[] = [];
    __setBedrockFetchForTests(stubFetch(captured, () => anthropicResponse([])));
    await withEnv(
      { AWS_BEARER_TOKEN_BEDROCK: undefined, AWS_ACCESS_KEY_ID: undefined },
      async () => {
        configureGateway({ env: {} });
        await expect(
          chat({ model: "bedrock:claude-sonnet-5", messages: [{ role: "user", content: "x" }] })
        ).rejects.toBeInstanceOf(AIConfigError);
      }
    );
    expect(captured).toHaveLength(0);
  });

  test("SigV4: eu-central-1 runtime URL, signed, Anthropic body with prompt cache", async () => {
    const captured: Captured[] = [];
    __setBedrockFetchForTests(
      stubFetch(captured, () => anthropicResponse([{ type: "text", text: "Antwort" }]))
    );
    await withEnv(
      {
        AWS_ENDPOINT_URL: "https://attacker.example",
        AWS_ENDPOINT_URL_BEDROCK_RUNTIME: "https://attacker.example",
        AWS_BEARER_TOKEN_BEDROCK: "process-env-token-must-not-win",
      },
      async () => {
        configureGateway({ env: { ...SIGV4_ENV } });
        const res = await chat({
          model: "bedrock:claude-sonnet-5",
          system: "Du bist ein juristischer Assistent.",
          cacheSystem: true,
          messages: [{ role: "user", content: "Frage" }],
        });
        expect(res.text).toBe("Antwort");
        expect(res.model).toBe("bedrock:eu.anthropic.claude-sonnet-5");
        expect(res.providerId).toBe("bedrock");
        expect(res.usage.input_tokens).toBeGreaterThan(0);
      }
    );
    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req.url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.claude-sonnet-5/invoke"
    );
    const auth = req.headers.get("authorization") ?? "";
    expect(auth).toStartWith("AWS4-HMAC-SHA256");
    expect(auth).toContain("/eu-central-1/bedrock/aws4_request");
    expect(req.body.anthropic_version).toBe("bedrock-2023-05-31");
    expect(req.body.model).toBeUndefined(); // model rides in the URL
    const system = req.body.system as Array<{ text: string; cache_control?: { type: string } }>;
    expect(Array.isArray(system)).toBe(true);
    expect(system[0].cache_control?.type).toBe("ephemeral");
  });

  test("Bearer: Bedrock API key sent as Authorization: Bearer", async () => {
    const captured: Captured[] = [];
    __setBedrockFetchForTests(
      stubFetch(captured, () => anthropicResponse([{ type: "text", text: "ok" }]))
    );
    configureGateway({
      env: { AWS_BEARER_TOKEN_BEDROCK: "bedrock-api-key", AWS_REGION: "eu-west-3" },
    });
    await chat({
      model: `bedrock:${BEDROCK_EU_MODELS.haiku45}`,
      messages: [{ role: "user", content: "x" }],
    });
    expect(captured[0].headers.get("authorization")).toBe("Bearer bedrock-api-key");
    expect(captured[0].url).toBe(
      `https://bedrock-runtime.eu-west-3.amazonaws.com/model/${encodeURIComponent(BEDROCK_EU_MODELS.haiku45)}/invoke`
    );
  });

  test("tool use round-trip: tools sent, tool_use block normalized to tool-call", async () => {
    const captured: Captured[] = [];
    __setBedrockFetchForTests(
      stubFetch(captured, () =>
        anthropicResponse(
          [{ type: "tool_use", id: "toolu_1", name: "search", input: { q: "ABGB 1096" } }],
          "tool_use"
        )
      )
    );
    configureGateway({ env: { ...SIGV4_ENV } });
    const res = await chat({
      model: "bedrock:claude-opus-5",
      messages: [{ role: "user", content: "Suche" }],
      tools: [
        {
          name: "search",
          description: "Suche im Korpus",
          inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
        },
      ],
    });
    expect(captured[0].body.tools?.[0]?.name).toBe("search");
    const call = res.blocks.find((b) => b.type === "tool-call") as
      | { type: "tool-call"; toolName: string; input: unknown }
      | undefined;
    expect(call?.toolName).toBe("search");
    expect(call?.input).toEqual({ q: "ABGB 1096" });
    expect(res.stopReason).toBe("tool_calls");
  });

  test("Bedrock error body surfaces as a normalized error (no failover to OpenRouter)", async () => {
    const captured: Captured[] = [];
    __setBedrockFetchForTests(
      stubFetch(
        captured,
        () =>
          new Response(JSON.stringify({ message: "You don't have access to the model" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          })
      )
    );
    await withEnv({ OPENROUTER_API_KEY: "sk-or" }, async () => {
      configureGateway({ env: { ...SIGV4_ENV } });
      const err = await chat({
        model: "bedrock:claude-sonnet-5",
        messages: [{ role: "user", content: "x" }],
      }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
    });
    // One Bedrock request (SDK may retry transient codes; 403 is not retried),
    // and never a request to another host.
    expect(captured.every((c) => c.url.startsWith("https://bedrock-runtime.eu-central-1."))).toBe(
      true
    );
  });

  test("streaming: invoke-with-response-stream, text deltas and usage come through", async () => {
    const captured: Captured[] = [];
    __setBedrockFetchForTests(
      stubFetch(captured, () =>
        bedrockEventStream([
          {
            type: "message_start",
            message: {
              id: "msg_s",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-5",
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 9, output_tokens: 1 },
            },
          },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hallo " } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Welt" } },
          { type: "content_block_stop", index: 0 },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 4 },
          },
          { type: "message_stop" },
        ])
      )
    );
    configureGateway({ env: { ...SIGV4_ENV } });
    let text = "";
    let done: { usage: { input_tokens: number; output_tokens: number } } | null = null;
    for await (const ev of chatStream({
      model: "bedrock:claude-sonnet-5",
      messages: [{ role: "user", content: "Hallo" }],
    })) {
      if (ev.type === "text") text += ev.text;
      if (ev.type === "done") done = ev.result;
    }
    expect(text).toBe("Hallo Welt");
    expect(done?.usage.output_tokens).toBe(4);
    expect(captured[0].url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.claude-sonnet-5/invoke-with-response-stream"
    );
  });
});
