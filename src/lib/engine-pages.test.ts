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

  test("follows the keyset cursor past filtered batches (matter scope shrinks pages)", async () => {
    // Engine with cursor support: every batch carries x-next-cursor while more
    // rows exist. Second batch returns zero rows (all filtered server-side)
    // but the cursor still advances — the scan must continue, not stop.
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      const cursor = u.searchParams.get("cursor");
      const seq = cursor ? Number(cursor.split("|")[1]) : 0;
      const batches: Array<{ rows: unknown[]; next: string | null }> = [
        {
          rows: [{ slug: "legal/a", title: "A", frontmatter: {} }],
          next: "2026-01-01T00:00:00Z|1",
        },
        { rows: [], next: "2026-01-01T00:00:00Z|2" },
        { rows: [{ slug: "legal/b", title: "B", frontmatter: {} }], next: null },
      ];
      const batch = batches[Math.min(seq, batches.length - 1)];
      const headers = new Headers();
      if (batch.next) headers.set("x-next-cursor", batch.next);
      return new Response(JSON.stringify(batch.rows), { status: 200, headers });
    });
    const pages = await listEnginePages({}, "legal_deadline", 100_000, { strict: true });
    expect(pages.map((p) => p.slug)).toEqual(["legal/a", "legal/b"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Third request carried the second cursor.
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get("cursor")).toBe(
      "2026-01-01T00:00:00Z|2"
    );
  });

  test("stops when the engine repeats the same cursor (defensive)", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify([{ slug: "legal/a", title: "A", frontmatter: {} }]), {
          status: 200,
          headers: { "x-next-cursor": "2026-01-01T00:00:00Z|1" },
        })
    );
    const pages = await listEnginePages({}, "legal_deadline", 100_000, { strict: true });
    expect(pages).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("drops tombstoned pages unless asked to include them", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            { slug: "legal/a", title: "A", frontmatter: {} },
            { slug: "legal/b", title: "B", frontmatter: { status: "tombstoned" } },
          ]),
          { status: 200 }
        )
    );
    const visible = await listEnginePages({}, "legal_deadline", 100);
    expect(visible.map((p) => p.slug)).toEqual(["legal/a"]);
    const all = await listEnginePages({}, "legal_deadline", 100, { includeTombstoned: true });
    expect(all).toHaveLength(2);
  });
});
