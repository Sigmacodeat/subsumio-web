/**
 * Color Token Lint — flags hardcoded Tailwind text-color utilities that bypass
 * the --ds-* semantic token system. These utilities don't adapt between
 * light/dark themes and produce wrong contrast in dark mode.
 *
 * Allowed (translucency auto-adapts):
 *   bg-{color}-500/{opacity}     — translucency makes it theme-agnostic
 *   border-{color}-500/{opacity} — translucency makes it theme-agnostic
 *
 * Flagged (static step, doesn't adapt):
 *   text-{color}-{100-900}       — static lightness step, wrong in dark mode
 *   bg-{color}-{100-900} (solid) — should use --ds-*-solid
 *
 * Usage: npx tsx scripts/color-token-lint.ts [--fix]
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(process.cwd(), "src");
const COLORS = [
  "red",
  "green",
  "blue",
  "amber",
  "emerald",
  "yellow",
  "orange",
  "rose",
  "violet",
  "purple",
  "pink",
  "teal",
  "cyan",
  "sky",
  "indigo",
  "fuchsia",
];
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

// text-{color}-{step} — these are the critical ones that don't adapt
const TEXT_COLOR_RE = new RegExp(`\\btext-(?:${COLORS.join("|")})-(?:${STEPS.join("|")})\\b`, "g");

// bg-{color}-{step} WITHOUT /opacity — solid backgrounds that don't adapt
const BG_SOLID_RE = new RegExp(`\\bbg-(?:${COLORS.join("|")})-(?:${STEPS.join("|")})\\b(?!/)`, "g");

type Violation = {
  file: string;
  line: number;
  col: number;
  match: string;
  type: "text-color" | "bg-solid";
  suggestion: string;
};

const MIGRATION_MAP: Record<string, string> = {
  // Text colors → --ds-*-text
  "text-red": "text-[color:var(--ds-danger-text)]",
  "text-rose": "text-[color:var(--ds-danger-text)]",
  "text-emerald": "text-[color:var(--ds-success-text)]",
  "text-green": "text-[color:var(--ds-success-text)]",
  "text-amber": "text-[color:var(--ds-warning-text)]",
  "text-yellow": "text-[color:var(--ds-warning-text)]",
  "text-blue": "text-[color:var(--ds-info-text)]",
  "text-orange": "text-[color:var(--ds-attention-text)]",
  // Solid bg → --ds-*-solid
  "bg-red": "bg-[color:var(--ds-danger-solid)]",
  "bg-rose": "bg-[color:var(--ds-danger-solid)]",
  "bg-emerald": "bg-[color:var(--ds-success-solid)]",
  "bg-green": "bg-[color:var(--ds-success-solid)]",
  "bg-amber": "bg-[color:var(--ds-warning-solid)]",
  "bg-yellow": "bg-[color:var(--ds-warning-solid)]",
  "bg-blue": "bg-[color:var(--ds-info-solid)]",
  "bg-orange": "bg-[color:var(--ds-attention-solid)]",
};

function getSuggestion(match: string, type: "text-color" | "bg-solid"): string {
  for (const [prefix, replacement] of Object.entries(MIGRATION_MAP)) {
    if (match.startsWith(prefix)) {
      return replacement;
    }
  }
  return "";
}

function walkDir(dir: string, results: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

function lintFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;

    // Check text-color violations
    let match: RegExpExecArray | null;
    const textRe = new RegExp(TEXT_COLOR_RE.source, "g");
    while ((match = textRe.exec(line)) !== null) {
      // Skip if it's inside a CSS var() expression like text-[color:var(--ds-...)]
      if (line.slice(Math.max(0, match.index - 15), match.index).includes("var(")) continue;
      violations.push({
        file: filePath,
        line: i + 1,
        col: match.index + 1,
        match: match[0],
        type: "text-color",
        suggestion: getSuggestion(match[0], "text-color"),
      });
    }

    // Check bg-solid violations
    const bgRe = new RegExp(BG_SOLID_RE.source, "g");
    while ((match = bgRe.exec(line)) !== null) {
      violations.push({
        file: filePath,
        line: i + 1,
        col: match.index + 1,
        match: match[0],
        type: "bg-solid",
        suggestion: getSuggestion(match[0], "bg-solid"),
      });
    }
  }

  return violations;
}

function main() {
  const fixMode = process.argv.includes("--fix");
  const dirs = [
    path.join(ROOT, "components", "dashboard"),
    path.join(ROOT, "components", "legal"),
    path.join(ROOT, "app", "dashboard"),
  ];

  const allViolations: Violation[] = [];
  let filesScanned = 0;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = walkDir(dir);
    for (const file of files) {
      filesScanned++;
      const violations = lintFile(file);
      allViolations.push(...violations);
    }
  }

  // Group by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  // Report
  const textCount = allViolations.filter((v) => v.type === "text-color").length;
  const bgCount = allViolations.filter((v) => v.type === "bg-solid").length;

  console.log(`\n=== Color Token Lint ===`);
  console.log(`Files scanned: ${filesScanned}`);
  console.log(
    `Total violations: ${allViolations.length} (text-color: ${textCount}, bg-solid: ${bgCount})`
  );

  if (allViolations.length === 0) {
    console.log("✅ No hardcoded color utilities found.");
    process.exit(0);
  }

  // Sort by violation count descending
  const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(`\nTop 30 files by violation count:`);
  for (const [file, violations] of sortedFiles.slice(0, 30)) {
    const rel = path.relative(process.cwd(), file);
    console.log(`  ${rel}: ${violations.length} violations`);
  }

  if (sortedFiles.length > 30) {
    console.log(`  ... and ${sortedFiles.length - 30} more files`);
  }

  // Show first 50 individual violations
  console.log(`\nSample violations (first 50):`);
  for (const v of allViolations.slice(0, 50)) {
    const rel = path.relative(process.cwd(), v.file);
    console.log(`  ${rel}:${v.line}  ${v.match}  →  ${v.suggestion || "(no auto-migration)"}`);
  }

  if (allViolations.length > 50) {
    console.log(`  ... and ${allViolations.length - 50} more`);
  }

  process.exit(0);
}

main();
