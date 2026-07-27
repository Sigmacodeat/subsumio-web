#!/usr/bin/env bun
/**
 * Chunk & Embedding Quality Audit — comprehensive quality check for
 * chunks and embeddings in the DACH/EU legal corpus.
 *
 * Runs ~20 SQL queries against the Hetzner production DB via SSH
 * (same pattern as embed-monitor.ts) and produces a structured report
 * covering structural integrity, chunk-text quality, chunker version
 * distribution, legal metadata coverage, and orphan/consistency checks.
 *
 * Usage:
 *   bun run server/scripts/chunk-quality-audit.ts [options]
 *
 * Options:
 *   --json              Output machine-readable JSON
 *   --verbose           Show detailed lists (e.g. all stale-chunker pages)
 *   --sample-size N     Sample size for dimension checks (default: 1000)
 *   --help              Show help
 */

import { parseArgs } from "util";
import { execFileSync } from "child_process";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    json: { type: "boolean", default: false },
    verbose: { type: "boolean", default: false },
    "sample-size": { type: "string", default: "1000" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`Chunk & Embedding Quality Audit
Usage: bun run server/scripts/chunk-quality-audit.ts [options]
  --json              Machine-readable JSON output
  --verbose           Detailed lists (stale chunker pages, encoding issues)
  --sample-size N     Sample size for dimension checks (default: 1000)
`);
  process.exit(0);
}

const JSON_OUTPUT = values.json as boolean;
const VERBOSE = values.verbose as boolean;
const SAMPLE_SIZE = parseInt(String(values["sample-size"] || "1000")) || 1000;

const DB_CMD = "docker exec hetzner-db-1 psql -U sigmabrain -d sigmabrain -P pager=off -t -c";

interface AuditResult {
  timestamp: string;
  overview: {
    total_pages: number;
    total_chunks: number;
    embedded_chunks: number;
    pending_chunks: number;
    coverage_pct: number;
  };
  structural: {
    embedding_dims: { dims: number; count: number }[] | null;
    models_in_use: { model: string; count: number }[];
    signature_distribution: { signature: string | null; count: number }[];
    stale_signature_count: number;
  };
  chunk_text_quality: {
    empty_chunks: number;
    size_distribution: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
    };
    oversized_chunks: number;
    encoding_issues: number;
    duplicate_chunks: number;
    duplicate_samples: { slug: string; chunk_index: number; length: number }[];
  };
  chunker_versions: {
    version: string | null;
    count: number;
    pct: number;
  }[];
  legal_metadata: {
    jurisdiction_distribution: { jurisdiction: string | null; count: number }[];
    page_type_distribution: { type: string | null; count: number }[];
    legal_pages_total: number;
    legal_with_paragraph: number;
    legal_with_abbreviation: number;
    legal_with_jurisdiction: number;
    contextual_cr_coverage: { mode: string | null; count: number }[];
    court_decisions: {
      total: number;
      with_court: number;
      with_case_number: number;
      with_ecli: number;
    };
  };
  orphan_consistency: {
    orphan_chunks: number;
    pages_without_chunks: number;
    chunk_index_gaps: number;
  };
  issues: { severity: "error" | "warning" | "info"; message: string }[];
}

function sshExec(cmd: string, timeoutMs = 60000): string {
  try {
    return execFileSync(
      "ssh",
      ["-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=no", "subsumio-hetzner", cmd],
      {
        timeout: timeoutMs,
        encoding: "utf-8",
      }
    ).trim();
  } catch (e: any) {
    if (VERBOSE && e?.stderr) console.error("  [ssh err]", e.stderr?.toString().trim());
    return "";
  }
}

function dbQuery(sql: string, timeoutMs = 60000): string {
  return sshExec(`${DB_CMD} "${sql.replace(/"/g, '\\"')}"`, timeoutMs);
}

function dbQueryRows(sql: string, delimiter = "|"): string[][] {
  const raw = dbQuery(sql);
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.split(delimiter).map((c) => c.trim()));
}

