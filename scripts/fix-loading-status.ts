#!/usr/bin/env bun
/**
 * Codemod: Add role="status" aria-live="polite" to loading wrapper divs
 * that contain Loader2 animate-spin but no role/aria-live.
 *
 * Pattern: <div className="..."> <Loader2 ... className="...animate-spin..." /> ...</div>
 * If the div doesn't already have role= or aria-live, add them.
 *
 * Usage: bun run scripts/fix-loading-status.ts
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
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

let filesModified = 0;
let replacements = 0;

for (const file of walk(SRC_DIR)) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  let modified = false;

  // Find lines with <div that contain className and are followed within a few lines
  // by Loader2 with animate-spin, and the div doesn't have role= or aria-live

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for <div with className but without role= or aria-live
    if (!line.includes("<div") || !line.includes("className=")) continue;
    if (line.includes("role=") || line.includes("aria-live") || line.includes("aria-busy"))
      continue;

    // Check if this div is a loading wrapper by looking at the next 5 lines for Loader2 animate-spin
    let hasLoadingSpinner = false;
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      if (lines[j].includes("Loader2") && lines[j].includes("animate-spin")) {
        hasLoadingSpinner = true;
        break;
      }
    }
    if (!hasLoadingSpinner) continue;

    // Also check that this div is a wrapper (not a button or something else)
    // and that it's a loading state (check for py- or items-center or justify-center)
    const fullDivLine = line;
    if (
      !fullDivLine.includes("items-center") &&
      !fullDivLine.includes("justify-center") &&
      !fullDivLine.includes("py-") &&
      !fullDivLine.includes("text-center")
    ) {
      continue;
    }

    // Add role="status" and aria-live="polite" to the div
    // Insert before the closing > or />
    if (fullDivLine.endsWith(">")) {
      lines[i] = fullDivLine.slice(0, -1) + ' role="status" aria-live="polite">';
      modified = true;
      replacements++;
    } else if (fullDivLine.endsWith("/>")) {
      lines[i] = fullDivLine.slice(0, -2) + ' role="status" aria-live="polite" />';
      modified = true;
      replacements++;
    } else if (fullDivLine.endsWith('">')) {
      lines[i] = fullDivLine.slice(0, -2) + '" role="status" aria-live="polite">';
      modified = true;
      replacements++;
    }
    // For multi-line div tags, skip — too risky to modify
  }

  if (modified) {
    writeFileSync(file, lines.join("\n"), "utf-8");
    filesModified++;
    console.log(`  ✓ ${file.replace(SRC_DIR + "/", "")}`);
  }
}

console.log(
  `\nDone! Modified ${filesModified} files, ${replacements} loading wrappers got role="status".`
);
