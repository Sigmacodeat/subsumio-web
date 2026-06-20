// @vitest-environment node

import { describe, test, expect, vi } from "vitest";
import {
  withRetry,
  fetchWithRetry,
  RetryableError,
  PermanentError,
  type RetryOptions,
} from "./retry";

describe("withRetry — success cases", () => {
  test("returns result on first success", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("returns result after retries succeed", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new RetryableError("transient");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("returns numeric result", async () => {
    const fn = async () => 42;
    const result = await withRetry(fn);
    expect(result).toBe(42);
  });

  test("returns object result", async () => {
    const fn = async () => ({ data: "test" });
    const result = await withRetry(fn);
    expect(result.data).toBe("test");
  });
});

describe("withRetry — retryable errors", () => {
  test("retries on RetryableError", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new RetryableError("retry me");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("retries on ECONNRESET error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("ECONNRESET: connection reset");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("retries on ETIMEDOUT error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("ETIMEDOUT: timeout");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  test("retries on fetch failed error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("fetch failed");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  test("retries on HTTP 500 in error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("HTTP 500: Internal Server Error");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  test("retries on HTTP 429 in error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("HTTP 429: Too Many Requests");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  test("exhausts maxRetries then throws", async () => {
    const fn = vi.fn(async () => {
      throw new RetryableError("always fails");
    });
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe("withRetry — permanent errors", () => {
  test("does not retry on PermanentError", async () => {
    const fn = vi.fn(async () => {
      throw new PermanentError("don't retry");
    });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow("don't retry");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("does not retry on HTTP 404 (not in retryable statuses)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("HTTP 404: Not Found");
    });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("does not retry on generic Error without retryable signal", async () => {
    const fn = vi.fn(async () => {
      throw new Error("something went wrong");
    });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow("something went wrong");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("does not retry on HTTP 400", async () => {
    const fn = vi.fn(async () => {
      throw new Error("HTTP 400: Bad Request");
    });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withRetry — onRetry callback", () => {
  test("onRetry is called with attempt number, error, and delay", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new RetryableError("retry");
      return "ok";
    });
    const onRetry = vi.fn();
    await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), expect.any(Number));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), expect.any(Number));
  });

  test("onRetry is not called on success", async () => {
    const fn = async () => "ok";
    const onRetry = vi.fn();
    await withRetry(fn, { onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("onRetry is not called on permanent error", async () => {
    const fn = async () => { throw new PermanentError("nope"); };
    const onRetry = vi.fn();
    await expect(withRetry(fn, { onRetry })).rejects.toThrow("nope");
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe("withRetry — custom retryableStatuses", () => {
  test("custom retryableStatuses includes 418", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("HTTP 418: I'm a teapot");
      return "ok";
    });
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      retryableStatuses: [418],
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("withRetry — maxRetries = 0", () => {
  test("no retries, throws immediately on retryable error", async () => {
    const fn = vi.fn(async () => {
      throw new RetryableError("fail");
    });
    await expect(withRetry(fn, { maxRetries: 0, baseDelayMs: 1 })).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("no retries, succeeds on first try", async () => {
    const fn = async () => "ok";
    const result = await withRetry(fn, { maxRetries: 0 });
    expect(result).toBe("ok");
  });
});

describe("fetchWithRetry", () => {
  test("returns response on success", async () => {
    global.fetch = vi.fn(async () =>
      new Response("ok", { status: 200 }),
    ) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  test("retries on 500 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response("err", { status: 500 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  test("does not retry on 404 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    await expect(fetchWithRetry("https://example.com")).rejects.toThrow("404");
    expect(calls).toBe(1);
  });

  test("does not retry on 400 status", async () => {
    global.fetch = vi.fn(async () =>
      new Response("bad", { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(fetchWithRetry("https://example.com")).rejects.toThrow("400");
  });

  test("retries on 429 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("rate", { status: 429 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("retries on 503 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("unavail", { status: 503 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
  });

  test("exhausts retries on persistent 500", async () => {
    global.fetch = vi.fn(async () =>
      new Response("err", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      fetchWithRetry("https://example.com", undefined, { maxRetries: 2, baseDelayMs: 1 }),
    ).rejects.toThrow("500");
  });
});

describe("RetryableError and PermanentError", () => {
  test("RetryableError is an Error with correct name", () => {
    const err = new RetryableError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RetryableError");
    expect(err.message).toBe("test");
  });

  test("PermanentError is an Error with correct name", () => {
    const err = new PermanentError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PermanentError");
    expect(err.message).toBe("test");
  });
});

// ── Additional retryable error patterns ─────────────────────────────────

describe("withRetry — additional retryable patterns", () => {
  test("retries on ENOTFOUND error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("ENOTFOUND: dns lookup failed");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("retries on 'network' keyword in error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("network error occurred");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  test("retries on HTTP 502 in error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("HTTP 502: Bad Gateway");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });

  test("retries on HTTP 504 in error message", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error("HTTP 504: Gateway Timeout");
      return "ok";
    });
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
  });
});

// ── fetchWithRetry: additional status codes ─────────────────────────────

describe("fetchWithRetry — additional status codes", () => {
  test("retries on 502 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("bad gateway", { status: 502 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("retries on 504 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("timeout", { status: 504 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
  });

  test("does not retry on 401 status", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch;
    await expect(fetchWithRetry("https://example.com")).rejects.toThrow("401");
    expect(calls).toBe(1);
  });

  test("does not retry on 403 status", async () => {
    global.fetch = vi.fn(async () =>
      new Response("forbidden", { status: 403 }),
    ) as unknown as typeof fetch;
    await expect(fetchWithRetry("https://example.com")).rejects.toThrow("403");
  });
});

// ── Delay computation ───────────────────────────────────────────────────

describe("withRetry — delay options", () => {
  test("respects maxDelayMs cap", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 4) throw new RetryableError("retry");
      return "ok";
    });
    const onRetry = (_a: number, _e: Error, delayMs: number) => delays.push(delayMs);
    await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 500,
      onRetry,
    });
    // All delays should be <= maxDelayMs (500)
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(500);
    }
  });

  test("uses baseDelayMs for first retry delay", async () => {
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      throw new RetryableError("retry");
    });
    const onRetry = (_a: number, _e: Error, delayMs: number) => delays.push(delayMs);
    await expect(withRetry(fn, {
      maxRetries: 1,
      baseDelayMs: 50,
      maxDelayMs: 10_000,
      onRetry,
    })).rejects.toThrow("retry");
    // First retry delay should be ~50 (base * 2^0 = 50 + jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(50);
    expect(delays[0]).toBeLessThan(70); // 50 + 30% jitter = max 65
  });
});
