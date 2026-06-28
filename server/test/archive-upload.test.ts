import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import {
  ARCHIVE_LIMITS,
  ArchiveSafetyError,
  readSafeZipEntries,
} from "../src/core/archive-upload.ts";

async function zipWith(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("readSafeZipEntries", () => {
  test("extracts files and ignores macOS metadata", async () => {
    const input = await zipWith({
      "Akte-123/vertrag.txt": "Vertrag",
      "Akte-123/beweis.pdf": "%PDF-test",
      "__MACOSX/._vertrag.txt": "metadata",
      ".DS_Store": "metadata",
    });
    const result = await readSafeZipEntries(input);
    expect(result.entries.map((entry) => entry.name)).toEqual([
      "Akte-123/vertrag.txt",
      "Akte-123/beweis.pdf",
    ]);
    expect(result.budget.entries).toBe(2);
  });

  test("shares byte and entry budgets across nested archives", async () => {
    const nested = await zipWith({ "inner.txt": "inside" });
    const outer = await zipWith({ "outer.txt": "outside", "nested.zip": nested });
    const first = await readSafeZipEntries(outer);
    const nestedEntry = first.entries.find((entry) => entry.name === "nested.zip");
    expect(nestedEntry).toBeDefined();
    const second = await readSafeZipEntries(nestedEntry!.data, {
      depth: 1,
      budget: first.budget,
    });
    expect(second.budget.entries).toBe(3);
    expect(second.entries[0]?.name).toBe("inner.txt");
  });

  test("rejects path traversal entries", async () => {
    const input = await zipWith({ "../outside.txt": "nope" });
    await expect(readSafeZipEntries(input)).rejects.toThrow(ArchiveSafetyError);
  });

  test("rejects excessive nesting", async () => {
    await expect(
      readSafeZipEntries(await zipWith({ "x.txt": "x" }), {
        depth: ARCHIVE_LIMITS.maxDepth + 1,
      })
    ).rejects.toThrow(/nesting/i);
  });

  test("rejects archives with too many files", async () => {
    const zip = new JSZip();
    for (let i = 0; i <= ARCHIVE_LIMITS.maxEntries; i++) zip.file(`f-${i}.txt`, "x");
    const input = await zip.generateAsync({ type: "nodebuffer" });
    await expect(readSafeZipEntries(input)).rejects.toThrow(/more than/i);
  });
});
