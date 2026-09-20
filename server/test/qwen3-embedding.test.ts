/**
 * Qwen3-Embedding support: the configured width reaches the provider, and
 * the retrieval instruction is put in front of queries but never documents.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  configureGateway,
  resetGateway,
  embed,
  embedQuery,
  __setEmbedTransportForTests,
} from "../src/core/ai/gateway.ts";
import { dimsProviderOptions, qwen3EmbeddingMaxDim } from "../src/core/ai/dims.ts";
import { queryInstructionFor } from "../src/core/ai/embedding-instructions.ts";

function configureQwen() {
  configureGateway({
    embedding_model: "openrouter:qwen/qwen3-embedding-8b",
    embedding_dimensions: 1536,
    env: { OPENROUTER_API_KEY: "sk-fake" },
  });
}

function capture() {
  const seen: { values: string[]; providerOptions: any }[] = [];
  __setEmbedTransportForTests((async (args: any) => {
    seen.push({ values: args.values, providerOptions: args.providerOptions });
    return {
      embeddings: args.values.map(() => Array.from({ length: 1536 }, () => 0.01)),
    };
  }) as any);
  return seen;
}

afterEach(() => {
  __setEmbedTransportForTests(null);
  resetGateway();
});

describe("Qwen3-Embedding dimensions", () => {
  test("knows each size's native width", () => {
    expect(qwen3EmbeddingMaxDim("qwen/qwen3-embedding-8b")).toBe(4096);
    expect(qwen3EmbeddingMaxDim("qwen/qwen3-embedding-4b")).toBe(2560);
    expect(qwen3EmbeddingMaxDim("Qwen3-Embedding-0.6B")).toBe(1024);
    expect(qwen3EmbeddingMaxDim("openai/text-embedding-3-small")).toBeNull();
  });

  test("sends the configured width", () => {
    expect(dimsProviderOptions("openai-compatible", "qwen/qwen3-embedding-8b", 1536)).toEqual({
      openaiCompatible: { dimensions: 1536 },
    });
  });

  test("rejects a width the model cannot produce", () => {
    expect(() => dimsProviderOptions("openai-compatible", "qwen/qwen3-embedding-4b", 3072)).toThrow(
      /32\.\.2560/
    );
  });
});

describe("Qwen3-Embedding query instruction", () => {
  test("only Qwen3-Embedding models get one", () => {
    expect(queryInstructionFor("qwen/qwen3-embedding-8b")).toMatch(/^Instruct: .*\nQuery: $/);
    expect(queryInstructionFor("text-embedding-3-small")).toBeNull();
  });

  test("queries carry the instruction", async () => {
    configureQwen();
    const seen = capture();
    await embedQuery("Wie lange gilt die Gewährleistung beim Gebrauchtwagen?");
    expect(seen[0]!.values[0]).toStartWith("Instruct: ");
    expect(seen[0]!.values[0]).toEndWith(
      "Query: Wie lange gilt die Gewährleistung beim Gebrauchtwagen?"
    );
    expect(seen[0]!.providerOptions?.openaiCompatible?.dimensions).toBe(1536);
  });

  test("documents stay bare", async () => {
    configureQwen();
    const seen = capture();
    await embed(["§ 933 ABGB — Gewährleistungsfristen"]);
    expect(seen[0]!.values[0]).toBe("§ 933 ABGB — Gewährleistungsfristen");
  });
});
