/**
 * Tests for batch-rows.ts — shared batch-insert row builders.
 *
 * Covers:
 *   - stripNul: NUL stripping from free-text fields
 *   - buildLinkRows: link row construction + defaulting + NUL policy
 *   - buildTimelineRows: timeline row construction + NUL stripping
 *   - buildTakeRows: takes row construction + weight clamping + NUL policy
 */
import { describe, test, expect } from "bun:test";
import {
  stripNul,
  buildLinkRows,
  buildTimelineRows,
  buildTakeRows,
} from "../src/core/batch-rows.ts";
import type { LinkBatchInput, TimelineBatchInput, TakeBatchInput } from "../src/core/engine.ts";

describe("stripNul", () => {
  test("passes through strings without NUL", () => {
    expect(stripNul("hello world")).toBe("hello world");
    expect(stripNul("")).toBe("");
    expect(stripNul('commas, quotes", braces{}')).toBe('commas, quotes", braces{}');
  });

  test("strips NUL characters", () => {
    expect(stripNul("hello\0world")).toBe("helloworld");
    expect(stripNul("\0\0\0")).toBe("");
    expect(stripNul("text\0with\0nul")).toBe("textwithnul");
  });

  test("strips multiple NULs in a row", () => {
    expect(stripNul("a\0\0\0b")).toBe("ab");
  });

  test("preserves other special characters", () => {
    expect(stripNul("em—dash")).toBe("em—dash");
    expect(stripNul("tab\there")).toBe("tab\there");
    expect(stripNul("newline\nhere")).toBe("newline\nhere");
  });
});

describe("buildLinkRows", () => {
  test("builds rows with correct defaults", () => {
    const inputs: LinkBatchInput[] = [
      {
        from_slug: "page-a",
        to_slug: "page-b",
      },
    ];
    const rows = buildLinkRows(inputs);
    expect(rows).toHaveLength(1);
    expect(rows[0].from_slug).toBe("page-a");
    expect(rows[0].to_slug).toBe("page-b");
    expect(rows[0].link_type).toBe(""); // || "" default
    expect(rows[0].link_source).toBe("markdown"); // || "markdown" default
    expect(rows[0].from_source_id).toBe("default"); // || "default" default
    expect(rows[0].to_source_id).toBe("default");
    expect(rows[0].origin_source_id).toBe("default");
    expect(rows[0].origin_slug).toBeNull(); // || null for empty
    expect(rows[0].origin_field).toBeNull();
    expect(rows[0].link_kind).toBeNull(); // ?? null
  });

  test("preserves explicit values", () => {
    const inputs: LinkBatchInput[] = [
      {
        from_slug: "a",
        to_slug: "b",
        link_type: "ref",
        context: "see also",
        link_source: "frontmatter",
        origin_slug: "orig",
        origin_field: "body",
        from_source_id: "src1",
        to_source_id: "src2",
        origin_source_id: "src3",
        link_kind: "strong",
      },
    ];
    const rows = buildLinkRows(inputs);
    expect(rows[0].link_type).toBe("ref");
    expect(rows[0].context).toBe("see also");
    expect(rows[0].link_source).toBe("frontmatter");
    expect(rows[0].origin_slug).toBe("orig");
    expect(rows[0].origin_field).toBe("body");
    expect(rows[0].from_source_id).toBe("src1");
    expect(rows[0].to_source_id).toBe("src2");
    expect(rows[0].origin_source_id).toBe("src3");
    expect(rows[0].link_kind).toBe("strong");
  });

  test("strips NUL from context (free-text body field)", () => {
    const inputs: LinkBatchInput[] = [
      {
        from_slug: "a",
        to_slug: "b",
        context: "hello\0world",
      },
    ];
    const rows = buildLinkRows(inputs);
    expect(rows[0].context).toBe("helloworld");
  });

  test("does NOT strip NUL from identity fields (from_slug, to_slug)", () => {
    const inputs: LinkBatchInput[] = [
      {
        from_slug: "page\0evil",
        to_slug: "b",
      },
    ];
    const rows = buildLinkRows(inputs);
    // Identity fields are NOT stripped — NUL in slug should error at DB level
    expect(rows[0].from_slug).toBe("page\0evil");
  });

  test("empty string link_kind is preserved (?? null, not || null)", () => {
    const inputs: LinkBatchInput[] = [
      {
        from_slug: "a",
        to_slug: "b",
        link_kind: "",
      },
    ];
    const rows = buildLinkRows(inputs);
    // ?? null preserves empty string; || null would convert to null
    expect(rows[0].link_kind).toBe("");
  });

  test("handles empty array", () => {
    expect(buildLinkRows([])).toEqual([]);
  });

  test("handles large batch", () => {
    const inputs: LinkBatchInput[] = Array.from({ length: 1000 }, (_, i) => ({
      from_slug: `page-${i}`,
      to_slug: `page-${i + 1}`,
    }));
    const rows = buildLinkRows(inputs);
    expect(rows).toHaveLength(1000);
    expect(rows[999].to_slug).toBe("page-1000");
  });
});

