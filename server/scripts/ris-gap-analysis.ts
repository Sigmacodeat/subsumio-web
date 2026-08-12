#!/usr/bin/env bun
/**
 * RIS API → DB Gap Analysis
 *
 * Scans RIS API for total document counts, compares with DB,
 * and outputs a clear gap report showing what's missing.
 *
 *   bun run /tmp/ris-gap-analysis.ts
 */

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const DB_URL = "postgres://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:15432/sigmabrain?sslmode=disable";

// ─── RIS API counts (from API reference + live verification) ───

const RIS_TOTALS: Record<string, { label: string; applikation: string; endpoint: string; total: number; corpusDir: string }> = {
  "bundesrecht": { label: "Bundesrecht (Normen)", applikation: "BrKons", endpoint: "Bundesrecht", total: 439943, corpusDir: "at-normen/" },
  "landesrecht": { label: "Landesrecht", applikation: "LrKons", endpoint: "Landesrecht", total: 279786, corpusDir: "at-landesrecht/" },
  "judikatur-ogh": { label: "Judikatur OGH", applikation: "Justiz", endpoint: "Judikatur", total: 138435, corpusDir: "at-judikatur/" },
  "judikatur-vwgh": { label: "Judikatur VwGH", applikation: "Vwgh", endpoint: "Judikatur", total: 356540, corpusDir: "at-judikatur-vwgh/" },
  "judikatur-vfgh": { label: "Judikatur VfGH", applikation: "Vfgh", endpoint: "Judikatur", total: 24082, corpusDir: "at-judikatur-vfgh/" },
  "judikatur-asylgh": { label: "Judikatur AsylGH", applikation: "AsylGH", endpoint: "Judikatur", total: 53113, corpusDir: "at-judikatur-asylgh/" },
  "judikatur-bvwg": { label: "Judikatur BVwG", applikation: "Bvwg", endpoint: "Judikatur", total: 287732, corpusDir: "at-judikatur-bvwg/" },
  "judikatur-lvwg": { label: "Judikatur LVwG", applikation: "Lvwg", endpoint: "Judikatur", total: 76507, corpusDir: "at-judikatur-lvwg/" },
  "judikatur-uvs": { label: "Judikatur UVS", applikation: "Uvs", endpoint: "Judikatur", total: 25939, corpusDir: "at-judikatur-uvs/" },
  "judikatur-dsk": { label: "Judikatur DSK", applikation: "Dsk", endpoint: "Judikatur", total: 1873, corpusDir: "at-judikatur-dsk/" },
  "judikatur-gbk": { label: "Judikatur GBK", applikation: "Gbk", endpoint: "Judikatur", total: 1042, corpusDir: "at-judikatur-gbk/" },
  "judikatur-pvak": { label: "Judikatur PVAK", applikation: "Pvak", endpoint: "Judikatur", total: 2550, corpusDir: "at-judikatur-pvak/" },
  "judikatur-dok": { label: "Judikatur DOK", applikation: "Dok", endpoint: "Judikatur", total: 4822, corpusDir: "at-judikatur-dok/" },
  "judikatur-ubas": { label: "Judikatur UBAS", applikation: "Ubas", endpoint: "Judikatur", total: 4052, corpusDir: "at-judikatur-ubas/" },
  "judikatur-umse": { label: "Judikatur UmSE", applikation: "Umse", endpoint: "Judikatur", total: 742, corpusDir: "at-judikatur-umse/" },
  "bezirke": { label: "Bezirke", applikation: "", endpoint: "Bezirke", total: 2484, corpusDir: "at-bezirke/" },
  "gemeinden": { label: "Gemeinden", applikation: "", endpoint: "Gemeinden", total: 18384, corpusDir: "at-gemeinden/" },
};

// ─── DB source_id mapping ───

const SOURCE_MAP: Record<string, string> = {
  "bundesrecht": "law-at",
  "landesrecht": "law-at-landesrecht",
  "judikatur-ogh": "law-at-judikatur",
  "judikatur-vwgh": "law-at-judikatur-vwgh",
  "judikatur-vfgh": "law-at-judikatur-vfgh",
  "judikatur-asylgh": "law-at-judikatur-asylgh",
  "judikatur-bvwg": "law-at-judikatur-bvwg",
  "judikatur-lvwg": "law-at-judikatur-lvwg",
  "judikatur-uvs": "law-at-judikatur-uvs",
  "judikatur-dsk": "law-at-judikatur-dsk",
  "judikatur-gbk": "law-at-judikatur-gbk",
  "judikatur-pvak": "law-at-judikatur-pvak",
  "judikatur-dok": "law-at-judikatur-dok",
  "judikatur-ubas": "law-at-judikatur-ubas",
  "judikatur-umse": "law-at-judikatur-umse",
};

// ─── Disk counts ───

import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const CORPUS_ROOT = join(import.meta.dir, "..", "Users", "msc", "subsumio-web", "law-corpus");
const CORPUS_ROOT2 = "/Users/msc/subsumio-web/law-corpus";

