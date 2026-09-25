// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  EngineWriteError,
  assertEngineWriteOk,
  engineWriteBestEffort,
  engineWriteOrThrow,
} from "./engine-write";
import { scanSource } from "../../scripts/check-unchecked-engine-writes";

afterEach(() => vi.unstubAllGlobals());

describe("engineWriteOrThrow", () => {
  test("returns the response on 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ slug: "a" }))
    );
    const res = await engineWriteOrThrow("http://e/api/pages", { method: "POST" }, "Test");
    expect(res.ok).toBe(true);
  });

  test("throws a 502 EngineWriteError on 5xx, without leaking the engine text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "db connection refused" }, { status: 500 }))
    );
    const err = await engineWriteOrThrow("http://e/api/pages", { method: "POST" }, "Vollmacht")
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineWriteError);
    const e = err as EngineWriteError;
    expect(e.statusCode).toBe(502);
    expect(e.code).toBe("engine_write_failed");
    expect(e.message).toContain("Vollmacht");
    expect(e.message).not.toContain("db connection");
    expect(e.engineMessage).toBe("db connection refused");
  });

  test("keeps a 409 conflict as 409 with the engine code", async () => {
    const res = Response.json({ error: "page_exists", message: "exists" }, { status: 409 });
    const err = await assertEngineWriteOk(res, "Akte").catch((e: unknown) => e);
    expect((err as EngineWriteError).statusCode).toBe(409);
    expect((err as EngineWriteError).code).toBe("page_exists");
  });
});

describe("engineWriteBestEffort", () => {
  test("reports false (never throws) for refused or failed writes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 503 }))
    );
    expect(await engineWriteBestEffort("http://e/api/pages", { method: "POST" })).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      })
    );
    expect(await engineWriteBestEffort("http://e/api/pages", { method: "POST" })).toBe(false);
  });

  test("reports true for a stored write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}))
    );
    expect(await engineWriteBestEffort("http://e/api/pages", { method: "POST" })).toBe(true);
  });
});

describe("check-unchecked-engine-writes guard", () => {
  const scan = (code: string) => scanSource("x.ts", code);

  test("flags an awaited write whose response is dropped", () => {
    expect(
      scan('async function f(){ await fetch(`${ENGINE_URL}/api/pages`, { method: "POST" }); }')
    ).toHaveLength(1);
  });

  test("flags void / .catch() chains that end in a statement", () => {
    expect(
      scan('function f(){ void fetch(`${ENGINE_URL}/x`, { method: "PATCH" }); }')
    ).toHaveLength(1);
    expect(
      scan(
        'async function f(){ await fetch(`${ENGINE_URL}/x`, { method: "DELETE" }).catch(() => {}); }'
      )
    ).toHaveLength(1);
  });

  test("flags PATCH to /api/pages/<slug> (no such engine route)", () => {
    expect(
      scan(
        'async function f(s: string){ const r = await fetch(`${ENGINE_URL}/api/pages/${s}`, { method: "PATCH" }); return r.ok; }'
      )
    ).toHaveLength(1);
  });

  test("accepts checked writes, reads, and exempted lines", () => {
    expect(
      scan(
        'async function f(){ const res = await fetch(`${ENGINE_URL}/x`, { method: "POST" }); return res.ok; }'
      )
    ).toHaveLength(0);
    expect(scan("async function f(){ await fetch(`${ENGINE_URL}/x`); }")).toHaveLength(0);
    expect(
      scan(
        'async function f(){ await fetch(`${ENGINE_URL}/x`, { method: "POST" }); // engine-write-ok: fire and forget ping\n}'
      )
    ).toHaveLength(0);
  });
});
