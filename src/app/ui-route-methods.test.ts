// @vitest-environment node
// Every browser call to a fixed /api path must hit a route that exports the
// HTTP method it uses. A button that posts to a GET-only route answers 405 on
// every click (the drafting page's "Im Hintergrund erstellen" did exactly
// that). Complements engine-contract.test.ts (web → engine) for UI → web.

import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const UI_DIRS = ["src/app", "src/components", "src/lib"].map((d) => path.join(ROOT, d));
const API_DIR = path.join(ROOT, "src/app/api");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || full === API_DIR) return [];
      return files(full);
    }
    return /\.tsx?$/.test(name) && !/\.(test|stories|d)\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Route file for a fixed path, matching dynamic segments ([id], [...slug]). */
function routeFileFor(apiPath: string): string | null {
  const segs = apiPath
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean);
  let dir = API_DIR;
  for (const seg of segs) {
    const exact = path.join(dir, seg);
    if (existsSync(exact) && statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }
    const dynamic = readdirSync(dir).find((n) => /^\[.+\]$/.test(n));
    if (!dynamic) return null;
    dir = path.join(dir, dynamic);
    if (dynamic.startsWith("[...")) break;
  }
  const file = path.join(dir, "route.ts");
  return existsSync(file) ? file : null;
}

function exportsMethod(src: string, method: string): boolean {
  return (
    new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${method}\\b`).test(src) ||
    new RegExp(`export\\s*\\{[^}]*\\b(?:as\\s+)?${method}\\b[^}]*\\}`).test(src)
  );
}

/** A fixed-path call and the options text after it (up to the next call). */
const CALL_RE = /\b(?:csrfFetch|fetch)\(\s*["'](\/api\/[A-Za-z0-9/_-]+)["']\s*(?=([\s\S]{0,400}))/g;

describe("UI → web route methods", () => {
  test("every fixed-path browser call targets an exported method", () => {
    const violations: string[] = [];
    for (const file of UI_DIRS.flatMap(files)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(CALL_RE)) {
        const apiPath = m[1];
        // Options follow as the 2nd argument; stop at the next call.
        const after = m[2] ?? "";
        const opts = after.startsWith(",") ? after.split(/\b(?:csrfFetch|fetch)\(/)[0] : "";
        const method = (/method:\s*["'](\w+)["']/.exec(opts)?.[1] ?? "GET").toUpperCase();
        const route = routeFileFor(apiPath);
        if (!route) continue; // external proxy / rewrites: out of scope here
        if (!exportsMethod(readFileSync(route, "utf8"), method)) {
          violations.push(`${path.relative(ROOT, file)}: ${method} ${apiPath}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
