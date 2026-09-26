/**
 * Live statute lookups against RIS keep the RIS pace (≥ 2 s between
 * requests), like every other RIS access.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchLiveStatuteVersions,
  livePauseMs,
  RIS_LIVE_PAUSE_MS,
} from "../src/lib/statute-live-source.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("live statute lookups — RIS pace", () => {
  test("Austrian lookups wait 2 s between requests, none before the first", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return new Response("{}", { status: 503 });
    }) as unknown as typeof fetch;
    const waits: number[] = [];
    await fetchLiveStatuteVersions("at", ["abgb", "zpo", "mrg"], {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(requests).toBeGreaterThanOrEqual(3);
    expect(waits).toEqual([RIS_LIVE_PAUSE_MS, RIS_LIVE_PAUSE_MS]);
    expect(RIS_LIVE_PAUSE_MS).toBeGreaterThanOrEqual(2_000);
  });

  test("other sources keep a small courtesy gap", () => {
    expect(livePauseMs("de")).toBe(200);
    expect(livePauseMs("at")).toBe(RIS_LIVE_PAUSE_MS);
  });
});
