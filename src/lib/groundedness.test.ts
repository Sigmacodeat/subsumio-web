import { describe, test, expect } from "vitest";
import { assessGroundedness, type Groundedness } from "./groundedness";

describe("assessGroundedness — low (no citations)", () => {
  test("returns 'low' when no citations and no gaps", () => {
    const result = assessGroundedness(undefined, undefined);
    expect(result.level).toBe("low");
    expect(result.label).toBe("Ungestützt");
    expect(result.citationCount).toBe(0);
    expect(result.gapCount).toBe(0);
  });

  test("returns 'low' when citations is empty array", () => {
    const result = assessGroundedness([], []);
    expect(result.level).toBe("low");
    expect(result.citationCount).toBe(0);
  });

  test("returns 'low' when citations is empty but gaps exist", () => {
    const result = assessGroundedness([], ["gap1"]);
    expect(result.level).toBe("low");
    expect(result.citationCount).toBe(0);
    expect(result.gapCount).toBe(1);
  });

  test("hint mentions Halluzinations-Risiko", () => {
    const result = assessGroundedness(undefined, undefined);
    expect(result.hint).toContain("Halluzination");
  });

  test("cls contains red styling", () => {
    const result = assessGroundedness(undefined, undefined);
    expect(result.cls).toContain("red");
  });
});

describe("assessGroundedness — partial (citations + gaps)", () => {
  test("returns 'partial' when citations exist and gaps exist", () => {
    const result = assessGroundedness(
      [{ slug: "doc1" }, { slug: "doc2" }],
      ["gap1"],
    );
    expect(result.level).toBe("partial");
    expect(result.label).toBe("Teilweise gestützt");
    expect(result.citationCount).toBe(2);
    expect(result.gapCount).toBe(1);
  });

  test("returns 'partial' with single citation and single gap", () => {
    const result = assessGroundedness([{ slug: "doc1" }], ["gap1"]);
    expect(result.level).toBe("partial");
    expect(result.citationCount).toBe(1);
    expect(result.gapCount).toBe(1);
  });

  test("hint mentions citation count and gap count", () => {
    const result = assessGroundedness(
      [{ slug: "a" }, { slug: "b" }, { slug: "c" }],
      ["gap1", "gap2"],
    );
    expect(result.hint).toContain("3");
    expect(result.hint).toContain("2");
  });

  test("cls contains amber styling", () => {
    const result = assessGroundedness([{ slug: "x" }], ["gap"]);
    expect(result.cls).toContain("amber");
  });
});

describe("assessGroundedness — high (citations, no gaps)", () => {
  test("returns 'high' when citations exist and no gaps", () => {
    const result = assessGroundedness([{ slug: "doc1" }], undefined);
    expect(result.level).toBe("high");
    expect(result.label).toBe("Gut gestützt");
    expect(result.citationCount).toBe(1);
    expect(result.gapCount).toBe(0);
  });

  test("returns 'high' when citations exist and gaps is empty array", () => {
    const result = assessGroundedness([{ slug: "doc1" }], []);
    expect(result.level).toBe("high");
    expect(result.gapCount).toBe(0);
  });

  test("returns 'high' with multiple citations and no gaps", () => {
    const result = assessGroundedness(
      [{ slug: "a" }, { slug: "b" }, { slug: "c" }, { slug: "d" }],
      [],
    );
    expect(result.level).toBe("high");
    expect(result.citationCount).toBe(4);
  });

  test("hint mentions citation count", () => {
    const result = assessGroundedness([{ slug: "a" }, { slug: "b" }], []);
    expect(result.hint).toContain("2");
  });

  test("cls contains emerald styling", () => {
    const result = assessGroundedness([{ slug: "x" }], []);
    expect(result.cls).toContain("emerald");
  });
});

describe("assessGroundedness — edge cases", () => {
  test("handles null citations and null gaps", () => {
    const result = assessGroundedness(null as never, null as never);
    expect(result.citationCount).toBe(0);
    expect(result.gapCount).toBe(0);
    expect(result.level).toBe("low");
  });

  test("handles many citations with many gaps", () => {
    const citations = Array.from({ length: 100 }, (_, i) => ({ slug: `doc-${i}` }));
    const gaps = Array.from({ length: 50 }, (_, i) => `gap-${i}`);
    const result = assessGroundedness(citations, gaps);
    expect(result.level).toBe("partial");
    expect(result.citationCount).toBe(100);
    expect(result.gapCount).toBe(50);
  });

  test("citationCount and gapCount are always numbers", () => {
    const r1 = assessGroundedness(undefined, undefined);
    const r2 = assessGroundedness([{ slug: "x" }], ["g"]);
    const r3 = assessGroundedness([{ slug: "x" }], []);
    expect(typeof r1.citationCount).toBe("number");
    expect(typeof r1.gapCount).toBe("number");
    expect(typeof r2.citationCount).toBe("number");
    expect(typeof r2.gapCount).toBe("number");
    expect(typeof r3.citationCount).toBe("number");
    expect(typeof r3.gapCount).toBe("number");
  });

  test("label is always a non-empty string", () => {
    const r1 = assessGroundedness(undefined, undefined);
    const r2 = assessGroundedness([{ slug: "x" }], ["g"]);
    const r3 = assessGroundedness([{ slug: "x" }], []);
    expect(r1.label.length).toBeGreaterThan(0);
    expect(r2.label.length).toBeGreaterThan(0);
    expect(r3.label.length).toBeGreaterThan(0);
  });

  test("cls is always a non-empty string with Tailwind classes", () => {
    const r1 = assessGroundedness(undefined, undefined);
    const r2 = assessGroundedness([{ slug: "x" }], ["g"]);
    const r3 = assessGroundedness([{ slug: "x" }], []);
    expect(r1.cls).toContain("text-");
    expect(r2.cls).toContain("text-");
    expect(r3.cls).toContain("text-");
  });

  test("hint is always a non-empty string", () => {
    const r1 = assessGroundedness(undefined, undefined);
    const r2 = assessGroundedness([{ slug: "x" }], ["g"]);
    const r3 = assessGroundedness([{ slug: "x" }], []);
    expect(r1.hint.length).toBeGreaterThan(10);
    expect(r2.hint.length).toBeGreaterThan(10);
    expect(r3.hint.length).toBeGreaterThan(10);
  });
});
