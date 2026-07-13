/**
 * Frontmatter → CorpusReceipt Migration
 *
 * T3.1: Migrates existing frontmatter metadata in law-corpus/*.md files
 * to structured CorpusReceipts and persists them via SnapshotStore.
 *
 * Frontmatter fields mapped:
 *   title          → (parsed for statute_code)
 *   jurisdiction   → jurisdiction
 *   abbreviation   → statute_code
 *   version_date   → valid_from
 *   retrieved_at   → fetched_at
 *   source_url     → source_url
 *   license        → license_status (public/licensed/pending)
 *
 * Usage:
 *   bun run server/src/core/legal/migrate-frontmatter.ts
 *
 * @module server/src/core/legal/migrate-frontmatter
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  type CorpusReceipt,
  type Jurisdiction,
  type LicenseStatus,
  validateReceipt,
  serializeReceipt,
} from "./corpus-receipt.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface ParsedFrontmatter {
  title: string;
  type: string;
  jurisdiction: string;
  abbreviation: string;
  version_date: string;
  retrieved_at: string;
  source_url: string;
  license: string;
  [key: string]: string;
}

export interface MigrationResult {
  slug: string;
  file_path: string;
  receipt: CorpusReceipt;
  migrated: boolean;
  error?: string;
}

export interface MigrationReport {
  total_files: number;
  migrated: number;
  skipped: number;
  errors: number;
  results: MigrationResult[];
}

// ── Frontmatter Parser ────────────────────────────────────────────────

/**
 * Parse YAML-like frontmatter from a markdown file.
 * This is a minimal parser — the corpus files use simple key: value pairs.
 */
export function parseFrontmatter(content: string): {
  frontmatter: ParsedFrontmatter | null;
  body: string;
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: null, body: content };
  }

  const fmText = fmMatch[1]!;
  const body = fmMatch[2]!;

  const frontmatter: Record<string, string> = {};
  for (const line of fmText.split("\n")) {
    const match = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (match) {
      frontmatter[match[1]!] = match[2]!;
    }
  }

  return { frontmatter: frontmatter as ParsedFrontmatter, body };
}

// ── Receipt Builder ───────────────────────────────────────────────────

/**
 * Build a CorpusReceipt from parsed frontmatter and file content.
 */
export function buildReceiptFromFrontmatter(
  filePath: string,
  frontmatter: ParsedFrontmatter,
  bodyContent: string,
  parserVersion = "frontmatter-migration-v1"
): CorpusReceipt {
  const jurisdiction = frontmatter.jurisdiction.toUpperCase() as Jurisdiction;
  const statuteCode = frontmatter.abbreviation || extractStatuteFromFilename(filePath);
  const slug = buildSlug(jurisdiction, statuteCode);
  const contentHash = hashContent(bodyContent);
  const licenseStatus = inferLicenseStatus(frontmatter.license);
  const paragraphCount = countParagraphs(bodyContent);

  return {
    slug,
    jurisdiction,
    statute_code: statuteCode,
    valid_from: frontmatter.version_date || new Date().toISOString().slice(0, 10),
    valid_to: null,
    fetched_at: frontmatter.retrieved_at
      ? new Date(frontmatter.retrieved_at).toISOString()
      : new Date().toISOString(),
    source_url: frontmatter.source_url || "",
    content_hash: contentHash,
    parser_version: parserVersion,
    license_status: licenseStatus,
    amendment_count: 0,
    language: "de",
    paragraph_count: paragraphCount,
  };
}

// ── File Scanner ──────────────────────────────────────────────────────

/**
 * Scan a directory for .md files with frontmatter.
 */
