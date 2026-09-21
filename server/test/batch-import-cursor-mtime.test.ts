import { describe, expect, test } from "bun:test";
import { needsImport } from "../scripts/import-cursor.ts";

/**
 * The cursor's `importedSlugs` list used to be the whole story: once a slug
 * was in it, every later pipeline run skipped that file forever, even after
 * normalize-corpus.ts or a RIS metadata sync rewrote it with corrected
 * frontmatter. Found 2026-09-21 via 960 law-at-landesrecht pages stuck on a
 * pre-canonical-schema frontmatter (`nor_id` instead of `doc_id`) for days
 * despite the fixed file sitting right next to them on disk.
 */
describe("needsImport", () => {
  test("an unseen slug always needs importing", () => {
    expect(needsImport("gnr-1/p-1", 1000, new Set(), {})).toBe(true);
  });

  test("a known slug with an unrecorded mtime needs (re-)importing", () => {
    // The exact shape of an old cursor file loaded after this fix ships:
    // the slug is in `alreadyImported` but mtimeAt has no entry for it yet.
    const alreadyImported = new Set(["gnr-1/p-1"]);
    expect(needsImport("gnr-1/p-1", 1000, alreadyImported, {})).toBe(true);
  });

  test("a known slug whose file mtime is unchanged stays skipped", () => {
    const alreadyImported = new Set(["gnr-1/p-1"]);
    const mtimeAt = { "gnr-1/p-1": 1000 };
    expect(needsImport("gnr-1/p-1", 1000, alreadyImported, mtimeAt)).toBe(false);
  });

  test("a known slug whose file was rewritten since needs reimporting", () => {
    // This is the actual bug: normalize-corpus.ts (or a metadata sync)
    // rewrites the normalized .md with a corrected doc_id — the file's
    // mtime moves forward, and that alone must be enough to pick it up
    // again, with no dependency on reading or hashing its content first.
    const alreadyImported = new Set(["gnr-1/p-1"]);
    const mtimeAt = { "gnr-1/p-1": 1000 };
    expect(needsImport("gnr-1/p-1", 2000, alreadyImported, mtimeAt)).toBe(true);
  });
});
