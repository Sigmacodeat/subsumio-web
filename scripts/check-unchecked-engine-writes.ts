#!/usr/bin/env tsx
/**
 * CI Guard: Engine write calls must check the HTTP status.
 *
 * `fetch` resolves on HTTP 4xx/5xx — an unchecked `await fetch(`${ENGINE_URL}…`)`
 * treats a rejected write as success. This guard scans src/ for two patterns:
 *
 *   1. `await fetch(`${ENGINE_URL}/api/pages…`)` whose return value is discarded
 *      (not assigned, not returned) — the write's status can never be checked.
 *   2. `method: "PATCH"` against `${ENGINE_URL}/api/pages/…` — the engine has no
 *      PATCH route for pages; merge-updates go through POST + `merge: true`
 *      (`enginePatchPage` in src/lib/engine.ts).
 *
 * Usage: npx tsx scripts/check-unchecked-engine-writes.ts
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC_ROOT = join(process.cwd(), "src");

/**
 * Files owned by a parallel remediation workstream (see audit D0 brief).
 * They still contain known unchecked writes — do NOT add new entries here;
 * remove them once the workstream migrates the call sites.
 */
const EXCLUDED_FILES = new Set([
  // Sperrbereich — owned by the parallel remediation workstream (audit D0 brief).
  // Do NOT add new entries; remove them once that workstream migrates the calls.
  "src/app/api/intake/convert/route.ts",
  "src/app/api/pages/route.ts",
  "src/app/api/bulk-cases/route.ts",
  "src/app/api/whatsapp/flow-endpoint/route.ts",
]);

interface Issue {
  file: string;
  line: number;
  issue: string;
}

const issues: Issue[] = [];
let scannedFiles = 0;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "_archive" || entry.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function checkFile(path: string): void {
  const rel = relative(process.cwd(), path);
  if (EXCLUDED_FILES.has(rel)) return;
  scannedFiles++;
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: discarded `await fetch(`${ENGINE_URL}…`)`
    if (
      /await\s+fetch\(\s*`?\$\{ENGINE_URL\}/.test(line) ||
      /await\s+fetch\(\s*`?\$\{ENGINE_/.test(line)
    ) {
      // Only when the whole statement starts with `await fetch(` — i.e. the
      // result is not assigned (`const res = await fetch(` doesn't match the
      // anchored form below).
      if (/^\s*await\s+fetch\(/.test(line)) {
        issues.push({
          file: rel,
          line: i + 1,
          issue:
            "unchecked engine call: `await fetch(`${ENGINE_URL}…`)` discards the response — " +
            "use engineWriteOrThrow()/requireEngineOk() or assign + check res.ok",
        });
      }
    }

    // Pattern 2: PATCH against /api/pages/:slug (route does not exist)
    if (/method:\s*["']PATCH["']/.test(line)) {
      // look backwards up to 8 lines for the fetch URL
      const ctx = lines.slice(Math.max(0, i - 10), i + 1).join("\n");
      if (/\$\{ENGINE_URL\}\/api\/pages\//.test(ctx)) {
        issues.push({
          file: rel,
          line: i + 1,
          issue:
            "PATCH on `${ENGINE_URL}/api/pages/{slug}` hits a non-existent route — " +
            "use enginePatchPage() (POST + merge:true)",
        });
      }
    }
  }
}

for (const file of walk(SRC_ROOT)) checkFile(file);

console.log(`[check-unchecked-engine-writes] ${scannedFiles} files scanned`);
if (issues.length > 0) {
  for (const i of issues) console.error(`  ${i.file}:${i.line} — ${i.issue}`);
  console.error(`[check-unchecked-engine-writes] ❌ ${issues.length} issue(s) found`);
  process.exit(1);
}
console.log("[check-unchecked-engine-writes] ✅ all engine writes are status-checked");
