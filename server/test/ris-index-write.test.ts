import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessIndexCompleteness,
  parseTotalHits,
  writeIndexAtomic,
} from "../scripts/ris-index-write.ts";

describe("parseTotalHits", () => {
  test("an error response without Hits is a failure, not zero documents", () => {
    expect(parseTotalHits({ OgdSearchResult: { Error: { Message: "x" } } })).toBeNull();
    expect(parseTotalHits({})).toBeNull();
    expect(parseTotalHits(null)).toBeNull();
    expect(parseTotalHits({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "0" } } } })).toBeNull();
  });

  test("reads the RIS #text node and a plain value", () => {
    expect(parseTotalHits({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "1234" } } } })).toBe(1234);
    expect(parseTotalHits({ OgdSearchResult: { OgdDocumentResults: { Hits: "17" } } })).toBe(17);
  });
});

describe("assessIndexCompleteness", () => {
  test("unknown total, lost pages or a short count are all rejected", () => {
    expect(assessIndexCompleteness({ total: null, written: 0, failedPages: [] }).ok).toBe(false);
    expect(assessIndexCompleteness({ total: 1000, written: 1000, failedPages: [7] }).ok).toBe(false);
    expect(assessIndexCompleteness({ total: 1000, written: 980, failedPages: [] }).ok).toBe(false);
  });

  test("a complete run passes", () => {
    expect(assessIndexCompleteness({ total: 1000, written: 995, failedPages: [] }).ok).toBe(true);
  });
});

describe("writeIndexAtomic", () => {
  let dir = "";
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  test("replaces the target in one step and leaves no temp file behind", () => {
    dir = mkdtempSync(join(tmpdir(), "ris-index-"));
    const out = join(dir, "ris-inforce.jsonl");
    writeFileSync(out, "old\n");
    writeIndexAtomic(out, ['{"nor":"A"}', '{"nor":"B"}']);
    expect(readFileSync(out, "utf8")).toBe('{"nor":"A"}\n{"nor":"B"}\n');
    expect(readdirSync(dir)).toEqual(["ris-inforce.jsonl"]);
  });

  test("a failed write keeps the previous index untouched", () => {
    dir = mkdtempSync(join(tmpdir(), "ris-index-"));
    const out = join(dir, "missing-subdir", "ris-inforce.jsonl");
    expect(() => writeIndexAtomic(out, ["x"])).toThrow();
    expect(existsSync(out)).toBe(false);
  });
});
