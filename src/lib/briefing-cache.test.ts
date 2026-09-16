// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn(), getCsrfToken: vi.fn(() => "t") }));
import {
  BRIEFING_CACHE_KEY,
  BRIEFING_CACHE_TTL_MS,
  briefingFromPayload,
  readBriefingCache,
  writeBriefingCache,
  type BriefingResponse,
} from "./briefing-cache";

const sample: BriefingResponse = {
  narrative: "Guten Morgen.",
  data: {
    criticalDeadlines: 2,
    overdueDeadlines: 1,
    inboxItems: 3,
    pendingReviews: 0,
    pendingSignatures: 0,
    openInvoices: 1,
    activeCases: 4,
    unassignedDocs: 0,
    reviewGaps: 0,
    overdueReconciliations: 0,
    followUpsToday: 1,
    topDeadlines: [],
    topCases: [],
  },
  generatedAt: "2026-09-16T06:00:00.000Z",
  usedFallback: false,
};

describe("briefing cache", () => {
  beforeEach(() => localStorage.clear());

  test("round-trips within the TTL and expires after it", () => {
    writeBriefingCache(sample);
    expect(readBriefingCache()?.data.criticalDeadlines).toBe(2);
    expect(readBriefingCache(Date.now() + BRIEFING_CACHE_TTL_MS + 1)).toBeNull();
  });

  test("ignores garbage and entries without stats", () => {
    localStorage.setItem(BRIEFING_CACHE_KEY, "{not json");
    expect(readBriefingCache()).toBeNull();
    localStorage.setItem(
      BRIEFING_CACHE_KEY,
      JSON.stringify({ narrative: "x", cachedAt: new Date().toISOString() })
    );
    expect(readBriefingCache()).toBeNull();
  });

  test("briefingFromPayload unwraps the handler envelope or a bare response", () => {
    expect(briefingFromPayload({ data: sample })?.data.activeCases).toBe(4);
    expect(briefingFromPayload(sample)?.data.activeCases).toBe(4);
    expect(briefingFromPayload({ data: { criticalDeadlines: 1 } })?.data.criticalDeadlines).toBe(1);
    expect(briefingFromPayload(null)).toBeNull();
  });
});

describe("loadBriefing", () => {
  test("serves the cache, otherwise shares one request between concurrent callers", async () => {
    localStorage.clear();
    const { csrfFetch } = await import("@/lib/csrf");
    const spy = vi.mocked(csrfFetch);
    spy.mockImplementation(
      async () => new Response(JSON.stringify({ data: sample }), { status: 200 })
    );
    const { loadBriefing } = await import("./briefing-cache");
    const [a, b] = await Promise.all([loadBriefing("de"), loadBriefing("de")]);
    expect(a?.data.activeCases).toBe(4);
    expect(b).toBe(a);
    expect(spy).toHaveBeenCalledTimes(1);
    // now cached: no request at all
    await loadBriefing("de");
    expect(spy).toHaveBeenCalledTimes(1);
    // force bypasses the cache
    await loadBriefing("de", { force: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
