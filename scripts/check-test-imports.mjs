#!/usr/bin/env node
// Every unit test must exercise product code: a *.test.ts(x) under src/ that
// imports nothing from the app (./, ../, @/) only tests a copy of the logic
// it claims to cover — green no matter what the product does.
//
//   node scripts/check-test-imports.mjs        → exit 1 and the list when found
//
// Deliberate exceptions (e.g. a smoke test that starts a real script as a
// child process) go into ALLOW with a reason.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ALLOW = new Map([
  ["src/lib/dav-smoke.test.ts", "starts scripts/dav-server.ts as a real process"],
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.test\.tsx?$/.test(name)) yield full;
  }
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+|vi\.mock\(\s*)["'](\.{1,2}\/|@\/)/;
// Static guards read the product's source files (route lists, headers,
// colour tokens, crontab …) or run a real process — they check the product.
const SOURCE_GUARD_RE = /readFileSync|readdirSync|readFile\(|globSync|execSync|spawn/;

const offenders = [];
for (const file of walk(path.join(ROOT, "src"))) {
  const rel = path.relative(ROOT, file);
  if (ALLOW.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  if (!IMPORT_RE.test(text) && !SOURCE_GUARD_RE.test(text)) offenders.push(rel);
}

if (offenders.length > 0) {
  console.error(
    `Test files without any import of product code (${offenders.length}) — they test a copy, not the product:`
  );
  for (const f of offenders) console.error(`  ${f}`);
  process.exit(1);
}
console.log("check-test-imports: every unit test imports product code.");
