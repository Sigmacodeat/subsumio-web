/**
 * Ratchet guard (audit QA-6): calendar days computed in UTC on the server.
 *
 * `new Date().toISOString().slice(0, 10)` (or `.split("T")[0]`) names the UTC
 * day. Between 00:00 and 01:00/02:00 Vienna time that is still yesterday —
 * invoice dates, number ranges on 1 January and "overdue today" checks go
 * wrong. Server code uses `firmToday()` / `firmYear()` / `zonedDateString()`
 * from src/lib/datetime.ts instead.
 *
 * Existing occurrences are counted, not all fixed yet: the check fails when
 * the count in src/app/api + src/lib grows above BASELINE. Lower BASELINE
 * whenever you remove some. A line carrying `utc-date-ok: <reason>` (e.g. a
 * genuinely UTC timestamp key) is not counted.
 *
 * Run: npx tsx scripts/check-utc-date-strings.ts   (part of `npm run verify`)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/app/api", "src/lib"];
const SKIP_DIRS = new Set(["node_modules", "_archive"]);
const EXEMPT_MARKER = /utc-date-ok:\s*\S/;
const PATTERN =
  /toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*["']T["']\s*\)\s*\[\s*0\s*\])/g;

/** Occurrences at the time the guard was introduced — may only go down. */
export const BASELINE = 79;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.(test|stories|d)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

export function countInSource(content: string): number {
  let n = 0;
  PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(content))) {
    const lineStart = content.lastIndexOf("\n", m.index) + 1;
    const lineEnd = content.indexOf("\n", m.index + m[0].length);
    const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
    if (!EXEMPT_MARKER.test(line)) n++;
  }
  return n;
}

export function scanRepository(cwd = process.cwd()): { total: number; byFile: [string, number][] } {
  const byFile: [string, number][] = [];
  let total = 0;
  for (const file of ROOTS.map((r) => join(cwd, r)).flatMap(walk)) {
    const n = countInSource(readFileSync(file, "utf8"));
    if (n > 0) {
      byFile.push([relative(cwd, file), n]);
      total += n;
    }
  }
  return { total, byFile };
}

function main(): void {
  const { total, byFile } = scanRepository();
  if (total > BASELINE) {
    console.error(
      `[check-utc-date-strings] ❌ ${total} UTC calendar-day computations (baseline ${BASELINE}).\n` +
        "  Use firmToday() / firmYear() / zonedDateString() from src/lib/datetime.ts.\n" +
        byFile.map(([f, n]) => `  ${f}: ${n}`).join("\n")
    );
    process.exit(1);
  }
  const note = total < BASELINE ? ` — lower BASELINE to ${total}` : "";
  console.log(`[check-utc-date-strings] ✅ ${total} ≤ baseline ${BASELINE}${note}`);
}

if (process.argv[1]?.endsWith("check-utc-date-strings.ts")) main();
