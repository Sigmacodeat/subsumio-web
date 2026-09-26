/**
 * "Nur EU" per firm: inside the request/job scope every gateway call to a
 * non-EU model is refused (EuResidencyError, nothing sent) — never silently
 * routed elsewhere. The demand is remembered per source and travels with
 * queued jobs.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";
import { __setChatTransportForTests, chat, type ChatResult } from "../src/core/ai/gateway.ts";
import { EuResidencyError } from "../src/core/ai/eu-policy.ts";
import {
  __resetEuSourceCacheForTests,
  isRequestEuOnly,
  jobRunsEuOnly,
  resolveRequestEuOnly,
  runWithRequestEuOnly,
} from "../src/core/ai/request-eu-policy.ts";

const stubResult: ChatResult = {
  text: "ok",
  blocks: [],
  stopReason: "end",
  usage: { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_creation_tokens: 0 },
  model: "stub:stub",
  providerId: "stub",
};

afterEach(() => __setChatTransportForTests(null));

describe("gateway under a firm's EU-only scope", () => {
  it("refuses a non-EU model before anything is sent", async () => {
    let sent = 0;
    __setChatTransportForTests(async () => {
      sent++;
      return stubResult;
    });
    await expect(
      runWithRequestEuOnly(() =>
        chat({
          model: "anthropic:claude-haiku-4-5",
          messages: [{ role: "user", content: "Mandantendaten" }],
        })
      )
    ).rejects.toBeInstanceOf(EuResidencyError);
    expect(sent).toBe(0);
  });

  it("outside the scope the same call goes through (deployment default unchanged)", async () => {
    const prev = process.env.SUBSUMIO_EU_ONLY;
    delete process.env.SUBSUMIO_EU_ONLY;
    let sent = 0;
    __setChatTransportForTests(async () => {
      sent++;
      return stubResult;
    });
    try {
      await chat({
        model: "anthropic:claude-haiku-4-5",
        messages: [{ role: "user", content: "x" }],
      });
      expect(sent).toBe(1);
    } finally {
      if (prev !== undefined) process.env.SUBSUMIO_EU_ONLY = prev;
    }
  });
});

describe("remembered per source", () => {
  const store = new Map<string, string>();
  const cfg = {
    getConfig: async (k: string) => store.get(k) ?? null,
    setConfig: async (k: string, v: string) => void store.set(k, v),
  };
  beforeEach(() => {
    store.clear();
    __resetEuSourceCacheForTests();
  });

  it("header eu_only applies and is remembered; no header inherits; 'any' lifts", async () => {
    expect(await resolveRequestEuOnly(cfg, "firm-a", "eu_only")).toBe(true);
    // Cron / webhook without a session header: still EU-only.
    expect(await resolveRequestEuOnly(cfg, "firm-a", undefined)).toBe(true);
    expect(await resolveRequestEuOnly(cfg, "firm-b", undefined)).toBe(false);
    expect(await resolveRequestEuOnly(cfg, "firm-a", "any")).toBe(false);
    expect(await resolveRequestEuOnly(cfg, "firm-a", undefined)).toBe(false);
  });
});

describe("queued jobs carry the demand", () => {
  let engine: PGLiteEngine;
  beforeAll(async () => {
    engine = new PGLiteEngine();
    await engine.connect({ database_url: "" });
    await engine.initSchema();
  }, 60_000);
  afterAll(async () => {
    await engine.disconnect();
  });
  beforeEach(() => __resetEuSourceCacheForTests());

  it("a job queued inside the scope is stamped and runs EU-only", async () => {
    const queue = new MinionQueue(engine);
    const job = await runWithRequestEuOnly(() =>
      queue.add("noop-eu-test", { _source_id: "firm-x" })
    );
    expect((job.data as Record<string, unknown>)._eu_only).toBe(true);
    expect(await jobRunsEuOnly(engine, job.data)).toBe(true);
    expect(isRequestEuOnly()).toBe(false);
  });

  it("a job of a remembered EU-only source runs EU-only even without a stamp", async () => {
    await resolveRequestEuOnly(engine, "firm-y", "eu_only");
    expect(await jobRunsEuOnly(engine, { _source_id: "firm-y" })).toBe(true);
    expect(await jobRunsEuOnly(engine, { _source_id: "firm-z" })).toBe(false);
  });
});
