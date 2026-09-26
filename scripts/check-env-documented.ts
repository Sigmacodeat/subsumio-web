/**
 * CI guard (audit QA-9): every environment variable the web app reads is
 * documented for operators.
 *
 * Collects `process.env.X`, `process.env["X"]` and `env("X")` in src/ (tests
 * excluded) and fails when a name appears in neither `.env.example` nor
 * `server/deploy/netcup/.env.example` (as `X=` or commented `# X=`).
 * Platform/runtime variables that operators never set are listed in
 * RUNTIME_PROVIDED.
 *
 * Run: npx tsx scripts/check-env-documented.ts   (part of `npm run verify`)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "src";
const SKIP_DIRS = new Set(["node_modules", "_archive", "test", "__mocks__"]);
const EXAMPLES = [".env.example", "server/deploy/netcup/.env.example"];

/** Set by the runtime, the platform or the test harness — not by operators. */
const RUNTIME_PROVIDED = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "CI",
  "VITEST",
  "JEST_WORKER_ID",
  "PORT",
  "HOSTNAME",
  "npm_package_version",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "NEXT_TELEMETRY_DISABLED",
  "TZ",
]);

const READ_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /\benv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.(test|stories|d)\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}

export function readNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const rx of READ_PATTERNS) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(content))) names.add(m[1]);
  }
  return names;
}

export function documentedNames(exampleContent: string): Set<string> {
  const names = new Set<string>();
  for (const line of exampleContent.split("\n")) {
    const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

export function findUndocumented(cwd = process.cwd()): {
  used: Map<string, string>;
  undocumented: string[];
} {
  const used = new Map<string, string>(); // name → first file
  for (const file of walk(join(cwd, SRC))) {
    for (const name of readNames(readFileSync(file, "utf8"))) {
      if (!used.has(name)) used.set(name, relative(cwd, file));
    }
  }
  const documented = new Set<string>();
  for (const example of EXAMPLES) {
    const path = join(cwd, example);
    if (existsSync(path))
      for (const n of documentedNames(readFileSync(path, "utf8"))) documented.add(n);
  }
  const undocumented = [...used.keys()]
    .filter((n) => !documented.has(n) && !RUNTIME_PROVIDED.has(n))
    .sort();
  return { used, undocumented };
}

function main(): void {
  const { used, undocumented } = findUndocumented();
  console.log(`[check-env-documented] ${used.size} variables read in src/`);
  if (undocumented.length > 0) {
    console.error(
      `[check-env-documented] ❌ ${undocumented.length} variable(s) not in .env.example:\n` +
        undocumented.map((n) => `  ${n}  (${used.get(n)})`).join("\n") +
        "\n  Fix: add each to .env.example with a one-line comment (commented out if optional)."
    );
    process.exit(1);
  }
  console.log("[check-env-documented] ✅ every variable is documented");
}

if (process.argv[1]?.endsWith("check-env-documented.ts")) main();
