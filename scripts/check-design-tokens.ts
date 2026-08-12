#!/usr/bin/env tsx
/**
 * CI Guard: Verify no undefined shadcn/Tailwind token classes are used.
 *
 * The Subsumio design system uses `--ds-*` and `--brand-*` CSS custom
 * properties. Legacy shadcn classes like `text-muted-foreground`,
 * `bg-muted`, `border-border`, `bg-accent`, `text-destructive`,
 * `ring-offset-background` and the undefined `--ds-text-secondary` token
 * produce NO CSS in Tailwind v4 (no shadcn CSS variables defined) and
 * silently render with inherited/random colors — a real WCAG AA failure.
 *
 * Fails if any of these patterns are found in src/ (excluding globals.css
 * which defines the tokens, and .stories.tsx which may demonstrate them).
 *
 * Usage: npx tsx scripts/check-design-tokens.ts
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SRC_ROOT = join(process.cwd(), "src");

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\btext-muted-foreground\b/g, reason: "undefined shadcn class — use text-[color:var(--ds-text-muted)]" },
  { pattern: /\bbg-muted\b(?![-\w])/g, reason: "undefined shadcn class — use bg-[color:var(--ds-surface-2)]" },
  { pattern: /\bborder-border\b(?![-\w])/g, reason: "undefined shadcn class — use border-[color:var(--ds-border)]" },
  { pattern: /\bbg-background\b/g, reason: "undefined shadcn class — use bg-[color:var(--ds-bg)]" },
  { pattern: /\btext-foreground\b/g, reason: "undefined shadcn class — use text-[color:var(--ds-text)]" },
  { pattern: /\bbg-destructive\b/g, reason: "undefined shadcn class — use bg-[color:var(--ds-danger-bg)]" },
  { pattern: /\btext-destructive\b/g, reason: "undefined shadcn class — use text-[color:var(--ds-danger-text)]" },
  { pattern: /\bborder-destructive\b/g, reason: "undefined shadcn class — use border-[color:var(--ds-danger-border)]" },
  { pattern: /\bbg-accent\b(?![-\w])/g, reason: "undefined shadcn class — use bg-[color:var(--ds-surface-hover)]" },
  { pattern: /\btext-accent\b(?![-\w])/g, reason: "undefined shadcn class — use text-[color:var(--ds-accent)]" },
  { pattern: /\bbg-popover\b/g, reason: "undefined shadcn class — use bg-[color:var(--ds-surface)]" },
  { pattern: /\btext-popover\b/g, reason: "undefined shadcn class — use text-[color:var(--ds-text)]" },
  { pattern: /\bbg-card\b(?![-\w])/g, reason: "undefined shadcn class — use bg-[color:var(--ds-surface)]" },
  { pattern: /\btext-card\b(?![-\w])/g, reason: "undefined shadcn class — use text-[color:var(--ds-text)]" },
  { pattern: /\bring-offset-background\b/g, reason: "undefined shadcn class — use ring-offset-[color:var(--ds-surface)]" },
  { pattern: /ds-text-secondary\b/g, reason: "undefined --ds-text-secondary token — use ds-text-muted" },
];

const SKIP_FILES = [/globals\.css$/, /\.stories\.tsx$/, /\.test\.tsx?$/];

interface TokenIssue {
  file: string;
  line: number;
  match: string;
  reason: string;
}

const issues: TokenIssue[] = [];
let checkedFiles = 0;

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (/\.(tsx?|jsx?|css)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkFile(filePath: string): void {
  if (SKIP_FILES.some((re) => re.test(filePath))) return;

  checkedFiles++;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = line.match(pattern);
      if (matches) {
        for (const match of matches) {
          issues.push({
            file: relative(process.cwd(), filePath),
            line: i + 1,
            match,
            reason,
          });
        }
      }
    }
  }
}

function main(): void {
  if (!statSync(SRC_ROOT).isDirectory()) {
    console.error(`[check-design-tokens] src/ not found: ${SRC_ROOT}`);
    process.exit(1);
  }

  const files = walk(SRC_ROOT);
  for (const file of files) {
    checkFile(file);
  }

  console.log(`\n[check-design-tokens] Checked ${checkedFiles} files in src/`);

  if (issues.length === 0) {
    console.log("[check-design-tokens] ✅ No undefined shadcn/Tailwind token classes found");
    process.exit(0);
  }

  console.error(`[check-design-tokens] ❌ Found ${issues.length} issue(s):\n`);
  for (const issue of issues) {
    console.error(`  ${issue.file}:${issue.line} — "${issue.match}" — ${issue.reason}`);
  }
  process.exit(1);
}

main();
