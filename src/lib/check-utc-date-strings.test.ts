// @vitest-environment node
import { describe, expect, test } from "vitest";
import { countInSource, scanRepository, BASELINE } from "../../scripts/check-utc-date-strings";

describe("check-utc-date-strings guard (audit QA-6)", () => {
  test("counts slice/substring/split forms, including across line breaks", () => {
    const code = [
      "const a = new Date().toISOString().slice(0, 10);",
      'const b = d.toISOString().split("T")[0];',
      "const c = d.toISOString().substring(0, 10);",
      "const e = new Date(x)",
      "  .toISOString()",
      "  .slice(0, 10);",
    ].join("\n");
    expect(countInSource(code)).toBe(4);
  });

  test("an exempted line is not counted", () => {
    expect(countInSource("k = d.toISOString().slice(0, 10); // utc-date-ok: storage key")).toBe(0);
  });

  test("the repository does not exceed the baseline", () => {
    expect(scanRepository().total).toBeLessThanOrEqual(BASELINE);
  });
});
