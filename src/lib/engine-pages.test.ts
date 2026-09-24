// @vitest-environment node
//
// listEnginePages pages through the engine's 100-row batches. The Fristen
// crons read EVERY page of a type strictly: nothing may drop out past a fixed
// cap, and a failed batch must throw instead of returning a partial list.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { ENGINE_LIST_MAX, listEnginePages } from "./engine-pages";

const fetchMock = vi.fn();

function engineWith(total: number, failAtOffset?: number) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(url);
    const offset = Number(u.searchParams.get("offset"));
    const limit = Number(u.searchParams.get("limit"));
    if (failAtOffset !== undefined && offset === failAtOffset) {
      return new Response("busy", { status: 503 });
    }
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      slug: `legal/deadlines/d${offset + i}`,
      title: "Frist",
      frontmatter: {},
    }));
    return Response.json(rows);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("listEnginePages", () => {
  test("reads every page beyond 500 when the limit allows it", async () => {
    engineWith(1234);
    const pages = await listEnginePages({}, "legal_deadline", 100_000, { strict: true });
    expect(pages).toHaveLength(1234);
    // 13 batches: 12 full + 1 short one that ends the loop.
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(1234 / ENGINE_LIST_MAX));
  });

  test("an exact multiple of the batch size ends on the first empty batch", async () => {
    engineWith(200);
    const pages = await listEnginePages({}, "legal_deadline", 100_000, { strict: true });
    expect(pages).toHaveLength(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("strict: a failed batch throws instead of returning a partial list", async () => {
    engineWith(1000, 300);
    await expect(listEnginePages({}, "legal_deadline", 100_000, { strict: true })).rejects.toThrow(
      /HTTP 503/
    );
  });

  test("non-strict keeps what was read", async () => {
    engineWith(1000, 300);
    const pages = await listEnginePages({}, "legal_deadline", 100_000);
    expect(pages).toHaveLength(300);
  });
});
