/**
 * Unit tests for the pure helpers in repair-known-bad-generation.ts.
 * Live-verified separately on 2026-09-23 against real RIS data for one
 * document (LVB40033711): fetched, compared, written, and confirmed to
 * dedupe to the SAME existing DB page (doc_id-keyed import, migration
 * v141's unique index) with a fresh retrieved_at — not a duplicate. See
 * memory korpus-pipeline-audit-2026-09-23.
 */
import { describe, expect, it } from "bun:test";
import {
  coverage,
  syntheticDoc,
  words,
  xmlUrlFor,
  type DbRow,
} from "../scripts/repair-known-bad-generation.ts";

describe("words", () => {
  it("lower-cases and strips punctuation", () => {
    expect(words("§ 20 Lehrberechtigung.")).toEqual(["§", "20", "lehrberechtigung"]);
  });

  it("keeps the § sign (a legal citation, not punctuation)", () => {
    expect(words("§ 1295 ABGB")).toEqual(["§", "1295", "abgb"]);
  });

  it("drops empty tokens", () => {
    expect(words("  a   b  ")).toEqual(["a", "b"]);
  });
});

describe("coverage", () => {
  it("is 1 for identical word lists", () => {
    expect(coverage(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("is 1 for an empty expected list (nothing to miss)", () => {
    expect(coverage([], ["a", "b"])).toBe(1);
  });

  it("counts a missing word against coverage", () => {
    expect(coverage(["a", "b", "c", "d"], ["a", "b", "c"])).toBe(0.75);
  });

  it("treats words as a multiset — a word missing twice counts twice", () => {
    // expected has "a" twice, actual only once: one hit, one miss.
    expect(coverage(["a", "a", "b"], ["a", "b"])).toBeCloseTo(2 / 3);
  });

  it("extra words in actual don't inflate coverage above 1", () => {
    expect(coverage(["a"], ["a", "a", "a"])).toBe(1);
  });
});

describe("xmlUrlFor", () => {
  it("builds the predictable per-document RIS XML URL", () => {
    expect(xmlUrlFor("LVB40033711")).toBe(
      "https://www.ris.bka.gv.at/Dokumente/Landesnormen/LVB40033711/LVB40033711.xml"
    );
  });
});

describe("syntheticDoc", () => {
  const row: DbRow = {
    doc_id: "LVB40033711",
    statute_id: "20001394",
    paragraph_ref: "§ 20",
    short_title: "Schischulgesetz",
    abbr: null,
    compiled_truth: "# Schischulgesetz\n\n§ 20 Lehrberechtigung\n\n(1) ...",
  };

  it("maps DB frontmatter fields onto a DeltaDocument the delta-watcher helpers accept", () => {
    const doc = syntheticDoc(row);
    expect(doc.id).toBe("LVB40033711");
    expect(doc.gesetzesnummer).toBe("20001394");
    expect(doc.artikelParagraphAnlage).toBe("§ 20");
    expect(doc.kurztitel).toBe("Schischulgesetz");
    const url = xmlUrlFor("LVB40033711");
    expect(doc.xmlUrl).toBe(url);
    expect(doc.dokumentUrl).toBe(url);
    expect(doc.changeType).toBe("changed");
  });

  it("passes through a null abbreviation/short_title unchanged", () => {
    const doc = syntheticDoc({ ...row, abbr: null, short_title: null });
    expect(doc.abkuerzung).toBeNull();
    expect(doc.kurztitel).toBeNull();
  });
});
