// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://localhost:3001",
  engineHeadersForBrain: vi.fn((brainId: string) => ({ "x-subsumio-source": brainId })),
  // Delegate to global fetch so fetchSpy assertions still observe the writes.
  engineWriteOrThrow: vi.fn(
    async (
      headers: Record<string, string>,
      body: Record<string, unknown>,
      opts?: { path?: string; timeoutMs?: number }
    ) => {
      const res = await fetch(`http://localhost:3001${opts?.path ?? "/api/pages"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 30_000),
      });
      if (!res.ok) throw new Error(`Engine write failed: HTTP ${res.status}`);
      return res;
    }
  ),
}));

vi.mock("@/lib/industry-pack", () => ({
  packForIndustry: vi.fn((industry?: string | null) =>
    industry === "legal" ? "subsumio-legal" : null
  ),
}));

import { provisionBrain, provisionBrainAsync } from "./provision";
import { demoMatterPages } from "@/content/demo-matter";

const DEMO_LIVE_COUNT = demoMatterPages().filter((p) => p.frontmatter.demo_stage === "live").length;

describe("provisionBrain", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns ok:true on successful stats call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // stats
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 })); // seed workflows
    const result = await provisionBrain("brain-1");
    expect(result.ok).toBe(true);
    expect(result.brainId).toBe("brain-1");
  });

  test("returns ok:true on 404 (source not yet created)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("not found", { status: 404 })); // stats
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 })); // seed workflows
    const result = await provisionBrain("brain-1");
    expect(result.ok).toBe(true);
  });

  test("seeds workflows, Kanzlei defaults and the demo matter for legal", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // stats
    // demo probe GET returns 404 (nothing seeded yet) so the demo seeds run.
    fetchSpy.mockImplementation((_url, init) => {
      const method = init?.method ?? "GET";
      return Promise.resolve(new Response("{}", { status: method === "GET" ? 404 : 200 }));
    });
    const result = await provisionBrain("brain-1", { industry: "legal" });
    expect(result.ok).toBe(true);
    // The engine has no skill-pack route — provisioning must not call it.
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/skillpack"))).toBe(false);
    // 3 workflow seeds + 1 Kanzlei defaults + live demo-matter seeds.
    const seedCalls = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes("/api/pages") && c[1]?.method === "POST"
    );
    expect(seedCalls.length).toBe(4 + DEMO_LIVE_COUNT);
  });

  test("unknown industry provisions the same legal defaults", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // stats
    fetchSpy.mockImplementation((_url, init) => {
      const method = init?.method ?? "GET";
      return Promise.resolve(new Response("{}", { status: method === "GET" ? 404 : 200 }));
    });
    const result = await provisionBrain("brain-1", { industry: "nonexistent" });
    expect(result.ok).toBe(true);
    // stats + 3 workflow seeds + 1 Kanzlei defaults + demo idempotency GET +
    // live demo seeds
    expect(fetchSpy).toHaveBeenCalledTimes(6 + DEMO_LIVE_COUNT);
  });

  test("returns ok:false on non-200/non-404 after retries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 500 }));
    const promise = provisionBrain("brain-1");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  test("returns ok:false on network error after retries", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const promise = provisionBrain("brain-1");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network");
  });

  test("includes brainId in result on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));
    const promise = provisionBrain("brain-99");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.brainId).toBe("brain-99");
  });
});

describe("provisionBrainAsync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("returns void immediately (fire-and-forget)", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const result = provisionBrainAsync("brain-1");
    expect(result).toBeUndefined();
  });

  test("does not throw on error (catches internally)", () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));
    expect(() => provisionBrainAsync("brain-1")).not.toThrow();
  });
});
