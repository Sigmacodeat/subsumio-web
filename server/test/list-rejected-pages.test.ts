import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { PageRow } from "../scripts/audit-plausibility-full.ts";
import { docIdOfPage, rejectedListPath, tallyRejected } from "../scripts/list-rejected-pages.ts";

const BODY = "§ 1. Dieses Gesetz regelt etwas Substanzielles über vierzig Zeichen lang.";

const page = (id: number, fm: Record<string, unknown>, body = BODY): PageRow => ({
  id,
  frontmatter: fm,
  compiled_truth: body,
});

describe("docIdOfPage", () => {
  test("doc_id first, then nor_id, then document_id", () => {
    expect(docIdOfPage({ doc_id: "A", nor_id: "B" })).toBe("A");
    expect(docIdOfPage({ nor_id: "B", document_id: "C" })).toBe("B");
    expect(docIdOfPage({ document_id: "C" })).toBe("C");
    expect(docIdOfPage({ doc_id: "  " })).toBeNull();
    expect(docIdOfPage(null)).toBeNull();
  });
});

describe("tallyRejected", () => {
  const rows = [
    page(1, { doc_id: "LTI1", schema_version: 1, retrieved_at: "2026-08-03" }),
    page(2, { doc_id: "LTI2", schema_version: 1, retrieved_at: "2026-09-26" }),
    page(
      3,
      { doc_id: "LTI3", schema_version: 1, retrieved_at: "2026-09-26" },
      `${BODY}\nDVR: 0059463`
    ),
    page(4, { schema_version: 1, retrieved_at: "2026-08-03" }),
  ];

  test("reason filter keeps only pages carrying that issue", () => {
    const t = tallyRejected(rows, "statute", "generation:known_bad");
    expect(t.ids).toEqual(["LTI1"]);
    expect(t.matched).toBe(2);
    // Page 4 has no number at all — counted, not listable.
    expect(t.withoutId).toBe(1);
    expect(t.issues["generation:known_bad"]).toBe(2);
  });

  test("without a reason every rejected page counts, plausible ones never", () => {
    const t = tallyRejected(rows, "statute", undefined);
    expect(t.ids.sort()).toEqual(["LTI1", "LTI3"]);
    expect(t.issues["body:letterhead"]).toBe(1);
  });

  test("tallies accumulate across batches", () => {
    const t = tallyRejected(rows.slice(0, 1), "statute", "generation:known_bad");
    tallyRejected(rows.slice(1), "statute", "generation:known_bad", t);
    expect(t.matched).toBe(2);
  });
});

describe("rejectedListPath", () => {
  test("under <root>/_state, reason made filename-safe", () => {
    expect(rejectedListPath("/law-corpus", "law-at-bezirke", "generation:known_bad")).toBe(
      join("/law-corpus", "_state", "rejected-law-at-bezirke-generation-known_bad.txt")
    );
    expect(rejectedListPath("/law-corpus", "law-at-bezirke")).toBe(
      join("/law-corpus", "_state", "rejected-law-at-bezirke-all.txt")
    );
  });
});