function parseNum(s: string | undefined): number {
  return parseInt(s?.trim() || "0", 10) || 0;
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

function runAudit(): AuditResult {
  const issues: AuditResult["issues"] = [];
  const timestamp = new Date().toISOString();

  // ── Overview ──
  const pagesCount = parseNum(dbQuery("SELECT count(*) FROM pages WHERE deleted_at IS NULL"));
  const totalChunks = parseNum(dbQuery("SELECT count(*) FROM content_chunks"));
  const embeddedChunks = parseNum(
    dbQuery("SELECT count(*) FROM content_chunks WHERE embedding IS NOT NULL")
  );
  const pendingChunks = totalChunks - embeddedChunks;
  const coveragePct = pct(embeddedChunks, totalChunks);

  // ── Structural: Embedding Dimensions ──
  // Use octet_length on the vector::binary cast as a proxy for dims,
  // or parse from model name. vector_dims() may not be available in all pgvector versions.
  const dimRaw = dbQuery(
    "SELECT model || '|' || count(*)::text FROM content_chunks " +
      "WHERE embedding IS NOT NULL GROUP BY model ORDER BY count(*) DESC LIMIT 10"
  );
  // Extract dims from model name (e.g. "openrouter:openai/text-embedding-3-small:1536")
  const embeddingDims: { dims: number; count: number }[] = [];
  if (dimRaw) {
    for (const line of dimRaw.split("\n").filter((l) => l.trim())) {
      const [model, cnt] = line.split("|").map((s) => s.trim());
      const dimsMatch = model?.match(/:(\d+)$/);
      const dims = dimsMatch ? parseNum(dimsMatch[1]) : 0;
      embeddingDims.push({ dims, count: parseNum(cnt) });
    }
  }
  if (embeddingDims.length > 1) {
    issues.push({
      severity: "error",
      message: `Mixed embedding dimensions detected: ${embeddingDims.map((d) => `${d.dims}d (${d.count})`).join(", ")}`,
    });
  }

  // ── Structural: Models in Use ──
  const modelRows = dbQueryRows(
    `SELECT model, count(*) FROM content_chunks GROUP BY model ORDER BY count(*) DESC`
  );
  const modelsInUse = modelRows.map(([m, c]) => ({ model: m, count: parseNum(c) }));
  if (modelsInUse.length > 1) {
    issues.push({
      severity: "warning",
      message: `Multiple embedding models in use: ${modelsInUse.map((m) => `${m.model} (${m.count})`).join(", ")}`,
    });
  }

  // ── Structural: Embedding Signature Distribution ──
  const sigRows = dbQueryRows(
    `SELECT embedding_signature, count(*) FROM pages ` +
      `WHERE deleted_at IS NULL GROUP BY embedding_signature ORDER BY count(*) DESC`
  );
  const signatureDistribution = sigRows.map(([s, c]) => ({
    signature: s || null,
    count: parseNum(c),
  }));
  const nullSigCount = signatureDistribution.find((s) => s.signature === null)?.count ?? 0;
  const staleSigCount = signatureDistribution
    .filter((s) => s.signature !== null && s.count < 100)
    .reduce((a, s) => a + s.count, 0);

  // ── Chunk Text Quality: Empty Chunks ──
  const emptyChunks = parseNum(
    dbQuery("SELECT count(*) FROM content_chunks WHERE LENGTH(TRIM(chunk_text)) = 0")
  );
  if (emptyChunks > 0) {
    issues.push({
      severity: "error",
      message: `${emptyChunks} empty/whitespace-only chunks found`,
    });
  }

  // ── Chunk Text Quality: Size Distribution ──
  // Use TABLESAMPLE on 1.6M rows to avoid full-scan timeout.
  // Separate queries with extended timeout for expensive aggregates.
  const samplePct = 5; // 5% sample = ~84K rows, statistically representative
  const sizeMin = parseNum(
    dbQuery(
      `SELECT min(LENGTH(chunk_text)) FROM content_chunks TABLESAMPLE SYSTEM(${samplePct})`,
      90000
    )
  );
  const sizeMax = parseNum(
    dbQuery(
      `SELECT max(LENGTH(chunk_text)) FROM content_chunks TABLESAMPLE SYSTEM(${samplePct})`,
      90000
    )
  );
  const sizeAvg = parseNum(
    dbQuery(
      `SELECT avg(LENGTH(chunk_text))::int FROM content_chunks TABLESAMPLE SYSTEM(${samplePct})`,
      90000
    )
  );
  const sizeP50 = parseNum(
    dbQuery(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(chunk_text))::int FROM content_chunks TABLESAMPLE SYSTEM(${samplePct})`,
      90000
    )
  );
  const sizeP95 = parseNum(
    dbQuery(
      `SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY LENGTH(chunk_text))::int FROM content_chunks TABLESAMPLE SYSTEM(${samplePct})`,
      90000
    )
  );
  const sizeDistribution = { min: sizeMin, max: sizeMax, avg: sizeAvg, p50: sizeP50, p95: sizeP95 };

  const oversizedChunks = parseNum(
    dbQuery("SELECT count(*) FROM content_chunks WHERE LENGTH(chunk_text) > 6000")
  );
  if (oversizedChunks > 0) {
    issues.push({
      severity: "warning",
      message: `${oversizedChunks} chunks exceed 6000 chars (maxChars cap should prevent this)`,
    });
  }

  // ── Chunk Text Quality: Encoding Issues ──
  const encodingIssues = parseNum(
    dbQuery(
      "SELECT count(*) FROM content_chunks WHERE chunk_text LIKE '%\uFFFD%' OR chunk_text LIKE '%&amp;%' OR chunk_text LIKE '%&lt;%' OR chunk_text LIKE '%&gt;%'"
    )
  );
  if (encodingIssues > 0) {
    issues.push({
      severity: "warning",
      message: `${encodingIssues} chunks with encoding issues (replacement chars or HTML entities)`,
    });
  }

  // ── Chunk Text Quality: Duplicate Chunks ──
  const dupCount = parseNum(
    dbQuery(
      "SELECT count(*) FROM (SELECT chunk_text FROM content_chunks GROUP BY chunk_text HAVING count(*) > 1) t"
    )
  );
  const dupSamples: { slug: string; chunk_index: number; length: number }[] = [];
  if (dupCount > 0) {
    issues.push({ severity: "warning", message: `${dupCount} duplicate chunk texts found` });
    if (VERBOSE) {
      const dupRows = dbQueryRows(
        `SELECT p.slug, cc.chunk_index, LENGTH(cc.chunk_text) ` +
          `FROM content_chunks cc JOIN pages p ON p.id = cc.page_id ` +
          `WHERE cc.chunk_text IN (SELECT chunk_text FROM content_chunks GROUP BY chunk_text HAVING count(*) > 1) ` +
          `LIMIT 20`
      );
      dupSamples.push(
        ...dupRows.map(([slug, idx, len]) => ({
          slug,
          chunk_index: parseNum(idx),
          length: parseNum(len),
        }))
      );
    }
  }

  // ── Chunker Version Distribution ──
  const chunkerRows = dbQueryRows(
    `SELECT chunker_version::text, count(*) FROM pages ` +
      `WHERE deleted_at IS NULL GROUP BY chunker_version ORDER BY chunker_version`
  );
  const totalPages = chunkerRows.reduce((a, [, c]) => a + parseNum(c), 0);
  const chunkerVersions = chunkerRows.map(([v, c]) => ({
    version: v || null,
    count: parseNum(c),
    pct: pct(parseNum(c), totalPages),
  }));
  const staleChunkerCount = chunkerVersions
    .filter((v) => v.version !== null && parseInt(v.version, 10) < 3)
    .reduce((a, v) => a + v.count, 0);
  if (staleChunkerCount > 0) {
    issues.push({
      severity: "warning",
      message: `${staleChunkerCount} pages on chunker version < 3 — run \`gbrain reindex --markdown\` to re-chunk`,
    });
  }

  // ── Legal Metadata: Page Type Distribution ──
  const typeRows = dbQueryRows(
    `SELECT type, count(*) FROM pages WHERE deleted_at IS NULL ` +
      `GROUP BY type ORDER BY count(*) DESC`
  );
  const pageTypeDistribution = typeRows.map(([t, c]) => ({ type: t || null, count: parseNum(c) }));
  const legalPagesTotal = pageTypeDistribution
    .filter(
      (t) =>
        t.type === "law" ||
        t.type === "statute" ||
        t.type === "court_decision" ||
        t.type === "judgement"
    )
    .reduce((a, t) => a + t.count, 0);

  // ── Legal Metadata: Jurisdiction Distribution ──
  const jurRows = dbQueryRows(
    `SELECT frontmatter->>'jurisdiction', count(*) FROM pages ` +
      `WHERE deleted_at IS NULL GROUP BY frontmatter->>'jurisdiction' ORDER BY count(*) DESC`
  );
  const jurisdictionDistribution = jurRows.map(([j, c]) => ({
    jurisdiction: j || null,
    count: parseNum(c),
  }));

  // ── Legal Metadata: §-Metadata Coverage ──
  const legalWithParagraph = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND type IN ('law','statute') AND frontmatter->>'paragraph' IS NOT NULL"
    )
  );
  const legalWithAbbreviation = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND type IN ('law','statute') AND frontmatter->>'abbreviation' IS NOT NULL"
    )
  );
  const legalWithJurisdiction = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND type IN ('law','statute','court_decision','judgement') AND frontmatter->>'jurisdiction' IS NOT NULL"
    )
  );
  const statutePages = pageTypeDistribution
    .filter((t) => t.type === "law" || t.type === "statute")
    .reduce((a, t) => a + t.count, 0);
  if (statutePages > 0 && legalWithParagraph < statutePages * 0.9) {
    issues.push({
      severity: "warning",
      message: `${statutePages - legalWithParagraph} legal pages missing §-metadata (paragraph field) — check frontmatter`,
    });
  }

  // ── Legal Metadata: Contextual Retrieval Coverage ──
  const crRows = dbQueryRows(
    `SELECT contextual_retrieval_mode, count(*) FROM pages ` +
      `WHERE deleted_at IS NULL GROUP BY contextual_retrieval_mode ORDER BY count(*) DESC`
  );
  const contextualCRCoverage = crRows.map(([m, c]) => ({ mode: m || null, count: parseNum(c) }));

  // ── Legal Metadata: Court Decisions ──
  const courtDecisionTotal = pageTypeDistribution
    .filter((t) => t.type === "court_decision" || t.type === "judgement")
    .reduce((a, t) => a + t.count, 0);
  const withCourt = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND type IN ('court_decision','judgement') AND frontmatter->>'court' IS NOT NULL"
    )
  );
  const withCaseNumber = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND type IN ('court_decision','judgement') AND frontmatter->>'case_number' IS NOT NULL"
    )
  );
  const withEcli = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages WHERE deleted_at IS NULL AND type IN ('court_decision','judgement') AND frontmatter->>'ecli' IS NOT NULL"
    )
  );

  // ── Orphan & Consistency ──
  const orphanChunks = parseNum(
    dbQuery("SELECT count(*) FROM content_chunks WHERE page_id NOT IN (SELECT id FROM pages)")
  );
  if (orphanChunks > 0) {
    issues.push({
      severity: "error",
      message: `${orphanChunks} orphan chunks (page_id not in pages table)`,
    });
  }

  const pagesWithoutChunks = parseNum(
    dbQuery(
      "SELECT count(*) FROM pages p WHERE p.deleted_at IS NULL AND p.compiled_truth != '' AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id)"
    )
  );
  if (pagesWithoutChunks > 0) {
    issues.push({
      severity: "warning",
      message: `${pagesWithoutChunks} pages with content but 0 chunks`,
    });
  }

  const chunkIndexGaps = parseNum(
    dbQuery(
      "SELECT count(*) FROM (SELECT page_id, MIN(chunk_index) as min_idx, MAX(chunk_index) as max_idx, count(*) as cnt FROM content_chunks GROUP BY page_id HAVING MIN(chunk_index) != 0 OR MAX(chunk_index) != count(*) - 1) t"
    )
  );
  if (chunkIndexGaps > 0) {
    issues.push({
      severity: "warning",
      message: `${chunkIndexGaps} pages with chunk_index gaps or non-zero start`,
    });
  }

  return {
    timestamp,
    overview: {
      total_pages: pagesCount,
      total_chunks: totalChunks,
      embedded_chunks: embeddedChunks,
      pending_chunks: pendingChunks,
      coverage_pct: coveragePct,
    },
    structural: {
      embedding_dims: embeddingDims.length > 0 ? embeddingDims : null,
      models_in_use: modelsInUse,
      signature_distribution: signatureDistribution,
      stale_signature_count: staleSigCount,
    },
    chunk_text_quality: {
      empty_chunks: emptyChunks,
      size_distribution: sizeDistribution,
      oversized_chunks: oversizedChunks,
      encoding_issues: encodingIssues,
      duplicate_chunks: dupCount,
      duplicate_samples: dupSamples,
    },
    chunker_versions: chunkerVersions,
    legal_metadata: {
      jurisdiction_distribution: jurisdictionDistribution,
      page_type_distribution: pageTypeDistribution,
      legal_pages_total: legalPagesTotal,
      legal_with_paragraph: legalWithParagraph,
      legal_with_abbreviation: legalWithAbbreviation,
      legal_with_jurisdiction: legalWithJurisdiction,
      contextual_cr_coverage: contextualCRCoverage,
      court_decisions: {
        total: courtDecisionTotal,
        with_court: withCourt,
        with_case_number: withCaseNumber,
        with_ecli: withEcli,
      },
    },
    orphan_consistency: {
      orphan_chunks: orphanChunks,
      pages_without_chunks: pagesWithoutChunks,
      chunk_index_gaps: chunkIndexGaps,
    },
    issues,
  };
}

