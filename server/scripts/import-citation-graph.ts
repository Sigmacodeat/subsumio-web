/**
 * import-citation-graph — populate the generic `links` table with §→§
 * within-statute citation edges (link_source: 'citation-graph'), so the
 * existing relational-recall search arm (4th RRF arm, v0.43) can traverse
 * "§ 1295 ABGB cites § 1489, § 1497" instead of that only being prose a
 * model has to re-read every time.
 *
 * Pure extraction lives in src/core/legal/citation-graph.ts (extractCitations,
 * unit-tested). This script does the I/O: read the corpus, split, extract,
 * batch-write via engine.addLinksBatch (ON CONFLICT DO NOTHING — safe to
 * re-run). One SQL call per statute regardless of edge count — avoids the
 * per-row write overhead that made a naive per-edge loop impractical at
 * production scale (see import-statutes-split.ts's --no-embed lesson).
 *
 * Usage:
 *   bun run server/scripts/import-citation-graph.ts [--only at:abgb,at:stgb] [--dry-run]
 *
 * --dry-run prints edge counts per statute without touching a DB (no engine
 * needed, mirrors import-statutes-split.ts's --dry-run contract).
 */

import { join } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";
import { extractCitations } from "../src/core/legal/citation-graph.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY: Set<string> | null =
  onlyIdx >= 0 && args[onlyIdx + 1] ? new Set(args[onlyIdx + 1].split(",")) : null;

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");

interface StatuteFile {
  file: string;
  abbr: string;
  jurisdiction: "at" | "de" | "ch";
}

// Same file list as import-statutes-split.ts's AT section (within-statute
// citations are highest-value for the AT corpus this session repaired).
const FILES: StatuteFile[] = [
  { file: "at/abgb.md", abbr: "abgb", jurisdiction: "at" },
  { file: "at/stgb-at.md", abbr: "stgb", jurisdiction: "at" },
  { file: "at/zpo-at.md", abbr: "zpo", jurisdiction: "at" },
  { file: "at/stpo-at.md", abbr: "stpo", jurisdiction: "at" },
  { file: "at/ugb.md", abbr: "ugb", jurisdiction: "at" },
  { file: "at/io.md", abbr: "io", jurisdiction: "at" },
  { file: "at/gmbhg-at.md", abbr: "gmbhg", jurisdiction: "at" },
  { file: "at/aktg-at.md", abbr: "aktg", jurisdiction: "at" },
  { file: "at/au-strg.md", abbr: "au-strg", jurisdiction: "at" },
  { file: "at/estg-at.md", abbr: "estg", jurisdiction: "at" },
  { file: "at/kstg-at.md", abbr: "kstg", jurisdiction: "at" },
  { file: "at/ustg-at.md", abbr: "ustg", jurisdiction: "at" },
  { file: "at/bao.md", abbr: "bao", jurisdiction: "at" },
  { file: "at/eo.md", abbr: "eo", jurisdiction: "at" },
  { file: "at/eheg.md", abbr: "eheg", jurisdiction: "at" },
  { file: "at/asvg.md", abbr: "asvg", jurisdiction: "at" },
];

async function main() {
  const selected = FILES.filter(
    (f) => !ONLY || ONLY.has(f.abbr) || ONLY.has(`${f.jurisdiction}:${f.abbr}`)
  );

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — §-Zitiergraph-Import (link_source: citation-graph)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : "import"}`);
  console.log("");

  let engine: any = null;
  let addLinksBatch: ((links: any[]) => Promise<number>) | null = null;
  if (!DRY) {
    const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
    const { createEngine } = await import("../src/core/engine-factory.ts");
    const cfg = loadConfig();
    if (!cfg) {
      throw new Error(
        "No engine configured. Set DATABASE_URL (Postgres) or a PGLite database_path " +
          "in ~/.gbrain/config.json."
      );
    }
    engine = await createEngine(toEngineConfig(cfg));
    await engine.connect(toEngineConfig(cfg));
    await engine.initSchema();
    addLinksBatch = (links: any[]) =>
      engine.addLinksBatch(links, { auditSite: "citation-graph-import" });
  }

  let totalEdges = 0;
  let totalWritten = 0;
  let totalErrors = 0;

  for (const sf of selected) {
    const path = join(CORPUS, sf.file);
    let raw: string;
    try {
      raw = await Bun.file(path).text();
    } catch {
      console.error(`  ❌ ${sf.file}: not found`);
      totalErrors++;
      continue;
    }
    const { sections } = splitStatute(raw);
    if (sections.length === 0) {
      console.error(`  ⚠️  ${sf.file}: 0 sections parsed, skipping`);
      continue;
    }
    const edges = extractCitations(sections);
    totalEdges += edges.length;

    if (DRY) {
      console.log(
        `  ${sf.jurisdiction}/${sf.abbr}: ${sections.length} §§, ${edges.length} Zitier-Kanten`
      );
      continue;
    }

    const sourceId = `law-${sf.jurisdiction}`;
    const prefix = `legal/statutes/${sf.jurisdiction}/${sf.abbr}/p-`;
    const links = edges.map((e) => ({
      from_slug: `${prefix}${e.fromRef}`,
      to_slug: `${prefix}${e.toRef}`,
      link_type: "cites",
      context: e.context,
      link_source: "citation-graph",
      from_source_id: sourceId,
      to_source_id: sourceId,
    }));

    try {
      const written = await addLinksBatch!(links);
      totalWritten += written;
      console.log(
        `  ✅ ${sf.jurisdiction}/${sf.abbr}: ${written}/${edges.length} Kanten geschrieben (Rest bereits vorhanden)`
      );
    } catch (e) {
      totalErrors++;
      console.error(
        `  ❌ ${sf.jurisdiction}/${sf.abbr}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  if (DRY) {
    console.log(`  GESAMT: ${totalEdges} Zitier-Kanten gefunden (dry-run)`);
  } else {
    console.log(`  GESAMT: ${totalWritten} Kanten geschrieben, ${totalErrors} Fehler`);
  }
  console.log("═══════════════════════════════════════════════════════════");

  if (!DRY) await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
