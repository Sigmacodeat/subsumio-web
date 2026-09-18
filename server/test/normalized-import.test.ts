import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { staleRawFiles } from "../scripts/normalized-import.ts";

describe("normalized-import", () => {
  test("only raw files without a current canonical copy are renormalized", () => {
    const root = mkdtempSync(join(tmpdir(), "ni-"));
    const raw = join(root, "at-normen");
    const norm = join(root, "_normalized", "at-normen");
    mkdirSync(join(raw, "gnr-1"), { recursive: true });
    mkdirSync(join(norm, "gnr-1"), { recursive: true });

    writeFileSync(join(raw, "gnr-1", "p-1.md"), "a"); // has a newer canonical copy
    writeFileSync(join(norm, "gnr-1", "p-1.md"), "a");
    utimesSync(join(raw, "gnr-1", "p-1.md"), 1000, 1000);
    utimesSync(join(norm, "gnr-1", "p-1.md"), 2000, 2000);

    writeFileSync(join(raw, "gnr-1", "p-2.md"), "b"); // no canonical copy
    writeFileSync(join(raw, "gnr-1", "p-3.md"), "c"); // changed after normalizing
    writeFileSync(join(norm, "gnr-1", "p-3.md"), "c");
    utimesSync(join(norm, "gnr-1", "p-3.md"), 1000, 1000);
    utimesSync(join(raw, "gnr-1", "p-3.md"), 2000, 2000);

    const stale = staleRawFiles(raw, norm)
      .map((f) => f.slice(raw.length + 1))
      .sort();
    expect(stale).toEqual(["gnr-1/p-2.md", "gnr-1/p-3.md"]);
  });

  test("a missing raw corpus has nothing to normalize", () => {
    expect(staleRawFiles("/nonexistent/x", "/nonexistent/y")).toEqual([]);
  });
});
