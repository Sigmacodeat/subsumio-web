import { describe, expect, it } from "vitest";
import { excludeDemoPages } from "./cron-utils";

describe("excludeDemoPages", () => {
  it("drops the seeded demo pages and keeps everything else", () => {
    const pages = [
      { slug: "legal/deadlines/demo-anfechtungsfrist-berger", frontmatter: { demo: true } },
      { slug: "legal/deadlines/echt", frontmatter: { demo: false } },
      { slug: "legal/deadlines/ohne", frontmatter: {} },
      { slug: "legal/deadlines/null", frontmatter: null },
    ];
    expect(excludeDemoPages(pages).map((p) => p.slug)).toEqual([
      "legal/deadlines/echt",
      "legal/deadlines/ohne",
      "legal/deadlines/null",
    ]);
  });
});
