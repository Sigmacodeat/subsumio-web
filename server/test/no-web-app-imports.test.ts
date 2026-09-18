/**
 * The engine image is built from server/ alone. An import that resolves into
 * the web app (repo-root src/) type-checks locally through the "@/*" path
 * fallback, but fails at runtime in the container. Only type imports are
 * safe, because they are erased.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SERVER = join(import.meta.dir, "..");
const ROOTS = ["src", "scripts"].map((d) => join(SERVER, d));
const WEB_ONLY =
  /^\s*import\s+(?!type\b)[^;]*?from\s+["'](@\/lib\/|@\/components\/|@\/app\/|(\.\.\/)+src\/)/m;

/**
 * Run only from a full checkout on a developer machine, never in the engine
 * container. Moving their web-app dependencies into server/ would be the clean
 * fix; until then they are listed here so a new file cannot slip in.
 */
const LOCAL_ONLY = new Set([
  "src/core/legal/novella-detection.ts", // not imported by the engine
  "scripts/sync-statutes-at.ts",
  "scripts/sync-statutes-ch.ts",
  "scripts/sync-statutes-de.ts",
  "scripts/run-release-gate-eval.ts",
]);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

describe("engine code does not import the web app", () => {
  test("no runtime import from web-only paths", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const f of files(root)) {
        if (LOCAL_ONLY.has(relative(SERVER, f))) continue;
        const src = readFileSync(f, "utf8");
        for (const stmt of src.split(/;\s*\n/)) {
          if (!WEB_ONLY.test(stmt)) continue;
          // "../src/" inside server/ is fine when it stays inside server/.
          const m = stmt.match(/from\s+["']((?:\.\.\/)+)src\//);
          if (m) {
            const depth = relative(SERVER, f).split("/").length - 1;
            if (m[1].length / 3 <= depth) continue;
          }
          offenders.push(`${relative(SERVER, f)}: ${stmt.trim().split("\n").pop()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
