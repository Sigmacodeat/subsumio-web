// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { executeBatch, type BatchOperation } from "./batch-edit";

const globalFetch = vi.fn();

describe("executeBatch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", globalFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalFetch.mockReset();
  });

  function mockPage(content: string, tags: string[] = [], type = "page") {
    return {
      ok: true,
      json: async () => ({
        compiled_truth: content,
        frontmatter: {},
        tags,
        type,
      }),
    };
  }

  function mockUpdate(ok = true) {
    return { ok };
  }

  test("replace_text updates matching pages", async () => {
    globalFetch
      .mockResolvedValueOnce(mockPage("Alter Text inhalt"))
      .mockResolvedValueOnce(mockUpdate());

    const op: BatchOperation = {
      type: "replace_text",
      slugs: ["page-1"],
      search: "Alter Text",
      replacement: "Neuer Text",
    };

    const result = await executeBatch(op, { Authorization: "Bearer token" });
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.results[0].changes_made).toBe(1);
  });

  test("replace_text returns 0 changes when no matches", async () => {
    globalFetch
      .mockResolvedValueOnce(mockPage("Unrelated content"))
      .mockResolvedValueOnce(mockUpdate());

    const op: BatchOperation = {
      type: "replace_text",
      slugs: ["page-1"],
      search: "Missing",
      replacement: "X",
    };

    const result = await executeBatch(op, {});
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].changes_made).toBe(0);
  });

  test("add_tag adds tag when not present", async () => {
    globalFetch
      .mockResolvedValueOnce(mockPage("content", ["tag-a"]))
      .mockResolvedValueOnce(mockUpdate());

    const op: BatchOperation = {
      type: "add_tag",
      slugs: ["page-1"],
      tag: "tag-b",
    };

    const result = await executeBatch(op, {});
    expect(result.results[0].changes_made).toBe(1);
  });

  test("remove_tag removes tag when present", async () => {
    globalFetch
      .mockResolvedValueOnce(mockPage("content", ["tag-a"]))
      .mockResolvedValueOnce(mockUpdate());

    const op: BatchOperation = {
      type: "remove_tag",
      slugs: ["page-1"],
      tag: "tag-a",
    };

    const result = await executeBatch(op, {});
    expect(result.results[0].changes_made).toBe(1);
  });

  test("update_frontmatter applies changes", async () => {
    globalFetch.mockResolvedValueOnce(mockPage("content")).mockResolvedValueOnce(mockUpdate());

    const op: BatchOperation = {
      type: "update_frontmatter",
      slugs: ["page-1"],
      frontmatter_updates: { status: "reviewed" },
    };

    const result = await executeBatch(op, {});
    expect(result.results[0].changes_made).toBe(1);
  });

  test("change_type changes type when different", async () => {
    globalFetch
      .mockResolvedValueOnce(mockPage("content", [], "page"))
      .mockResolvedValueOnce(mockUpdate());

    const op: BatchOperation = {
      type: "change_type",
      slugs: ["page-1"],
      new_type: "contract",
    };

    const result = await executeBatch(op, {});
    expect(result.results[0].changes_made).toBe(1);
  });

  test("dry_run returns preview without saving", async () => {
    globalFetch.mockResolvedValueOnce(mockPage("Alter Text"));

    const op: BatchOperation = {
      type: "replace_text",
      slugs: ["page-1"],
      search: "Alter Text",
      replacement: "Neuer Text",
      dry_run: true,
    };

    const result = await executeBatch(op, {});
    expect(result.dry_run).toBe(true);
    expect(result.results[0].success).toBe(true);
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  test("reports fetch failure", async () => {
    globalFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const op: BatchOperation = {
      type: "replace_text",
      slugs: ["page-1"],
      search: "x",
      replacement: "y",
    };

    const result = await executeBatch(op, {});
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("404");
  });
});
