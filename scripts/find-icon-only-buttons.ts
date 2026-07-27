#!/usr/bin/env bun
/**
 * Find icon-only buttons (buttons whose only child is a Lucide icon component)
 * that are missing aria-label or sr-only text.
 *
 * Heuristic: A <button> whose direct children are only icon components (PascalCase, self-closing)
 * and no text content, and no aria-label attribute on the button tag.
 *
 * Usage: bun run scripts/find-icon-only-buttons.ts
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

// Match <button ...>...</button> blocks
const buttonBlockPattern = /<button\b([^>]*?)>([\s\S]*?)<\/button>/g;

// Icon component pattern: <IconName size={...} className={...} /> or <IconName size=".." />
const iconOnlyPattern = /^[\s\n]*<([A-Z][A-Za-z0-9]+)\b[^>]*\/>[\s\n]*$/;

// Check if children contain visible text (not just whitespace)
function hasVisibleText(children: string): boolean {
  // Remove icon components
  const withoutIcons = children.replace(/<[A-Z][A-Za-z0-9]+\b[^>]*\/>/g, "");
  // Remove comments
  const withoutComments = withoutIcons.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  // Remove sr-only spans (they count as accessible names)
  const withoutSrOnly = withoutComments.replace(
    /<span[^>]*className="[^"]*sr-only[^"]*"[^>]*>[^<]*<\/span>/g,
    ""
  );
  // Check if any non-whitespace text remains
  return withoutSrOnly.trim().length > 0;
}

function hasAriaLabel(attrs: string): boolean {
  return /\baria-label\s*=/.test(attrs);
}

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

    // Skip if it has aria-label
    if (hasAriaLabel(attrs)) continue;

    // Skip if children have visible text
    if (hasVisibleText(children)) continue;

    // Skip if children contain sr-only text
    if (children.includes("sr-only")) continue;

    // This is an icon-only button without aria-label
    const offset = match.index;
    // Find line number
    let line = 1;
    for (let i = 0; i < lineOffsets.length; i++) {
      if (lineOffsets[i] > offset) {
        line = i;
        break;
      }
    }

    const snippet = match[0].split("\n")[0].substring(0, 120);
    results.push({ file: file.replace(SRC_DIR + "/", ""), line, snippet });
  }
}

// Group by file
const byFile = new Map<string, typeof results>();
for (const r of results) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file)!.push(r);
}

console.log(
  `\n${results.length} icon-only buttons missing aria-label across ${byFile.size} files:\n`
);
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file} (${items.length})`);
  for (const item of items) {
    console.log(`    L${item.line}: ${item.snippet}`);
  }
}
