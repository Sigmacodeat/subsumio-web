// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { topbarDeadlineWarnings } from "./topbar-deadline-warnings";
import { loadFristenReadModel } from "./fristen-read-model";

const TODAY = "2026-10-10";

describe("topbarDeadlineWarnings", () => {
  it("links the warning to the matter, not to the deadline record", () => {
    const [w] = topbarDeadlineWarnings(
      [
        {
          id: "legal/deadlines/f1",
          title: "Berufung",
          due_date: "2026-10-12",
          status: "critical",
          case_slug: "legal/cases/akte-a",
          case_title: "Akte A",
        },
      ],
      TODAY
    );
    expect(w.caseSlug).toBe("legal/cases/akte-a");
    expect(w.caseTitle).toBe("Akte A");
    expect(w.daysRemaining).toBe(2);
    expect(w.isOverdue).toBe(false);
  });

  it("skips done deadlines, entries without a date and those beyond the window", () => {
    const out = topbarDeadlineWarnings(
      [
        { id: "a", title: "erledigt", due_date: "2026-10-09", status: "done" },
        { id: "b", title: "ohne Datum", due_date: "", status: "pending" },
        { id: "c", title: "später", due_date: "2026-10-20", status: "pending" },
        { id: "d", title: "überfällig", due_date: "2026-10-08", status: "overdue" },
      ],
      TODAY
    );
    expect(out.map((w) => w.id)).toEqual(["d"]);
    expect(out[0].isOverdue).toBe(true);
    expect(out[0].daysRemaining).toBe(-2);
  });
});

describe("topbar warnings from the Fristen read model", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("never warns for cancelled, rejected or dateless deadlines", async () => {
    const deadlinePages = [
      {
        slug: "legal/deadlines/storniert",
        title: "Storniert",
        frontmatter: { due_date: "2026-10-09", status: "cancelled", case_slug: "legal/cases/a" },
      },
      {
        slug: "legal/deadlines/verworfen",
        title: "Verworfen",
        frontmatter: { due_date: "2026-10-09", review_status: "rejected" },
      },
      {
        slug: "legal/deadlines/ohne-datum",
        title: "Ohne Datum",
        created_at: "2026-01-01T00:00:00Z",
        frontmatter: {},
      },
      {
        slug: "legal/deadlines/echt",
        title: "Echte Frist",
        frontmatter: { due_date: "2026-10-11", case_slug: "legal/cases/a" },
      },
    ];
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(String(url));
      if (u.searchParams.get("type") === "legal_deadline") {
        return Response.json(u.searchParams.get("offset") === "0" ? deadlinePages : []);
      }
      return Response.json([]);
    });
    const { fristen } = await loadFristenReadModel({}, { heute: TODAY });
    const warnings = topbarDeadlineWarnings(fristen, TODAY);
    expect(warnings.map((w) => w.title)).toEqual(["Echte Frist"]);
    expect(warnings[0].caseSlug).toBe("legal/cases/a");
  });
});
