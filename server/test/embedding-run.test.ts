import { describe, expect, test } from "bun:test";
import { MIN_EMBED_CHARS, noiseFilterSql, pagePrefix, toVectorStr } from "../src/core/embedding-run.ts";

describe("noiseFilterSql", () => {
  test("uses the shared threshold and the caller's alias", () => {
    expect(noiseFilterSql("c")).toBe(`length(btrim(c.chunk_text)) >= ${MIN_EMBED_CHARS}`);
    expect(noiseFilterSql("cc")).toContain("cc.chunk_text");
  });
});

describe("toVectorStr", () => {
  test("writes pgvector's own literal, not JSON", () => {
    expect(toVectorStr(new Float32Array([1, 0.5, -2]))).toBe("[1,0.5,-2]");
  });
});

describe("pagePrefix", () => {
  test("names the law on a federal norm", () => {
    const prefix = pagePrefix({
      title: "§ 1295 ABGB",
      type: "statute",
      frontmatter: {
        jurisdiction: "at",
        abbr: "ABGB",
        short_title: "Allgemeines bürgerliches Gesetzbuch",
        paragraph_ref: "§ 1295",
        doc_class: "statute",
      },
    });
    expect(prefix).toContain("ABGB");
    expect(prefix).toContain("§ 1295");
  });

  test("names the state on state law — nine states share the wording", () => {
    const prefix = pagePrefix({
      title: "Tiroler Straßengesetz",
      type: "statute",
      frontmatter: {
        jurisdiction: "at",
        region: "Tirol",
        short_title: "Tiroler Straßengesetz",
        paragraph_ref: "§ 61",
        doc_class: "statute",
      },
    });
    expect(prefix).toContain("Tirol");
    expect(prefix).toContain("§ 61");
  });

  test("a page without legal metadata still gets its title", () => {
    const prefix = pagePrefix({ title: "Kanzleihandbuch", type: "note", frontmatter: {} });
    expect(prefix ?? "").toContain("Kanzleihandbuch");
  });
});
