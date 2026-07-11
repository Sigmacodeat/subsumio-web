/**
 * Color Token Migration Script — automatically replaces hardcoded Tailwind
 * text/bg/border color utilities with --ds-* semantic tokens.
 *
 * Only applies SAFE migrations where a clear semantic mapping exists.
 * Categorical colors (purple, cyan, violet, sky, teal, indigo, fuchsia, pink)
 * are left untouched — they don't have --ds-* equivalents.
 *
 * Usage: npx tsx scripts/color-token-migrate.ts [--dry-run]
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(process.cwd(), "src");
const DRY_RUN = process.argv.includes("--dry-run");

// ── Migration maps ──

// text-{color}-{step} → text-[color:var(--ds-*-text)]
const TEXT_MIGRATIONS: Record<string, string> = {
  red: "danger",
  rose: "danger",
  emerald: "success",
  green: "success",
  amber: "warning",
  yellow: "warning",
  blue: "info",
  orange: "attention",
};

// bg-{color}-{step} (solid, no /opacity) → bg-[color:var(--ds-*-solid)]
const BG_SOLID_MIGRATIONS: Record<string, string> = {
  red: "danger",
  rose: "danger",
  emerald: "success",
  green: "success",
  amber: "warning",
  yellow: "warning",
  blue: "info",
  orange: "attention",
};

// border-{color}-{step}/opacity → border-[color:var(--ds-*-border)]
// border-{color}-{step}/opacity bg-{color}-{step}/opacity → use --ds-*-border and --ds-*-bg
const BORDER_BG_MIGRATIONS: Record<string, string> = {
  red: "danger",
  rose: "danger",
  emerald: "success",
  green: "success",
  amber: "warning",
  yellow: "warning",
  blue: "info",
  orange: "attention",
};

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const MIGRATABLE_COLORS = Object.keys(TEXT_MIGRATIONS);

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

function migrateContent(content: string): { newContent: string; changes: number } {
  let newContent = content;
  let changes = 0;

  for (const color of MIGRATABLE_COLORS) {
    const dsToken = TEXT_MIGRATIONS[color]!;

    for (const step of STEPS) {
      // text-{color}-{step} → text-[color:var(--ds-*-text)]
      const textRe = new RegExp(`\\btext-${color}-${step}\\b`, "g");
      const textMatches = newContent.match(textRe);
      if (textMatches) {
        newContent = newContent.replace(textRe, `text-[color:var(--ds-${dsToken}-text)]`);
        changes += textMatches.length;
      }

      // bg-{color}-{step} (NOT followed by /) → bg-[color:var(--ds-*-solid)]
      const bgRe = new RegExp(`\\bbg-${color}-${step}\\b(?!/)`, "g");
      const bgMatches = newContent.match(bgRe);
      if (bgMatches) {
        newContent = newContent.replace(bgRe, `bg-[color:var(--ds-${dsToken}-solid)]`);
        changes += bgMatches.length;
      }

      // border-{color}-{step}/opacity → border-[color:var(--ds-*-border)]
      const borderRe = new RegExp(`\\bborder-${color}-${step}/\\d+\\b`, "g");
      const borderMatches = newContent.match(borderRe);
      if (borderMatches) {
        newContent = newContent.replace(borderRe, `border-[color:var(--ds-${dsToken}-border)]`);
        changes += borderMatches.length;
      }

      // bg-{color}-{step}/opacity → bg-[color:var(--ds-*-bg)]
      const bgOpacityRe = new RegExp(`\\bbg-${color}-${step}/\\d+\\b`, "g");
      const bgOpacityMatches = newContent.match(bgOpacityRe);
      if (bgOpacityMatches) {
        newContent = newContent.replace(bgOpacityRe, `bg-[color:var(--ds-${dsToken}-bg)]`);
        changes += bgOpacityMatches.length;
      }

      // border-l-{color}-{step} → border-l-[color:var(--ds-*-solid)]
      const borderLRe = new RegExp(`\\bborder-l-${color}-${step}\\b`, "g");
      const borderLMatches = newContent.match(borderLRe);
      if (borderLMatches) {
        newContent = newContent.replace(borderLRe, `border-l-[color:var(--ds-${dsToken}-solid)]`);
        changes += borderLMatches.length;
      }
    }
  }

  return { newContent, changes };
}

function main() {
  const dirs = [
    path.join(ROOT, "components", "dashboard"),
    path.join(ROOT, "components", "legal"),
    path.join(ROOT, "app", "dashboard"),
  ];

  let totalChanges = 0;
  let filesChanged = 0;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = walkDir(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const { newContent, changes } = migrateContent(content);
      if (changes > 0) {
        filesChanged++;
        totalChanges += changes;
        if (!DRY_RUN) {
          fs.writeFileSync(file, newContent, "utf-8");
        }
        const rel = path.relative(process.cwd(), file);
        console.log(`  ${DRY_RUN ? "[DRY]" : "[MIGR]"} ${rel}: ${changes} replacements`);
      }
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Files changed: ${filesChanged}`);
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Total replacements: ${totalChanges}`);
}

main();