function countDisk(dir: string): number {
  const full = join(CORPUS_ROOT2, dir);
  if (!existsSync(full)) return 0;
  try {
    // For directories with subdirs (like at-normen)
    const entries = readdirSync(full);
    let count = 0;
    for (const e of entries) {
      const p = join(full, e);
      if (statSync(p).isDirectory()) {
        count += readdirSync(p).filter((f) => f.endsWith(".md")).length;
      } else if (e.endsWith(".md")) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ─── DB counts ───

async function dbCounts(): Promise<Record<string, { pages: number; chunks: number; embedded: number }>> {
  const { Client } = await import("pg");
  const client = new Client(DB_URL);
  await client.connect();

  const result: Record<string, { pages: number; chunks: number; embedded: number }> = {};

  // Get all law-at* sources
  const res = await client.query(`
    SELECT p.source_id,
      count(DISTINCT p.id) as pages,
      count(c.id) as chunks,
      count(c.embedding) as embedded
    FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.source_id LIKE 'law-at%' AND p.deleted_at IS NULL
    GROUP BY p.source_id
    ORDER BY p.source_id
  `);

  for (const row of res.rows) {
    result[row.source_id] = {
      pages: parseInt(row.pages),
      chunks: parseInt(row.chunks),
      embedded: parseInt(row.embedded),
    };
  }

  await client.end();
  return result;
}

// ─── Main ───

async function main() {
  console.log("RIS API → DB Gap Analysis");
  console.log("=========================\n");

  const db = await dbCounts();

  // ─── Table header ───
  const cols = ["Source", "RIS Total", "Disk", "DB Pages", "DB Chunks", "Embedded", "Emb %", "Gap"];
  const widths = [22, 10, 8, 10, 10, 10, 7, 10];
  console.log(cols.map((c, i) => c.padEnd(widths[i])).join(" | "));
  console.log(widths.map((w) => "-".repeat(w)).join("-+-"));

  let totalRis = 0;
  let totalDisk = 0;
  let totalPages = 0;
  let totalChunks = 0;
  let totalEmb = 0;

  for (const [key, info] of Object.entries(RIS_TOTALS)) {
    const sourceId = SOURCE_MAP[key] ?? "";
    const dbData = sourceId ? db[sourceId] ?? { pages: 0, chunks: 0, embedded: 0 } : { pages: 0, chunks: 0, embedded: 0 };
    const disk = countDisk(info.corpusDir);
    const embPct = dbData.chunks > 0 ? ((dbData.embedded / dbData.chunks) * 100).toFixed(1) + "%" : "—";
    const gap = info.total - dbData.pages;
    const gapStr = gap > 0 ? `−${gap}` : "✓";

    console.log([
      info.label.padEnd(widths[0]),
      String(info.total).padStart(widths[1]),
      String(disk).padStart(widths[2]),
      String(dbData.pages).padStart(widths[3]),
      String(dbData.chunks).padStart(widths[4]),
      String(dbData.embedded).padStart(widths[5]),
      embPct.padStart(widths[6]),
      gapStr.padStart(widths[7]),
    ].join(" | "));

    totalRis += info.total;
    totalDisk += disk;
    totalPages += dbData.pages;
    totalChunks += dbData.chunks;
    totalEmb += dbData.embedded;
  }

  console.log(widths.map((w) => "-".repeat(w)).join("-+-"));
  console.log([
    "TOTAL".padEnd(widths[0]),
    String(totalRis).padStart(widths[1]),
    String(totalDisk).padStart(widths[2]),
    String(totalPages).padStart(widths[3]),
    String(totalChunks).padStart(widths[4]),
    String(totalEmb).padStart(widths[5]),
    ((totalEmb / totalChunks) * 100).toFixed(1) + "%".padStart(widths[6] - 4),
    String(totalRis - totalPages).padStart(widths[7]),
  ].join(" | "));

  // ─── Additional DB issues ───
  console.log("\n\nDB Issues (law-at only):");
  console.log("------------------------");

  const { Client } = await import("pg");
  const client = new Client(DB_URL);
  await client.connect();

  const issues = [
    ["statute_abbr NULL", `SELECT count(*) FROM content_chunks c JOIN pages p ON p.id = c.page_id WHERE p.source_id = 'law-at' AND p.deleted_at IS NULL AND c.statute_abbr IS NULL`],
    ["paragraph_ref NULL", `SELECT count(*) FROM content_chunks c JOIN pages p ON p.id = c.page_id WHERE p.source_id = 'law-at' AND p.deleted_at IS NULL AND c.paragraph_ref IS NULL`],
    ["chunk_role NULL", `SELECT count(*) FROM content_chunks c JOIN pages p ON p.id = c.page_id WHERE p.source_id = 'law-at' AND p.deleted_at IS NULL AND c.chunk_role IS NULL`],
    ["Old slug format (legal/at/)", `SELECT count(*) FROM pages WHERE source_id = 'law-at' AND deleted_at IS NULL AND slug LIKE 'legal/at/%' AND slug NOT LIKE 'legal/statutes/at/%'`],
    ["Pages without chunks", `SELECT count(*) FROM pages p LEFT JOIN content_chunks c ON c.page_id = p.id WHERE p.source_id = 'law-at' AND p.deleted_at IS NULL AND c.id IS NULL`],
    ["Chunks without embedding (law-at)", `SELECT count(*) FROM content_chunks c JOIN pages p ON p.id = c.page_id WHERE p.source_id = 'law-at' AND p.deleted_at IS NULL AND c.embedding IS NULL`],
  ];

  for (const [label, query] of issues) {
    const res = await client.query(query);
    const count = parseInt(res.rows[0].count);
    const status = count === 0 ? "✅" : count > 1000 ? "❌" : "⚠️";
    console.log(`  ${status} ${label}: ${count.toLocaleString()}`);
  }

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
