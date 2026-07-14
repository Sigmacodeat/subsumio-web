/**
 * Full DB Audit — duplicates, slug formats, citation link integrity, embedding coverage.
 */
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No config");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FULL DB AUDIT — Duplicates · Slugs · Links · Embeddings");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Sources overview ──
  const sources = (await engine.executeRaw(
    `SELECT s.id, s.name, count(p.id) as page_count
     FROM sources s LEFT JOIN pages p ON p.source_id = s.id
     WHERE s.id LIKE 'law-%' OR s.id = 'default' OR s.id = 'demo'
     GROUP BY s.id, s.name ORDER BY s.id`, []
  )) as any[];
  console.log("=== 1. Sources ===");
  for (const r of sources) console.log(`  ${r.id}: ${r.page_count} pages (${r.name})`);

  // ── 2. Total pages & chunks ──
  const totals = (await engine.executeRaw(
    `SELECT (SELECT count(*) FROM pages) as total_pages,
            (SELECT count(*) FROM content_chunks) as total_chunks,
            (SELECT count(embedding) FROM content_chunks) as chunks_with_emb,
            (SELECT count(*) FROM links) as total_links`, []
  )) as any[];
  console.log("\n=== 2. Totals ===");
  console.log(`  Pages: ${totals[0].total_pages}`);
  console.log(`  Chunks: ${totals[0].total_chunks} (with embeddings: ${totals[0].chunks_with_emb})`);
  console.log(`  Links: ${totals[0].total_links}`);

  // ── 3. Duplicate slugs (same slug across different source_ids) ──
  const dupSlugs = (await engine.executeRaw(
    `SELECT slug, count(DISTINCT source_id) as src_count, array_agg(DISTINCT source_id) as sources
     FROM pages GROUP BY slug HAVING count(DISTINCT source_id) > 1
     ORDER BY src_count DESC LIMIT 30`, []
  )) as any[];
  console.log(`\n=== 3. Duplicate slugs (same slug, different sources) ===`);
  if (dupSlugs.length === 0) console.log("  ✅ No duplicates found");
  for (const r of dupSlugs) console.log(`  ⚠️  ${r.slug} — ${r.src_count} sources: ${r.sources}`);

  // ── 4. Duplicate (source_id, slug) pairs ──
  const dupPairs = (await engine.executeRaw(
    `SELECT source_id, slug, count(*) as cnt
     FROM pages GROUP BY source_id, slug HAVING count(*) > 1
     ORDER BY cnt DESC LIMIT 20`, []
  )) as any[];
  console.log(`\n=== 4. Duplicate (source_id, slug) pairs ===`);
  if (dupPairs.length === 0) console.log("  ✅ No duplicate pairs found");
  for (const r of dupPairs) console.log(`  ⚠️  ${r.source_id}/${r.slug}: ${r.cnt}×`);

  // ── 5. AT statute slug format check ──
  // Canonical: legal/statutes/at/<lowercase-abbr>/p-<N>
  const badAtSlugs = (await engine.executeRaw(
    `SELECT slug, source_id FROM pages
     WHERE source_id = 'law-at'
       AND slug LIKE 'legal/statutes/at/%'
       AND slug !~ '^legal/statutes/at/[a-z][a-z0-9-]*/p-[0-9]+$'
     LIMIT 30`, []
  )) as any[];
  console.log(`\n=== 5. AT statute slugs NOT matching canonical format ===`);
  console.log("  Expected: legal/statutes/at/<lowercase-abbr>/p-<N>");
  if (badAtSlugs.length === 0) console.log("  ✅ All AT statute slugs match canonical format");
  for (const r of badAtSlugs) console.log(`  ⚠️  ${r.slug}`);

  // ── 6. AT statute slug summary ──
  const atSlugSummary = (await engine.executeRaw(
    `SELECT substring(slug from '^legal/statutes/at/[^/]+') as law_prefix, count(*) as cnt
     FROM pages WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/%'
     GROUP BY 1 ORDER BY cnt DESC`, []
  )) as any[];
  console.log(`\n=== 6. AT statutes by law (paragraph counts) ===`);
  for (const r of atSlugSummary) console.log(`  ${r.law_prefix}: ${r.cnt} paragraphs`);

  // ── 7. Judikatur slug patterns ──
  const judSlugs = (await engine.executeRaw(
    `SELECT source_id,
       substring(slug from '^legal/judikatur/at/[^/]+') as court_prefix,
       count(*) as cnt
     FROM pages WHERE slug LIKE 'legal/judikatur/at/%'
     GROUP BY 1, 2 ORDER BY source_id, court_prefix`, []
  )) as any[];
  console.log(`\n=== 7. Judikatur pages by court ===`);
  for (const r of judSlugs) console.log(`  ${r.source_id} / ${r.court_prefix}: ${r.cnt}`);

  // ── 8. Citation link integrity — orphan links (target page doesn't exist)
  // links uses from_page_id/to_page_id FKs, so orphans can't exist by design (FK constraint)
  // But we can check for links where the to_page has been deleted (shouldn't happen due to ON DELETE CASCADE)
  const orphanCheck = (await engine.executeRaw(
    `SELECT count(*) as cnt FROM links l
     LEFT JOIN pages p ON p.id = l.to_page_id
     WHERE p.id IS NULL`, []
  )) as any[];
  console.log(`\n=== 8. Orphan links (to_page missing) ===`);
  const orphanCount = orphanCheck[0]?.cnt ?? 0;
  if (orphanCount === 0) console.log("  ✅ No orphan links — all to_pages exist (FK enforced)");
  else console.log(`  ⚠️  ${orphanCount} orphan links`);

  // ── 9. Citation links summary ──
  const linkSummary = (await engine.executeRaw(
    `SELECT l.link_source, l.link_type, count(*) as cnt
     FROM links l GROUP BY 1, 2 ORDER BY 1, 2`, []
  )) as any[];
  console.log(`\n=== 9. All links by source/type ===`);
  for (const r of linkSummary) console.log(`  ${r.link_source}/${r.link_type}: ${r.cnt}`);

  // ── 10. Embedding coverage by source ──
  const embCoverage = (await engine.executeRaw(
    `SELECT p.source_id,
       count(DISTINCT p.id) as pages,
       count(c.id) as chunks,
       count(c.embedding) as chunks_with_emb,
       CASE WHEN count(c.id) > 0 THEN round(count(c.embedding)::numeric / count(c.id) * 100, 1) ELSE 0 END as emb_pct
     FROM pages p
     LEFT JOIN content_chunks c ON c.page_id = p.id
     WHERE p.source_id LIKE 'law-at%'
     GROUP BY p.source_id ORDER BY p.source_id`, []
  )) as any[];
  console.log(`\n=== 10. Embedding coverage (AT sources) ===`);
  for (const r of embCoverage) {
    const status = r.emb_pct == 100 ? "✅" : r.emb_pct > 0 ? "⚠️" : "❌";
    console.log(`  ${status} ${r.source_id}: ${r.pages} pages, ${r.chunks} chunks, ${r.chunks_with_emb} emb (${r.emb_pct}%)`);
  }

  // ── 11. DE + CH sources embedding coverage ──
  const otherEmb = (await engine.executeRaw(
    `SELECT p.source_id,
       count(DISTINCT p.id) as pages,
       count(c.id) as chunks,
       count(c.embedding) as chunks_with_emb,
       CASE WHEN count(c.id) > 0 THEN round(count(c.embedding)::numeric / count(c.id) * 100, 1) ELSE 0 END as emb_pct
     FROM pages p
     LEFT JOIN content_chunks c ON c.page_id = p.id
     WHERE p.source_id LIKE 'law-de%' OR p.source_id LIKE 'law-ch%' OR p.source_id LIKE 'law-eu%'
     GROUP BY p.source_id ORDER BY p.source_id`, []
  )) as any[];
  console.log(`\n=== 11. Embedding coverage (DE/CH/EU sources) ===`);
  if (otherEmb.length === 0) console.log("  (none)");
  for (const r of otherEmb) {
    const status = r.emb_pct == 100 ? "✅" : r.emb_pct > 0 ? "⚠️" : "❌";
    console.log(`  ${status} ${r.source_id}: ${r.pages} pages, ${r.chunks} chunks, ${r.chunks_with_emb} emb (${r.emb_pct}%)`);
  }

  // ── 12. Judikatur-cites link targets — which laws are cited most ──
  const topCited = (await engine.executeRaw(
    `SELECT t.source_id as target_source,
       substring(t.slug from '^legal/statutes/at/[^/]+') as law,
       count(*) as cnt
     FROM links l
     JOIN pages t ON t.id = l.to_page_id
     WHERE l.link_type = 'judikatur-cites'
     GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 20`, []
  )) as any[];
  console.log(`\n=== 12. Top 20 cited laws (judikatur-cites targets) ===`);
  if (topCited.length === 0) console.log("  (no judikatur-cites links found)");
  for (const r of topCited) console.log(`  ${r.law || r.target_source}: ${r.cnt} citations`);

  // ── 13. Judikatur-cites — sample target slugs to verify correctness ──
  const sampleCites = (await engine.executeRaw(
    `SELECT t.slug as target_slug, t.source_id as target_source, count(*) as cnt
     FROM links l
     JOIN pages t ON t.id = l.to_page_id
     WHERE l.link_type = 'judikatur-cites'
     GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 20`, []
  )) as any[];
  console.log(`\n=== 13. Top 20 judikatur-cites target slugs ===`);
  if (sampleCites.length === 0) console.log("  (no judikatur-cites links found)");
  for (const r of sampleCites) console.log(`  ${r.target_source}/${r.target_slug}: ${r.cnt} links`);

  // ── 14. Unique constraint check — (source_id, slug) should be unique ──
  const constraintCheck = (await engine.executeRaw(
    `SELECT source_id, slug, count(*) as cnt
     FROM pages GROUP BY source_id, slug HAVING count(*) > 1
     LIMIT 5`, []
  )) as any[];
  console.log(`\n=== 14. Unique constraint violations (source_id, slug) ===`);
  if (constraintCheck.length === 0) console.log("  ✅ No violations — (source_id, slug) is unique");

  // ── 15. Pages without chunks ──
  const noChunks = (await engine.executeRaw(
    `SELECT p.source_id, count(*) as cnt
     FROM pages p
     LEFT JOIN content_chunks c ON c.page_id = p.id
     WHERE c.id IS NULL
     GROUP BY p.source_id ORDER BY cnt DESC LIMIT 10`, []
  )) as any[];
  console.log(`\n=== 15. Pages without any chunks ===`);
  if (noChunks.length === 0) console.log("  ✅ All pages have chunks");
  for (const r of noChunks) console.log(`  ⚠️  ${r.source_id}: ${r.cnt} pages without chunks`);

  await engine.disconnect();
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AUDIT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