describe("buildTimelineRows", () => {
  test("builds rows with correct defaults", () => {
    const inputs: TimelineBatchInput[] = [
      {
        slug: "case-1",
        date: "2024-01-15",
        summary: "Hearing scheduled",
      },
    ];
    const rows = buildTimelineRows(inputs);
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("case-1");
    expect(rows[0].date).toBe("2024-01-15");
    expect(rows[0].source).toBe(""); // || "" default
    expect(rows[0].summary).toBe("Hearing scheduled");
    expect(rows[0].detail).toBe(""); // || "" default
    expect(rows[0].source_id).toBe("default");
  });

  test("strips NUL from summary and detail (free-text body fields)", () => {
    const inputs: TimelineBatchInput[] = [
      {
        slug: "case-1",
        date: "2024-01-15",
        summary: "clean\0text",
        detail: "also\0clean",
      },
    ];
    const rows = buildTimelineRows(inputs);
    expect(rows[0].summary).toBe("cleantext");
    expect(rows[0].detail).toBe("alsoclean");
  });

  test("does NOT strip NUL from slug (identity field)", () => {
    const inputs: TimelineBatchInput[] = [
      {
        slug: "case\0evil",
        date: "2024-01-15",
        summary: "text",
      },
    ];
    const rows = buildTimelineRows(inputs);
    expect(rows[0].slug).toBe("case\0evil");
  });
});

describe("buildTakeRows", () => {
  test("builds rows with correct defaults", () => {
    const inputs: TakeBatchInput[] = [
      {
        page_id: 42,
        row_num: 1,
        claim: "The defendant is liable",
        kind: "legal_claim",
        holder: "court",
        weight: 0.8,
      },
    ];
    const { rows, weightClamped } = buildTakeRows(inputs);
    expect(rows).toHaveLength(1);
    expect(rows[0].page_id).toBe(42);
    expect(rows[0].row_num).toBe(1);
    expect(rows[0].claim).toBe("The defendant is liable");
    expect(rows[0].kind).toBe("legal_claim");
    expect(rows[0].holder).toBe("court");
    expect(rows[0].weight).toBe(0.8);
    expect(rows[0].since_date).toBeNull();
    expect(rows[0].until_date).toBeNull();
    expect(rows[0].source).toBeNull();
    expect(rows[0].superseded_by).toBeNull();
    expect(rows[0].active).toBe(true); // ?? true default
    expect(weightClamped).toBe(0);
  });

  test("strips NUL from claim (free-text body field)", () => {
    const inputs: TakeBatchInput[] = [
      {
        page_id: 1,
        row_num: 1,
        claim: "evil\0claim",
        kind: "legal_claim",
        holder: "court",
        weight: 0.5,
      },
    ];
    const { rows } = buildTakeRows(inputs);
    expect(rows[0].claim).toBe("evilclaim");
  });

  test("does NOT strip NUL from holder (security-relevant field)", () => {
    const inputs: TakeBatchInput[] = [
      {
        page_id: 1,
        row_num: 1,
        claim: "text",
        kind: "legal_claim",
        holder: "court\0evil",
        weight: 0.5,
      },
    ];
    const { rows } = buildTakeRows(inputs);
    // holder is security-relevant (read-side ANY(allowlist) filter) — NOT stripped
    expect(rows[0].holder).toBe("court\0evil");
  });

  test("does NOT strip NUL from kind (identity field)", () => {
    const inputs: TakeBatchInput[] = [
      {
        page_id: 1,
        row_num: 1,
        claim: "text",
        kind: "legal\0claim",
        holder: "court",
        weight: 0.5,
      },
    ];
    const { rows } = buildTakeRows(inputs);
    expect(rows[0].kind).toBe("legal\0claim");
  });

  test("clamps weight > 1 to 1", () => {
    const inputs: TakeBatchInput[] = [
      {
        page_id: 1,
        row_num: 1,
        claim: "text",
        kind: "legal_claim",
        holder: "court",
        weight: 1.5,
      },
    ];
    const { rows, weightClamped } = buildTakeRows(inputs);
    expect(rows[0].weight).toBeLessThanOrEqual(1);
    expect(weightClamped).toBe(1);
  });

  test("clamps weight < 0 to 0", () => {
    const inputs: TakeBatchInput[] = [
      {
        page_id: 1,
        row_num: 1,
        claim: "text",
        kind: "legal_claim",
        holder: "court",
        weight: -0.5,
      },
    ];
    const { rows, weightClamped } = buildTakeRows(inputs);
    expect(rows[0].weight).toBeGreaterThanOrEqual(0);
    expect(weightClamped).toBe(1);
  });

  test("handles empty array", () => {
    const { rows, weightClamped } = buildTakeRows([]);
    expect(rows).toEqual([]);
    expect(weightClamped).toBe(0);
  });
});
