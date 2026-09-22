import { describe, expect, test } from "bun:test";
import { mapToCanonical, parseRaw, regionOfDocId } from "../scripts/normalize/normalize-corpus.ts";

/**
 * Nine states legislate on the same subjects in near-identical words; the
 * state is what tells their sections apart in the embedding context. The XML
 * fetcher writes no `bundesland`, so a normalizer that read only the raw
 * frontmatter left thousands of state-law pages without one.
 */
describe("regionOfDocId", () => {
  test("every RIS state prefix maps to its state", () => {
    expect(regionOfDocId("LBG40012345")).toBe("Burgenland");
    expect(regionOfDocId("LKT40012345")).toBe("Kärnten");
    expect(regionOfDocId("LNO40012345")).toBe("Niederösterreich");
    expect(regionOfDocId("LOO40012345")).toBe("Oberösterreich");
    expect(regionOfDocId("LSB40012345")).toBe("Salzburg");
    expect(regionOfDocId("LST40012345")).toBe("Steiermark");
    expect(regionOfDocId("LTI40038778")).toBe("Tirol");
    expect(regionOfDocId("LVB40010730")).toBe("Vorarlberg");
    expect(regionOfDocId("LWI40018339")).toBe("Wien");
  });

  test("federal and unknown numbers name no state", () => {
    expect(regionOfDocId("NOR40277286")).toBeNull();
    expect(regionOfDocId("LXX40000001")).toBeNull();
    expect(regionOfDocId(null)).toBeNull();
    expect(regionOfDocId("")).toBeNull();
  });
});

describe("mapToCanonical — region", () => {
  const rawFile = (frontmatter: string) =>
    parseRaw(
      `---\n${frontmatter}\n---\n\n# Wiener Kinder- und Jugendhilfegesetz 2013\n\n§ 12 Text.\n`
    );

  test("a state-law file without `bundesland` still gets its state", () => {
    const fm = mapToCanonical(
      rawFile(
        [
          "title: Wiener Kinder- und Jugendhilfegesetz 2013",
          "type: statute",
          "jurisdiction: at",
          "source_url: https://www.ris.bka.gv.at/Dokumente/Landesnormen/LWI40018339/LWI40018339.xml",
        ].join("\n")
      ),
      "fallback"
    );
    expect(fm.doc_id).toBe("LWI40018339");
    expect(fm.region).toBe("Wien");
  });

  test("a state the raw file names wins over the derived one", () => {
    const fm = mapToCanonical(
      rawFile(
        [
          "title: Test",
          "type: statute",
          "jurisdiction: at",
          "bundesland: Tirol",
          "source_url: https://www.ris.bka.gv.at/Dokumente/Landesnormen/LTI40038778/LTI40038778.xml",
        ].join("\n")
      ),
      "fallback"
    );
    expect(fm.region).toBe("Tirol");
  });

  test("federal law gets no region", () => {
    const fm = mapToCanonical(
      rawFile(
        [
          "title: ABGB",
          "type: statute",
          "jurisdiction: at",
          "source_url: https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40277286/NOR40277286.xml",
        ].join("\n")
      ),
      "fallback"
    );
    expect(fm.region).toBeNull();
  });
});