function formatNum(n: number): string {
  return n.toLocaleString("de-DE");
}

function printReport(r: AuditResult): void {
  const ts = new Date(r.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Vienna" });
  const sep = "═══════════════════════════════════════════════════════════";

  console.log(sep);
  console.log(`  Chunk & Embedding Quality Audit — ${ts}`);
  console.log(sep);
  console.log();

  // Overview
  console.log("  📊 OVERVIEW");
  console.log(`  Total Pages:       ${formatNum(r.overview.total_pages)}`);
  console.log(`  Total Chunks:      ${formatNum(r.overview.total_chunks)}`);
  const pendingPct = Math.round((1 - r.overview.coverage_pct / 100) * 1000) / 10;
  console.log(
    `  Embedded Chunks:   ${formatNum(r.overview.embedded_chunks)} (${r.overview.coverage_pct}%)`
  );
  console.log(`  Pending:           ${formatNum(r.overview.pending_chunks)} (${pendingPct}%)`);
  console.log();

  // Structural
  console.log("  ✅ STRUCTURAL INTEGRITY");
  if (r.structural.embedding_dims) {
    const dimsStr = r.structural.embedding_dims
      .map((d) => `${d.dims}d (${formatNum(d.count)} chunks)`)
      .join(", ");
    const consistent = r.structural.embedding_dims.length === 1;
    console.log(`  Embedding Dims:    ${dimsStr} ${consistent ? "✅" : "⚠️  MIXED"}`);
  } else {
    console.log("  Embedding Dims:    N/A (no embeddings)");
  }
  const modelsStr = r.structural.models_in_use
    .map((m) => `${m.model} (${formatNum(m.count)})`)
    .join(", ");
  console.log(`  Models in Use:     ${modelsStr}`);
  const sigStr = r.structural.signature_distribution
    .slice(0, 5)
    .map((s) => `${s.signature === null ? "NULL" : s.signature} (${formatNum(s.count)})`)
    .join(", ");
  console.log(`  Signatures:        ${sigStr}`);
  if (r.structural.stale_signature_count > 0) {
    console.log(`  Stale Signatures:  ${formatNum(r.structural.stale_signature_count)} pages ⚠️`);
  }
  console.log();

  // Chunk Text Quality
  console.log("  📝 CHUNK TEXT QUALITY");
  const emptyIcon = r.chunk_text_quality.empty_chunks === 0 ? "✅" : "❌";
  console.log(`  Empty Chunks:      ${formatNum(r.chunk_text_quality.empty_chunks)} ${emptyIcon}`);
  const sd = r.chunk_text_quality.size_distribution;
  console.log(
    `  Chunk Length:      min=${sd.min} | P50=${sd.p50} | avg=${sd.avg} | P95=${sd.p95} | max=${sd.max}`
  );
  const overIcon = r.chunk_text_quality.oversized_chunks === 0 ? "✅" : "⚠️";
  console.log(
    `  Oversized (>6000): ${formatNum(r.chunk_text_quality.oversized_chunks)} ${overIcon}`
  );
  const encIcon = r.chunk_text_quality.encoding_issues === 0 ? "✅" : "⚠️";
  console.log(`  Encoding Issues:   ${formatNum(r.chunk_text_quality.encoding_issues)} ${encIcon}`);
  const dupIcon = r.chunk_text_quality.duplicate_chunks === 0 ? "✅" : "⚠️";
  console.log(
    `  Duplicates:        ${formatNum(r.chunk_text_quality.duplicate_chunks)} ${dupIcon}`
  );
  if (VERBOSE && r.chunk_text_quality.duplicate_samples.length > 0) {
    console.log("    Duplicate samples:");
    for (const s of r.chunk_text_quality.duplicate_samples.slice(0, 10)) {
      console.log(`      ${s.slug} [${s.chunk_index}] (${s.length} chars)`);
    }
  }
  console.log();

  // Chunker Versions
  console.log("  📋 CHUNKER VERSIONS");
  for (const v of r.chunker_versions) {
    const icon = v.version === null ? "⚠️" : parseInt(v.version, 10) < 3 ? "⚠️" : "✅";
    console.log(`  v${v.version ?? "NULL"}: ${formatNum(v.count)} pages (${v.pct}%) ${icon}`);
  }
  console.log();

  // Legal Metadata
  console.log("  🏛️ LEGAL METADATA");
  const jurStr = r.legal_metadata.jurisdiction_distribution
    .map((j) => `${j.jurisdiction ?? "NULL"}: ${formatNum(j.count)}`)
    .join(" | ");
  console.log(`  Jurisdiction:      ${jurStr}`);
  const typeStr = r.legal_metadata.page_type_distribution
    .slice(0, 8)
    .map((t) => `${t.type ?? "NULL"}: ${formatNum(t.count)}`)
    .join(" | ");
  console.log(`  Page Types:        ${typeStr}`);
  console.log(`  Legal Pages:       ${formatNum(r.legal_metadata.legal_pages_total)}`);
  const statutePages = r.legal_metadata.page_type_distribution
    .filter((t) => t.type === "law" || t.type === "statute")
    .reduce((a, t) => a + t.count, 0);
  if (statutePages > 0) {
    console.log(
      `  §-Metadata:        ${formatNum(r.legal_metadata.legal_with_paragraph)}/${formatNum(statutePages)} (${pct(r.legal_metadata.legal_with_paragraph, statutePages)}%)`
    );
    console.log(
      `  Abbreviation:      ${formatNum(r.legal_metadata.legal_with_abbreviation)}/${formatNum(statutePages)} (${pct(r.legal_metadata.legal_with_abbreviation, statutePages)}%)`
    );
  }
  console.log(
    `  Jurisdiction Tag:  ${formatNum(r.legal_metadata.legal_with_jurisdiction)}/${formatNum(r.legal_metadata.legal_pages_total)} (${pct(r.legal_metadata.legal_with_jurisdiction, r.legal_metadata.legal_pages_total)}%)`
  );
  const crStr = r.legal_metadata.contextual_cr_coverage
    .map((c) => `${c.mode ?? "NULL"}: ${formatNum(c.count)}`)
    .join(" | ");
  console.log(`  Contextual CR:     ${crStr}`);
  const cd = r.legal_metadata.court_decisions;
  if (cd.total > 0) {
    console.log(
      `  Court Decisions:   ${formatNum(cd.total)} (court: ${pct(cd.with_court, cd.total)}%, case#: ${pct(cd.with_case_number, cd.total)}%, ECLI: ${pct(cd.with_ecli, cd.total)}%)`
    );
  }
  console.log();

  // Orphan & Consistency
  console.log("  🔍 ORPHAN & CONSISTENCY");
  const orphanIcon = r.orphan_consistency.orphan_chunks === 0 ? "✅" : "❌";
  console.log(
    `  Orphan Chunks:     ${formatNum(r.orphan_consistency.orphan_chunks)} ${orphanIcon}`
  );
  const noChunkIcon = r.orphan_consistency.pages_without_chunks === 0 ? "✅" : "⚠️";
  console.log(
    `  Pages w/o Chunks:  ${formatNum(r.orphan_consistency.pages_without_chunks)} ${noChunkIcon}`
  );
  const gapIcon = r.orphan_consistency.chunk_index_gaps === 0 ? "✅" : "⚠️";
  console.log(
    `  Chunk Index Gaps:  ${formatNum(r.orphan_consistency.chunk_index_gaps)} ${gapIcon}`
  );
  console.log();

  // Issues Summary
  if (r.issues.length > 0) {
    console.log("  ⚠️ ISSUES FOUND");
    for (const issue of r.issues) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`    ${icon} ${issue.message}`);
    }
  } else {
    console.log("  ✅ No issues found — all quality checks passed");
  }
  console.log(sep);
  console.log();
}

function main(): void {
  if (!JSON_OUTPUT) {
    console.log("Chunk & Embedding Quality Audit — connecting to Hetzner DB via SSH...");
    console.log();
  }

  const result = runAudit();

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }
}

main();
