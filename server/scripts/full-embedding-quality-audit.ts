#!/usr/bin/env bun
/**
 * Full Embedding & Corpus Quality Audit — Hetzner Postgres via local tunnel.
 * Fast, focused report for cleaning up embeddings and corpus completeness.
 *
 * Usage:
 *   bun run scripts/full-embedding-quality-audit.ts [--output /tmp/audit.json]
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import { readdirSync, existsSync, Dirent } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = join(_scriptDir, "..", "..", "law-corpus");

interface SourceReport {
  source_id: string;
  jurisdiction: string | null;
  pages: number;
  chunks: number;
  embedded: number;
  pending: number;
  coverage_pct: number;
  pages_without_chunks: number;
  empty_chunk_texts: number;
  oversized_chunks: number;
  encoding_issues: number;
}

interface CompletenessReport {
  jurisdiction: string;
  source: string;
  local_files: number;
  db_pages: number;
  db_chunks: number;
  db_coverage_pct: number;
  note: string;
}

interface AuditReport {
  timestamp: string;
  summary: {
    total_pages: number;
    total_chunks: number;
    total_embedded: number;
    total_pending: number;
    overall_coverage_pct: number;
    pages_without_chunks: number;
    sources_with_issues: string[];
  };
  sources: SourceReport[];
  signatures: {
    current: string;
    distinct: { signature: string | null; count: number }[];
    consistent: boolean;
  };
  chunk_quality: {
    total_empty: number;
    total_oversized: number;
    total_encoding_issues: number;
    oversized_samples: { source_id: string; slug: string; chunk_index: number; length: number }[];
  };
  pages_without_chunks_samples: {
    source_id: string;
    slug: string;
    compiled_truth_length: number;
  }[];
  completeness: CompletenessReport[];
  issues: { severity: "error" | "warning" | "info"; message: string }[];
}

function countMdFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countMdFiles(join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count++;
    }
  }
  return count;
}

async function main() {
  const outputIdx = process.argv.indexOf("--output");
  const outputPath =
    outputIdx !== -1 ? process.argv[outputIdx + 1] : "/tmp/full-embedding-quality-audit.json";

  console.log("Connecting to brain...");
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // non-fatal
  }

  console.log("Auditing...");

  // ── 1. Source overview ──
  const sourceRows = (await engine.executeRaw(`
    SELECT p.source_id,
           count(DISTINCT p.id) as pages,
           count(c.id) as chunks,
           count(c.embedding) as embedded,
           count(c.id) FILTER (WHERE c.embedding IS NULL) as pending
    FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.source_id
    ORDER BY p.source_id
  `)) as any[];

  const sources: SourceReport[] = sourceRows.map((r) => ({
    source_id: r.source_id,
    jurisdiction: null,
    pages: Number(r.pages || 0),
    chunks: Number(r.chunks || 0),
    embedded: Number(r.embedded || 0),
    pending: Number(r.pending || 0),
    coverage_pct:
      r.chunks > 0 ? Math.round((Number(r.embedded) / Number(r.chunks)) * 1000) / 10 : 0,
    pages_without_chunks: 0,
    empty_chunk_texts: 0,
    oversized_chunks: 0,
    encoding_issues: 0,
  }));
  const sourceMap = new Map(sources.map((s) => [s.source_id, s]));

  const jurRows = (await engine.executeRaw(`SELECT id, jurisdiction FROM sources`)) as any[];
  const sourceJurisdiction = new Map(jurRows.map((r) => [r.id, r.jurisdiction as string | null]));
  for (const s of sources) s.jurisdiction = sourceJurisdiction.get(s.source_id) ?? null;

  // ── 2. Pages without chunks ──
  const noChunkRows = (await engine.executeRaw(`
    SELECT p.source_id, count(*) as cnt
    FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.deleted_at IS NULL AND c.id IS NULL
    GROUP BY p.source_id
    ORDER BY p.source_id
  `)) as any[];
  for (const r of noChunkRows) {
    const s = sourceMap.get(r.source_id);
    if (s) s.pages_without_chunks = Number(r.cnt);
  }

  const noChunkSamples = (await engine.executeRaw(`
    SELECT p.source_id, p.slug, LENGTH(p.compiled_truth) as len
    FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.deleted_at IS NULL AND p.compiled_truth != '' AND c.id IS NULL
    ORDER BY p.source_id, p.slug
    LIMIT 50
  `)) as any[];

  // ── 3. Chunk quality (per-source counts; avoid global scans) ──
  for (const s of sources) {
    const [empty] = (await engine.executeRaw(
      `SELECT count(*) as cnt FROM content_chunks cc JOIN pages p ON p.id=cc.page_id WHERE p.source_id=$1 AND LENGTH(TRIM(cc.chunk_text))=0`,
      [s.source_id]
    )) as any[];
    s.empty_chunk_texts = Number(empty?.cnt || 0);

    const [over] = (await engine.executeRaw(
      `SELECT count(*) as cnt FROM content_chunks cc JOIN pages p ON p.id=cc.page_id WHERE p.source_id=$1 AND LENGTH(cc.chunk_text) > 6000`,
      [s.source_id]
    )) as any[];
    s.oversized_chunks = Number(over?.cnt || 0);

    const [enc] = (await engine.executeRaw(
      `SELECT count(*) as cnt FROM content_chunks cc JOIN pages p ON p.id=cc.page_id WHERE p.source_id=$1 AND (cc.chunk_text LIKE '%\uFFFD%' OR cc.chunk_text LIKE '%&amp;%' OR cc.chunk_text LIKE '%&lt;%' OR cc.chunk_text LIKE '%&gt;%')`,
      [s.source_id]
    )) as any[];
    s.encoding_issues = Number(enc?.cnt || 0);
  }

  // ── 4. Embedding signatures ──
  const sigRows = (await engine.executeRaw(`
    SELECT embedding_signature, count(*) as cnt
    FROM pages WHERE deleted_at IS NULL
    GROUP BY embedding_signature
    ORDER BY count(*) DESC
  `)) as any[];

  let signatureAudit: { currentSignature: string; isConsistent: boolean } | null = null;
  try {
    const mod = await import("../src/core/embedding-consistency-guard.ts");
    const a = await mod.auditEmbeddingSignatures(engine);
    signatureAudit = { currentSignature: a.currentSignature, isConsistent: a.isConsistent };
  } catch (e) {
    console.warn("Could not run signature audit:", e);
  }

  // ── 5. Oversized samples (limit 10) ──
  const oversizedSamples = (await engine.executeRaw(`
    SELECT p.source_id, p.slug, cc.chunk_index, LENGTH(cc.chunk_text) as len
    FROM content_chunks cc JOIN pages p ON p.id = cc.page_id
    WHERE LENGTH(cc.chunk_text) > 6000
    ORDER BY LENGTH(cc.chunk_text) DESC
    LIMIT 10
  `)) as any[];

  // ── 6. Corpus completeness ──
  const corpusDirs: { dir: string; source: string; jurisdiction: string; note: string }[] = [
    { dir: "at", source: "law-at", jurisdiction: "at", note: "AT core statutes (per-§ split)" },
    { dir: "de", source: "law-de", jurisdiction: "de", note: "DE core statutes (per-§ split)" },
    { dir: "ch", source: "law-ch", jurisdiction: "ch", note: "CH core statutes (per-§ split)" },
    {
      dir: "at-staatsvertraege",
      source: "law-at-staatsvertraege",
      jurisdiction: "at",
      note: "AT Staatsverträge",
    },
    {
      dir: "at-landesrecht",
      source: "law-at-landesrecht",
      jurisdiction: "at",
      note: "AT Landesrecht",
    },
    {
      dir: "eu/regulations",
      source: "law-eu-regulations",
      jurisdiction: "eu",
      note: "EU regulations",
    },
    {
      dir: "eu/directives",
      source: "law-eu-directives",
      jurisdiction: "eu",
      note: "EU directives",
    },
    { dir: "eu/decisions", source: "law-eu-decisions", jurisdiction: "eu", note: "EU decisions" },
    { dir: "eu/caselaw", source: "law-eu-caselaw", jurisdiction: "eu", note: "EuGH caselaw" },
    {
      dir: "at-judikatur",
      source: "law-at-judikatur",
      jurisdiction: "at",
      note: "AT OGH judikatur",
    },
    {
      dir: "at-judikatur-asylgh",
      source: "law-at-judikatur-asylgh",
      jurisdiction: "at",
      note: "AT AsylGH judikatur",
    },
    {
      dir: "at-judikatur-bvwg",
      source: "law-at-judikatur-bvwg",
      jurisdiction: "at",
      note: "AT BVwG judikatur",
    },
    {
      dir: "at-judikatur-lvwg",
      source: "law-at-judikatur-lvwg",
      jurisdiction: "at",
      note: "AT LVwG judikatur",
    },
    {
      dir: "at-judikatur-uvs",
      source: "law-at-judikatur-uvs",
      jurisdiction: "at",
      note: "AT UVS judikatur",
    },
    {
      dir: "at-judikatur-vfgh",
      source: "law-at-judikatur-vfgh",
      jurisdiction: "at",
      note: "AT VfGH judikatur",
    },
    {
      dir: "at-judikatur-vwgh",
      source: "law-at-judikatur-vwgh",
      jurisdiction: "at",
      note: "AT VwGH judikatur",
    },
    { dir: "de-judikatur", source: "law-de-judikatur", jurisdiction: "de", note: "DE judikatur" },
    {
      dir: "ch-judikatur",
      source: "law-ch-judikatur",
      jurisdiction: "ch",
      note: "CH BGE judikatur",
    },
  ];

  const completeness: CompletenessReport[] = [];
  for (const { dir, source, jurisdiction, note } of corpusDirs) {
    const localPath = join(CORPUS_ROOT, dir);
    const localFiles = existsSync(localPath) ? countMdFiles(localPath) : 0;
    const db = sourceMap.get(source);
    completeness.push({
      jurisdiction,
      source,
      local_files: localFiles,
      db_pages: db?.pages ?? 0,
      db_chunks: db?.chunks ?? 0,
      db_coverage_pct: db?.coverage_pct ?? 0,
      note,
    });
  }

  // ── 7. Build issues & report ──
  const totalPages = sources.reduce((a, s) => a + s.pages, 0);
  const totalChunks = sources.reduce((a, s) => a + s.chunks, 0);
  const totalEmbedded = sources.reduce((a, s) => a + s.embedded, 0);
  const totalPending = sources.reduce((a, s) => a + s.pending, 0);
  const totalWithoutChunks = sources.reduce((a, s) => a + s.pages_without_chunks, 0);

  const issues: AuditReport["issues"] = [];
  const sourcesWithIssues: string[] = [];

  for (const s of sources) {
    if (s.pending > 0) {
      issues.push({
        severity: "warning",
        message: `${s.source_id}: ${s.pending.toLocaleString("de-DE")} pending embeddings (${s.coverage_pct}%)`,
      });
      sourcesWithIssues.push(s.source_id);
    }
    if (s.pages_without_chunks > 0) {
      issues.push({
        severity: "error",
        message: `${s.source_id}: ${s.pages_without_chunks.toLocaleString("de-DE")} pages without chunks`,
      });
      sourcesWithIssues.push(s.source_id);
    }
    if (s.empty_chunk_texts > 0) {
      issues.push({
        severity: "error",
        message: `${s.source_id}: ${s.empty_chunk_texts} empty chunks`,
      });
      sourcesWithIssues.push(s.source_id);
    }
    if (s.oversized_chunks > 0) {
      issues.push({
        severity: "warning",
        message: `${s.source_id}: ${s.oversized_chunks} chunks > 6000 chars`,
      });
      sourcesWithIssues.push(s.source_id);
    }
    if (s.encoding_issues > 0) {
      issues.push({
        severity: "warning",
        message: `${s.source_id}: ${s.encoding_issues} chunks with encoding issues`,
      });
      sourcesWithIssues.push(s.source_id);
    }
  }

  if (signatureAudit && !signatureAudit.isConsistent) {
    issues.push({
      severity: "error",
      message: `Embedding signatures inconsistent. Run gbrain embed --stale. Current: ${signatureAudit.currentSignature}`,
    });
  }

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total_pages: totalPages,
      total_chunks: totalChunks,
      total_embedded: totalEmbedded,
      total_pending: totalPending,
      overall_coverage_pct:
        totalChunks > 0 ? Math.round((totalEmbedded / totalChunks) * 1000) / 10 : 0,
      pages_without_chunks: totalWithoutChunks,
      sources_with_issues: [...new Set(sourcesWithIssues)],
    },
    sources,
    signatures: {
      current: signatureAudit?.currentSignature ?? "unknown",
      distinct: sigRows.map((r) => ({
        signature: r.embedding_signature ?? null,
        count: Number(r.cnt),
      })),
      consistent: signatureAudit?.isConsistent ?? true,
    },
    chunk_quality: {
      total_empty: sources.reduce((a, s) => a + s.empty_chunk_texts, 0),
      total_oversized: sources.reduce((a, s) => a + s.oversized_chunks, 0),
      total_encoding_issues: sources.reduce((a, s) => a + s.encoding_issues, 0),
      oversized_samples: oversizedSamples.map((r) => ({
        source_id: r.source_id,
        slug: r.slug,
        chunk_index: Number(r.chunk_index),
        length: Number(r.len),
      })),
    },
    pages_without_chunks_samples: noChunkSamples.map((r) => ({
      source_id: r.source_id,
      slug: r.slug,
      compiled_truth_length: Number(r.len),
    })),
    completeness,
    issues,
  };

  await Bun.write(outputPath, JSON.stringify(report, null, 2));

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Full Embedding & Corpus Quality Audit");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Timestamp: ${report.timestamp}`);
  console.log(`  Report: ${outputPath}`);
  console.log("");
  console.log("  SUMMARY");
  console.log(`    Total Pages:        ${totalPages.toLocaleString("de-DE")}`);
  console.log(`    Total Chunks:       ${totalChunks.toLocaleString("de-DE")}`);
  console.log(
    `    Embedded:           ${totalEmbedded.toLocaleString("de-DE")} (${report.summary.overall_coverage_pct}%)`
  );
  console.log(`    Pending:            ${totalPending.toLocaleString("de-DE")}`);
  console.log(`    Pages w/o Chunks:   ${totalWithoutChunks.toLocaleString("de-DE")}`);
  console.log(
    `    Signatures:         ${report.signatures.consistent ? "✅ consistent" : "❌ MISMATCH"}`
  );
  console.log("");
  console.log(
    `    ${"Source".padEnd(28)} ${"Pages".padStart(8)} ${"Chunks".padStart(10)} ${"Emb".padStart(10)} ${"Pend".padStart(10)} ${"Cov%".padStart(6)} ${"NoChunk".padStart(8)}`
  );
  for (const s of sources) {
    console.log(
      `    ${s.source_id.padEnd(28)} ${String(s.pages).padStart(8)} ${String(s.chunks).padStart(10)} ${String(s.embedded).padStart(10)} ${String(s.pending).padStart(10)} ${s.coverage_pct.toFixed(1).padStart(5)}% ${String(s.pages_without_chunks).padStart(7)}`
    );
  }
  console.log("");
  console.log("  CHUNK QUALITY");
  console.log(`    Empty:        ${report.chunk_quality.total_empty}`);
  console.log(`    Oversized:    ${report.chunk_quality.total_oversized}`);
  console.log(`    Encoding:     ${report.chunk_quality.total_encoding_issues}`);
  console.log("");
  console.log("  CORPUS COMPLETENESS (local files vs DB pages)");
  console.log(
    `    ${"Jur".padEnd(3)} ${"Source".padEnd(28)} ${"Files".padStart(8)} ${"DB Pages".padStart(10)} ${"DB Chunks".padStart(12)} ${"Cov%".padStart(6)}  Note`
  );
  for (const c of completeness) {
    console.log(
      `    ${c.jurisdiction.padEnd(3)} ${c.source.padEnd(28)} ${String(c.local_files).padStart(8)} ${String(c.db_pages).padStart(10)} ${String(c.db_chunks).padStart(12)} ${c.db_coverage_pct.toFixed(1).padStart(5)}%  ${c.note}`
    );
  }
  console.log("");
  if (issues.length > 0) {
    console.log("  ISSUES");
    for (const issue of issues) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`    ${icon} ${issue.message}`);
    }
  } else {
    console.log("  ✅ No issues found");
  }
  console.log("═══════════════════════════════════════════════════════════");

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