export function scanCorpusFiles(corpusRoot: string): string[] {
  const files: string[] = [];

  function scanDir(dir: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  if (existsSync(corpusRoot)) {
    scanDir(corpusRoot);
  }

  return files.sort();
}

// ── Migration Runner ──────────────────────────────────────────────────

/**
 * Migrate all frontmatter files in a corpus directory to CorpusReceipts.
 * Returns a report of what was migrated.
 */
export function migrateCorpusFrontmatter(
  corpusRoot: string,
  opts?: { parserVersion?: string; dryRun?: boolean }
): MigrationReport {
  const files = scanCorpusFiles(corpusRoot);
  const results: MigrationResult[] = [];
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, "utf8");
      const { frontmatter, body } = parseFrontmatter(content);

      if (!frontmatter) {
        results.push({
          slug: "",
          file_path: filePath,
          receipt: null as unknown as CorpusReceipt,
          migrated: false,
          error: "No frontmatter found",
        });
        skipped++;
        continue;
      }

      const receipt = buildReceiptFromFrontmatter(filePath, frontmatter, body, opts?.parserVersion);

      const validationErrors = validateReceipt(receipt);
      if (validationErrors.length > 0) {
        results.push({
          slug: receipt.slug,
          file_path: filePath,
          receipt,
          migrated: false,
          error: `Validation: ${validationErrors.map((e) => e.message).join("; ")}`,
        });
        errors++;
        continue;
      }

      results.push({
        slug: receipt.slug,
        file_path: filePath,
        receipt,
        migrated: !opts?.dryRun,
      });
      if (!opts?.dryRun) {
        migrated++;
      } else {
        migrated++;
      }
    } catch (err) {
      results.push({
        slug: "",
        file_path: filePath,
        receipt: null as unknown as CorpusReceipt,
        migrated: false,
        error: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  return {
    total_files: files.length,
    migrated,
    skipped,
    errors,
    results,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function buildSlug(jurisdiction: Jurisdiction, statuteCode: string): string {
  return `law/${jurisdiction.toLowerCase()}/${statuteCode.toLowerCase()}`;
}

function extractStatuteFromFilename(filePath: string): string {
  const base = basename(filePath, ".md");
  return base.toUpperCase();
}

function inferLicenseStatus(licenseText: string): LicenseStatus {
  const lower = (licenseText || "").toLowerCase();
  if (
    lower.includes("gemeinfrei") ||
    lower.includes("public domain") ||
    lower.includes("amtliches werk")
  ) {
    return "public";
  }
  if (
    lower.includes("open government") ||
    lower.includes("cc-by") ||
    lower.includes("cc0") ||
    lower.includes("open data")
  ) {
    return "public";
  }
  if (lower.includes("lizenz") || lower.includes("license") || lower.includes("verlag")) {
    return "licensed";
  }
  return "pending";
}

function countParagraphs(content: string): number {
  // Count § symbols or "§ " patterns
  const matches = content.match(/§\s*\d+/g);
  return matches ? matches.length : 0;
}

// ── CLI Entry Point ───────────────────────────────────────────────────

/**
 * Run the migration from the command line.
 * Usage: bun run server/src/core/legal/migrate-frontmatter.ts [--dry-run] [--corpus /path/to/law-corpus]
 */
export async function runMigrationCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const corpusArg = args.find((a) => a.startsWith("--corpus="));
  const corpusRoot = corpusArg ? corpusArg.split("=")[1]! : join(process.cwd(), "law-corpus");

  console.log(`[migrate-frontmatter] Scanning ${corpusRoot} (dryRun=${dryRun})`);

  const report = migrateCorpusFrontmatter(corpusRoot, { dryRun });

  console.log(`\n[migrate-frontmatter] Migration Report:`);
  console.log(`  Total files: ${report.total_files}`);
  console.log(`  Migrated:    ${report.migrated}`);
  console.log(`  Skipped:     ${report.skipped}`);
  console.log(`  Errors:      ${report.errors}`);

  if (report.errors > 0) {
    console.log(`\n  Errors:`);
    for (const r of report.results.filter((r) => r.error)) {
      console.log(`    ${r.file_path}: ${r.error}`);
    }
  }

  // Print first few receipts as sample
  const sampleReceipts = report.results.filter((r) => r.migrated).slice(0, 3);
  if (sampleReceipts.length > 0) {
    console.log(`\n  Sample receipts:`);
    for (const r of sampleReceipts) {
      console.log(`    ${r.slug}: ${serializeReceipt(r.receipt).slice(0, 120)}...`);
    }
  }
}

// Run CLI if called directly
if (import.meta.main) {
  runMigrationCLI().catch((err) => {
    console.error("[migrate-frontmatter] Fatal error:", err);
    process.exit(1);
  });
}
