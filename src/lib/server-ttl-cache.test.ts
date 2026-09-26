// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createTtlCache, headersCacheKey } from "./server-ttl-cache";

function token(payload: Record<string, unknown>): string {
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

describe("createTtlCache", () => {
  test("concurrent gets share one load; the value is reused within the TTL", async () => {
    const cache = createTtlCache<number>(60_000);
    const load = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    const [a, b] = await Promise.all([cache.get("k", load), cache.get("k", load)]);
    expect([a, b]).toEqual([42, 42]);
    expect(await cache.get("k", load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("a failed load is not cached", async () => {
    const cache = createTtlCache<number>(60_000);
    await expect(cache.get("k", async () => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(await cache.get("k", async () => 1)).toBe(1);
  });
});

describe("headersCacheKey", () => {
  test("ignores the token expiry, request id and API key — not the identity", () => {
    const a = headersCacheKey({
      "x-subsumio-source": "b1",
      "x-subsumio-api-key": "secret",
      "x-request-id": "r1",
      "x-subsumio-identity-token": token({ sourceId: "b1", userId: "u1", exp: 1 }),
    });
    const b = headersCacheKey({
      "x-subsumio-source": "b1",
      "x-request-id": "r2",
      "x-subsumio-identity-token": token({ sourceId: "b1", userId: "u1", exp: 2 }),
    });
    const other = headersCacheKey({
      "x-subsumio-source": "b1",
      "x-subsumio-identity-token": token({ sourceId: "b1", userId: "u2", exp: 1 }),
    });
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    expect(a).not.toContain("secret");
  });
});
