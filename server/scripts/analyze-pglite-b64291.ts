import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { existsSync, cpSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const home = process.env.HOME || "/Users/msc";
const sourceDir = resolve(home, ".gbrain/brain.pglite");
const workDir = `/tmp/brain-pglite-analyze-${Date.now()}`;
const outputFile = `/tmp/pglite-analysis-${Date.now()}.json`;

if (!existsSync(sourceDir)) {
  console.error("Source DB not found:", sourceDir);
  process.exit(1);
}

console.log("[1/4] Copying DB to", workDir);
mkdirSync(workDir, { recursive: true });
cpSync(sourceDir, workDir, { recursive: true, preserveTimestamps: true });
console.log("[2/4] Copy done");
rmSync(resolve(workDir, "postmaster.pid"), { force: true });
rmSync(resolve(workDir, "postmaster.opts"), { force: true });
console.log("[2.5/4] Removed postmaster lock files");

console.log("[3/4] Opening PGLite (Postgres 17 data dir)");
const db = new PGlite(workDir, {
  extensions: { vector, pg_trgm },
});
await db.waitReady;
console.log("[4/4] PGLite ready");

const queries = [
  {
    name: "tables",
    sql: `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  },
  {
    name: "sources",
    sql: `SELECT count(*) AS pages, source_id FROM pages GROUP BY source_id ORDER BY count(*) DESC`,
  },
  {
    name: "pages_total",
    sql: `SELECT count(*) AS total_pages FROM pages`,
  },
  {
    name: "chunks_total",
    sql: `SELECT count(*) AS total_chunks FROM content_chunks`,
  },
  {
    name: "chunks_per_source",
    sql: `SELECT count(*) AS chunks, p.source_id FROM content_chunks c JOIN pages p ON c.page_id = p.id GROUP BY p.source_id ORDER BY count(*) DESC`,
  },
  {
    name: "chunks_missing_embedding",
    sql: `SELECT count(*) AS missing_embedding FROM content_chunks WHERE embedding IS NULL`,
  },
  {
    name: "orphan_pages",
    sql: `SELECT count(*) AS orphan_pages FROM pages p WHERE NOT EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id)`,
  },
  {
    name: "placeholder_chunks",
    sql: `SELECT count(*) AS placeholder_chunks FROM content_chunks WHERE chunk_text ILIKE '%Volltext nicht abrufbar%' OR chunk_text ILIKE '%placeholder%'`,
  },
  {
    name: "duplicate_slugs",
    sql: `SELECT source_id, slug, count(*) AS n FROM pages GROUP BY source_id, slug HAVING count(*) > 1 ORDER BY n DESC LIMIT 20`,
  },
  {
    name: "links",
    sql: `SELECT count(*) AS total_links FROM links`,
  },
  {
    name: "orphan_links",
    sql: `SELECT count(*) AS orphan_links FROM links l WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.id = l.from_page_id) OR NOT EXISTS (SELECT 1 FROM pages p WHERE p.id = l.to_page_id)`,
  },
  {
    name: "citation_status",
    sql: `SELECT citation_status, count(*) AS n FROM pages WHERE citation_status IS NOT NULL GROUP BY citation_status ORDER BY n DESC`,
  },
  {
    name: "language_chunks",
    sql: `SELECT language, count(*) AS n FROM content_chunks WHERE language IS NOT NULL GROUP BY language ORDER BY n DESC`,
  },
  {
    name: "top_slug_prefixes",
    sql: `SELECT split_part(slug, '/', 1) || '/' || split_part(slug, '/', 2) AS prefix, count(*) AS n FROM pages GROUP BY prefix ORDER BY n DESC LIMIT 20`,
  },
  {
    name: "page_types",
    sql: `SELECT page_type, count(*) AS n FROM pages WHERE page_type IS NOT NULL GROUP BY page_type ORDER BY n DESC LIMIT 20`,
  },
  {
    name: "sample_pages",
    sql: `SELECT id, source_id, slug, title, page_type, citation_status FROM pages ORDER BY id DESC LIMIT 10`,
  },
];

const results: Record<string, unknown> = {};

for (const q of queries) {
  try {
    const res = await db.query(q.sql);
    results[q.name] = res.rows;
    console.log(`\n--- ${q.name} ---`);
    console.log(JSON.stringify(res.rows.slice(0, 10), null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results[q.name] = { error: message };
    console.error(`\n--- ${q.name} ERROR ---`, message);
  }
}

writeFileSync(outputFile, JSON.stringify(results, null, 2));
console.log("\nFull results written to", outputFile);

await db.close();
