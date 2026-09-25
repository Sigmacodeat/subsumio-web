// @vitest-environment node
import { describe, expect, test } from "vitest";
import { documentedNames, findUndocumented, readNames } from "../../scripts/check-env-documented";

describe("check-env-documented guard (audit QA-9)", () => {
  test("reads process.env.X, process.env['X'] and env('X')", () => {
    const names = readNames(
      'const a = process.env.FOO_URL; const b = process.env["BAR_KEY"]; const c = env("BAZ");'
    );
    expect([...names].sort()).toEqual(["BAR_KEY", "BAZ", "FOO_URL"]);
  });

  test("set and commented-out entries both count as documented", () => {
    const names = documentedNames("FOO=1\n# BAR=\n  # BAZ=x\nnot a var\n");
    expect([...names].sort()).toEqual(["BAR", "BAZ", "FOO"]);
  });

  test("every variable the app reads is documented", () => {
    expect(findUndocumented().undocumented).toEqual([]);
  });
});
