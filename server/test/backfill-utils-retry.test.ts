import { afterEach, describe, expect, test } from "bun:test";
import { fetchWithRetry, retryDelayMs } from "../scripts/backfill-utils.ts";
import { RIS_PAUSE_MS } from "../scripts/ris-pace.ts";

const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
});

describe("retryDelayMs", () => {
  test("after 429 the next attempt waits at least the RIS pause", () => {
    expect(retryDelayMs(429, 0, 1000, null, 0)).toBeGreaterThanOrEqual(RIS_PAUSE_MS);
  });
  test("Retry-After is honoured when longer (seconds or HTTP date)", () => {
    expect(retryDelayMs(429, 0, 1000, "5", 0)).toBe(5000);
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString();
    expect(retryDelayMs(429, 0, 1000, inTenSeconds, 0)).toBeGreaterThanOrEqual(8000);
  });
  test("5xx keeps the plain exponential backoff", () => {
    expect(retryDelayMs(503, 0, 1000, null, 0)).toBe(1000);
    expect(retryDelayMs(503, 2, 1000, null, 0)).toBe(4000);
  });
});

describe("fetchWithRetry after HTTP 429", () => {
  test("waits at least 2 s before the second attempt", async () => {
    const delays: number[] = [];
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return realSetTimeout(fn, 0);
    }) as unknown as typeof setTimeout;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1
        ? new Response("slow down", { status: 429 })
        : new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://data.bka.gv.at/ris/api/v2.6/Bundesrecht", {
      maxRetries: 2,
      timeoutMs: 5_000,
    });
    expect(res?.status).toBe(200);
    expect(calls).toBe(2);
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(RIS_PAUSE_MS);
  });
});
