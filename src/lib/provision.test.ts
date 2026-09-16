// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://localhost:3001",
  engineHeadersForBrain: vi.fn((brainId: string) => ({ "x-subsumio-source": brainId })),
}));

vi.mock("@/lib/industry-pack", () => ({
  packForIndustry: vi.fn((industry?: string | null) =>
    industry === "legal" ? "subsumio-legal" : null
  ),
}));

import { provisionBrain, provisionBrainAsync } from "./provision";

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

  test("mounts skill pack when industry is legal", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // stats
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // skillpack
    // seedWorkflows: 3 workflow pages for legal; demo probe GET returns 404
    // (nothing seeded yet) so the 4 demo seeds run afterwards.
    fetchSpy.mockImplementation((_url, init) => {
      const method = init?.method ?? "GET";
      return Promise.resolve(new Response("{}", { status: method === "GET" ? 404 : 200 }));
    });
    const result = await provisionBrain("brain-1", { industry: "legal" });
    expect(result.ok).toBe(true);
    const skillpackCall = fetchSpy.mock.calls[1];
    expect(skillpackCall[0]).toContain("/api/skillpack/apply");
    // Verify seed calls were made: 3 workflow seeds + 1 Kanzlei defaults +
    // 4 demo-matter seeds (plus one GET for the demo idempotency probe).
    const seedCalls = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes("/api/pages") && c[1]?.method === "POST"
    );
    expect(seedCalls.length).toBe(8);
  });

  test("does not mount skill pack for unknown industry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // stats
    // seedWorkflows still runs for unknown industry (defaults to legal templates);
    // demo probe GET → 404 so demo seeds run.
    fetchSpy.mockImplementation((_url, init) => {
      const method = init?.method ?? "GET";
      return Promise.resolve(new Response("{}", { status: method === "GET" ? 404 : 200 }));
    });
    const result = await provisionBrain("brain-1", { industry: "nonexistent" });
    expect(result.ok).toBe(true);
    // stats + 3 workflow seeds + 1 Kanzlei defaults + demo idempotency GET +
    // 4 demo seeds = 10 total (no skillpack for unknown industry)
    expect(fetchSpy).toHaveBeenCalledTimes(10);
  });

  test("succeeds even if skill pack mounting fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 })); // stats
    fetchSpy.mockRejectedValueOnce(new Error("skillpack fail")); // skillpack error
    fetchSpy.mockResolvedValue(new Response("{}", { status: 200 })); // seed workflow calls
    const result = await provisionBrain("brain-1", { industry: "legal" });
    expect(result.ok).toBe(true);
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
