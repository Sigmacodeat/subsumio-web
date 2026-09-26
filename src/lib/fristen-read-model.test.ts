// @vitest-environment node
//
// R11-1: the read model must not silently cut deadlines at a fixed cap —
// the listing is newest-first, so a cut drops the long-untouched deadlines
// that are falling due now.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { FRISTEN_READ_CAP, loadFristenReadModel } from "./fristen-read-model";

type Row = { slug: string; title: string; frontmatter: Record<string, unknown> };

const fetchMock = vi.fn();
let deadlineRows: Row[] = [];
let endlessDeadlines = false;
const listUrls: URL[] = [];

function tomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  deadlineRows = [];
  endlessDeadlines = false;
  listUrls.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/api/legal/fristenbuch") return Response.json({ eintraege: [] });
    if (u.pathname !== "/api/pages") return new Response("{}", { status: 404 });
    listUrls.push(u);
    const type = u.searchParams.get("type");
    const limit = Number(u.searchParams.get("limit"));
    const start = Number(u.searchParams.get("cursor") ?? u.searchParams.get("offset") ?? 0);
    if (type !== "legal_deadline") return Response.json([]);
    if (endlessDeadlines) {
      const rows = Array.from({ length: limit }, (_, i) => ({
        slug: `legal/deadlines/e-${start + i}`,
        title: "Frist",
        frontmatter: { due_date: "2030-01-01" },
      }));
      return Response.json(rows, { headers: { "x-next-cursor": String(start + limit) } });
    }
    const caseSlug = u.searchParams.get("fm.case_slug");
    const all = caseSlug
      ? deadlineRows.filter((r) => r.frontmatter.case_slug === caseSlug)
      : deadlineRows;
    const rows = all.slice(start, start + limit);
    const more = start + limit < all.length;
    return Response.json(rows, more ? { headers: { "x-next-cursor": String(start + limit) } } : {});
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("loadFristenReadModel", () => {
  test("10,050 deadline pages: the oldest open one (due tomorrow) is included", async () => {
    deadlineRows = Array.from({ length: 10_050 }, (_, i) => ({
      slug: `legal/deadlines/d-${i}`,
      title: `Frist ${i}`,
      frontmatter: {
        due_date: i === 10_049 ? tomorrow() : "2020-01-01",
        status: i === 10_049 ? "open" : "done",
        case_slug: `legal/cases/c-${i % 50}`,
      },
    }));
    const model = await loadFristenReadModel({});
    expect(model.failedSources).toEqual([]);
    expect(model.fristen.some((f) => f.source_slug === "legal/deadlines/d-10049")).toBe(true);
  });

  test("a list cut at the safety stop is reported as a failed source", async () => {
    endlessDeadlines = true;
    const model = await loadFristenReadModel({});
    expect(model.failedSources).toContain("legal_deadline");
    expect(FRISTEN_READ_CAP).toBeGreaterThanOrEqual(100_000);
  });

  test("with a matter filter the engine selects only that matter's deadlines", async () => {
    deadlineRows = [
      { slug: "legal/deadlines/a", title: "A", frontmatter: { due_date: tomorrow(), case_slug: "legal/cases/x" } },
      { slug: "legal/deadlines/b", title: "B", frontmatter: { due_date: tomorrow(), case_slug: "legal/cases/y" } },
    ];
    const model = await loadFristenReadModel({}, { caseFilter: "legal/cases/x" });
    expect(model.fristen.map((f) => f.source_slug)).toEqual(["legal/deadlines/a"]);
    const deadlineCall = listUrls.find((u) => u.searchParams.get("type") === "legal_deadline")!;
    expect(deadlineCall.searchParams.get("fm.case_slug")).toBe("legal/cases/x");
  });
});
