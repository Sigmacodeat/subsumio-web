#!/usr/bin/env bun
/**
 * Codemod: Replace `focus:outline-none` with `focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1`
 *
 * Only adds focus-visible:ring if the className string doesn't already contain
 * `focus-visible:ring` or `focus-visible:outline`.
 *
 * Usage: bun run scripts/fix-focus-visible.ts
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, extname } from "path";

const SRC_DIR = join(import.meta.dir, "..", "src");
const RING_CLASS =
  "focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1";

let filesScanned = 0;
let filesModified = 0;
let replacements = 0;

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (extname(fullPath) === ".tsx" || extname(fullPath) === ".ts") {
      files.push(fullPath);
    }
  }
  return files;
}

function processFile(filePath: string): void {
  filesScanned++;
  const content = readFileSync(filePath, "utf-8");
  let modified = content;

  // Pattern 1: className="...focus:outline-none..." (double quotes)
  // Pattern 2: className={cn("...focus:outline-none...")} (template strings)
  // Pattern 3: className={`...focus:outline-none...`} (template literals)

  // Match className strings containing focus:outline-none but NOT focus-visible:ring
  // We need to be careful to only add the ring classes if they don't already exist

  // Strategy: Find all occurrences of `focus:outline-none` that are NOT followed by
  // `focus-visible:ring` within the same className string, and append the ring classes.

  // Simple approach: replace `focus:outline-none` with `focus:outline-none ${RING_CLASS}`
  // but only if the surrounding context doesn't already have focus-visible:ring

  // Use a regex that matches focus:outline-none NOT immediately followed by focus-visible:ring
  const pattern = /focus:outline-none(?!(?:[^"]*focus-visible:ring))/g;

  // But we need to be more careful — the negative lookahead needs to stay within
  // the same className string. Let's use a simpler approach:
  // Replace all `focus:outline-none` that are NOT already followed by `focus-visible:ring`
  // on the same line.

  const lines = modified.split("\n");
  const newLines: string[] = [];
  let fileChanged = false;

  for (const line of lines) {
    if (!line.includes("focus:outline-none")) {
      newLines.push(line);
      continue;
    }

    // Skip if the line already has focus-visible:ring or focus-visible:outline
    if (line.includes("focus-visible:ring") || line.includes("focus-visible:outline")) {
      newLines.push(line);
      continue;
    }

    // Replace focus:outline-none with focus:outline-none + ring classes
    const newLine = line.replace(/focus:outline-none/g, `focus:outline-none ${RING_CLASS}`);

    if (newLine !== line) {
      fileChanged = true;
      replacements += (line.match(/focus:outline-none/g) || []).length;
    }
    newLines.push(newLine);
  }

  if (fileChanged) {
    modified = newLines.join("\n");
    writeFileSync(filePath, modified, "utf-8");
    filesModified++;
    console.log(
      `  ✓ ${filePath.replace(SRC_DIR + "/", "")} (${replacements} replacements in this pass)`
    );
  }
}

console.log("Scanning", SRC_DIR, "for focus:outline-none without focus-visible:ring...\n");

const files = walk(SRC_DIR);
for (const file of files) {
  processFile(file);
}

console.log(
  `\nDone! Scanned ${filesScanned} files, modified ${filesModified} files, ${replacements} replacements.`
);
