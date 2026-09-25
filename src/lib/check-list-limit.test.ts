// @vitest-environment node
import { describe, expect, test } from "vitest";
import { scanFile } from "../../scripts/check-list-limit";

describe("check-list-limit guard", () => {
  test("flags URLSearchParams limits above the engine cap in page-list files", () => {
    const code = [
      'const params = new URLSearchParams({ type: "rsv_case", limit: "500" });',
      "await fetch(`${ENGINE_URL}/api/pages?${params}`);",
    ].join("\n");
    expect(scanFile(code)).toHaveLength(1);
  });

  test("flags searchParams.set('limit', …) above the cap", () => {
    const code = [
      "const url = new URL(`${ENGINE_URL}/api/pages`);",
      'url.searchParams.set("limit", "200");',
    ].join("\n");
    expect(scanFile(code)).toHaveLength(1);
  });

  test("ignores query builders in files that do not list engine pages", () => {
    expect(scanFile('params.set("limit", "500"); fetch(`/api/audit?${params}`);')).toHaveLength(0);
  });

  test("accepts the cap itself and exempted lines", () => {
    expect(
      scanFile(
        'const p = new URLSearchParams({ limit: "100" }); fetch(`${ENGINE_URL}/api/pages?${p}`);'
      )
    ).toHaveLength(0);
    expect(
      scanFile(
        'const p = new URLSearchParams({ limit: "500" }); // list-cap-ok: capped on purpose\nfetch(`/api/pages`);'
      )
    ).toHaveLength(0);
  });
});
