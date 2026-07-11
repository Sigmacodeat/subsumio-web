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

// Full AT corpus — same file/abbr mapping as import-statutes-split.ts's AT
// section, kept identical so slugs always agree between the two scripts.
const FILES: StatuteFile[] = [
  { file: "at/abgb.md", abbr: "abgb", jurisdiction: "at" },
  { file: "at/b-vg.md", abbr: "b-vg", jurisdiction: "at" },
  { file: "at/bvergg.md", abbr: "bvergg", jurisdiction: "at" },
  { file: "at/stgb-at.md", abbr: "stgb", jurisdiction: "at" },
  { file: "at/stpo-at.md", abbr: "stpo", jurisdiction: "at" },
  { file: "at/jgg-at.md", abbr: "jgg", jurisdiction: "at" },
  { file: "at/eo.md", abbr: "eo", jurisdiction: "at" },
  { file: "at/zpo-at.md", abbr: "zpo", jurisdiction: "at" },
  { file: "at/au-strg.md", abbr: "au-strg", jurisdiction: "at" },
  { file: "at/estg-at.md", abbr: "estg", jurisdiction: "at" },
  { file: "at/kstg-at.md", abbr: "kstg", jurisdiction: "at" },
  { file: "at/ustg-at.md", abbr: "ustg", jurisdiction: "at" },
  { file: "at/bao.md", abbr: "bao", jurisdiction: "at" },
  { file: "at/bewg.md", abbr: "bewg", jurisdiction: "at" },
  { file: "at/ugb.md", abbr: "ugb", jurisdiction: "at" },
  { file: "at/gmbhg-at.md", abbr: "gmbhg", jurisdiction: "at" },
  { file: "at/aktg-at.md", abbr: "aktg", jurisdiction: "at" },
  { file: "at/io.md", abbr: "io", jurisdiction: "at" },
  { file: "at/gewo-at.md", abbr: "gewo", jurisdiction: "at" },
  { file: "at/gwg.md", abbr: "gwg", jurisdiction: "at" },
  { file: "at/kartg.md", abbr: "kartg", jurisdiction: "at" },
  { file: "at/asvg.md", abbr: "asvg", jurisdiction: "at" },
  { file: "at/arbvg.md", abbr: "arbvg", jurisdiction: "at" },
  { file: "at/angg.md", abbr: "angg", jurisdiction: "at" },
  { file: "at/azg.md", abbr: "azg", jurisdiction: "at" },
  { file: "at/avrag.md", abbr: "avrag", jurisdiction: "at" },
  { file: "at/bbg.md", abbr: "bbg", jurisdiction: "at" },
  { file: "at/buag.md", abbr: "buag", jurisdiction: "at" },
  { file: "at/alvg.md", abbr: "alvg", jurisdiction: "at" },
  { file: "at/mschg.md", abbr: "mschg", jurisdiction: "at" },
  { file: "at/mschg-at.md", abbr: "mschg-at", jurisdiction: "at" },
  { file: "at/kschg.md", abbr: "kschg", jurisdiction: "at" },
  { file: "at/mrg.md", abbr: "mrg", jurisdiction: "at" },
  { file: "at/weg.md", abbr: "weg", jurisdiction: "at" },
  { file: "at/gebg.md", abbr: "gebg", jurisdiction: "at" },
  { file: "at/grstg.md", abbr: "grstg", jurisdiction: "at" },
  { file: "at/gukg.md", abbr: "gukg", jurisdiction: "at" },
  { file: "at/avg.md", abbr: "avg", jurisdiction: "at" },
  { file: "at/stvo-at.md", abbr: "stvo", jurisdiction: "at" },
  { file: "at/spg.md", abbr: "spg", jurisdiction: "at" },
  { file: "at/asylg.md", abbr: "asylg", jurisdiction: "at" },
  { file: "at/aufenthg.md", abbr: "aufenthg", jurisdiction: "at" },
  { file: "at/auslbg.md", abbr: "auslbg", jurisdiction: "at" },
  { file: "at/waffg.md", abbr: "waffg", jurisdiction: "at" },
  { file: "at/awg.md", abbr: "awg", jurisdiction: "at" },
  { file: "at/dsg-at.md", abbr: "dsg", jurisdiction: "at" },
  { file: "at/tkg.md", abbr: "tkg", jurisdiction: "at" },
  { file: "at/urhg-at.md", abbr: "urhg", jurisdiction: "at" },
  { file: "at/patg.md", abbr: "patg", jurisdiction: "at" },
  { file: "at/medieng.md", abbr: "medieng", jurisdiction: "at" },
  { file: "at/amg.md", abbr: "amg", jurisdiction: "at" },
  { file: "at/smg.md", abbr: "smg", jurisdiction: "at" },
  { file: "at/chemg.md", abbr: "chemg", jurisdiction: "at" },
  { file: "at/eiwog.md", abbr: "eiwog", jurisdiction: "at" },
  { file: "at/forstg.md", abbr: "forstg", jurisdiction: "at" },
  { file: "at/epig.md", abbr: "epig", jurisdiction: "at" },
  { file: "at/rao.md", abbr: "rao", jurisdiction: "at" },
  { file: "at/gog.md", abbr: "gog", jurisdiction: "at" },
  { file: "at/bdg.md", abbr: "bdg", jurisdiction: "at" },
  { file: "at/e-govg.md", abbr: "e-govg", jurisdiction: "at" },
  { file: "at/ahg.md", abbr: "ahg", jurisdiction: "at" },
  { file: "at/arg.md", abbr: "arg", jurisdiction: "at" },
  { file: "at/brag.md", abbr: "brag", jurisdiction: "at" },
  { file: "at/ecg.md", abbr: "ecg", jurisdiction: "at" },
  { file: "at/eheg.md", abbr: "eheg", jurisdiction: "at" },
  { file: "at/fpg.md", abbr: "fpg", jurisdiction: "at" },
  { file: "at/glbg.md", abbr: "glbg", jurisdiction: "at" },
  { file: "at/kag.md", abbr: "kag", jurisdiction: "at" },
  { file: "at/n-g.md", abbr: "n-g", jurisdiction: "at" },
  { file: "at/pstg.md", abbr: "pstg", jurisdiction: "at" },
  { file: "at/stbg.md", abbr: "stbg", jurisdiction: "at" },
  { file: "at/stregg.md", abbr: "stregg", jurisdiction: "at" },
  { file: "at/tilgg.md", abbr: "tilgg", jurisdiction: "at" },
  { file: "at/tschg.md", abbr: "tschg", jurisdiction: "at" },
  { file: "at/vbvg.md", abbr: "vbvg", jurisdiction: "at" },
  { file: "at/vkgg.md", abbr: "vkgg", jurisdiction: "at" },
  { file: "at/vstg.md", abbr: "vstg", jurisdiction: "at" },
  { file: "at/vvg.md", abbr: "vvg", jurisdiction: "at" },
  { file: "at/wrg.md", abbr: "wrg", jurisdiction: "at" },
  { file: "at/zustg.md", abbr: "zustg", jurisdiction: "at" },
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
