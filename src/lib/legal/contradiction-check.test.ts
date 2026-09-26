// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ list: vi.fn(), patch: vi.fn() }));

vi.mock("@/lib/engine", () => ({
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...a: unknown[]) => m.list(...a),
}));

import { checkCaseContradictions } from "./contradiction-check";

const doc = (slug: string, caseSlug: string, analysis: Record<string, unknown>, extra = {}) => ({
  slug,
  title: slug,
  frontmatter: { case_slug: caseSlug, auto_analysis: analysis, ...extra },
});

beforeEach(() => {
  vi.clearAllMocks();
  m.patch.mockResolvedValue(Response.json({ ok: true }));
});

describe("checkCaseContradictions", () => {
  it("finds conflicting parties and dates within one matter and stores them", async () => {
    m.list.mockResolvedValue([
      doc("d1", "legal/cases/m1", {
        parties: [{ role: "kläger", name: "Anna Muster" }],
        key_dates: [{ label: "Vertrag", date: "2026-01-10" }],
      }),
      doc("d2", "legal/cases/m1", {
        parties: [{ role: "kläger", name: "Berta Beispiel" }],
        key_dates: [{ label: "Vertrag", date: "2026-02-10" }],
      }),
      // Other matter and deleted documents are not compared.
      doc("d3", "legal/cases/other", { parties: [{ role: "kläger", name: "X" }] }),
      doc(
        "d4",
        "legal/cases/m1",
        { parties: [{ role: "kläger", name: "Y" }] },
        {
          status: "tombstoned",
        }
      ),
    ]);
    const headers = { "x-subsumio-source": "brain-at" };
    const result = await checkCaseContradictions(headers, "legal/cases/m1");

    expect(result.documents_checked).toBe(2);
    expect(result.contradictions.map((c) => c.field).sort()).toEqual([
      "date.Vertrag",
      "party.kläger",
    ]);
    expect(m.list.mock.calls[0][0]).toBe(headers);
    expect(m.patch).toHaveBeenCalledWith(
      headers,
      expect.objectContaining({
        slug: "legal/cases/m1",
        frontmatter: expect.objectContaining({ contradiction_count: 2 }),
      }),
      expect.anything()
    );
  });

  it("needs two documents", async () => {
    m.list.mockResolvedValue([doc("d1", "legal/cases/m1", {})]);
    const result = await checkCaseContradictions({}, "legal/cases/m1");
    expect(result.contradictions).toEqual([]);
    expect(m.patch).not.toHaveBeenCalled();
  });

  it("reads only the matter's documents via the engine filter, complete or error (R11-5)", async () => {
    m.list.mockResolvedValue([
      doc("d1", "legal/cases/m1", {}),
      doc("d2", "legal/cases/m1", {}),
    ]);
    await checkCaseContradictions({}, "legal/cases/m1");
    expect(m.list.mock.calls[0][3]).toMatchObject({
      strict: true,
      failOnTruncate: true,
      frontmatter: { case_slug: "legal/cases/m1" },
    });
  });

  it("a truncated read keeps the stored findings of the matter", async () => {
    m.list.mockRejectedValue(new Error("list document truncated at 10000"));
    await expect(checkCaseContradictions({}, "legal/cases/m1")).rejects.toThrow("truncated");
    expect(m.patch).not.toHaveBeenCalled();
  });

  it("concurrent checks of one matter coalesce into at most two runs", async () => {
    m.list.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [doc("d1", "legal/cases/m1", {}), doc("d2", "legal/cases/m1", {})];
    });
    const results = await Promise.all(
      Array.from({ length: 30 }, () => checkCaseContradictions({ a: "1" }, "legal/cases/m1"))
    );
    expect(results).toHaveLength(30);
    expect(m.list.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("throws when the documents cannot be read", async () => {
    m.list.mockRejectedValue(new Error("HTTP 502"));
    await expect(checkCaseContradictions({}, "legal/cases/m1")).rejects.toThrow("HTTP 502");
  });
});
