/**
 * Guard (audit ENG-4): a `JSON.stringify(...)` parameter bound to a bare
 * `$N::jsonb` placeholder in an `executeRaw(sql, [params])` call.
 *
 * postgres.js describes the statement first, learns the parameter is jsonb
 * and JSON-encodes the already-encoded string again — Postgres stores a JSON
 * *string* instead of the object (PGLite hides it). Pass the raw value
 * (executeRawJsonb) or cast explicitly from text: `$N::text::jsonb`.
 *
 * Complements scripts/check-jsonb-pattern.sh, which only sees the
 * single-line `${JSON.stringify(x)}::jsonb` template form.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "src");
/** Eval harnesses write to scratch databases, not production data. */
const SKIP = new Set(["eval"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP.has(entry)) out.push(...walk(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Split `s` at top-level commas, respecting brackets and string literals. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === "\\") {
        cur += s[++i] ?? "";
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function closingParen(s: string, from: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

export function findStringifiedJsonbParams(source: string): number[] {
  const lines: number[] = [];
  const re = /executeRaw(?:<[^>]*>)?\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const start = m.index + m[0].length;
    const end = closingParen(source, start);
    if (end < 0) continue;
    const args = splitTop(source.slice(start, end));
    if (args.length < 2) continue;
    const sql = args[0];
    const params = args[1].trim();
    if (!sql.includes("::jsonb") || !params.startsWith("[")) continue;
    const list = splitTop(params.slice(1, params.lastIndexOf("]")));
    list.forEach((p, i) => {
      if (!p.trim().startsWith("JSON.stringify(")) return;
      if (new RegExp(`\\$${i + 1}::jsonb\\b`).test(sql)) {
        lines.push(source.slice(0, m!.index).split("\n").length);
      }
    });
  }
  return lines;
}

describe("JSONB stringify-param guard", () => {
  test("detects the multi-line executeRaw form", () => {
    const code = [
      "await engine.executeRaw(",
      "  `INSERT INTO t (a, b) VALUES ($1, $2::jsonb)`,",
      "  [id, JSON.stringify(obj)]",
      ");",
    ].join("\n");
    expect(findStringifiedJsonbParams(code)).toEqual([1]);
  });

  test("accepts an explicit text cast and raw objects", () => {
    expect(
      findStringifiedJsonbParams(
        "await engine.executeRaw(`INSERT INTO t VALUES ($1::text::jsonb)`, [JSON.stringify(o)]);"
      )
    ).toEqual([]);
    expect(
      findStringifiedJsonbParams(
        "await engine.executeRaw(`INSERT INTO t VALUES ($1::jsonb)`, [o]);"
      )
    ).toEqual([]);
  });

  test("no engine source binds JSON.stringify(...) to a bare $N::jsonb", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      for (const line of findStringifiedJsonbParams(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(ROOT, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
