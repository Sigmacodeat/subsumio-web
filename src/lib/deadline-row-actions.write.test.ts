// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { writeEmbeddedDeadline, type EmbeddedDeadlineWriter } from "./deadline-row-actions";

function writer(overrides: Partial<EmbeddedDeadlineWriter> = {}): EmbeddedDeadlineWriter {
  return {
    mutatePageArray: vi.fn(async () => ({ matched_ids: ["d1"], not_found_ids: [] })),
    getPage: vi.fn(async () => ({ frontmatter: {} })),
    patchPageIfMatch: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("writeEmbeddedDeadline — no blind read-modify-write of deadlines[] (FRI-8)", () => {
  it("an entry with id is patched atomically by id — the matter is never read or rewritten", async () => {
    const w = writer();
    await writeEmbeddedDeadline(w, "legal/cases/akte-1", { id: "d1" }, { status: "done" });
    expect(w.mutatePageArray).toHaveBeenCalledWith(
      "legal/cases/akte-1",
      "deadlines",
      expect.objectContaining({
        match_key: "id",
        match: ["d1"],
        set: expect.objectContaining({ status: "done" }),
      })
    );
    expect(w.getPage).not.toHaveBeenCalled();
    expect(w.patchPageIfMatch).not.toHaveBeenCalled();
  });

  it("reports a vanished entry instead of silently succeeding", async () => {
    const w = writer({
      mutatePageArray: vi.fn(async () => ({ matched_ids: [], not_found_ids: ["d1"] })),
    });
    await expect(
      writeEmbeddedDeadline(w, "legal/cases/akte-1", { id: "d1" }, { status: "done" })
    ).rejects.toThrow(/not found/);
  });

  it("a legacy entry without id is written with the version it was read at (If-Match)", async () => {
    const w = writer({
      getPage: vi.fn(async () => ({
        frontmatter: {
          version: 12,
          deadlines: [
            { title: "Replik", due_date: "2026-04-01" },
            { id: "d9", title: "Andere", due_date: "2026-05-01" },
          ],
        },
      })),
    });
    await writeEmbeddedDeadline(
      w,
      "legal/cases/akte-1",
      { title: "Replik", due_date: "2026-04-01" },
      { review_status: "approved" }
    );
    expect(w.patchPageIfMatch).toHaveBeenCalledTimes(1);
    const [slug, fm, version] = vi.mocked(w.patchPageIfMatch).mock.calls[0];
    expect(slug).toBe("legal/cases/akte-1");
    expect(version).toBe(12);
    const list = (fm as { deadlines: Array<Record<string, unknown>> }).deadlines;
    expect(list[0]).toMatchObject({ title: "Replik", review_status: "approved" });
    expect(list[1]).toEqual({ id: "d9", title: "Andere", due_date: "2026-05-01" });
  });
});
