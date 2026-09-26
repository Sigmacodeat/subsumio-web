import { describe, expect, test } from "bun:test";

describe("ris-proxy: RIS is always called directly", () => {
  test("a configured RIS_PROXY_URLS has no effect", async () => {
    const prev = process.env.RIS_PROXY_URLS;
    process.env.RIS_PROXY_URLS =
      "http://user:pass@proxy.example.test:8080,http://p2.example.test:8080";
    process.env.RIS_PROXY_CONCURRENCY = "10";
    try {
      const mod = await import(`../scripts/ris-proxy.ts?fresh=${Date.now()}`);
      expect(mod.proxyFetchOptions()).toEqual({});
      expect(mod.recommendedConcurrency()).toBe(1);
      expect(Object.keys(mod).sort()).toEqual([
        "getUserAgent",
        "proxyFetchOptions",
        "recommendedConcurrency",
      ]);
    } finally {
      if (prev === undefined) delete process.env.RIS_PROXY_URLS;
      else process.env.RIS_PROXY_URLS = prev;
      delete process.env.RIS_PROXY_CONCURRENCY;
    }
  });
});
