#!/usr/bin/env tsx
/**
 * CI Guard: No interactive element may be nested inside another.
 *
 * `<Link><Button>…</Button></Link>` renders <a><button> — invalid HTML that
 * confuses focus order, screen readers (two tab stops, duplicate activation)
 * and hydration. The correct shape is `<Button asChild><Link>…</Link></Button>`
 * (Radix Slot merges the button styles onto the anchor).
 *
 * Catches the two shapes this codebase has shipped before:
 *   <Link …>  <Button|button …> … </…>  </Link>
 *   <a …>     <Button|button …> … </…>  </a>
 *
 * Usage: npx tsx scripts/check-nested-interactive.ts
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SRC_ROOT = join(process.cwd(), "src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx$/.test(entry)) files.push(full);
  }
  return files;
}

// Opening <Link>/<a> immediately wrapping a <Button>/<button>, plus the
// mirrored closer pattern for cases where the inner element follows later.
const OPEN_RE = /<(Link|a)\b[^>]*>\s*<(Button|button)\b/g;
const CLOSE_RE = /<\/(Button|button)>\s*<\/(Link|a)>/g;

// `<Button asChild>` merges buttonVariants (which sets `inline-flex`) onto the
// child's className. A `hidden`/`hidden X:block` class on the child then LOSES
// against `inline-flex` (same-specificity display utilities — source order in
// the generated CSS decides) and the element stays visible at every breakpoint.
// Correct: single-sided visibility (`max-lg:hidden`, `sm:hidden`, `lg:hidden`)
// or wrap in a plain element that carries `hidden`.
const DISPLAY_CONFLICT_RE =
  /asChild><(Link|a)\b[^>]*className="[^"]*\b(?:hidden\s+(?:sm|md|lg|xl|2xl):block|(?:^|\s)hidden(?:\s|"|$)|inline-block)/;

const issues: { file: string; line: number; snippet: string }[] = [];
const files = walk(SRC_ROOT);

for (const file of files) {
  const src = readFileSync(file, "utf-8");
  for (const re of [OPEN_RE, CLOSE_RE]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      issues.push({
        file: file.replace(`${process.cwd()}/`, ""),
        line: src.slice(0, m.index).split("\n").length,
        snippet: m[0].replace(/\s+/g, " ").slice(0, 80),
      });
    }
  }
  let m: RegExpExecArray | null;
  while ((m = DISPLAY_CONFLICT_RE.exec(src))) {
    issues.push({
      file: file.replace(`${process.cwd()}/`, ""),
      line: src.slice(0, m.index).split("\n").length,
      snippet: "display-conflict: " + m[0].replace(/\s+/g, " ").slice(0, 80),
    });
  }
}

console.log(`[check-nested-interactive] Scanned ${files.length} tsx files`);

if (issues.length) {
  console.error(`\n[check-nested-interactive] ❌ ${issues.length} nested interactive element(s):`);
  for (const i of issues) console.error(`  ${i.file}:${i.line}  ${i.snippet}`);
  console.error(
    "  Fix: <Button asChild><Link href={…}>Label</Link></Button> (Radix Slot, see ui/button.tsx).\n" +
      "  For responsive visibility use max-*/min-* variants (max-lg:hidden), never `hidden X:block`."
  );
  process.exit(1);
}

console.log("[check-nested-interactive] ✅ No nested interactive elements");
