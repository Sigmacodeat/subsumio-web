/**
 * import-judikatur — bring fetched Austrian court decisions into the brain
 * as pages, AND link each decision to the statute §§ it references.
 *
 * Supports eleven court sources via --source flag:
 *   ogh   (default) — server/law-corpus/at-judikatur/   → source law-at-judikatur
 *   vfgh             — server/law-corpus/at-judikatur-vfgh/ → source law-at-judikatur-vfgh
 *   vwgh             — server/law-corpus/at-judikatur-vwgh/ → source law-at-judikatur-vwgh
 *   bvwg             — server/law-corpus/at-judikatur-bvwg/ → source law-at-judikatur-bvwg
 *   lvwg             — server/law-corpus/at-judikatur-lvwg/ → source law-at-judikatur-lvwg
 *   asylgh           — server/law-corpus/at-judikatur-asylgh/ → source law-at-judikatur-asylgh
 *   uvs              — server/law-corpus/at-judikatur-uvs/ → source law-at-judikatur-uvs
 *   dsk              — server/law-corpus/at-judikatur-dsk/ → source law-at-judikatur-dsk
 *   gbk              — server/law-corpus/at-judikatur-gbk/ → source law-at-judikatur-gbk
 *   pvak             — server/law-corpus/at-judikatur-pvak/ → source law-at-judikatur-pvak
 *   dok              — server/law-corpus/at-judikatur-dok/ → source law-at-judikatur-dok
 *   ubas             — server/law-corpus/at-judikatur-ubas/ → source law-at-judikatur-ubas
 *   umse             — server/law-corpus/at-judikatur-umse/ → source law-at-judikatur-umse
 *
 * Two writes per decision:
 *   1. The decision itself as a page (`legal/judikatur/at/[court]/<file-slug>`),
 *      source `law-at-judikatur[-court]`, embedded for semantic search.
 *   2. `links` edges (link_type='judikatur-cites', link_source='citation-
 *      graph') from the decision to each cited § page — ONLY when that
 *      abbreviation is in JUDIKATUR_CODE_MAP and the target § page exists.
 *      Fail-closed: unknown/historical codes (HGB→UGB, JN, VersVG, ...) are
 *      deliberately left unmapped — same principle as citation-graph.ts.
 *
 * Usage:
 *   bun run server/scripts/import-judikatur.ts [--source ogh|vfgh|vwgh|bvwg|lvwg|asylgh|uvs] [--all-sources] [--dry-run] [--no-embed] [--limit N]
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { extractAllNormReferences } from "../src/core/legal/judikatur-citations.ts";
import { extractMultiJurisdictionNormReferences } from "../src/core/legal/multi-jurisdiction-citations.ts";
import { createProgress } from "../src/core/progress.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NO_EMBED = args.includes("--no-embed");
const ALL_SOURCES = args.includes("--all-sources");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const offsetIdx = args.indexOf("--offset");
const OFFSET = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1], 10) : 0;
const sourceIdx = args.indexOf("--source");
const sourceKey = sourceIdx >= 0 ? args[sourceIdx + 1] : "ogh";
// Placeholders are ALWAYS skipped — text-less stubs in the brain are retrieval
// noise and block the content-hash update path. The --skip-placeholders flag is
// kept for backwards compatibility but is now a no-op (default: true).
const SKIP_PLACEHOLDERS = true;

interface SourceConfig {
  dir: string;
  sourceId: string;
  slugPrefix: string;
  label: string;
}

const SOURCE_CONFIGS: Record<string, SourceConfig> = {
  ogh: {
    dir: "at-judikatur",
    sourceId: "law-at-judikatur",
    slugPrefix: "legal/judikatur/at",
    label: "OGH",
  },
  vfgh: {
    dir: "at-judikatur-vfgh",
    sourceId: "law-at-judikatur-vfgh",
    slugPrefix: "legal/judikatur/at/vfgh",
    label: "VfGH",
  },
  vwgh: {
    dir: "at-judikatur-vwgh",
    sourceId: "law-at-judikatur-vwgh",
    slugPrefix: "legal/judikatur/at/vwgh",
    label: "VwGH",
  },
  bvwg: {
    dir: "at-judikatur-bvwg",
    sourceId: "law-at-judikatur-bvwg",
    slugPrefix: "legal/judikatur/at/bvwg",
    label: "BVwG",
  },
  lvwg: {
    dir: "at-judikatur-lvwg",
    sourceId: "law-at-judikatur-lvwg",
    slugPrefix: "legal/judikatur/at/lvwg",
    label: "LVwG",
  },
  asylgh: {
    dir: "at-judikatur-asylgh",
    sourceId: "law-at-judikatur-asylgh",
    slugPrefix: "legal/judikatur/at/asylgh",
    label: "AsylGH",
  },
  uvs: {
    dir: "at-judikatur-uvs",
    sourceId: "law-at-judikatur-uvs",
    slugPrefix: "legal/judikatur/at/uvs",
    label: "Uvs",
  },
  dsk: {
    dir: "at-judikatur-dsk",
    sourceId: "law-at-judikatur-dsk",
    slugPrefix: "legal/judikatur/at/dsk",
    label: "DSB",
  },
  gbk: {
    dir: "at-judikatur-gbk",
    sourceId: "law-at-judikatur-gbk",
    slugPrefix: "legal/judikatur/at/gbk",
    label: "GBK",
  },
  pvak: {
    dir: "at-judikatur-pvak",
    sourceId: "law-at-judikatur-pvak",
    slugPrefix: "legal/judikatur/at/pvak",
    label: "PVAK",
  },
  dok: {
    dir: "at-judikatur-dok",
    sourceId: "law-at-judikatur-dok",
    slugPrefix: "legal/judikatur/at/dok",
    label: "DOK",
  },
  ubas: {
    dir: "at-judikatur-ubas",
    sourceId: "law-at-judikatur-ubas",
    slugPrefix: "legal/judikatur/at/ubas",
    label: "UBAS",
  },
  umse: {
    dir: "at-judikatur-umse",
    sourceId: "law-at-judikatur-umse",
    slugPrefix: "legal/judikatur/at/umse",
    label: "UMSE",
  },
  de: {
    dir: "de-judikatur",
    sourceId: "law-de-judikatur",
    slugPrefix: "legal/judikatur/de",
    label: "DE",
  },
  ch: {
    dir: "ch-judikatur",
    sourceId: "law-ch-judikatur",
    slugPrefix: "legal/judikatur/ch",
    label: "CH",
  },
  eu: {
    dir: "eu-judikatur",
    sourceId: "law-eu-judikatur",
    slugPrefix: "legal/judikatur/eu",
    label: "EU",
  },
};

const sourcesToRun: string[] = ALL_SOURCES ? Object.keys(SOURCE_CONFIGS) : [sourceKey];

if (!ALL_SOURCES) {
  const srcCfg = SOURCE_CONFIGS[sourceKey];
  if (!srcCfg) {
    console.error(
      `Unknown source: ${sourceKey}. Use ogh, vfgh, vwgh, bvwg, lvwg, asylgh, uvs, dsk, gbk, pvak, dok, de, ch, or eu.`
    );
    process.exit(1);
  }
}

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
  // Expanded — codes that exist as law-at pages in the DB
  WRG: "wrg",
  JN: "jn",
  SMG: "smg",
  AZG: "azg",
  ZustG: "zustg",
  PatG: "patg",
  RAO: "rao",
  AMG: "amg",
  BAO: "bao",
  UrhG: "urhg",
  BDG: "bdg",
  WEG: "weg",
  BUAG: "buag",
  VbVG: "vbvg",
  AktG: "aktg",
  ALVG: "alvg",
  ARG: "arg",
  AsylG: "asylg",
  AufenthG: "aufenthg",
  AuslBG: "auslbg",
  AVRAG: "avrag",
  AWG: "awg",
  BBG: "bbg",
  BewG: "bewg",
  BVerGG: "bvergg",
  "B-VG": "b-vg",
  ChemG: "chemg",
  ECG: "ecg",
  "E-GovG": "e-govg",
  Eiwog: "eiwog",
  EPG: "epig",
  EstG: "estg",
  ForstG: "forstg",
  FPG: "fpg",
  GebG: "gebg",
  GlBG: "glbg",
  GWG: "gwg",
  KAG: "kag",
  KartG: "kartg",
  KStG: "kstg",
  MedienG: "medieng",
  MSchG: "mschg",
  "N-G": "n-g",
  PStG: "pstg",
  SPG: "spg",
  StBG: "stbg",
  StRegG: "stregg",
  TilgG: "tilgg",
  TKG: "tkg",
  TschG: "tschg",
  UStG: "ustg",
  VKGG: "vkgg",
  VVG: "vvg",
  WaffG: "waffg",
  // Synced with import-citation-graph.ts KNOWN_ABBRS_BASE
  GlbG: "glbg",
  StbG: "stbg",
  UWG: "uwg",
  VKgG: "vkgg",
};

interface ParsedDecision {
  slug: string;
  content: string;
  normRefs: Array<{ code: string; ref: string; statuteSlug?: string }>;
}

function loadDecisions(srcCfg: SourceConfig): ParsedDecision[] {
  // Use LAW_CORPUS_ROOT if set, otherwise try both possible locations
  const corpusRoot = process.env.LAW_CORPUS_ROOT;
  const dir1 = corpusRoot
    ? join(corpusRoot, srcCfg.dir)
    : join(import.meta.dir, "..", "..", "law-corpus", srcCfg.dir);
  const dir2 = join(import.meta.dir, "..", "law-corpus", srcCfg.dir);
  let dir: string;
  try {
    const files1 = readdirSync(dir1).filter((f) => f.endsWith(".md"));
    dir = files1.length > 0 ? dir1 : dir2;
  } catch {
    dir = dir2;
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .slice(OFFSET, OFFSET + LIMIT);
  const decisions: ParsedDecision[] = [];
  let skippedPlaceholders = 0;
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf-8");
    // Never import text-less stubs: a "Volltext nicht abrufbar" page in the
    // brain is retrieval noise AND blocks the content-hash update path from
    // treating the later real text as fresh content worth re-embedding
    // eagerly. The corpus pipeline re-runs this import after backfill fills
    // the text in, so skipping here loses nothing.
    if (SKIP_PLACEHOLDERS && content.includes("Volltext nicht abrufbar")) {
      skippedPlaceholders++;
      continue;
    }
    const slug = `${srcCfg.slugPrefix}/${f.replace(/\.md$/, "")}`;
    // AT decisions use the RIS-specific extractor (structured Norm section + inline fallback).
    // DE/CH/EU decisions use the multi-jurisdiction inline extractor.
    const jurisdiction = srcCfg.dir.startsWith("de-")
      ? "de"
      : srcCfg.dir.startsWith("ch-")
        ? "ch"
        : srcCfg.dir.startsWith("eu-")
          ? "eu"
          : "at";
    let normRefs: Array<{ code: string; ref: string; statuteSlug?: string }>;
    if (jurisdiction === "at") {
      normRefs = extractAllNormReferences(content);
    } else {
      normRefs = extractMultiJurisdictionNormReferences(content, jurisdiction);
    }
    decisions.push({ slug, content, normRefs });
  }
  if (skippedPlaceholders > 0) {
    console.log(
      `  [${srcCfg.label}] ${skippedPlaceholders} Platzhalter-Dateien übersprungen (kein Volltext)`
    );
  }
  return decisions;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `  Subsumio — Judikatur-Import (${sourcesToRun.length} Gericht${sourcesToRun.length > 1 ? "e" : ""})`
  );
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : NO_EMBED ? "import, no-embed" : "import + embed"}`
  );
  console.log(`Quellen: ${sourcesToRun.join(", ")}`);
  console.log("");

  const allDecisions: Array<{ srcCfg: SourceConfig; decisions: ParsedDecision[] }> = [];
  for (const key of sourcesToRun) {
    const sc = SOURCE_CONFIGS[key];
    const decisions = loadDecisions(sc);
    allDecisions.push({ srcCfg: sc, decisions });
    console.log(`  ${sc.label}: ${decisions.length} Entscheidungen`);
  }
  const totalDecisions = allDecisions.reduce((s, x) => s + x.decisions.length, 0);
  console.log(`  Gesamt: ${totalDecisions} Entscheidungen`);
  console.log("");

  if (DRY) {
    let totalNorms = 0;
    let mappable = 0;
    for (const { decisions } of allDecisions) {
      for (const d of decisions) {
        totalNorms += d.normRefs.length;
        mappable += d.normRefs.filter((r) => r.statuteSlug || JUDIKATUR_CODE_MAP[r.code]).length;
      }
    }
    console.log(`  Norm-Referenzen gesamt: ${totalNorms}`);
    console.log(`  Davon auf bekannte Codes abbildbar: ${mappable}`);
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

  for (const { srcCfg } of allDecisions) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
      [srcCfg.sourceId]
    );
  }

  const progress = createProgress({ mode: "auto" });
  progress.start("judikatur-import", totalDecisions);

  let pagesOk = 0;
  let pagesErr = 0;
  let linksWritten = 0;
  let totalLinks = 0;
  const BATCH_SIZE = 100;

  for (const { srcCfg, decisions } of allDecisions) {
    for (let bi = 0; bi < decisions.length; bi += BATCH_SIZE) {
      const batch = decisions.slice(bi, bi + BATCH_SIZE);
      const batchLinks: Array<{
        from_slug: string;
        to_slug: string;
        link_type: string;
        context: string;
        link_source: string;
        from_source_id: string;
        to_source_id: string;
      }> = [];

      for (const d of batch) {
        try {
          const result = await importFromContent(engine, d.slug, d.content, {
            noEmbed: NO_EMBED,
            sourceId: srcCfg.sourceId,
          });
          if (result.status === "imported" || result.status === "skipped") pagesOk++;
          else {
            pagesErr++;
            console.error(`  ❌ ${d.slug}: ${result.error || result.status}`);
          }
        } catch (e) {
          pagesErr++;
          console.error(`  ❌ ${d.slug}: ${e instanceof Error ? e.message : String(e)}`);
          progress.tick(1, `err`);
          continue;
        }

        for (const r of d.normRefs) {
          // AT decisions: resolve via JUDIKATUR_CODE_MAP → legal/statutes/at/<abbr>/p-<N>
          // DE/CH/EU decisions: statuteSlug already resolved by multi-jurisdiction extractor
          let toSlug: string;
          let toSourceId: string;
          if (r.statuteSlug) {
            toSlug = r.statuteSlug;
            // Determine target source from jurisdiction
            const jur = r.statuteSlug.startsWith("legal/statutes/de/")
              ? "de"
              : r.statuteSlug.startsWith("legal/statutes/ch/")
                ? "ch"
                : r.statuteSlug.startsWith("legal/statutes/eu/")
                  ? "eu"
                  : "at";
            toSourceId = `law-${jur}`;
          } else {
            const abbr = JUDIKATUR_CODE_MAP[r.code];
            if (!abbr) continue;
            toSlug = `legal/statutes/at/${abbr}/p-${r.ref}`;
            toSourceId = "law-at";
          }
          batchLinks.push({
            from_slug: d.slug,
            to_slug: toSlug,
            link_type: "judikatur-cites",
            context: `${r.code} § ${r.ref}`,
            link_source: "citation-graph",
            from_source_id: srcCfg.sourceId,
            to_source_id: toSourceId,
          });
        }
        progress.tick(1, `${srcCfg.label} ${pagesOk}`);
      }

      if (batchLinks.length > 0) {
        const written = await (engine as any).addLinksBatch(batchLinks, {
          auditSite: "judikatur-import",
        });
        linksWritten += written;
        totalLinks += batchLinks.length;
      }
    }
  }
  progress.finish(`${pagesOk} pages, ${linksWritten} links`);

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `  GESAMT: ${pagesOk} Entscheidungen, ${linksWritten} Zitier-Kanten (${totalLinks} versucht, ${pagesErr} Fehler)`
  );
  console.log("═══════════════════════════════════════════════════════════");

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
