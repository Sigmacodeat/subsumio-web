// Ids like "legal/templates/abc" contain slashes. Routes under a single
// dynamic segment ([slug], not [...slug]) receive them only when the whole id
// is encoded as ONE segment; a client that encodes each part separately gets a
// 404 for every get, update and delete (this broke trust accounts, templates,
// playbooks, review sets and litigation).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function singleSlugRoutes(dir = path.join(ROOT, "src/app/api"), prefix = "/api"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name === "[slug]") out.push(prefix);
    else if (!name.startsWith("[...") && !name.startsWith("_")) {
      out.push(...singleSlugRoutes(full, `${prefix}/${name}`));
    }
  }
  return out;
}

const CLIENT_FILES = ["src/lib/api.ts", "src/lib/queries/agent-templates.ts"];

describe("client paths for single-segment slug routes", () => {
  const routes = singleSlugRoutes();

  it("finds the routes", () => {
    expect(routes).toContain("/api/legal/trust-accounts");
  });

  for (const file of CLIENT_FILES) {
    it(`${file} encodes the whole id as one segment`, () => {
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
      const offenders: string[] = [];
      lines.forEach((line, i) => {
        const route = routes.find((r) => line.includes(`${r}/`));
        if (!route) return;
        const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (
          /split\("\/"\)\.map\(encodeURIComponent\)\.join\("\/"\)|parts\.map\(encodeURIComponent\)\.join\("\/"\)/.test(
            window
          )
        ) {
          offenders.push(`${file}:${i + 1} ${route}`);
        }
      });
      expect(offenders).toEqual([]);
    });
  }
});
