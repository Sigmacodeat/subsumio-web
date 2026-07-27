#!/usr/bin/env bun
/**
 * Find <div> elements with onClick but no role="button", tabIndex, or onKeyDown.
 * These are keyboard-inaccessible.
 *
 * Usage: bun run scripts/find-div-onclick.ts
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

// Match <div ... onClick={...} ... > but NOT if the div also has role="button", tabIndex, or onKeyDown
const divOnClickPattern = /<div\b([^>]*?)onClick=\{[^}]*\}([^>]*?)>/g;

const results: Array<{ file: string; line: number; snippet: string }> = [];

for (const file of walk(SRC_DIR)) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
  }

  let match: RegExpExecArray | null;
  divOnClickPattern.lastIndex = 0;
  while ((match = divOnClickPattern.exec(content)) !== null) {
    const allAttrs = match[1] + match[2];

    // Skip if it has role="button", tabIndex, or onKeyDown
    if (/role\s*=\s*"button"/.test(allAttrs)) continue;
    if (/tabIndex/.test(allAttrs)) continue;
    if (/onKeyDown/.test(allAttrs)) continue;
    if (/onKeyPress/.test(allAttrs)) continue;
    if (/onKeyUp/.test(allAttrs)) continue;

    const offset = match.index;
    let line = 1;
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] > offset) {
        line = i;
        break;
      }
    }

    const snippet = match[0].substring(0, 150);
    results.push({ file: file.replace(SRC_DIR + "/", ""), line, snippet });
  }
}

const byFile = new Map<string, typeof results>();
for (const r of results) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file)!.push(r);
}

console.log(
  `\n${results.length} div onClick without keyboard handler across ${byFile.size} files:\n`
);
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file} (${items.length})`);
  for (const item of items) {
    console.log(`    L${item.line}: ${item.snippet}`);
  }
}
