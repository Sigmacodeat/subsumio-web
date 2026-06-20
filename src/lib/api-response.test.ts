import { describe, test, expect } from "vitest";
import {
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  apiUnprocessable,
  apiRateLimited,
  apiUnavailable,
  apiError,
  apiSuccess,
  apiPaginated,
  apiStream,
  apiCached,
} from "./api-response";

describe("apiError", () => {
  test("returns correct status and body", async () => {
    const res = apiError("test_code", "Test message", 418);
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body.error).toBe("Test message");
    expect(body.code).toBe("test_code");
  });

  test("includes details when provided", async () => {
    const res = apiError("code", "msg", 400, { field: "value" });
    const body = await res.json();
    expect(body.details).toEqual({ field: "value" });
  });

  test("omits details when not provided", async () => {
    const res = apiError("code", "msg", 400);
    const body = await res.json();
    expect(body.details).toBeUndefined();
  });
});

describe("apiBadRequest", () => {
  test("returns 400", () => {
    expect(apiBadRequest("bad", "Bad request").status).toBe(400);
  });
});

describe("apiUnauthorized", () => {
  test("returns 401 with default message", async () => {
    const res = apiUnauthorized();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(body.code).toBe("unauthorized");
  });

  test("accepts custom message", async () => {
    const res = apiUnauthorized("Custom auth message");
    const body = await res.json();
    expect(body.error).toBe("Custom auth message");
  });
});

describe("apiForbidden", () => {
  test("returns 403 with default message", async () => {
    const res = apiForbidden();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("forbidden");
  });

  test("accepts custom message and details", async () => {
    const res = apiForbidden("No access", { resource: "admin" });
    const body = await res.json();
    expect(body.error).toBe("No access");
    expect(body.details).toEqual({ resource: "admin" });
  });
});

describe("apiNotFound", () => {
  test("returns 404 with resource name in message", async () => {
    const res = apiNotFound("Case");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Case not found");
    expect(body.code).toBe("not_found");
  });

  test("uses default resource name", async () => {
    const res = apiNotFound();
    const body = await res.json();
    expect(body.error).toBe("Resource not found");
  });
});

describe("apiConflict", () => {
  test("returns 409", async () => {
    const res = apiConflict("dup", "Duplicate");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("dup");
  });
});

describe("apiUnprocessable", () => {
  test("returns 422", async () => {
    const res = apiUnprocessable("invalid", "Invalid");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid");
  });
});

describe("apiRateLimited", () => {
  test("returns 429 with Retry-After header", async () => {
    const res = apiRateLimited(60);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.code).toBe("rate_limited");
    expect(body.details).toEqual({ retry_after: 60 });
  });
});

describe("apiUnavailable", () => {
  test("returns 503 with default message", async () => {
    const res = apiUnavailable();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("service_unavailable");
  });

  test("accepts custom message", async () => {
    const res = apiUnavailable("Engine down");
    const body = await res.json();
    expect(body.error).toBe("Engine down");
  });
});

describe("apiSuccess", () => {
  test("returns 200 with data", async () => {
    const res = apiSuccess({ id: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 1 });
  });

  test("accepts custom status", () => {
    expect(apiSuccess({}, undefined, 201).status).toBe(201);
  });

  test("includes meta when provided", async () => {
    const res = apiSuccess([1, 2, 3], { page: 1, limit: 3, total: 10 });
    const body = await res.json();
    expect(body.meta).toEqual({ page: 1, limit: 3, total: 10 });
  });

  test("omits meta when not provided", async () => {
    const res = apiSuccess({ ok: true });
    const body = await res.json();
    expect(body.meta).toBeUndefined();
  });
});

describe("apiPaginated", () => {
  test("returns 200 with data and pagination meta", async () => {
    const res = apiPaginated([1, 2], { page: 1, limit: 2, total: 100 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([1, 2]);
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 100 });
  });
});

describe("apiStream", () => {
  test("returns 200 with SSE headers", () => {
    const stream = new ReadableStream({ start(c) { c.close(); } });
    const res = apiStream(stream);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });

  test("sets X-AI-Generated header when aiGenerated is true", () => {
    const stream = new ReadableStream({ start(c) { c.close(); } });
    const res = apiStream(stream, { aiGenerated: true });
    expect(res.headers.get("X-AI-Generated")).toBe("true");
  });

  test("omits X-AI-Generated when not set", () => {
    const stream = new ReadableStream({ start(c) { c.close(); } });
    const res = apiStream(stream);
    expect(res.headers.get("X-AI-Generated")).toBeNull();
  });

  test("accepts custom content type", () => {
    const stream = new ReadableStream({ start(c) { c.close(); } });
    const res = apiStream(stream, { contentType: "application/x-ndjson" });
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
  });
});

describe("apiCached", () => {
  test("returns 200 with Cache-Control and ETag headers", () => {
    const res = apiCached({ data: 1 }, {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=600");
    expect(res.headers.get("ETag")).toBeTruthy();
  });

  test("accepts custom maxAge and swr", () => {
    const res = apiCached({ data: 1 }, { maxAgeSeconds: 30, swrSeconds: 300 });
    expect(res.headers.get("Cache-Control")).toContain("max-age=30");
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=300");
  });

  test("generates consistent ETag for same data", () => {
    const res1 = apiCached({ id: 1 }, {});
    const res2 = apiCached({ id: 1 }, {});
    expect(res1.headers.get("ETag")).toBe(res2.headers.get("ETag"));
  });

  test("generates different ETag for different data", () => {
    const res1 = apiCached({ id: 1 }, {});
    const res2 = apiCached({ id: 2 }, {});
    expect(res1.headers.get("ETag")).not.toBe(res2.headers.get("ETag"));
  });

  test("uses custom tag for ETag when provided", () => {
    const res = apiCached({ data: 1 }, { tag: "custom-tag" });
    expect(res.headers.get("ETag")).toBe('"custom-tag"');
  });
});
