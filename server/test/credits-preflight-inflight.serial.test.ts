import { afterEach, describe, expect, test } from "bun:test";
import { _resetCreditsHealthCache, getCreditsHealth } from "../src/core/ai/credits-preflight.ts";

const realFetch = globalThis.fetch;
const saved = {
  a: process.env.ANTHROPIC_API_KEY,
  o: process.env.OPENROUTER_API_KEY,
  f: process.env.OPENROUTER_API_KEY_FALLBACK,
};
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of [
    ["ANTHROPIC_API_KEY", saved.a],
    ["OPENROUTER_API_KEY", saved.o],
    ["OPENROUTER_API_KEY_FALLBACK", saved.f],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  _resetCreditsHealthCache();
});

describe("getCreditsHealth", () => {
  test("parallel callers share one paid provider check", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY_FALLBACK;
    _resetCreditsHealthCache();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return Response.json({ id: "msg", content: [] }, { status: 200 });
    }) as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      getCreditsHealth(),
      getCreditsHealth(),
      getCreditsHealth(),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // Cached afterwards: no further call.
    await getCreditsHealth();
    expect(calls).toBe(1);
  });
});
