import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  alreadyRefetched,
  docIdOfRawText,
  indexRawFilesById,
  parseIdList,
  retrievedAtOfRawText,
} from "../scripts/corpus-id-index.ts";
import { standardRelPath } from "../scripts/fetch-at-landesrecht-xml.ts";

/** Frontmatter shape written by fetch-at-landesrecht-xml.ts. */
const landesrecht = (docId: string, retrievedAt: string) =>
  [
    "---",
    `title: "Höfegesetz, Tiroler"`,
    "type: law",
    "jurisdiction: at",
    `doc_id: "${docId}"`,
    `id: "ris-${docId}"`,
    `gesetzesnummer: "10000001"`,
    `source_url: "https://www.ris.bka.gv.at/Dokumente/Landesnormen/${docId}/${docId}.xml"`,
    "source_format: xml",
    `retrieved_at: "${retrievedAt}"`,
    "---",
    "",
    "# Höfegesetz, Tiroler",
    "",
    "Als geschlossener Hof gilt jede land- und forstwirtschaftliche Besitzung.",
    "",
  ].join("\n");

describe("parseIdList", () => {
  test("one id per line; blanks, comments and repeats are dropped, order kept", () => {
    expect(parseIdList("LTI1\n\n# Kommentar\n  LTI2  \nLTI1\n")).toEqual(["LTI1", "LTI2"]);
  });
});

describe("docIdOfRawText", () => {
  test("the RIS number in source_url is the id — same rule as the normalizer", () => {
    expect(docIdOfRawText(landesrecht("LTI40038778", "2026-08-03"))).toBe("LTI40038778");
  });

  test("PDF corpora (document_id + PDF URL) resolve to the document number", () => {
    const text = [
      "---",
      `title: "Verordnung"`,
      `type: "law"`,
      `document_id: "BVB_NI_BN_20260923_14"`,
      `source_url: "https://ogd.ris.bka.gv.at/Dokumente/Bvb/BVB_NI_BN_20260923_14/BVB_NI_BN_20260923_14.pdf"`,
      "---",
      "",
      "Text",
    ].join("\n");
    expect(docIdOfRawText(text)).toBe("BVB_NI_BN_20260923_14");
  });

  test("a file without frontmatter has no id", () => {
    expect(docIdOfRawText("# nur Text")).toBeNull();
  });
});

describe("retrievedAtOfRawText / alreadyRefetched", () => {
  test("reads the quoted date", () => {
    expect(retrievedAtOfRawText(landesrecht("LTI1", "2026-08-03"))).toBe("2026-08-03");
  });

  test("an id is done only when every copy was retrieved on or after the start date", () => {
    expect(alreadyRefetched(["2026-09-26", "2026-09-27"], "2026-09-26")).toBe(true);
    expect(alreadyRefetched(["2026-09-26", "2026-08-03"], "2026-09-26")).toBe(false);
    expect(alreadyRefetched([null], "2026-09-26")).toBe(false);
    // No file on disk yet: must still be fetched.
    expect(alreadyRefetched([], "2026-09-26")).toBe(false);
  });
});

describe("indexRawFilesById", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "corpus-id-index-"));
    // Same document in the fetcher's layout and in the layout the old repair job wrote.
    mkdirSync(join(dir, "tir", "gnr-10000001"), { recursive: true });
    mkdirSync(join(dir, "tir", "gnr-tir-10000001"), { recursive: true });
    mkdirSync(join(dir, "_state"), { recursive: true });
    writeFileSync(join(dir, "tir", "gnr-10000001", "p-1.md"), landesrecht("LTI1", "2026-08-03"));
    writeFileSync(
      join(dir, "tir", "gnr-tir-10000001", "p-1.md"),
      landesrecht("LTI1", "2026-09-24")
    );
    writeFileSync(join(dir, "tir", "gnr-10000001", "p-2.md"), landesrecht("LTI2", "2026-08-03"));
    // Bookkeeping folders are never corpus files.
    writeFileSync(join(dir, "_state", "x.md"), landesrecht("LTI1", "2026-08-03"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("finds every copy of a wanted id, and only wanted ids", () => {
    const idx = indexRawFilesById(dir, new Set(["LTI1", "LTI9"]));
    expect([...idx.keys()]).toEqual(["LTI1"]);
    expect(idx.get("LTI1")).toEqual([
      join(dir, "tir", "gnr-10000001", "p-1.md"),
      join(dir, "tir", "gnr-tir-10000001", "p-1.md"),
    ]);
  });

  test("a missing directory yields an empty index", () => {
    expect(indexRawFilesById(join(dir, "fehlt"), new Set(["LTI1"])).size).toBe(0);
  });
});

describe("standardRelPath (Landesrecht, --ids for a document with no raw file yet)", () => {
  test("same layout as the page/index mode: <land>/gnr-<nr>/<key>.md", () => {
    expect(standardRelPath("LTI40038778", "10000001", "§ 1")).toBe(
      join("tir", "gnr-10000001", "p-1.md")
    );
  });

  test("no Gesetzesnummer → no-gn folder", () => {
    expect(standardRelPath("LTI40038778", "", "Art. 2")).toBe(join("tir", "no-gn", "art-2.md"));
  });

  test("§ 0 / Norm documents have no paragraph file", () => {
    expect(standardRelPath("LTI40038778", "10000001", "§ 0")).toBeNull();
    expect(standardRelPath("LTI40038778", "10000001", null)).toBeNull();
  });
});
