#!/usr/bin/env bun
/**
 * Find <button> elements that have title= but no aria-label=.
 * title is not reliably announced by screen readers.
 *
 * Usage: bun run scripts/find-title-only-buttons.ts
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname } from "path";

const SRC_DIR = join(import.meta.dir, "..", "src");

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (extname(fullPath) === ".tsx") {
      files.push(fullPath);
    }
  }
  return files;
}

const buttonBlockPattern = /<button\b([^>]*?)>([\s\S]*?)<\/button>/g;
const results: Array<{ file: string; line: number; snippet: string }> = [];

for (const file of walk(SRC_DIR)) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
  }

  let match: RegExpExecArray | null;
  buttonBlockPattern.lastIndex = 0;
  while ((match = buttonBlockPattern.exec(content)) !== null) {
    const attrs = match[1];
    const children = match[2];

    // Must have title= but NOT aria-label=
    if (!/\btitle\s*=/.test(attrs)) continue;
    if (/\baria-label\s*=/.test(attrs)) continue;

    // Skip if children have visible text (title is just a tooltip enhancement)
    const withoutIcons = children.replace(/<[A-Z][A-Za-z0-9]+\b[^>]*\/>/g, "");
    const withoutComments = withoutIcons.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    if (withoutComments.trim().length > 0) continue;

    // This is an icon-only button with title but no aria-label
    const offset = match.index;
    let line = 1;
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] > offset) {
        line = i;
        break;
      }
    }

    const snippet = match[0].split("\n")[0].substring(0, 150);
    results.push({ file: file.replace(SRC_DIR + "/", ""), line, snippet });
  }
}

const byFile = new Map<string, typeof results>();
for (const r of results) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file)!.push(r);
}

console.log(
  `\n${results.length} icon-only buttons with title but no aria-label across ${byFile.size} files:\n`
);
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file} (${items.length})`);
  for (const item of items) {
    console.log(`    L${item.line}: ${item.snippet}`);
  }
}
