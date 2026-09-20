import { describe, expect, test } from "bun:test";
import { promotionVerdict, type PromotionState } from "../src/core/embedding-run.ts";

const ready: PromotionState = {
  signature: "openrouter:qwen/qwen3-embedding-8b:1536",
  filledRows: 3_920_512,
  openCandidates: 0,
  strayModelRows: 0,
  missingIndexes: [],
  scaffoldType: "vector(1536)",
  liveType: "vector(1536)",
  allowPartial: false,
};

describe("promotionVerdict", () => {
  test("lets a finished column through", () => {
    const v = promotionVerdict(ready);
    expect(v.blockers).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  test("refuses an empty column — that would switch search off", () => {
    const v = promotionVerdict({ ...ready, filledRows: 0, openCandidates: 3_920_512 });
    expect(v.blockers.join(" ")).toContain("leer");
  });

  test("--allow-partial is no way to promote an empty column", () => {
    const v = promotionVerdict({
      ...ready,
      filledRows: 0,
      openCandidates: 3_920_512,
      allowPartial: true,
    });
    expect(v.blockers.length).toBeGreaterThan(0);
  });

  test("refuses vectors of a second model", () => {
    const v = promotionVerdict({ ...ready, strayModelRows: 12 });
    expect(v.blockers.join(" ")).toContain("anderen Modells");
  });

  test("refuses while chunks are still open", () => {
    const v = promotionVerdict({ ...ready, openCandidates: 40_000 });
    expect(v.blockers.join(" ")).toContain("noch nicht eingebettet");
  });

  test("--allow-partial turns that into a warning with the share", () => {
    const v = promotionVerdict({
      ...ready,
      filledRows: 3_900_000,
      openCandidates: 39_000,
      allowPartial: true,
    });
    expect(v.blockers).toEqual([]);
    expect(v.warnings.join(" ")).toContain("1,0 %");
  });

  test("refuses without the indexes — search would crawl", () => {
    const v = promotionVerdict({ ...ready, missingIndexes: ["idx_chunks_embedding_qwen_hnsw"] });
    expect(v.blockers.join(" ")).toContain("idx_chunks_embedding_qwen_hnsw");
  });

  test("refuses a column that carries no signature of ours", () => {
    const v = promotionVerdict({ ...ready, signature: undefined });
    expect(v.blockers.join(" ")).toContain("Signatur");
  });

  test("warns when the widths differ, but does not block", () => {
    const v = promotionVerdict({ ...ready, scaffoldType: "vector(1024)" });
    expect(v.blockers).toEqual([]);
    expect(v.warnings.join(" ")).toContain("vector(1024)");
  });
});
