/**
 * Every OpenRouter request carries data_collection "deny" + zdr (provider
 * preferences), independent of the EU-only switch.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { getRecipe } from "../../src/core/ai/recipes/index.ts";
import { applyOpenRouterPrivacyPreferences } from "../../src/core/ai/recipes/openrouter.ts";

describe("applyOpenRouterPrivacyPreferences", () => {
  test("adds data_collection deny + zdr true", () => {
    const out = applyOpenRouterPrivacyPreferences({ model: "anthropic/claude-sonnet-5" }, {});
    expect(out.provider).toEqual({ data_collection: "deny", zdr: true });
    expect(out.model).toBe("anthropic/claude-sonnet-5");
  });

  test("keeps other caller preferences but forces the two privacy fields", () => {
    const out = applyOpenRouterPrivacyPreferences(
      { provider: { order: ["amazon-bedrock"], data_collection: "allow", zdr: false } },
      {}
    );
    expect(out.provider).toEqual({ order: ["amazon-bedrock"], data_collection: "deny", zdr: true });
  });

  test("SUBSUMIO_OPENROUTER_ZDR=off drops zdr only", () => {
    const out = applyOpenRouterPrivacyPreferences({}, { SUBSUMIO_OPENROUTER_ZDR: "off" });
    expect(out.provider).toEqual({ data_collection: "deny" });
  });
});

function parseMaybe(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

describe("openrouter recipe fetch wrapper", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function capture(): Array<{ url: string; body: any; auth: string | null }> {
    const seen: Array<{ url: string; body: any; auth: string | null }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      seen.push({
        url,
        body: parseMaybe(init?.body),
        auth: new Headers(init?.headers).get("authorization"),
      });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    return seen;
  }

  test("chat and embedding bodies get the preferences (single key, no fallback)", async () => {
    const seen = capture();
    const cfg = getRecipe("openrouter")!.resolveOpenAICompatConfig!({ OPENROUTER_API_KEY: "k" });
    expect(cfg.fetch).toBeDefined();
    await cfg.fetch!("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "anthropic/claude-sonnet-5", messages: [] }),
    });
    await cfg.fetch!("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: ["x"] }),
    });
    expect(seen.map((s) => s.body.provider)).toEqual([
      { data_collection: "deny", zdr: true },
      { data_collection: "deny", zdr: true },
    ]);
  });

  test("key failover on 402 keeps the preferences on the retry", async () => {
    const seen: Array<{ body: any; auth: string | null }> = [];
    let n = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        body: JSON.parse(init!.body as string),
        auth: new Headers(init?.headers).get("authorization"),
      });
      return new Response("{}", { status: n++ === 0 ? 402 : 200 });
    }) as unknown as typeof fetch;
    const cfg = getRecipe("openrouter")!.resolveOpenAICompatConfig!({
      OPENROUTER_API_KEY: "primary",
      OPENROUTER_API_KEY_FALLBACK: "fallback",
    });
    await cfg.fetch!("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer primary" },
      body: JSON.stringify({ model: "m" }),
    });
    expect(seen).toHaveLength(2);
    expect(seen[1].auth).toBe("Bearer fallback");
    expect(seen[1].body.provider).toEqual({ data_collection: "deny", zdr: true });
  });

  test("non-JSON bodies pass through untouched", async () => {
    const seen = capture();
    const cfg = getRecipe("openrouter")!.resolveOpenAICompatConfig!({ OPENROUTER_API_KEY: "k" });
    await cfg.fetch!("https://openrouter.ai/api/v1/x", { method: "POST", body: "not json" });
    expect(seen[0].body).toBe("not json");
  });
});
