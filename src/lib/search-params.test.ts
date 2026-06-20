import { describe, test, expect } from "vitest";
import { sanitizeTypeFilter, buildSearchParams, ALLOWED_TYPES, LEGAL_BOOST } from "./search-params";

describe("sanitizeTypeFilter", () => {
  test("allows valid types", () => {
    expect(sanitizeTypeFilter("statute,deadline")).toBe("statute,deadline");
  });

  test("filters out invalid types", () => {
    expect(sanitizeTypeFilter("statute,invalid,norm")).toBe("statute,norm");
  });

  test("returns empty for all invalid", () => {
    expect(sanitizeTypeFilter("hacker,injection")).toBe("");
  });

  test("trims whitespace", () => {
    expect(sanitizeTypeFilter(" statute , deadline ")).toBe("statute,deadline");
  });

  test("returns empty for empty string", () => {
    expect(sanitizeTypeFilter("")).toBe("");
  });

  test("handles single type", () => {
    expect(sanitizeTypeFilter("case")).toBe("case");
  });
});

describe("buildSearchParams", () => {
  test("builds base params", () => {
    const params = buildSearchParams("contract", "10", "");
    expect(params.get("q")).toBe("contract");
    expect(params.get("limit")).toBe("10");
    expect(params.get("boost_types")).toBe(LEGAL_BOOST);
    expect(params.has("type")).toBe(false);
  });

  test("adds type filter when present", () => {
    const params = buildSearchParams("clause", "20", "contract,statute");
    expect(params.get("q")).toBe("clause");
    expect(params.get("type")).toBe("contract,statute");
  });

  test("encodes special chars", () => {
    const params = buildSearchParams("§ 823 BGB", "5", "");
    expect(params.get("q")).toBe("§ 823 BGB");
  });
});

describe("ALLOWED_TYPES", () => {
  test("contains core legal types", () => {
    expect(ALLOWED_TYPES.has("statute")).toBe(true);
    expect(ALLOWED_TYPES.has("deadline")).toBe(true);
    expect(ALLOWED_TYPES.has("judgement")).toBe(true);
    expect(ALLOWED_TYPES.has("case")).toBe(true);
  });

  test("does not contain injection strings", () => {
    expect(ALLOWED_TYPES.has("../admin")).toBe(false);
    expect(ALLOWED_TYPES.has("<script>")).toBe(false);
  });
});
