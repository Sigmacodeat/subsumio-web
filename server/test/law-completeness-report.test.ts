import { describe, expect, test } from "bun:test";
import { summarize } from "../scripts/law-completeness-report.ts";

describe("summarize", () => {
  test("counts each status independently", () => {
    expect(
      summarize([
        { status: "complete" },
        { status: "complete" },
        { status: "partial" },
        { status: "missing" },
      ])
    ).toEqual({ complete: 2, partial: 1, missing: 1 });
  });

  test("empty input is all zeros, not a crash", () => {
    expect(summarize([])).toEqual({ complete: 0, partial: 0, missing: 0 });
  });

  test("all-complete has zero gaps", () => {
    expect(summarize([{ status: "complete" }, { status: "complete" }])).toEqual({
      complete: 2,
      partial: 0,
      missing: 0,
    });
  });
});
