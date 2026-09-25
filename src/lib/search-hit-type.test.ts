import { describe, expect, it } from "vitest";
import { searchHitType } from "./search-hit-type";

describe("searchHitType", () => {
  it("uses the page type, not the source id", () => {
    expect(searchHitType({ slug: "x/y", type: "legal_case" })).toBe("legal_case");
  });

  it("falls back to the slug when the engine sends no type", () => {
    expect(searchHitType({ slug: "cases/acme" })).toBe("legal_case");
    expect(searchHitType({ slug: "misc/abc" })).toBe("page");
  });
});
