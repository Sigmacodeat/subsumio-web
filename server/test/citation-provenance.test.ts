import { describe, test, expect } from "bun:test";
import {
  parsePageSegments,
  pageForOffset,
  pageForPassage,
  provenanceForChunk,
} from "../src/core/citation-provenance.ts";

// Mirrors the real extractPdf output shape.
const DOC = [
  "--- Page 1 ---",
  "Der Kläger begehrt Schadensersatz nach § 280 BGB.",
  "###***###",
  "--- Page 2 ---",
  "Die Beklagte bestreitet den Anspruch dem Grunde nach.",
  "###***###",
  "--- Page 3 ---",
  "Beweis: Zeugnis des Herrn Muster, Anlage K3.",
].join("\n");

describe("citation-provenance", () => {
  test("parses page segments with correct page numbers", () => {
    const segs = parsePageSegments(DOC);
    expect(segs.map((s) => s.page)).toEqual([1, 2, 3]);
    expect(segs[0].text).toBe("Der Kläger begehrt Schadensersatz nach § 280 BGB.");
    expect(segs[1].text).toBe("Die Beklagte bestreitet den Anspruch dem Grunde nach.");
    expect(segs[2].text).toBe("Beweis: Zeugnis des Herrn Muster, Anlage K3.");
  });

  test("segment char ranges actually slice back to their text", () => {
    const segs = parsePageSegments(DOC);
    for (const s of segs) {
      expect(DOC.slice(s.start, s.end)).toBe(s.text);
    }
  });

  test("pageForOffset maps offsets to the right page", () => {
    const segs = parsePageSegments(DOC);
    expect(pageForOffset(segs, DOC.indexOf("§ 280 BGB"))).toBe(1);
    expect(pageForOffset(segs, DOC.indexOf("bestreitet"))).toBe(2);
    expect(pageForOffset(segs, DOC.indexOf("Anlage K3"))).toBe(3);
  });

  test("offset on a marker line (not body) returns null", () => {
    const segs = parsePageSegments(DOC);
    // Offset 0 is the first char of "--- Page 1 ---" marker, not page body.
    expect(pageForOffset(segs, 0)).toBeNull();
  });

  test("pageForPassage finds the page a quote sits on", () => {
    expect(pageForPassage(DOC, "Schadensersatz nach § 280 BGB")).toBe(1);
    expect(pageForPassage(DOC, "bestreitet den Anspruch")).toBe(2);
    expect(pageForPassage(DOC, "nicht im Dokument")).toBeNull();
  });

  test("provenanceForChunk returns page + within-page offset", () => {
    const segs = parsePageSegments(DOC);
    const start = DOC.indexOf("Die Beklagte");
    const end = DOC.indexOf("nach.") + "nach.".length;
    const prov = provenanceForChunk(segs, start, end);
    expect(prov.page).toBe(2);
    expect(prov.pageEnd).toBe(2);
    expect(prov.charOffsetInPage).toBe(0); // chunk starts at the page body start
  });

  test("chunk spanning a page boundary reports start and end pages", () => {
    const segs = parsePageSegments(DOC);
    const start = DOC.indexOf("§ 280 BGB"); // page 1
    const end = DOC.indexOf("bestreitet") + 5; // page 2
    const prov = provenanceForChunk(segs, start, end);
    expect(prov.page).toBe(1);
    expect(prov.pageEnd).toBe(2);
  });

  test("documents without page markers yield no segments (clean absence)", () => {
    const plain = "Ein einfaches Dokument ohne Seitenmarker.";
    expect(parsePageSegments(plain)).toEqual([]);
    expect(pageForPassage(plain, "einfaches")).toBeNull();
  });
});
