/**
 * RIS-OGD live lookups honour the terms of use: one request at a time, at
 * least two seconds apart, and never triggered by a remote (MCP) caller.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { dispatchToolCall } from "../src/mcp/dispatch.ts";
import { RIS_MIN_INTERVAL_MS, fetchRisOgdStatuteVersion } from "../src/lib/statute-live-source.ts";

const realFetch = globalThis.fetch;
let starts: number[] = [];
let inFlight = 0;
let maxInFlight = 0;

function stubFetch() {
  starts = [];
  inFlight = 0;
  maxInFlight = 0;
  globalThis.fetch = (async () => {
    starts.push(Date.now());
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 20));
    inFlight--;
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

let engine: PGLiteEngine;
beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 120_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  await engine?.disconnect();
});

describe("RIS-OGD live lookups", () => {
  test("parallel callers are serialised with the minimum spacing", async () => {
    stubFetch();
    await Promise.all([fetchRisOgdStatuteVersion("ABGB"), fetchRisOgdStatuteVersion("StGB")]);
    expect(starts).toHaveLength(2);
    expect(maxInFlight).toBe(1);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(RIS_MIN_INTERVAL_MS - 5);
  }, 20_000);

  test("a remote caller cannot trigger a live comparison", async () => {
    stubFetch();
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ('law-at', 'law-at', '{}'::jsonb) ON CONFLICT (id) DO NOTHING`
    );
    await engine.executeRaw(`UPDATE sources SET jurisdiction = 'at' WHERE id = 'law-at'`);
    await engine.putPage(
      "legal/statutes/at/abgb/p1",
      {
        type: "law",
        title: "§ 1 ABGB",
        compiled_truth: "Text",
        frontmatter: { version_date: "2020-01-01" },
      } as never,
      { sourceId: "law-at" }
    );
    await dispatchToolCall(
      engine,
      "statute_currency_check",
      { jurisdiction: "at", compare_live: true },
      { remote: true, sourceId: "law-at" }
    );
    expect(starts).toHaveLength(0);
    // Control: the same call from a trusted local caller does look it up.
    await dispatchToolCall(
      engine,
      "statute_currency_check",
      { jurisdiction: "at", compare_live: true },
      { remote: false, sourceId: "law-at" }
    );
    expect(starts.length).toBeGreaterThan(0);
  });
});
