/**
 * Tests für credits-preflight.ts — Provider Credits Pre-Flight Check.
 *
 * Deckt ab:
 *   1. pingAnthropic / pingOpenRouter mit mocked fetch
 *   2. Retry-Logic (transient errors → retry, definitive → no retry)
 *   3. Cache (60s TTL, inject + reset)
 *   4. assertProviderCredits (throws bei depleted, passes bei ok)
 *   5. Alert throttle (1h cooldown per provider)
 *   6. checkAllProviders (not_configured bei missing env vars)
 *   7. Error handling (network error, timeout, 5xx, 401, 429, 402)
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  getCreditsHealth,
  assertProviderCredits,
  __test,
  type CreditsHealthResult,
  type ProviderHealth,
} from "../../src/core/ai/credits-preflight.ts";

// Helper: create a mock Response
const mockResponse = (status: number, body: string, ok?: boolean): Response => {
  const res = {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
  return res;
};

// Helper: create a mock fetch that returns different responses per call
const createMockFetch = (responses: Array<Response | Error>): typeof fetch => {
  let callIndex = 0;
  return mock((_url: string | URL | Request, _init?: RequestInit) => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
};

const originalFetch = globalThis.fetch;

describe("credits-preflight", () => {
  beforeEach(() => {
    __test.resetCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY_FALLBACK;
    delete process.env.ADMIN_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.CREDITS_ALERT_WEBHOOK_URL;
  });

  // ── pingAnthropic ──────────────────────────────────────────────────

  describe("pingAnthropic", () => {
    it("returns ok on HTTP 200", async () => {
      globalThis.fetch = createMockFetch([mockResponse(200, "{}")]);
      process.env.ANTHROPIC_API_KEY = "test-key";
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("ok");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns depleted on 'credit balance is too low'", async () => {
      globalThis.fetch = createMockFetch([
        mockResponse(400, '{"error": "credit balance is too low"}'),
      ]);
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("depleted");
      expect(result.error).toContain("Credit balance too low");
    });

    it("returns error on 401 (invalid key)", async () => {
      globalThis.fetch = createMockFetch([mockResponse(401, '{"error": "invalid key"}')]);
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("error");
      expect(result.error).toBe("Invalid API key");
    });

    it("returns ok on 429 (rate limited but credits OK)", async () => {
      globalThis.fetch = createMockFetch([mockResponse(429, '{"error": "rate limited"}')]);
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("ok");
      expect(result.error).toContain("Rate limited");
    });

    it("retries on 5xx then succeeds", async () => {
      globalThis.fetch = createMockFetch([
        mockResponse(503, "Service Unavailable"),
        mockResponse(200, "{}"),
      ]);
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("ok");
    });

    it("retries on network error then succeeds", async () => {
      globalThis.fetch = createMockFetch([new Error("ECONNRESET"), mockResponse(200, "{}")]);
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("ok");
    });

    it("gives up after MAX_RETRIES on persistent 5xx", async () => {
      globalThis.fetch = createMockFetch([
        mockResponse(503, "Service Unavailable"),
        mockResponse(503, "Service Unavailable"),
        mockResponse(503, "Service Unavailable"),
      ]);
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("error");
      expect(result.error).toContain("503");
    });

    it("does NOT retry on depleted (definitive)", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        return Promise.resolve(mockResponse(400, "credit balance is too low"));
      }) as unknown as typeof fetch;
      const result = await __test.pingAnthropic("test-key");
      expect(result.status).toBe("depleted");
      expect(callCount).toBe(1); // no retry
    });
  });

  // ── pingOpenRouter ─────────────────────────────────────────────────

  describe("pingOpenRouter", () => {
    it("returns depleted on HTTP 402", async () => {
      globalThis.fetch = createMockFetch([mockResponse(402, '{"error": "Insufficient credits"}')]);
      const result = await __test.pingOpenRouter("test-key");
      expect(result.status).toBe("depleted");
      expect(result.error).toContain("Insufficient credits");
    });

    it("returns depleted on 'Insufficient credits' in body", async () => {
      globalThis.fetch = createMockFetch([
        mockResponse(400, "Error: Insufficient credits for this request"),
      ]);
      const result = await __test.pingOpenRouter("test-key");
      expect(result.status).toBe("depleted");
    });

    it("returns ok on HTTP 200", async () => {
      globalThis.fetch = createMockFetch([mockResponse(200, "{}")]);
      const result = await __test.pingOpenRouter("test-key");
      expect(result.status).toBe("ok");
    });
  });

  // ── pingWithRetry ──────────────────────────────────────────────────

  describe("pingWithRetry", () => {
    it("retries up to MAX_RETRIES times", async () => {
      let calls = 0;
      const fn = async (): Promise<ProviderHealth> => {
        calls++;
        return { status: "error", latencyMs: 0, error: "network error" };
      };
      await __test.pingWithRetry(fn);
      expect(calls).toBe(__test.MAX_RETRIES + 1); // initial + retries
    });

    it("does not retry on ok", async () => {
      let calls = 0;
      const fn = async (): Promise<ProviderHealth> => {
        calls++;
        return { status: "ok", latencyMs: 0 };
      };
      await __test.pingWithRetry(fn);
      expect(calls).toBe(1);
    });

    it("does not retry on depleted", async () => {
      let calls = 0;
      const fn = async (): Promise<ProviderHealth> => {
        calls++;
        return { status: "depleted", latencyMs: 0, error: "empty" };
      };
      await __test.pingWithRetry(fn);
      expect(calls).toBe(1);
    });

    it("does not retry on 'Invalid API key' (definitive 401)", async () => {
      let calls = 0;
      const fn = async (): Promise<ProviderHealth> => {
        calls++;
        return { status: "error", latencyMs: 0, error: "Invalid API key" };
      };
      await __test.pingWithRetry(fn);
      expect(calls).toBe(1);
    });
  });

  // ── getCreditsHealth (cache) ───────────────────────────────────────

  describe("getCreditsHealth cache", () => {
    it("returns cached result within TTL", async () => {
      const cached: CreditsHealthResult = {
        providers: { anthropic: { status: "ok", latencyMs: 50 } },
        allOk: true,
        checkedAt: "2024-01-01T00:00:00.000Z",
      };
      __test.injectCachedResult(cached);

      // Even without env vars or fetch, should return cached
      const result = await getCreditsHealth();
      expect(result).toEqual(cached);
    });

    it("calls checkAllProviders when cache is empty", async () => {
      // No env vars → not_configured for both
      const result = await getCreditsHealth();
      expect(result.providers.anthropic?.status).toBe("not_configured");
      expect(result.providers.openrouter?.status).toBe("not_configured");
      expect(result.allOk).toBe(true);
    });
  });

  // ── assertProviderCredits ──────────────────────────────────────────

  describe("assertProviderCredits", () => {
    it("passes when all providers ok", async () => {
      __test.injectCachedResult({
        providers: {
          anthropic: { status: "ok", latencyMs: 50 },
          openrouter: { status: "ok", latencyMs: 100 },
        },
        allOk: true,
        checkedAt: "2024-01-01T00:00:00.000Z",
      });
      await expect(assertProviderCredits()).resolves.toBeUndefined();
    });

    it("passes when providers not_configured", async () => {
      __test.injectCachedResult({
        providers: {
          anthropic: { status: "not_configured", latencyMs: null },
          openrouter: { status: "not_configured", latencyMs: null },
        },
        allOk: true,
        checkedAt: "2024-01-01T00:00:00.000Z",
      });
      await expect(assertProviderCredits()).resolves.toBeUndefined();
    });

    it("throws on depleted provider", async () => {
      __test.injectCachedResult({
        providers: {
          anthropic: { status: "depleted", latencyMs: 50, error: "Credit balance too low" },
          openrouter: { status: "ok", latencyMs: 100 },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      });
      await expect(assertProviderCredits()).rejects.toThrow("Pre-Flight Check");
    });

    it("throws on error provider", async () => {
      __test.injectCachedResult({
        providers: {
          anthropic: { status: "ok", latencyMs: 50 },
          openrouter: { status: "error", latencyMs: null, error: "Timeout" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      });
      await expect(assertProviderCredits()).rejects.toThrow("Pre-Flight Check");
    });

    it("error message includes topup URL", async () => {
      __test.injectCachedResult({
        providers: {
          anthropic: { status: "depleted", latencyMs: 50, error: "Credit balance too low" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      });
      try {
        await assertProviderCredits(["anthropic"]);
        expect(false).toBe(true); // should throw
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).toContain("console.anthropic.com");
      }
    });

    it("only checks requiredProviders when specified", async () => {
      __test.injectCachedResult({
        providers: {
          anthropic: { status: "ok", latencyMs: 50 },
          openrouter: { status: "depleted", latencyMs: 100, error: "Insufficient credits" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      });
      // Only require anthropic → should pass despite openrouter depleted
      await expect(assertProviderCredits(["anthropic"])).resolves.toBeUndefined();
    });
  });

  // ── Alert Throttle ─────────────────────────────────────────────────

  describe("sendCreditsAlert throttle", () => {
    it("sends alert for first occurrence", async () => {
      const health: CreditsHealthResult = {
        providers: {
          anthropic: { status: "depleted", latencyMs: 50, error: "empty" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      };
      await __test.sendCreditsAlert(health);
      expect(__test.getLastAlertSent("anthropic")).toBeDefined();
    });

    it("skips alert within cooldown period", async () => {
      // Pre-set last alert to now
      __test.setLastAlertSent("anthropic", Date.now());

      const health: CreditsHealthResult = {
        providers: {
          anthropic: { status: "depleted", latencyMs: 50, error: "empty" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      };
      const before = __test.getLastAlertSent("anthropic");
      await __test.sendCreditsAlert(health);
      const after = __test.getLastAlertSent("anthropic");
      // Should not update (throttled)
      expect(after).toBe(before);
    });

    it("sends alert after cooldown expires", async () => {
      // Set last alert to 2h ago (past cooldown)
      __test.setLastAlertSent("anthropic", Date.now() - 2 * 60 * 60 * 1000);

      const health: CreditsHealthResult = {
        providers: {
          anthropic: { status: "depleted", latencyMs: 50, error: "empty" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      };
      const before = __test.getLastAlertSent("anthropic");
      await __test.sendCreditsAlert(health);
      const after = __test.getLastAlertSent("anthropic");
      expect(after).toBeDefined();
      expect(after!).toBeGreaterThan(before!);
    });

    it("handles multiple providers independently", async () => {
      const health: CreditsHealthResult = {
        providers: {
          anthropic: { status: "depleted", latencyMs: 50, error: "empty" },
          openrouter: { status: "error", latencyMs: null, error: "timeout" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      };
      await __test.sendCreditsAlert(health);
      expect(__test.getLastAlertSent("anthropic")).toBeDefined();
      expect(__test.getLastAlertSent("openrouter")).toBeDefined();
    });

    it("skips alert for ok providers", async () => {
      const health: CreditsHealthResult = {
        providers: {
          anthropic: { status: "ok", latencyMs: 50 },
          openrouter: { status: "depleted", latencyMs: 100, error: "empty" },
        },
        allOk: false,
        checkedAt: "2024-01-01T00:00:00.000Z",
      };
      await __test.sendCreditsAlert(health);
      expect(__test.getLastAlertSent("anthropic")).toBeUndefined();
      expect(__test.getLastAlertSent("openrouter")).toBeDefined();
    });
  });
});
