/**
 * import-judikatur — bring the fetched OGH decisions (server/law-corpus/at-
 * judikatur/*.md, from scripts/ingest-at-judikatur.ts / bulk-import-ogh-
 * judikate.ts) into the brain as pages, AND link each decision to the
 * statute §§ it's actually about via its RIS "Norm" field.
 *
 * Two writes per decision:
 *   1. The decision itself as a page (`legal/judikatur/at/<file-slug>`),
 *      source `law-at-judikatur`, embedded for semantic search.
 *   2. `links` edges (link_type='judikatur-cites', link_source='citation-
 *      graph') from the decision to each cited § page it references — ONLY
 *      when that exact abbreviation is one we hold real statute pages for
 *      (JUDIKATUR_CODE_MAP below) and the target § page actually exists.
 *      Historical/foreign abbreviations we don't carry (JN, VersVG, RAT,
 *      GBG, ...) or renamed codes (HGB → UGB in 2007, NOT a safe 1:1 mapping
 *      since §-numbering shifted) are deliberately left unmapped rather than
 *      risk a wrong edge — same fail-closed principle as citation-graph.ts.
 *
 * Usage:
 *   bun run server/scripts/import-judikatur.ts [--dry-run] [--no-embed] [--limit N]
 */

import { readdirSync } from "fs";
import { join } from "path";
import { extractNormReferences } from "../src/core/legal/judikatur-citations.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NO_EMBED = args.includes("--no-embed");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const JUDIKATUR_DIR = join(import.meta.dir, "..", "law-corpus", "at-judikatur");
const SOURCE_ID = "law-at-judikatur";

/** RIS "Norm" abbreviation → our statute abbr (matches import-statutes-split.ts
 *  / import-citation-graph.ts's `at/<abbr>` file naming). Only codes we hold
 *  real, current-fassung § pages for; deliberately excludes renamed/historical
 *  codes (HGB→UGB) where §-numbering isn't a safe 1:1 carryover. */
const JUDIKATUR_CODE_MAP: Record<string, string> = {
  StGB: "stgb",
  ABGB: "abgb",
  ZPO: "zpo",
  EO: "eo",
  AHG: "ahg",
  ArbVG: "arbvg",
  StPO: "stpo",
  AußStrG: "au-strg",
  DSG: "dsg",
  AngG: "angg",
  IO: "io",
  KSchG: "kschg",
  MRG: "mrg",
  EheG: "eheg",
  GmbHG: "gmbhg",
  UGB: "ugb",
  ASVG: "asvg",
  AVG: "avg",
  GewO: "gewo",
  StVO: "stvo",
  VStG: "vstg",
  JGG: "jgg",
  GOG: "gog",
};

interface ParsedDecision {
  slug: string;
  content: string;
  normRefs: Array<{ code: string; ref: string }>;
}

function loadDecisions(): ParsedDecision[] {
  const files = readdirSync(JUDIKATUR_DIR)
    .filter((f) => f.endsWith(".md"))
    .slice(0, LIMIT);
  return files.map((f) => {
    const content = require("fs").readFileSync(join(JUDIKATUR_DIR, f), "utf-8");
    const slug = `legal/judikatur/at/${f.replace(/\.md$/, "")}`;
    const normRefs = extractNormReferences(content);
    return { slug, content, normRefs };
  });
}

async function main() {
  const decisions = loadDecisions();
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Judikatur-Import (OGH-Entscheidungen)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : NO_EMBED ? "import, no-embed" : "import + embed"}`
  );
  console.log(`Gefunden: ${decisions.length} Entscheidungen`);
  console.log("");

  if (DRY) {
    const totalNorms = decisions.reduce((s, d) => s + d.normRefs.length, 0);
    const mappable = decisions.reduce(
      (s, d) => s + d.normRefs.filter((r) => JUDIKATUR_CODE_MAP[r.code]).length,
      0
    );
    console.log(`  Norm-Referenzen gesamt: ${totalNorms}`);
    console.log(`  Davon auf bekannte Codes abbildbar: ${mappable}`);
    console.log(`  Beispiel: ${decisions.find((d) => d.normRefs.length > 0)?.slug}`);
    return;
  }

  const { importFromContent } = await import("../src/core/import-file.ts");
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../src/core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  await engine.initSchema();
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal: pre-v39 brains may not have a usable config table.
  }

  await engine.executeRaw(
    `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
    [SOURCE_ID]
  );

  let pagesOk = 0;
  let pagesErr = 0;
  const allLinks: Array<{
    from_slug: string;
    to_slug: string;
    link_type: string;
    context: string;
    link_source: string;
    from_source_id: string;
    to_source_id: string;
  }> = [];

  for (const d of decisions) {
    try {
      const result = await importFromContent(engine, d.slug, d.content, {
        noEmbed: NO_EMBED,
        sourceId: SOURCE_ID,
      });
      if (result.status === "imported" || result.status === "skipped") pagesOk++;
      else {
        pagesErr++;
        console.error(`  ❌ ${d.slug}: ${result.error || result.status}`);
      }
    } catch (e) {
      pagesErr++;
      console.error(`  ❌ ${d.slug}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    for (const r of d.normRefs) {
      const abbr = JUDIKATUR_CODE_MAP[r.code];
      if (!abbr) continue;
      allLinks.push({
        from_slug: d.slug,
        to_slug: `legal/statutes/at/${abbr}/p-${r.ref}`,
        link_type: "judikatur-cites",
        context: `${r.code} § ${r.ref}`,
        link_source: "citation-graph",
        from_source_id: SOURCE_ID,
        to_source_id: "law-at",
      });
    }
  }

  console.log(`  Seiten: ${pagesOk} ok, ${pagesErr} Fehler`);

  let linksWritten = 0;
  if (allLinks.length > 0) {
    linksWritten = await (engine as any).addLinksBatch(allLinks, {
      auditSite: "judikatur-import",
    });
  }
  console.log(
    `  Kanten: ${linksWritten}/${allLinks.length} geschrieben (Rest: Ziel-§ existiert nicht / bereits vorhanden)`
  );

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  GESAMT: ${pagesOk} Entscheidungen, ${linksWritten} Zitier-Kanten`);
  console.log("═══════════════════════════════════════════════════════════");

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
