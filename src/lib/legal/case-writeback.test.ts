// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock engine module
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: vi.fn(async () => ({ ok: true })),
}));

// Mock utils
vi.mock("@/lib/utils", () => ({
  encodeSlugPath: (slug: string) => encodeURIComponent(slug),
}));

// Mock analysis-utils
vi.mock("@/lib/legal/analysis-utils", () => ({
  DEADLINE_CREATE_TIMEOUT: 5000,
  ENGINE_FETCH_TIMEOUT: 10000,
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { writeSuggestedDeadlinesAndParties } from "./case-writeback";
import { enginePatchPage } from "@/lib/engine";

describe("writeSuggestedDeadlinesAndParties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does nothing when no deadlines and no parties extracted", async () => {
    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      { deadlines: [], parties: [] },
      "doc/test.md"
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(enginePatchPage).not.toHaveBeenCalled();
  });

  test("does nothing when parsed has no deadlines/parties arrays", async () => {
    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      { summary: "some text" },
      "doc/test.md"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("fetches case page and patches with new deadlines", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          frontmatter: { suggested_deadlines: [], suggested_parties: [] },
        }),
        { status: 200 }
      )
    );

    await writeSuggestedDeadlinesAndParties(
      { Authorization: "Bearer test" },
      "legal/cases/test",
      {
        deadlines: [
          { label: "Berufungsfrist", date: "2026-12-01", urgency: "high", source: "Absatz 3" },
        ],
        parties: [],
      },
      "doc/klage.md"
    );

    expect(fetch).toHaveBeenCalled();
    expect(enginePatchPage).toHaveBeenCalledWith(
      { Authorization: "Bearer test" },
      expect.objectContaining({
        slug: "legal/cases/test",
        frontmatter: expect.objectContaining({
          suggested_deadlines: expect.arrayContaining([
            expect.objectContaining({
              title: "Berufungsfrist",
              due_date: "2026-12-01",
              urgency: "high",
              confirmed: false,
            }),
          ]),
        }),
      }),
      expect.any(Object)
    );
  });

  test("deduplicates deadlines by title+due_date", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          frontmatter: {
            suggested_deadlines: [
              { title: "Berufungsfrist", due_date: "2026-12-01", source: "KI-Analyse: doc/old.md" },
            ],
            suggested_parties: [],
          },
        }),
        { status: 200 }
      )
    );

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      {
        deadlines: [
          { label: "Berufungsfrist", date: "2026-12-01", urgency: "high" },
          { label: "Neue Frist", date: "2027-01-15", urgency: "normal" },
        ],
        parties: [],
      },
      "doc/new.md"
    );

    expect(enginePatchPage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          suggested_deadlines: expect.arrayContaining([
            expect.objectContaining({ title: "Berufungsfrist", due_date: "2026-12-01" }),
            expect.objectContaining({ title: "Neue Frist", due_date: "2027-01-15" }),
          ]),
        }),
      }),
      expect.any(Object)
    );
  });

  test("deduplicates parties by name+role", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          frontmatter: {
            suggested_deadlines: [],
            suggested_parties: [
              { name: "Max Muster", role: "mandant", source: "KI-Analyse: doc/old.md" },
            ],
          },
        }),
        { status: 200 }
      )
    );

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      {
        deadlines: [],
        parties: [
          { name: "Max Muster", role: "mandant" },
          { name: "Anna Schmidt", role: "gegner" },
        ],
      },
      "doc/new.md"
    );

    expect(enginePatchPage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          suggested_parties: expect.arrayContaining([
            expect.objectContaining({ name: "Max Muster", role: "mandant" }),
            expect.objectContaining({ name: "Anna Schmidt", role: "gegner" }),
          ]),
        }),
      }),
      expect.any(Object)
    );
  });

  test("auto-creates deadline pages for high-urgency deadlines", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            frontmatter: { suggested_deadlines: [], suggested_parties: [] },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      {
        deadlines: [
          { label: "Notfrist", date: "2026-12-01", urgency: "critical", source: "§ XYZ" },
        ],
        parties: [],
      },
      "doc/urgent.md"
    );

    // First fetch: get case page, second fetch: create deadline page
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const createCall = calls.find((c) => c[1]?.method === "POST");
    expect(createCall).toBeDefined();
    const body = JSON.parse((createCall![1] as RequestInit).body as string);
    expect(body.type).toBe("legal_deadline");
    expect(body.frontmatter.status).toBe("pending");
    expect(body.frontmatter.review_status).toBe("unreviewed");
    expect(body.frontmatter.urgency).toBe("critical");
  });

  test("does not auto-create deadline pages for normal urgency", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          frontmatter: { suggested_deadlines: [], suggested_parties: [] },
        }),
        { status: 200 }
      )
    );

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      {
        deadlines: [{ label: "Normale Frist", date: "2026-12-01", urgency: "normal" }],
        parties: [],
      },
      "doc/normal.md"
    );

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const createCall = calls.find((c) => c[1]?.method === "POST");
    expect(createCall).toBeUndefined();
  });

  test("does not auto-create deadline pages without due_date", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          frontmatter: { suggested_deadlines: [], suggested_parties: [] },
        }),
        { status: 200 }
      )
    );

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      {
        deadlines: [{ label: "Frist ohne Datum", date: "", urgency: "critical" }],
        parties: [],
      },
      "doc/no-date.md"
    );

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const createCall = calls.find((c) => c[1]?.method === "POST");
    expect(createCall).toBeUndefined();
  });

  test("swallows errors silently (fire-and-forget)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Engine unreachable")
    );

    // Should not throw
    await expect(
      writeSuggestedDeadlinesAndParties(
        {},
        "legal/cases/test",
        { deadlines: [{ label: "Frist", date: "2026-12-01", urgency: "high" }], parties: [] },
        "doc/test.md"
      )
    ).resolves.toBeUndefined();
  });

  test("returns early when case page fetch fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Not found", { status: 404 })
    );

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/missing",
      { deadlines: [{ label: "Frist", date: "2026-12-01" }], parties: [] },
      "doc/test.md"
    );

    expect(enginePatchPage).not.toHaveBeenCalled();
  });

  test("merges new deadlines with existing ones", async () => {
    const existingDeadline = {
      title: "Alte Frist",
      due_date: "2026-10-01",
      source: "KI-Analyse: doc/old.md",
      confirmed: true,
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          frontmatter: {
            suggested_deadlines: [existingDeadline],
            suggested_parties: [],
          },
        }),
        { status: 200 }
      )
    );

    await writeSuggestedDeadlinesAndParties(
      {},
      "legal/cases/test",
      {
        deadlines: [{ label: "Neue Frist", date: "2026-12-01", urgency: "high" }],
        parties: [],
      },
      "doc/new.md"
    );

    expect(enginePatchPage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          suggested_deadlines: expect.arrayContaining([
            expect.objectContaining({ title: "Alte Frist" }),
            expect.objectContaining({ title: "Neue Frist" }),
          ]),
        }),
      }),
      expect.any(Object)
    );
  });
});
