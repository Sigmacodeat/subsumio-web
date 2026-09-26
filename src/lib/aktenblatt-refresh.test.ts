// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
const writeMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/engine-write", () => ({ engineWriteBestEffort: (...a: unknown[]) => writeMock(...a) }));

import { refreshAktenblatt } from "./aktenblatt-refresh";

const fetchMock = vi.fn();
const listCalls: URL[] = [];

beforeEach(() => {
  fetchMock.mockReset();
  writeMock.mockClear();
  listCalls.length = 0;
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/api/pages") {
      listCalls.push(u);
      await new Promise((r) => setTimeout(r, 5));
      return Response.json([
        {
          slug: "legal/deadlines/d1",
          title: "Frist",
          frontmatter: { case_slug: "legal/cases/a", due_date: "2026-10-01", title: "Frist" },
        },
      ]);
    }
    return Response.json({ title: "Akte A", content: "", frontmatter: {} });
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("refreshAktenblatt", () => {
  test("reads only the matter's deadlines through the engine filter", async () => {
    await refreshAktenblatt({ "x-subsumio-source": "b1" }, "legal/cases/a");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0].searchParams.get("fm.case_slug")).toBe("legal/cases/a");
  });

  test("30 concurrent writes of one matter run at most one refresh at a time", async () => {
    const h = { "x-subsumio-source": "b1" };
    await Promise.all(Array.from({ length: 30 }, () => refreshAktenblatt(h, "legal/cases/a")));
    // First run + one coalesced follow-up for everything that arrived meanwhile.
    expect(listCalls.length).toBeLessThanOrEqual(2);
  });

  test("a truncated or failed deadline read skips the write", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/api/pages") return new Response("busy", { status: 503 });
      return Response.json({ title: "Akte A", content: "", frontmatter: {} });
    });
    await refreshAktenblatt({ "x-subsumio-source": "b1" }, "legal/cases/a");
    expect(writeMock).not.toHaveBeenCalled();
  });
});
