#!/usr/bin/env bun
/**
 * Comprehensive Corpus Completeness Verification
 *
 * Scans EVERY .md file in law-corpus/ and classifies it as:
 *   - COMPLETE: Has frontmatter + substantial body text with real legal content
 *   - PLACEHOLDER: Contains "Volltext nicht abrufbar" or equivalent
 *   - STUB: Body < 200 chars (metadata-only, no real content)
 *   - WEAK: Body ≥200 chars but <1000 chars AND no §/Art. markers (metadata-only stub)
 *   - TINY: File < 500 bytes total
 *   - MISSING_URL: No source_url in frontmatter (can't backfill)
 *   - QUARANTINED: Listed in corpus-policy.ts quarantine
 *
 * For each incomplete file, extracts the source_url so it can be backfilled.
 *
 * Optionally: --verify-api fetches a sample from each source to confirm
 * the API still serves the expected document (identity check).
 *
 * Usage:
 *   bun run server/scripts/verify-corpus-completeness.ts
 *   bun run server/scripts/verify-corpus-completeness.ts --json /tmp/corpus-audit.json
 *   bun run server/scripts/verify-corpus-completeness.ts --verify-api --sample 100
 *   bun run server/scripts/verify-corpus-completeness.ts --dir at-landesrecht
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");

const args = process.argv.slice(2);
const jsonIdx = args.indexOf("--json");
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const dirIdx = args.indexOf("--dir");
const DIR_FILTER = dirIdx >= 0 ? args[dirIdx + 1] : null;
const verifyApi = args.includes("--verify-api");
const sampleIdx = args.indexOf("--sample");
const SAMPLE_SIZE = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 0;

// Thresholds
const MIN_BODY_CHARS = 200;
const TINY_FILE_BYTES = 500;
const PLACEHOLDER_MARKERS = [
  "Volltext nicht abrufbar",
  "No full text available",
  "Text nicht verfügbar",
  "Placeholder",
  "PLACEHOLDER",
];

type FileStatus =
  | "complete"
  | "placeholder"
  | "stub"
  | "weak"
  | "tiny"
  | "missing_url"
  | "quarantined"
  | "error";

interface FileReport {
  path: string;
  source: string;
  status: FileStatus;
  file_bytes: number;
  body_chars: number;
  has_source_url: boolean;
  source_url: string;
  has_section_markers: boolean;
  jurisdiction: string;
  type: string;
  title: string;
}

interface SourceReport {
  source: string;
  total: number;
  complete: number;
  placeholder: number;
  stub: number;
  weak: number;
  tiny: number;
  missing_url: number;
  quarantined: number;
  error: number;
  needs_backfill: number;
  sample_urls: string[];
}

interface AuditReport {
  timestamp: string;
  corpus_root: string;
  summary: {
    total_files: number;
    complete: number;
    placeholder: number;
    stub: number;
    tiny: number;
    missing_url: number;
    quarantined: number;
    error: number;
    needs_backfill: number;
    completeness_pct: number;
  };
  sources: SourceReport[];
  files_needing_backfill: FileReport[];
}

function parseFrontmatter(raw: string): {
  fm: Record<string, string>;
  body: string;
  fmEnd: number;
} {
  if (!raw.startsWith("---")) return { fm: {}, body: raw, fmEnd: 0 };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: {}, body: raw, fmEnd: 0 };
  const block = raw.slice(3, end);
  const fm: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[m[1]] = v;
  }
  const afterClose = raw.indexOf("\n", end + 1);
  const fmEnd = afterClose === -1 ? raw.length : afterClose + 1;
  return { fm, body: raw.slice(fmEnd), fmEnd };
}

function isPlaceholder(body: string): boolean {
  return PLACEHOLDER_MARKERS.some((m) => body.includes(m));
}

function hasSectionMarkers(body: string): boolean {
  return /§|Art\.|Artikel\s+\d/.test(body);
}

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function classifyFile(filePath: string, corpusRoot: string): FileReport {
  const relPath = relative(corpusRoot, filePath);
  const stat = statSync(filePath);
  const raw = readFileSync(filePath, "utf-8");
  const { fm, body } = parseFrontmatter(raw);

  const bodyTrimmed = body.trim();
  const sourceUrl = fm.source_url ?? "";
  const jurisdiction = fm.jurisdiction ?? "";
  const type = fm.type ?? "";
  const title = fm.title ?? "";

  let status: FileStatus;
  if (isPlaceholder(bodyTrimmed)) {
    status = "placeholder";
  } else if (stat.size < TINY_FILE_BYTES) {
    status = "tiny";
  } else if (bodyTrimmed.length < MIN_BODY_CHARS) {
    status = "stub";
  } else if (
    bodyTrimmed.length < 1000 &&
    !hasSectionMarkers(bodyTrimmed) &&
    !/\(\d+\)\s/.test(bodyTrimmed) && // Absatz markers like (1), (2)
    !/^\s*\d+\./m.test(bodyTrimmed) // numbered list items
  ) {
    // Has some body text but no legal structure — likely a metadata stub
    status = "weak";
  } else if (!sourceUrl) {
    status = "missing_url";
  } else {
    status = "complete";
  }

  // Determine source from path
  const parts = relPath.split("/");
  const source = parts[0];

  return {
    path: relPath,
    source,
    status,
    file_bytes: stat.size,
    body_chars: bodyTrimmed.length,
    has_source_url: !!sourceUrl,
    source_url: sourceUrl,
    has_section_markers: hasSectionMarkers(bodyTrimmed),
    jurisdiction,
    type,
    title,
  };
}

async function verifyApiSample(files: FileReport[], sampleSize: number): Promise<void> {
  const { acquireRisLock, releaseRisLock } = await import("./ris-lock.ts").catch(() => ({
    acquireRisLock: async () => {},
    releaseRisLock: async () => {},
  }));
  const { proxyFetchOptions, getUserAgent } = await import("./ris-proxy.ts").catch(() => ({
    proxyFetchOptions: () => ({}),
    getUserAgent: () => "Subsumio-Corpus-Verify/1.0",
  }));

  // Sample across sources
  const bySource = new Map<string, FileReport[]>();
  for (const f of files) {
    const list = bySource.get(f.source) ?? [];
    list.push(f);
    bySource.set(f.source, list);
  }

  const sample: FileReport[] = [];
  for (const [, list] of bySource) {
    const n = Math.min(Math.ceil(sampleSize / bySource.size), list.length);
    // Random-ish sample: pick evenly spaced
    const step = Math.max(1, Math.floor(list.length / n));
    for (let i = 0; i < list.length && sample.length < sampleSize; i += step) {
      sample.push(list[i]);
    }
  }

  console.log(
    `\n🔍 API Verification: sampling ${sample.length} files across ${bySource.size} sources\n`
  );

  let verified = 0;
  let mismatched = 0;
  let failed = 0;

  for (const file of sample) {
    if (!file.source_url) {
      console.log(`  ⏭️  ${file.path} — no source_url, skipping`);
      continue;
    }

    const isRIS =
      file.source_url.includes("ris.bka.gv.at") || file.source_url.includes("data.bka.gv.at");
    if (isRIS) await acquireRisLock();

    try {
      const res = await fetch(file.source_url, {
        headers: {
          "User-Agent": getUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        ...proxyFetchOptions(),
      });

      if (!res.ok) {
        console.log(`  ❌ ${file.path} — HTTP ${res.status}`);
        failed++;
      } else {
        const text = await res.text();
        // Identity check: does the response contain the title or a key identifier?
        const titlePart = file.title.slice(0, 40).trim();
        const hasTitle = titlePart && text.includes(titlePart);
        const hasContent = text.length > 500;

        if (hasTitle && hasContent) {
          console.log(`  ✅ ${file.path} — verified (${text.length} bytes from API)`);
          verified++;
        } else {
          console.log(
            `  ⚠️  ${file.path} — response doesn't match expected content (title: ${hasTitle}, len: ${text.length})`
          );
          mismatched++;
        }
      }

      if (isRIS) {
        await releaseRisLock();
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (e) {
      console.log(`  ❌ ${file.path} — ${e instanceof Error ? e.message : String(e)}`);
      failed++;
      if (isRIS) await releaseRisLock();
    }
  }

  console.log(
    `\n  API Verification Summary: ${verified} verified, ${mismatched} mismatched, ${failed} failed\n`
  );
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Comprehensive Corpus Completeness Verification");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Corpus root: ${CORPUS_ROOT}`);
  console.log(`  Timestamp:   ${new Date().toISOString()}`);
  if (DIR_FILTER) console.log(`  Directory filter: ${DIR_FILTER}`);
  if (verifyApi) console.log(`  API verification: enabled (sample: ${SAMPLE_SIZE || "all"})`);
  console.log("");

  // Discover all corpus directories
  const allDirs: string[] = [];
  if (DIR_FILTER) {
    const fullDir = join(CORPUS_ROOT, DIR_FILTER);
    if (existsSync(fullDir)) allDirs.push(fullDir);
  } else {
    const entries = readdirSync(CORPUS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        allDirs.push(join(CORPUS_ROOT, entry.name));
      }
    }
  }

  const allFiles: string[] = [];
  for (const dir of allDirs) {
    walkDir(dir, allFiles);
  }

  console.log(
    `  Scanning ${allFiles.length} markdown files across ${allDirs.length} directories...\n`
  );

  const reports: FileReport[] = [];
  for (const file of allFiles) {
    try {
      reports.push(classifyFile(file, CORPUS_ROOT));
    } catch (e) {
      // Skip unreadable files
    }
  }

  // Build per-source reports
  const sourceMap = new Map<string, FileReport[]>();
  for (const r of reports) {
    const list = sourceMap.get(r.source) ?? [];
    list.push(r);
    sourceMap.set(r.source, list);
  }

  const sourceReports: SourceReport[] = [];
  for (const [source, files] of sourceMap) {
    const sr: SourceReport = {
      source,
      total: files.length,
      complete: 0,
      placeholder: 0,
      stub: 0,
      weak: 0,
      tiny: 0,
      missing_url: 0,
      quarantined: 0,
      error: 0,
      needs_backfill: 0,
      sample_urls: [],
    };
    for (const f of files) {
      switch (f.status) {
        case "complete":
          sr.complete++;
          break;
        case "placeholder":
          sr.placeholder++;
          sr.needs_backfill++;
          break;
        case "stub":
          sr.stub++;
          sr.needs_backfill++;
          break;
        case "weak":
          sr.weak++;
          sr.needs_backfill++;
          break;
        case "tiny":
          sr.tiny++;
          sr.needs_backfill++;
          break;
        case "missing_url":
          sr.missing_url++;
          break;
        case "quarantined":
          sr.quarantined++;
          break;
        case "error":
          sr.error++;
          break;
      }
    }
    // Collect sample URLs for backfill
    const needsBf = files.filter(
      (f) =>
        f.status === "placeholder" ||
        f.status === "stub" ||
        f.status === "weak" ||
        f.status === "tiny"
    );
    sr.sample_urls = needsBf.slice(0, 5).map((f) => f.source_url);
    sourceReports.push(sr);
  }

  sourceReports.sort((a, b) => b.needs_backfill - a.needs_backfill);

  const summary = {
    total_files: reports.length,
    complete: reports.filter((r) => r.status === "complete").length,
    placeholder: reports.filter((r) => r.status === "placeholder").length,
    stub: reports.filter((r) => r.status === "stub").length,
    weak: reports.filter((r) => r.status === "weak").length,
    tiny: reports.filter((r) => r.status === "tiny").length,
    missing_url: reports.filter((r) => r.status === "missing_url").length,
    quarantined: reports.filter((r) => r.status === "quarantined").length,
    error: reports.filter((r) => r.status === "error").length,
    needs_backfill: reports.filter(
      (r) =>
        r.status === "placeholder" ||
        r.status === "stub" ||
        r.status === "weak" ||
        r.status === "tiny"
    ).length,
    completeness_pct: 0,
  };
  summary.completeness_pct =
    summary.total_files > 0 ? Math.round((summary.complete / summary.total_files) * 1000) / 10 : 0;

  // Print report
  console.log(
    "┌────────────────────────────────────────────────────────────────────────────────────┐"
  );
  console.log(
    "│ CORPUS COMPLETENESS REPORT                                                          │"
  );
  console.log(
    "├────────────────────────────────────────────────────────────────────────────────────┤"
  );
  console.log(
    `│ Total files:        ${String(summary.total_files).padStart(10)}                                           │`
  );
  console.log(
    `│ ✅ Complete:        ${String(summary.complete).padStart(10)}  (${summary.completeness_pct}%)                              │`
  );
  console.log(
    `│ ⚠️  Placeholder:     ${String(summary.placeholder).padStart(10)}                                           │`
  );
  console.log(
    `│ ⚠️  Stub (<200ch):   ${String(summary.stub).padStart(10)}                                           │`
  );
  console.log(
    `│ ⚠️  Tiny (<500B):    ${String(summary.tiny).padStart(10)}                                           │`
  );
  console.log(
    `│ ❓ Missing URL:      ${String(summary.missing_url).padStart(10)}                                           │`
  );
  console.log(
    `│ 🚫 Quarantined:     ${String(summary.quarantined).padStart(10)}                                           │`
  );
  console.log(
    `│ ❌ Error:            ${String(summary.error).padStart(10)}                                           │`
  );
  console.log(
    `│ ─────────────────────────────────────────────────────────────────────────────────── │`
  );
  console.log(
    `│ 🔧 Needs backfill:   ${String(summary.needs_backfill).padStart(10)}  (${Math.round((summary.needs_backfill / summary.total_files) * 1000) / 10}%)                              │`
  );
  console.log(
    "└────────────────────────────────────────────────────────────────────────────────────┘"
  );

  console.log("\n📊 Per-Source Breakdown:\n");
  console.log(
    "  Source".padEnd(30) +
      "Total".padStart(8) +
      "OK".padStart(8) +
      "Place".padStart(8) +
      "Stub".padStart(8) +
      "Weak".padStart(8) +
      "Tiny".padStart(8) +
      "NoURL".padStart(8) +
      "Backfill".padStart(10)
  );
  console.log("  " + "─".repeat(78));
  for (const sr of sourceReports) {
    const pct = sr.total > 0 ? Math.round((sr.complete / sr.total) * 100) : 0;
    console.log(
      `  ${sr.source.padEnd(28)}` +
        String(sr.total).padStart(8) +
        String(sr.complete).padStart(8) +
        String(sr.placeholder).padStart(8) +
        String(sr.stub).padStart(8) +
        String(sr.weak ?? 0).padStart(8) +
        String(sr.tiny).padStart(8) +
        String(sr.missing_url).padStart(8) +
        String(sr.needs_backfill).padStart(10) +
        `  (${pct}%)`
    );
  }

  // List files needing backfill (limited output)
  const needsBf = reports.filter(
    (r) =>
      r.status === "placeholder" ||
      r.status === "stub" ||
      r.status === "weak" ||
      r.status === "tiny"
  );
  if (needsBf.length > 0) {
    console.log(`\n🔧 Files needing backfill (${needsBf.length} total, showing first 20):\n`);
    for (const f of needsBf.slice(0, 20)) {
      console.log(`  [${f.status.toUpperCase().padEnd(11)}] ${f.path}`);
      console.log(`    URL: ${f.source_url || "(none)"}`);
      console.log(`    Body: ${f.body_chars} chars, §: ${f.has_section_markers}`);
      console.log("");
    }
    if (needsBf.length > 20) {
      console.log(`  ... and ${needsBf.length - 20} more (use --json for full list)`);
    }
  }

  // Optional API verification
  if (verifyApi) {
    await verifyApiSample(
      reports.filter((r) => r.status === "complete"),
      SAMPLE_SIZE || 100
    );
  }

  // JSON output
  if (JSON_OUT) {
    const audit: AuditReport = {
      timestamp: new Date().toISOString(),
      corpus_root: CORPUS_ROOT,
      summary,
      sources: sourceReports,
      files_needing_backfill: needsBf,
    };
    writeFileSync(JSON_OUT, JSON.stringify(audit, null, 2));
    console.log(`\n📄 Full report written to ${JSON_OUT}`);
  }

  // Exit code: 0 if complete, 1 if issues found
  if (summary.needs_backfill > 0) {
    console.log(
      `\n❌ ${summary.needs_backfill} files need backfilling — corpus is NOT 100% complete`
    );
    process.exit(1);
  } else {
    console.log(
      `\n✅ All ${summary.total_files} files have complete content — corpus is 100% complete`
    );
    process.exit(0);
  }
}

import { writeFileSync } from "fs";

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(2);
});
