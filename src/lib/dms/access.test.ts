// @vitest-environment node

/**
 * DMS content is served only for documents the firm imported (proof: the
 * import page in the caller's own brain) and only when the user may read the
 * matter it is linked to. Search hits linked to a matter the user may not read
 * are dropped; client_viewer never gets anything.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine", enginePatchPage: vi.fn() }));

const caseAccess = new Map<string, "ok" | "blocked" | "not_found">();
vi.mock("@/lib/email/case-link", () => ({
  caseAccessForUser: vi.fn(
    async (_h: unknown, slug: string) => caseAccess.get(slug) ?? "not_found"
  ),
  caseAccessAllowed: (a: string) => a === "ok",
  blockedCasesForUser: vi.fn(async (_h: unknown, slugs: string[]) => {
    return new Set(slugs.filter((s) => caseAccess.get(s) !== "ok"));
  }),
}));

import { dmsContentAccess, filterDmsSearchHits, loadDmsImport } from "./access";

/** Engine pages visible through the caller's headers, keyed by brain. */
const pagesByBrain: Record<string, Record<string, unknown>> = {};

function caller(brain: string, role = "lawyer") {
  return { headers: { "x-brain": brain }, user: { id: "u1", role } };
}

beforeEach(() => {
  caseAccess.clear();
  for (const k of Object.keys(pagesByBrain)) delete pagesByBrain[k];
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const brain = new Headers(init?.headers).get("x-brain") ?? "";
    const slug = decodeURIComponent(url.replace("http://engine/api/pages/", ""));
    const page = pagesByBrain[brain]?.[slug];
    return page
      ? new Response(JSON.stringify(page), { status: 200 })
      : new Response("not found", { status: 404 });
  });
});

function importPage(brain: string, id: string, fm: Record<string, unknown> = {}, extra = {}) {
  pagesByBrain[brain] ??= {};
  (pagesByBrain[brain] as Record<string, unknown>)[`dms/import/${id}`] = {
    type: "dms_document",
    frontmatter: { dms_document_id: id, ...fm },
    ...extra,
  };
}

describe("dmsContentAccess", () => {
  test("a document imported by another firm counts as not imported", async () => {
    importPage("brain-a", "doc-1");
    expect(await dmsContentAccess(caller("brain-b"), "doc-1")).toBe("not_imported");
    expect(await dmsContentAccess(caller("brain-a"), "doc-1")).toBe("ok");
  });

  test("an unknown id is refused", async () => {
    expect(await dmsContentAccess(caller("brain-a"), "never-imported")).toBe("not_imported");
  });

  test("a page that is not the import of this id does not count as proof", async () => {
    importPage("brain-a", "doc-1", { dms_document_id: "other-id" });
    expect(await loadDmsImport({ "x-brain": "brain-a" }, "doc-1")).toBeNull();
  });

  test("a deleted import does not count as proof", async () => {
    importPage("brain-a", "doc-1", {}, { status: "tombstoned" });
    expect(await dmsContentAccess(caller("brain-a"), "doc-1")).toBe("not_imported");
  });

  test("a document linked to a matter needs access to that matter", async () => {
    importPage("brain-a", "doc-1", { case_slug: "cases/walled" });
    importPage("brain-a", "doc-2", { case_slug: "cases/open" });
    caseAccess.set("cases/walled", "blocked");
    caseAccess.set("cases/open", "ok");
    expect(await dmsContentAccess(caller("brain-a"), "doc-1")).toBe("blocked");
    expect(await dmsContentAccess(caller("brain-a"), "doc-2")).toBe("ok");
  });

  test("a matter outside the user's scope (engine 404) is denied", async () => {
    importPage("brain-a", "doc-1", { case_slug: "cases/out-of-scope" });
    expect(await dmsContentAccess(caller("brain-a"), "doc-1")).toBe("blocked");
  });

  test("client_viewer is always denied, even for an unlinked import", async () => {
    importPage("brain-a", "doc-1");
    expect(await dmsContentAccess(caller("brain-a", "client_viewer"), "doc-1")).toBe("blocked");
  });
});

describe("filterDmsSearchHits", () => {
  const hits = [{ id: "unlinked" }, { id: "linked-open" }, { id: "linked-walled" }];

  test("drops hits linked to a matter the user may not read; unlinked stay for staff", async () => {
    importPage("brain-a", "linked-open", { case_slug: "cases/open" });
    importPage("brain-a", "linked-walled", { case_slug: "cases/walled" });
    caseAccess.set("cases/open", "ok");
    caseAccess.set("cases/walled", "blocked");
    const visible = await filterDmsSearchHits(caller("brain-a"), hits);
    expect(visible.map((d) => d.id)).toEqual(["unlinked", "linked-open"]);
  });

  test("client_viewer sees no hits at all", async () => {
    expect(await filterDmsSearchHits(caller("brain-a", "client_viewer"), hits)).toEqual([]);
  });
});
