// @vitest-environment node

import { describe, expect, test } from "vitest";

import { deadlineWriteTarget, patchEmbeddedDeadline } from "./deadline-row-actions";

describe("deadlineWriteTarget", () => {
  test("a legal_deadline row writes its own page", () => {
    expect(deadlineWriteTarget({ slug: "legal/deadlines/x", source: "legal_deadline" })).toEqual({
      kind: "page",
      slug: "legal/deadlines/x",
    });
  });

  test("a matter-embedded row targets the entry, never the matter page", () => {
    expect(
      deadlineWriteTarget({ slug: "cases/mueller", source: "legal_case", embedded: { id: "d1" } })
    ).toEqual({ kind: "embedded", caseSlug: "cases/mueller", ref: { id: "d1" } });
  });

  test("a matter-embedded row without its reference is not writable", () => {
    // Writing {status: "done"} to cases/mueller would close the Akte.
    expect(deadlineWriteTarget({ slug: "cases/mueller", source: "legal_case" })).toEqual({
      kind: "none",
      reason: "missing_ref",
    });
  });

  test("timeline rows are read-only in the Fristen view", () => {
    expect(deadlineWriteTarget({ slug: "cases/mueller", source: "timeline" }).kind).toBe("none");
  });

  test("rows without a page are not writable", () => {
    expect(deadlineWriteTarget({ source: "fristenbuch" }).kind).toBe("none");
  });
});

describe("patchEmbeddedDeadline", () => {
  const list = [
    { id: "d1", title: "Berufung", due_date: "2026-10-01", status: "pending" },
    { id: "d2", title: "Replik", due_date: "2026-10-05", status: "pending" },
    { title: "Alt-Frist", due_date: "2026-10-09", status: "pending" },
  ];

  test("patches only the entry with the matching id", () => {
    const out = patchEmbeddedDeadline(list, { id: "d2" }, { status: "done" });
    expect(out).not.toBeNull();
    expect(out![0].status).toBe("pending");
    expect(out![1].status).toBe("done");
    expect(out![1].updated_at).toBeTypeOf("string");
    expect(out![2].status).toBe("pending");
    expect(out).toHaveLength(3);
  });

  test("finds legacy entries by title + due_date", () => {
    const out = patchEmbeddedDeadline(
      list,
      { title: "alt-frist ", due_date: "2026-10-09" },
      { review_status: "approved" }
    );
    expect(out![2].review_status).toBe("approved");
    expect(out![0].review_status).toBeUndefined();
  });

  test("returns null when the entry is gone (caller must not write)", () => {
    expect(patchEmbeddedDeadline(list, { id: "missing" }, { status: "done" })).toBeNull();
    expect(patchEmbeddedDeadline(undefined, { id: "d1" }, { status: "done" })).toBeNull();
  });

  test("does not mutate the stored list", () => {
    patchEmbeddedDeadline(list, { id: "d1" }, { status: "done" });
    expect(list[0].status).toBe("pending");
  });
});
