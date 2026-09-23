import { describe, expect, test } from "bun:test";
import { DEAD_END_CODES, isDeadEndOnly } from "../scripts/tombstone-dead-end-pages.ts";

describe("isDeadEndOnly", () => {
  test("a page with only a dead-end issue is eligible", () => {
    expect(isDeadEndOnly(["body:kein_rechtssatz"])).toBe(true);
  });

  test("a page with no issues at all is not eligible — nothing to tombstone", () => {
    expect(isDeadEndOnly([])).toBe(false);
  });

  test("a fixable issue alongside a dead-end one keeps the page out of reach", () => {
    // The exact risk this guards against: a page that's ALSO from the
    // known-bad generation shouldn't get swept up and deleted instead of
    // waiting for the queued re-fetch that would actually fix it.
    expect(isDeadEndOnly(["body:kein_rechtssatz", "generation:known_bad"])).toBe(false);
  });

  test("a purely fixable issue is never eligible", () => {
    expect(isDeadEndOnly(["schema:legacy_frontmatter"])).toBe(false);
    expect(isDeadEndOnly(["body:letterhead"])).toBe(false);
    expect(isDeadEndOnly(["body:no_content_section", "body:ris_prefix"])).toBe(false);
  });

  test("every declared dead-end code is individually sufficient on its own", () => {
    for (const code of DEAD_END_CODES) {
      expect(isDeadEndOnly([code])).toBe(true);
    }
  });
});
