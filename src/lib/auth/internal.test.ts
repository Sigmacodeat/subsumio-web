// @vitest-environment node
// Audit QA-10: regression tests for the service-to-service secret guards.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";

const hit = vi.fn(async (..._args: unknown[]) => ({ ok: true, retryAfterSeconds: 0 }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: (...args: unknown[]) => hit(...args),
  clientIp: () => "203.0.113.7",
}));

import { hasValidInternalSecret } from "./internal";
import { requireInternalSecret } from "./internal-guard";

const SECRET = "s3cret-internal-value-0123456789";
const original = process.env.SUBSUMIO_INTERNAL_SECRET;

function req(secret?: string): NextRequest {
  const headers = new Headers();
  if (secret !== undefined) headers.set("x-internal-secret", secret);
  return new Request("http://localhost/api/internal/x", { headers }) as unknown as NextRequest;
}

beforeEach(() => {
  process.env.SUBSUMIO_INTERNAL_SECRET = SECRET;
  hit.mockClear();
  hit.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
});
afterEach(() => {
  if (original === undefined) delete process.env.SUBSUMIO_INTERNAL_SECRET;
  else process.env.SUBSUMIO_INTERNAL_SECRET = original;
});

describe("hasValidInternalSecret", () => {
  test("accepts the exact secret", () => {
    expect(hasValidInternalSecret(req(SECRET))).toBe(true);
  });

  test("rejects a missing header, a wrong value and a different length", () => {
    expect(hasValidInternalSecret(req())).toBe(false);
    expect(hasValidInternalSecret(req(SECRET.replace(/.$/, "X")))).toBe(false);
    expect(hasValidInternalSecret(req(`${SECRET}x`))).toBe(false);
    expect(hasValidInternalSecret(req(SECRET.slice(0, 5)))).toBe(false);
  });

  test("an unconfigured (or empty) secret never matches — not even an empty header", () => {
    delete process.env.SUBSUMIO_INTERNAL_SECRET;
    expect(hasValidInternalSecret(req(""))).toBe(false);
    process.env.SUBSUMIO_INTERNAL_SECRET = "";
    expect(hasValidInternalSecret(req(""))).toBe(false);
  });
});

describe("requireInternalSecret", () => {
  test("valid secret → null (proceed)", async () => {
    expect(await requireInternalSecret(req(SECRET))).toBeNull();
  });

  test("wrong secret → 401", async () => {
    const res = await requireInternalSecret(req("nope"));
    expect(res?.status).toBe(401);
  });

  test("rate limit exhausted → 429 before the secret is even compared", async () => {
    hit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });
    const res = await requireInternalSecret(req(SECRET));
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("30");
  });
});
