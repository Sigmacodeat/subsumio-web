import { describe, expect, test } from "vitest";
import { withQueryParam } from "./url-params";

describe("withQueryParam", () => {
  test("adds the first parameter with ?", () => {
    expect(withQueryParam("/api/files/docs/a.pdf", "inline", "1")).toBe(
      "/api/files/docs/a.pdf?inline=1"
    );
  });

  test("adds to an existing query with & (DMS preview)", () => {
    expect(withQueryParam("/api/dms/content?id=7", "inline", "1")).toBe(
      "/api/dms/content?id=7&inline=1"
    );
  });

  test("keeps a fragment at the end", () => {
    expect(withQueryParam("/x?a=1#page=2", "inline", "1")).toBe("/x?a=1&inline=1#page=2");
  });
});
