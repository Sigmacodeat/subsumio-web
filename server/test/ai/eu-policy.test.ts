/**
 * EU-only routing: residency classification (one table in model-registry.ts),
 * the SUBSUMIO_EU_ONLY refusal on every gateway touchpoint, the embedding
 * sub-switch, EU-aware provider failover and the LLM-reranker chain.
 * Hermetic: transports are stubbed, no provider is called.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { withEnv } from "../helpers/with-env.ts";
import {
  __setChatTransportForTests,
  __setEmbedTransportForTests,
  __setRerankTransportForTests,
  chat,
  chatStream,
  configureGateway,
  embed,
  embedMultimodal,
  embedQuery,
  expand,
  generateOcrText,
  rerank,
  resetGateway,
  RerankError,
  toolLoop,
  type ChatResult,
} from "../../src/core/ai/gateway.ts";
import {
  __resetEuPolicyLogForTests,
  assertEuResidency,
  euRefusal,
  EuResidencyError,
  isAllowedUnderEuPolicy,
  isEuOnly,
  isEuOnlyEmbeddings,
  residencyOf,
} from "../../src/core/ai/eu-policy.ts";
import {
  getModelEntry,
  PROVIDER_RESIDENCY,
  resolveProviderResidency,
} from "../../src/core/model-registry.ts";
import { listRecipes } from "../../src/core/ai/recipes/index.ts";
import { providerFailoverModel } from "../../src/core/ai/provider-failover.ts";
import { transcribeBuffer } from "../../src/core/transcription.ts";
import { applyLLMReranker } from "../../src/core/search/hybrid.ts";
import { resolveModel } from "../../src/core/model-config.ts";
import type { SearchResult } from "../../src/core/types.ts";

const EU = { SUBSUMIO_EU_ONLY: "1" };
const EU_EMB = { SUBSUMIO_EU_ONLY: "1", SUBSUMIO_EU_ONLY_EMBEDDINGS: "1" };
const BEDROCK_SONNET = "bedrock:eu.anthropic.claude-sonnet-5";

function fakeResult(model: string): ChatResult {
  return {
    text: "ok",
    blocks: [{ type: "text", text: "ok" }],
    stopReason: "end",
    usage: { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_creation_tokens: 0 },
    model,
    providerId: model.split(":")[0],
  };
}

describe("residency classification (PROVIDER_RESIDENCY)", () => {
  test("every recipe is classified — a new recipe must declare its residency", () => {
    for (const r of listRecipes()) {
      expect(
        PROVIDER_RESIDENCY[r.id],
        `recipe "${r.id}" missing in PROVIDER_RESIDENCY`
      ).toBeDefined();
    }
  });

  test("direct vendor APIs are non-EU; Mistral is EU", () => {
    for (const p of [
      "anthropic",
      "openai",
      "google",
      "deepseek",
      "groq",
      "zeroentropyai",
      "dashscope",
      "voyage",
      "xai",
    ]) {
      expect(resolveProviderResidency(p, "x", {}).residency).toBe("non_eu");
    }
    expect(resolveProviderResidency("mistral", "mistral-large-3", {}).residency).toBe("eu");
  });

  test("unknown provider is non-EU (fail-closed)", () => {
    const v = resolveProviderResidency("madeup", "m", {});
    expect(v.residency).toBe("non_eu");
    expect(v.basis).toContain("unknown provider");
  });

  test("attested providers are non-EU by default and EU only with <VAR>=eu", () => {
    expect(resolveProviderResidency("openrouter", "anthropic/claude-sonnet-5", {}).residency).toBe(
      "non_eu"
    );
    expect(
      resolveProviderResidency("openrouter", "x", { SUBSUMIO_OPENROUTER_RESIDENCY: "EU" }).residency
    ).toBe("eu");
    expect(resolveProviderResidency("azure-openai", "x", {}).residency).toBe("non_eu");
    expect(
      resolveProviderResidency("azure-openai", "x", { SUBSUMIO_AZURE_OPENAI_RESIDENCY: "eu" })
        .residency
    ).toBe("eu");
    expect(
      resolveProviderResidency("azure-openai", "x", { SUBSUMIO_AZURE_OPENAI_RESIDENCY: "yes" })
        .residency
    ).toBe("non_eu");
    expect(
      resolveProviderResidency("llama-server-reranker", "x", {
        SUBSUMIO_SELF_HOSTED_RESIDENCY: "eu",
      }).residency
    ).toBe("eu");
  });

  test("bedrock: eu. profile in an EU member-state region is EU", () => {
    expect(resolveProviderResidency("bedrock", "eu.anthropic.claude-sonnet-5", {}).residency).toBe(
      "eu"
    );
    expect(
      resolveProviderResidency("bedrock", "eu.anthropic.claude-opus-5", { AWS_REGION: "eu-west-3" })
        .residency
    ).toBe("eu");
    // in-region id in an EU region
    expect(
      resolveProviderResidency("bedrock", "anthropic.claude-opus-5", { AWS_REGION: "eu-central-1" })
        .residency
    ).toBe("eu");
  });

  test("bedrock: global./us. profiles, London/Zurich/US regions and ARNs are non-EU", () => {
    const nonEu: Array<[string, Record<string, string>]> = [
      ["global.anthropic.claude-sonnet-5", {}],
      ["us.anthropic.claude-sonnet-5", {}],
      ["eu.anthropic.claude-sonnet-5", { AWS_REGION: "eu-west-2" }],
      ["eu.anthropic.claude-sonnet-5", { AWS_REGION: "eu-central-2" }],
      ["eu.anthropic.claude-sonnet-5", { AWS_REGION: "us-east-1" }],
      ["anthropic.claude-opus-5", { AWS_REGION: "us-east-1" }],
      ["arn:aws:bedrock:eu-central-1:123456789012:application-inference-profile/abc", {}],
    ];
    for (const [model, env] of nonEu) {
      expect(
        resolveProviderResidency("bedrock", model, env).residency,
        `${model} ${JSON.stringify(env)}`
      ).toBe("non_eu");
    }
  });

  test("registry entries derive data_residency from the same table", () => {
    expect(getModelEntry(BEDROCK_SONNET)?.data_residency).toBe("eu");
    expect(
      getModelEntry("bedrock:eu.anthropic.claude-haiku-4-5-20251001-v1:0")?.data_residency
    ).toBe("eu");
    expect(getModelEntry("bedrock:eu.anthropic.claude-opus-5")?.data_residency).toBe("eu");
    expect(getModelEntry("mistral:mistral-large-3")?.data_residency).toBe("eu");
    expect(getModelEntry("anthropic:claude-sonnet-5")?.data_residency).toBe("non_eu");
    expect(getModelEntry("openrouter:deepseek/deepseek-chat")?.data_residency).toBe("non_eu");
  });

  test("residencyOf splits provider:model with colon precedence (bedrock ids contain ':')", () => {
    const v = residencyOf("bedrock:eu.anthropic.claude-haiku-4-5-20251001-v1:0", {});
    expect(v.provider).toBe("bedrock");
    expect(v.residency).toBe("eu");
  });
});

describe("switch parsing", () => {
  test("SUBSUMIO_EU_ONLY accepts 1/true/yes/on", () => {
    for (const v of ["1", "true", "YES", "on"])
      expect(isEuOnly({ SUBSUMIO_EU_ONLY: v })).toBe(true);
    for (const v of ["", "0", "false", "off", undefined])
      expect(isEuOnly({ SUBSUMIO_EU_ONLY: v })).toBe(false);
  });

  test("embedding sub-switch needs both switches", () => {
    expect(isEuOnlyEmbeddings({ SUBSUMIO_EU_ONLY_EMBEDDINGS: "1" })).toBe(false);
    expect(isEuOnlyEmbeddings(EU_EMB)).toBe(true);
  });

  test("switch off → everything allowed", () => {
    expect(isAllowedUnderEuPolicy("anthropic:claude-sonnet-5", {})).toBe(true);
    expect(() => assertEuResidency("anthropic:claude-sonnet-5", "chat", {})).not.toThrow();
  });

  test("refusal message names switch, target and basis; no failover-trigger words", () => {
    let err: unknown;
    try {
      assertEuResidency("anthropic:claude-sonnet-5", "chat", EU);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EuResidencyError);
    const msg = (err as Error).message;
    expect(msg).toContain("SUBSUMIO_EU_ONLY=1");
    expect(msg).toContain("anthropic:claude-sonnet-5");
    expect(msg).toContain("inference_geo");
    expect(msg).not.toMatch(/network|quota|billing|rate.?limit|overloaded/i);
  });
});

describe("gateway touchpoints under SUBSUMIO_EU_ONLY=1", () => {
  let transportCalls: string[];
  beforeEach(() => {
    resetGateway();
    __resetEuPolicyLogForTests();
    transportCalls = [];
    __setChatTransportForTests(async (opts) => {
      transportCalls.push(opts.model ?? "<default>");
      return fakeResult(opts.model ?? "x:y");
    });
  });
  afterEach(() => {
    __setChatTransportForTests(null);
    __setEmbedTransportForTests(null);
    __setRerankTransportForTests(null);
    resetGateway();
  });

  test("chat: non-EU refused before the transport; EU model passes", async () => {
    configureGateway({ env: { ...EU } });
    await expect(
      chat({ model: "anthropic:claude-sonnet-5", messages: [{ role: "user", content: "x" }] })
    ).rejects.toBeInstanceOf(EuResidencyError);
    await expect(
      chat({
        model: "openrouter:anthropic/claude-sonnet-5",
        messages: [{ role: "user", content: "x" }],
      })
    ).rejects.toBeInstanceOf(EuResidencyError);
    expect(transportCalls).toEqual([]);
    const ok = await chat({ model: BEDROCK_SONNET, messages: [{ role: "user", content: "x" }] });
    expect(ok.text).toBe("ok");
    expect(transportCalls).toEqual([BEDROCK_SONNET]);
  });

  test("chat: switch off → non-EU allowed (default behaviour unchanged)", async () => {
    configureGateway({ env: {} });
    await chat({ model: "anthropic:claude-sonnet-5", messages: [{ role: "user", content: "x" }] });
    expect(transportCalls).toEqual(["anthropic:claude-sonnet-5"]);
  });

  test("chat: default chat model is enforced too", async () => {
    configureGateway({ chat_model: "anthropic:claude-haiku-4-5", env: { ...EU } });
    await expect(chat({ messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(
      EuResidencyError
    );
  });

  test("chatStream: non-EU refused before any request", async () => {
    configureGateway({ env: { ...EU, ANTHROPIC_API_KEY: "sk-test" } });
    const run = async () => {
      for await (const _ of chatStream({
        model: "anthropic:claude-sonnet-5",
        messages: [{ role: "user", content: "x" }],
      })) {
        // no events expected
      }
    };
    await expect(run()).rejects.toBeInstanceOf(EuResidencyError);
  });

  test("toolLoop: refused on a non-EU model", async () => {
    configureGateway({ env: { ...EU } });
    await expect(
      toolLoop({
        model: "openai:gpt-5",
        initialMessages: [{ role: "user", content: "x" }],
        tools: [],
        toolHandlers: new Map(),
      })
    ).rejects.toBeInstanceOf(EuResidencyError);
    expect(transportCalls).toEqual([]);
  });

  test("expansion: non-EU model degrades to the original query (no request)", async () => {
    configureGateway({
      expansion_model: "anthropic:claude-haiku-4-5",
      env: { ...EU, ANTHROPIC_API_KEY: "sk-test" },
    });
    expect(await expand("Mietzinsminderung Schimmel")).toEqual(["Mietzinsminderung Schimmel"]);
  });

  test("OCR (expansion model): refused on a non-EU model", async () => {
    configureGateway({
      expansion_model: "anthropic:claude-haiku-4-5",
      env: { ...EU, ANTHROPIC_API_KEY: "sk-test" },
    });
    await expect(generateOcrText(Buffer.from("x"), "image/png")).rejects.toBeInstanceOf(
      EuResidencyError
    );
  });

  test("embeddings: EU_ONLY alone keeps the public-corpus index usable; client text refused", async () => {
    const seen: number[] = [];
    __setEmbedTransportForTests((async ({ values }: { values: string[] }) => {
      seen.push(values.length);
      return { embeddings: values.map(() => new Array(1536).fill(0.1)), usage: { tokens: 1 } };
    }) as never);
    configureGateway({
      embedding_model: "openrouter:openai/text-embedding-3-small",
      embedding_dimensions: 1536,
      env: { ...EU, OPENROUTER_API_KEY: "sk-or" },
    });
    // Unlabelled bulk run (corpus) and an explicit law-* source pass.
    await embed(["§ 1295 ABGB"]);
    await embed(["§ 1296 ABGB"], { sourceId: "law-at" });
    // A firm's document and any search query are client data.
    await expect(embed(["Mandantenschreiben"], { sourceId: "kanzlei-a" })).rejects.toBeInstanceOf(
      EuResidencyError
    );
    await expect(embedQuery("Frage")).rejects.toBeInstanceOf(EuResidencyError);
    expect(seen).toEqual([1, 1]);
  });

  test("embeddings: EU_ONLY_EMBEDDINGS also refuses the corpus (document-side)", async () => {
    const seen: number[] = [];
    __setEmbedTransportForTests((async ({ values }: { values: string[] }) => {
      seen.push(values.length);
      return { embeddings: values.map(() => new Array(1536).fill(0.1)), usage: { tokens: 1 } };
    }) as never);
    configureGateway({
      embedding_model: "openrouter:openai/text-embedding-3-small",
      embedding_dimensions: 1536,
      env: { ...EU_EMB, OPENROUTER_API_KEY: "sk-or" },
    });
    await expect(embed(["§ 1295 ABGB"])).rejects.toBeInstanceOf(EuResidencyError);
    await expect(embed(["§ 1295 ABGB"], { sourceId: "law-at" })).rejects.toBeInstanceOf(
      EuResidencyError
    );
    await expect(embedQuery("Frage")).rejects.toBeInstanceOf(EuResidencyError);
    expect(seen).toEqual([]);
  });

  test("multimodal embeddings: document-side refused under EU_ONLY_EMBEDDINGS", async () => {
    configureGateway({
      embedding_multimodal_model: "voyage:voyage-multimodal-3",
      env: { ...EU_EMB, VOYAGE_API_KEY: "v" },
    });
    await expect(
      embedMultimodal([{ kind: "image_base64", data: "AAAA", mime: "image/png" }])
    ).rejects.toBeInstanceOf(EuResidencyError);
  });

  test("rerank: non-EU reranker refused as RerankError, transport never called", async () => {
    let called = 0;
    __setRerankTransportForTests(async () => {
      called++;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    configureGateway({
      reranker_model: "zeroentropyai:zerank-2",
      env: { ...EU, ZEROENTROPY_API_KEY: "z" },
    });
    const err = await rerank({ query: "q", documents: ["a", "b"] }).catch((e) => e);
    expect(err).toBeInstanceOf(RerankError);
    expect((err as Error).message).toContain("SUBSUMIO_EU_ONLY");
    expect(called).toBe(0);
  });

  test("rerank: attested self-hosted reranker is allowed", async () => {
    let called = 0;
    __setRerankTransportForTests(async () => {
      called++;
      return new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 1 }] }), {
        status: 200,
      });
    });
    configureGateway({
      reranker_model: "llama-server-reranker:qwen3-reranker-4b",
      env: { ...EU, SUBSUMIO_SELF_HOSTED_RESIDENCY: "eu" },
    });
    const r = await rerank({ query: "q", documents: ["a"] }).catch((e) => e);
    // Model allowlist may reject an unlisted id — either way no EU refusal.
    if (r instanceof Error) expect(r.message).not.toContain("SUBSUMIO_EU_ONLY");
    else expect(called).toBe(1);
  });
});

describe("outside the gateway", () => {
  test("transcription: refused under EU_ONLY (no EU speech-to-text route)", async () => {
    await withEnv({ ...EU, GROQ_API_KEY: "g", OPENAI_API_KEY: undefined }, async () => {
      await expect(transcribeBuffer(Buffer.from("x"), "a.ogg")).rejects.toBeInstanceOf(
        EuResidencyError
      );
    });
  });

  test("euRefusal: HTTP payload for the engine transcribe endpoint", () => {
    expect(euRefusal("openrouter:whisper-1", "transcription", {})).toBeNull();
    const r = euRefusal("openrouter:whisper-1", "transcription", EU);
    expect(r?.error).toBe("eu_only_refused");
    expect(r?.message).toContain("transcription");
  });

  test("provider failover never reroutes to a non-EU OpenRouter under EU_ONLY", () => {
    const err = Object.assign(new Error("overloaded"), { status: 529 });
    const keyed = { OPENROUTER_API_KEY: "k" } as NodeJS.ProcessEnv;
    expect(providerFailoverModel("anthropic:claude-sonnet-5", err, keyed)).toBe(
      "openrouter:anthropic/claude-sonnet-5"
    );
    expect(
      providerFailoverModel("anthropic:claude-sonnet-5", err, {
        ...keyed,
        ...EU,
      } as NodeJS.ProcessEnv)
    ).toBeNull();
    const refusal = new EuResidencyError("chat", "anthropic:x", residencyOf("anthropic:x", {}));
    expect(providerFailoverModel("anthropic:claude-sonnet-5", refusal, keyed)).toBeNull();
  });

  test("LLM reranker chain: all non-EU → no LLM call, RRF order kept", async () => {
    let calls = 0;
    __setChatTransportForTests(async (opts) => {
      calls++;
      return fakeResult(opts.model ?? "x:y");
    });
    try {
      await withEnv({ ...EU }, async () => {
        const results = [
          { slug: "a/p-1", chunk_text: "eins", title: "A" },
          { slug: "b/p-2", chunk_text: "zwei", title: "B" },
        ] as unknown as SearchResult[];
        const out = await applyLLMReranker("Frage", results, {
          enabled: true,
          model: "anthropic:claude-haiku-4-5",
        });
        expect(out).toBe(results);
        expect(calls).toBe(0);
      });
    } finally {
      __setChatTransportForTests(null);
    }
  });

  test("subagent tier: non-EU resolution refused (legacy direct path bypasses the gateway)", async () => {
    await withEnv({ ...EU, SUBSUMIO_AI_PROVIDER: undefined }, async () => {
      await expect(
        resolveModel(null, { tier: "subagent", fallback: "anthropic:claude-haiku-4-5" })
      ).rejects.toBeInstanceOf(EuResidencyError);
      // Other tiers are enforced at the gateway call, not at resolution
      // (utility also resolves the embedding model).
      await expect(
        resolveModel(null, { tier: "utility", fallback: "anthropic:claude-haiku-4-5" })
      ).resolves.toBeString();
    });
  });
});
