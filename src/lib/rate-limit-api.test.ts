// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the underlying rate-limit module
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn(async (_key: string, _max: number, _windowMs: number) => ({
    ok: true,
    retryAfterSeconds: 0,
  })),
}));

import { checkApiRate, requireApiRate, type RateTier } from "./rate-limit-api";
import { hit } from "@/lib/auth/rate-limit";

describe("checkApiRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns ok for standard tier", async () => {
    const result = await checkApiRate("user-1", "standard");
    expect(result.ok).toBe(true);
  });

  test("returns ok for heavy tier", async () => {
    const result = await checkApiRate("user-1", "heavy");
    expect(result.ok).toBe(true);
  });

  test("returns ok for search tier", async () => {
    const result = await checkApiRate("user-1", "search");
    expect(result.ok).toBe(true);
  });

  test("passes correct max and windowMs for standard (120/min)", async () => {
    await checkApiRate("user-1", "standard");
    expect(hit).toHaveBeenCalledWith(expect.any(String), 120, 60_000);
  });

  test("passes correct max and windowMs for heavy (30/min)", async () => {
    await checkApiRate("user-1", "heavy");
    expect(hit).toHaveBeenCalledWith(expect.any(String), 30, 60_000);
  });

  test("passes correct max and windowMs for search (60/min)", async () => {
    await checkApiRate("user-1", "search");
    expect(hit).toHaveBeenCalledWith(expect.any(String), 60, 60_000);
  });

  test("uses key format api:{tier}:{userId}", async () => {
    await checkApiRate("user-123", "heavy");
    expect(hit).toHaveBeenCalledWith("api:heavy:user-123", 30, 60_000);
  });

  test("returns not-ok when rate limit exceeded", async () => {
    vi.mocked(hit).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });
    const result = await checkApiRate("user-1", "standard");
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBe(30);
  });
});

describe("requireApiRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when rate limit ok", async () => {
    const result = await requireApiRate("user-1", "standard");
    expect(result).toBeNull();
  });

  test("returns 429 Response when rate limit exceeded", async () => {
    vi.mocked(hit).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60 });
    const result = await requireApiRate("user-1", "standard");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Retry-After")).toBe("60");
    const body = await result!.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retry_after).toBe(60);
  });
});
