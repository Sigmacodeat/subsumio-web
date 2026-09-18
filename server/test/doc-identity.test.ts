import { describe, expect, test } from "bun:test";
import { docIdFromContent, loadActiveDocSlugs, resolveSlug } from "../scripts/doc-identity.ts";

const NORMALIZED = `---
schema_version: 1
doc_id: BVWGT_20150915_G305_1435812_2_00
doc_id_alt: []
source_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Bvwg&Dokumentnummer=BVWGT_20150915_G305_1435812_2_00"
---

# Bundesverwaltungsgericht — G305 1435812-2
`;

const RAW = `---
type: court_decision
case_number: G309 2126636-1
source_url: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Bvwg&Dokumentnummer=BVWGT_20161227_G309_2126636_1_00
---

# Bundesverwaltungsgericht — G309 2126636-1
`;

describe("doc-identity", () => {
  test("doc id from the canonical schema", () => {
    expect(docIdFromContent(NORMALIZED)).toBe("BVWGT_20150915_G305_1435812_2_00");
  });

  test("doc id from a raw file's RIS link", () => {
    expect(docIdFromContent(RAW)).toBe("BVWGT_20161227_G309_2126636_1_00");
  });

  test("no frontmatter, no id", () => {
    expect(docIdFromContent("# nur Text")).toBeNull();
    expect(docIdFromContent("---\ndoc_id: null\n---\n")).toBeNull();
  });

  test("a known document keeps its page; an unknown one gets the new slug", () => {
    const known = new Map([["BVWGT_1", "legal/judikatur/at/g309-1"]]);
    expect(resolveSlug(known, "BVWGT_1", "legal/judikatur/at/bvwg/2016-12-27-g309-1")).toBe(
      "legal/judikatur/at/g309-1"
    );
    expect(resolveSlug(known, "BVWGT_2", "legal/judikatur/at/bvwg/x")).toBe(
      "legal/judikatur/at/bvwg/x"
    );
    expect(resolveSlug(known, null, "d")).toBe("d");
  });

  test("the lookup reads doc_id, falls back to the RIS link, keeps the oldest page", async () => {
    const engine = {
      async executeRaw() {
        return [
          { slug: "a", doc_id: "DOC_A", source_url: null },
          { slug: "b", doc_id: null, source_url: "https://x/?Dokumentnummer=DOC_B" },
          { slug: "a-dup", doc_id: "DOC_A", source_url: null },
        ];
      },
    };
    const map = await loadActiveDocSlugs(engine, "law-at-judikatur-bvwg");
    expect(map.get("DOC_A")).toBe("a");
    expect(map.get("DOC_B")).toBe("b");
  });
});
