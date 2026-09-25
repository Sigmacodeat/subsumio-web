/**
 * CI guard (audit QA-7): an engine write whose response is thrown away.
 *
 * `fetch` does not throw on HTTP 4xx/5xx, so
 *   await fetch(`${ENGINE_URL}/api/pages`, { method: "POST", … });
 * reports a refused save as success. Every engine write must use
 * `engineWriteOrThrow` / `engineWriteBestEffort` / `assertEngineWriteOk`
 * (src/lib/engine-write.ts) or assign the response and check `res.ok`.
 *
 * Flagged: a `fetch(…ENGINE_URL…, { method: POST|PUT|PATCH|DELETE })` whose
 * result is discarded — used as a statement, behind `await`/`void`, or only
 * chained with `.catch()` / `.then()` that ends in a statement.
 * A line carrying `engine-write-ok: <reason>` is exempt.
 *
 * Run: npx tsx scripts/check-unchecked-engine-writes.ts   (part of `npm run verify`)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOTS = ["src/app/api", "src/lib"];
const SKIP_DIRS = new Set(["node_modules", "_archive"]);
const EXEMPT_MARKER = /engine-write-ok:\s*\S/;

/**
 * Known remaining sites in files owned by a parallel work package. Remove an
 * entry once its file is migrated; the guard fails if an entry goes stale.
 */
const KNOWN_OPEN = new Set([
  // PUT then POST fallback on restore; the PUT is a wasted 404 but checked.
  "src/app/api/admin/backup/[id]/route.ts",
  "src/app/api/intake/convert/route.ts",
  "src/app/api/pages/route.ts",
]);

const WRITE_METHOD = /^(post|put|patch|delete)$/i;

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

function isEngineWriteFetch(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "fetch") return false;
  const [url, init] = node.arguments;
  if (!url || !/\bENGINE_URL\b/.test(url.getText(sf))) return false;
  if (!init || !ts.isObjectLiteralExpression(init)) return false;
  for (const prop of init.properties) {
    if (!ts.isPropertyAssignment(prop) || prop.name.getText(sf) !== "method") continue;
    const value = prop.initializer;
    if (ts.isStringLiteralLike(value)) return WRITE_METHOD.test(value.text);
    return true; // computed method: treat as a write
  }
  return false; // default GET
}

/**
 * The engine serves only GET and DELETE on /api/pages/<slug>. A PATCH/PUT
 * there answers 404 — a silent no-op when unchecked. Merge writes go through
 * POST /api/pages with `merge: true` (enginePatchPage).
 */
function isSlugPatch(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  const callee = node.expression.getText(sf);
  if (!/^(fetch|engineWriteOrThrow|engineWriteBestEffort)$/.test(callee)) return false;
  const [url, init] = node.arguments;
  if (!url || !/ENGINE_URL\}\/api\/pages\/\$\{/.test(url.getText(sf))) return false;
  if (!init || !ts.isObjectLiteralExpression(init)) return false;
  return init.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name.getText(sf) === "method" &&
      ts.isStringLiteralLike(p.initializer) &&
      /^(patch|put)$/i.test(p.initializer.text)
  );
}

/** Climb `await` / `(…)` / `.catch()` / `.then()` wrappers; true if the result is dropped. */
function resultIsDiscarded(node: ts.Node): boolean {
  let current: ts.Node = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return false;
    if (ts.isAwaitExpression(parent) || ts.isParenthesizedExpression(parent)) {
      current = parent;
      continue;
    }
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === current &&
      (parent.name.text === "catch" ||
        parent.name.text === "then" ||
        parent.name.text === "finally") &&
      parent.parent &&
      ts.isCallExpression(parent.parent)
    ) {
      current = parent.parent;
      continue;
    }
    return ts.isExpressionStatement(parent) || ts.isVoidExpression(parent);
  }
}

export function scanSource(fileName: string, content: string): string[] {
  const sf = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const lines = content.split("\n");
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    const push = (why: string) => {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      const text = lines[line] ?? "";
      if (!EXEMPT_MARKER.test(text)) hits.push(`${line + 1}: ${why}${text.trim().slice(0, 120)}`);
    };
    if (ts.isCallExpression(node) && isEngineWriteFetch(node, sf) && resultIsDiscarded(node)) {
      push("");
    }
    if (ts.isCallExpression(node) && isSlugPatch(node, sf)) {
      push("PATCH/PUT to /api/pages/<slug> (engine has no such route — use enginePatchPage): ");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export function scanRepository(cwd = process.cwd()): {
  files: number;
  violations: string[];
  staleKnown: string[];
} {
  const files = ROOTS.map((r) => join(cwd, r)).flatMap(walk);
  const violations: string[] = [];
  const knownWithHits = new Set<string>();
  for (const file of files) {
    const rel = relative(cwd, file);
    const hits = scanSource(rel, readFileSync(file, "utf8"));
    if (hits.length === 0) continue;
    if (KNOWN_OPEN.has(rel)) {
      knownWithHits.add(rel);
      continue;
    }
    for (const hit of hits) violations.push(`${rel}:${hit}`);
  }
  const staleKnown = [...KNOWN_OPEN].filter((f) => !knownWithHits.has(f));
  return { files: files.length, violations, staleKnown };
}

function main(): void {
  const { files, violations, staleKnown } = scanRepository();
  console.log(`[check-unchecked-engine-writes] ${files} files scanned`);
  if (violations.length > 0) {
    console.error(
      `[check-unchecked-engine-writes] ❌ ${violations.length} engine write(s) without a status check:\n` +
        violations.map((v) => `  ${v}`).join("\n") +
        "\n  Fix: use engineWriteOrThrow / engineWriteBestEffort (src/lib/engine-write.ts)," +
        " or assign the response and check res.ok."
    );
    process.exit(1);
  }
  if (staleKnown.length > 0) {
    console.error(
      `[check-unchecked-engine-writes] ❌ KNOWN_OPEN entries without findings — remove them:\n` +
        staleKnown.map((f) => `  ${f}`).join("\n")
    );
    process.exit(1);
  }
  console.log("[check-unchecked-engine-writes] ✅ every engine write checks its response");
}

if (process.argv[1]?.endsWith("check-unchecked-engine-writes.ts")) main();
