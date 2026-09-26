// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
}));

global.fetch = vi.fn() as unknown as typeof fetch;
const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

import { enginePatchPage } from "@/lib/engine";
import { archiveCaseDocuments, canRestoreCase, restoreCaseDocuments } from "./case-cascade";

const patchMock = vi.mocked(enginePatchPage);
const CASE = "legal/cases/alt";

type Doc = { slug: string; title: string; frontmatter: Record<string, unknown> };

/** Engine that returns at most 100 rows per request and pages by cursor. */
function engineWith(docs: Doc[], failAtPage?: number) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(url);
    // Only documents in these fixtures; every other matter type is empty.
    if (u.searchParams.get("type") !== "document") return new Response("[]", { status: 200 });
    const start = Number(u.searchParams.get("cursor") ?? "0");
    const page = start / 100 + 1;
    if (failAtPage && page === failAtPage) return new Response("{}", { status: 500 });
    const batch = docs.slice(start, start + 100);
    const headers: Record<string, string> = {};
    if (start + 100 < docs.length) headers["x-next-cursor"] = String(start + 100);
    return new Response(JSON.stringify(batch), { status: 200, headers });
  });
}

function filler(n: number): Doc[] {
  return Array.from({ length: n }, (_, i) => ({
    slug: `docs/other-${i}`,
    title: `Other ${i}`,
    frontmatter: { case_slug: "legal/cases/andere" },
  }));
}

describe("case cascade", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    patchMock.mockClear();
  });

  test("archive reaches a matter document beyond the first 100 rows", async () => {
    const docs = filler(250);
    docs.splice(230, 0, { slug: "docs/akt", title: "Akt", frontmatter: { case_slug: CASE } });
    engineWith(docs);
    const result = await archiveCaseDocuments({}, new Set([CASE]), "anwalt@example.com");
    expect(result).toMatchObject({ matched: 1, succeeded: 1, failed: [] });
    expect(patchMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        slug: "docs/akt",
        frontmatter: expect.objectContaining({
          status: "tombstoned",
          tombstone_reason: "case_archived",
        }),
      }),
      expect.anything()
    );
  });

  test("archive leaves already deleted documents alone (their reason stays)", async () => {
    engineWith([
      {
        slug: "docs/manuell",
        title: "M",
        frontmatter: { case_slug: CASE, status: "tombstoned", tombstone_reason: "manual_delete" },
      },
    ]);
    const result = await archiveCaseDocuments({}, new Set([CASE]), "a@b.at");
    expect(result.matched).toBe(0);
    expect(patchMock).not.toHaveBeenCalled();
  });

  test("restore brings back archive-cascade documents on page 3, not manual deletions", async () => {
    const docs = filler(220);
    docs.push(
      {
        slug: "docs/archiviert",
        title: "A",
        frontmatter: { case_slug: CASE, status: "tombstoned", tombstone_reason: "case_archived" },
      },
      {
        slug: "docs/manuell",
        title: "M",
        frontmatter: { case_slug: CASE, status: "tombstoned", tombstone_reason: "manual_delete" },
      }
    );
    engineWith(docs);
    const result = await restoreCaseDocuments({}, new Set([CASE]), "a@b.at");
    expect(result).toMatchObject({ matched: 1, succeeded: 1, failed: [] });
    expect(patchMock).toHaveBeenCalledTimes(1);
    const body = patchMock.mock.calls[0]![1] as {
      slug: string;
      frontmatter: Record<string, unknown>;
    };
    expect(body.slug).toBe("docs/archiviert");
    expect(body.frontmatter).toMatchObject({
      status: null,
      tombstone_reason: null,
      tombstoned_by: null,
      restored_by: "a@b.at",
    });
  });

  test("a listing failure on page 2 is reported, not treated as success", async () => {
    engineWith(filler(250), 2);
    const result = await restoreCaseDocuments({}, new Set([CASE]), "a@b.at");
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.slug).toBe("*");
    expect(patchMock).not.toHaveBeenCalled();
  });

  test("only lawyers and admins restore matters", () => {
    expect(canRestoreCase("lawyer")).toBe(true);
    expect(canRestoreCase("admin")).toBe(true);
    expect(canRestoreCase("assistant")).toBe(false);
    expect(canRestoreCase(undefined)).toBe(false);
  });
});

describe("case cascade — every page of the matter, not only documents", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    patchMock.mockClear();
  });

  function engineByType(byType: Record<string, Doc[]>) {
    fetchMock.mockImplementation(async (url: string) => {
      const type = new URL(url).searchParams.get("type") ?? "";
      return new Response(JSON.stringify(byType[type] ?? []), { status: 200 });
    });
  }

  test("archiving hides notes, deadlines and chats of the matter with it", async () => {
    engineByType({
      legal_note: [{ slug: "notes/n1", title: "Notiz", frontmatter: { case_slug: CASE } }],
      legal_deadline: [
        { slug: "legal/deadlines/f1", title: "Frist", frontmatter: { case_slug: CASE } },
      ],
      chat_session: [{ slug: "chat/u1/c1", title: "Chat", frontmatter: { case_slug: CASE } }],
      document_request: [
        { slug: "requests/r1", title: "Anfrage", frontmatter: { case_slug: "legal/cases/x" } },
      ],
    });
    const result = await archiveCaseDocuments({}, new Set([CASE]), "a@b.at");
    expect(result).toMatchObject({ matched: 3, succeeded: 3, failed: [], skipped: 0 });
    const slugs = patchMock.mock.calls.map((c) => (c[1] as { slug: string }).slug).sort();
    expect(slugs).toEqual(["chat/u1/c1", "legal/deadlines/f1", "notes/n1"]);
    for (const c of patchMock.mock.calls) {
      expect((c[1] as { frontmatter: Record<string, unknown> }).frontmatter).toMatchObject({
        tombstone_reason: "case_archived",
      });
    }
  });

  test("never hides a live Notfrist, a billed time entry or a page under legal hold", async () => {
    engineByType({
      legal_deadline: [
        {
          slug: "legal/deadlines/notfrist",
          title: "Berufung",
          frontmatter: { case_slug: CASE, is_notfrist: true, status: "pending" },
        },
      ],
      time_entry: [
        { slug: "time/t1", title: "Zeit", frontmatter: { case_slug: CASE, billed: true } },
        { slug: "time/t2", title: "Zeit offen", frontmatter: { case_slug: CASE } },
      ],
      legal_note: [
        { slug: "notes/held", title: "Hold", frontmatter: { case_slug: CASE, legal_hold: true } },
      ],
    });
    const result = await archiveCaseDocuments({}, new Set([CASE]), "a@b.at");
    expect(result).toMatchObject({ matched: 1, succeeded: 1, skipped: 3 });
    expect((patchMock.mock.calls[0]![1] as { slug: string }).slug).toBe("time/t2");
  });
});
