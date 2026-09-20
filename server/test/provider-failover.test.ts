/**
 * Provider failover: a Claude call on Anthropic's API that fails for account
 * or availability reasons is retried once on the same model via OpenRouter;
 * request errors are not. Hermetic via __setChatTransportForTests.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  __setChatTransportForTests,
  chat,
  type ChatResult,
} from "../src/core/ai/gateway.ts";
import {
  isProviderFailure,
  openRouterEquivalent,
  providerFailoverModel,
} from "../src/core/ai/provider-failover.ts";

const KEYED = { OPENROUTER_API_KEY: "sk-or-test" } as NodeJS.ProcessEnv;

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe("openRouterEquivalent", () => {
  test("maps current Claude models to their OpenRouter slugs", () => {
    expect(openRouterEquivalent("anthropic:claude-sonnet-5")).toBe("openrouter:anthropic/claude-sonnet-5");
    expect(openRouterEquivalent("anthropic:claude-opus-5")).toBe("openrouter:anthropic/claude-opus-5");
    expect(openRouterEquivalent("anthropic:claude-fable-5-1")).toBe("openrouter:anthropic/claude-fable-5.1");
    expect(openRouterEquivalent("anthropic:claude-haiku-4-5")).toBe("openrouter:anthropic/claude-haiku-4.5");
    expect(openRouterEquivalent("anthropic:claude-haiku-4-5-20251001")).toBe(
      "openrouter:anthropic/claude-haiku-4.5"
    );
  });

  test("no counterpart for other providers or already-OpenRouter models", () => {
    expect(openRouterEquivalent("openrouter:anthropic/claude-sonnet-5")).toBeNull();
    expect(openRouterEquivalent("mistral:mistral-large-3")).toBeNull();
    expect(openRouterEquivalent("openai:gpt-5")).toBeNull();
  });
});

describe("isProviderFailure", () => {
  test("account and availability failures fail over", () => {
    expect(isProviderFailure(apiError(400, "Your credit balance is too low to access the Anthropic API."))).toBe(true);
    expect(isProviderFailure(apiError(401, "invalid x-api-key"))).toBe(true);
    expect(isProviderFailure(apiError(429, "rate_limit_error"))).toBe(true);
    expect(isProviderFailure(apiError(529, "overloaded_error"))).toBe(true);
    expect(isProviderFailure(apiError(503, "service unavailable"))).toBe(true);
    expect(isProviderFailure(new Error("fetch failed: ECONNRESET"))).toBe(true);
  });

  test("the status is found on a wrapped cause (normalizeAIError)", () => {
    const wrapped = Object.assign(new Error("[chat(anthropic:claude-sonnet-5)] credit"), {
      cause: apiError(400, "Your credit balance is too low"),
    });
    expect(isProviderFailure(wrapped)).toBe(true);
  });

  test("request errors and our own cancellation do not", () => {
    expect(isProviderFailure(apiError(400, "messages: prefill not supported"))).toBe(false);
    expect(isProviderFailure(apiError(404, "model not found"))).toBe(false);
    expect(isProviderFailure(apiError(422, "invalid tool schema"))).toBe(false);
    expect(isProviderFailure(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
  });
});

describe("providerFailoverModel", () => {
  const credit = apiError(400, "Your credit balance is too low");

  test("needs an OpenRouter key and can be switched off", () => {
    expect(providerFailoverModel("anthropic:claude-sonnet-5", credit, KEYED)).toBe(
      "openrouter:anthropic/claude-sonnet-5"
    );
    expect(providerFailoverModel("anthropic:claude-sonnet-5", credit, {} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      providerFailoverModel("anthropic:claude-sonnet-5", credit, {
        ...KEYED,
        GBRAIN_PROVIDER_FAILOVER: "off",
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });
});

describe("chat() provider failover", () => {
  const saved = process.env.OPENROUTER_API_KEY;
  const calls: string[] = [];
  const ok = (model: string): ChatResult =>
    ({ text: `answer from ${model}`, model, stopReason: "end", usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as ChatResult;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    calls.length = 0;
  });
  afterEach(() => {
    __setChatTransportForTests(null);
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  });

  test("empty Anthropic balance → same model via OpenRouter, answer returned", async () => {
    __setChatTransportForTests(async (opts) => {
      calls.push(opts.model!);
      if (opts.model!.startsWith("anthropic:")) throw apiError(400, "Your credit balance is too low");
      return ok(opts.model!);
    });
    const res = await chat({ model: "anthropic:claude-haiku-4-5", messages: [{ role: "user", content: "Hallo" }] });
    expect(calls).toEqual(["anthropic:claude-haiku-4-5", "openrouter:anthropic/claude-haiku-4.5"]);
    expect(res.text).toBe("answer from openrouter:anthropic/claude-haiku-4.5");
  });

  test("a request error is not retried elsewhere", async () => {
    __setChatTransportForTests(async (opts) => {
      calls.push(opts.model!);
      throw apiError(400, "messages: prefill not supported");
    });
    await expect(
      chat({ model: "anthropic:claude-haiku-4-5", messages: [{ role: "user", content: "Hallo" }] })
    ).rejects.toThrow("prefill");
    expect(calls).toEqual(["anthropic:claude-haiku-4-5"]);
  });

  test("tries OpenRouter once; if that fails too, its error surfaces", async () => {
    __setChatTransportForTests(async (opts) => {
      calls.push(opts.model!);
      throw apiError(503, "service unavailable");
    });
    await expect(
      chat({ model: "anthropic:claude-sonnet-5", messages: [{ role: "user", content: "Hallo" }] })
    ).rejects.toThrow();
    expect(calls).toEqual(["anthropic:claude-sonnet-5", "openrouter:anthropic/claude-sonnet-5"]);
  });
});
