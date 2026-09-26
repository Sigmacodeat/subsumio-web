// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import robots from "./robots";

describe("sitemap", () => {
  const entries = sitemap();

  it("lists no page that is marked noindex", () => {
    for (const e of entries) {
      const path = new URL(e.url).pathname.replace(/\/$/, "");
      const file = join(process.cwd(), "src/app", path, "page.tsx");
      if (!existsSync(file)) continue; // dynamic routes (blog posts, cities)
      const src = readFileSync(file, "utf8");
      expect(/index:\s*false/.test(src), `${path} is noindex but in the sitemap`).toBe(false);
    }
  });

  it("carries no fake 'modified now' on static pages", () => {
    const start = Date.now() - 60_000;
    for (const e of entries) {
      if (!e.lastModified) continue;
      expect(new Date(e.lastModified).getTime()).toBeLessThan(start);
    }
  });
});

describe("robots.txt", () => {
  it("keeps app areas and the firm-specific public forms out", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow as string[];
    for (const p of ["/ops", "/mobile", "/erstanfrage", "/termin", "/mandat", "/dashboard"]) {
      expect(disallow).toContain(p);
    }
  });
});
