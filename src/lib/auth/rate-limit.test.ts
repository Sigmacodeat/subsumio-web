// @vitest-environment node

import { describe, test, expect } from "vitest";
import { hit, clientIp } from "./rate-limit";

describe("hit (in-memory)", () => {
  test("allows requests under limit", async () => {
    const result = await hit("test:ip:1.2.3.4", 3, 1000);
    expect(result.ok).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  test("blocks after max exceeded", async () => {
    const key = `test:block:${Date.now()}`;
    await hit(key, 2, 500);
    await hit(key, 2, 500);
    const third = await hit(key, 2, 500);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("window resets after duration", async () => {
    const key = `test:reset:${Date.now()}`;
    await hit(key, 1, 50);
    const blocked = await hit(key, 1, 50);
    expect(blocked.ok).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 100));
    const fresh = await hit(key, 1, 50);
    expect(fresh.ok).toBe(true);
  });

  test("independent keys do not interfere", async () => {
    const base = Date.now();
    await hit(`test:a:${base}`, 1, 1000);
    const b = await hit(`test:b:${base}`, 1, 1000);
    expect(b.ok).toBe(true);
  });
});

describe("clientIp", () => {
  test("extracts from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "9.8.7.6" });
    expect(clientIp(headers)).toBe("9.8.7.6");
  });

  test("returns unknown when no headers", () => {
    const headers = new Headers();
    expect(clientIp(headers)).toBe("unknown");
  });
});
