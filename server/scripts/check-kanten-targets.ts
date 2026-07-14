/**
 * Quick check: how many judikatur-cites target slugs actually exist in the DB.
 * Supports all 7 court sources. Uses the full JUDIKATUR_CODE_MAP from import-judikatur.ts.
 *
 * Usage:
 *   bun run server/scripts/check-kanten-targets.ts [--all-sources] [--source ogh]
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { extractAllNormReferences } from "../src/core/legal/judikatur-citations.ts";

const args = process.argv.slice(2);
const ALL_SOURCES = args.includes("--all-sources");
const sourceIdx = args.indexOf("--source");
const sourceKey = sourceIdx >= 0 ? args[sourceIdx + 1] : "ogh";

const SOURCE_DIRS: Record<string, string> = {
  ogh: "at-judikatur",
  vfgh: "at-judikatur-vfgh",
  vwgh: "at-judikatur-vwgh",
  bvwg: "at-judikatur-bvwg",
  lvwg: "at-judikatur-lvwg",
  asylgh: "at-judikatur-asylgh",
  uvs: "at-judikatur-uvs",
};

const sourcesToRun = ALL_SOURCES ? Object.keys(SOURCE_DIRS) : [sourceKey];

const JUDIKATUR_CODE_MAP: Record<string, string> = {
  StGB: "stgb", ABGB: "abgb", ZPO: "zpo", EO: "eo", AHG: "ahg",
  ArbVG: "arbvg", StPO: "stpo", AußStrG: "au-strg", DSG: "dsg",
  AngG: "angg", IO: "io", KSchG: "kschg", MRG: "mrg", EheG: "eheg",
  GmbHG: "gmbhg", UGB: "ugb", ASVG: "asvg", AVG: "avg", GewO: "gewo",
  StVO: "stvo", VStG: "vstg", JGG: "jgg", GOG: "gog",
  WRG: "wrg", JN: "jn", SMG: "smg", AZG: "azg", ZustG: "zustg",
  PatG: "patg", RAO: "rao", AMG: "amg", BAO: "bao", UrhG: "urhg",
  BDG: "bdg", WEG: "weg", BUAG: "buag", VbVG: "vbvg", AktG: "aktg",
  ALVG: "alvg", ARG: "arg", AsylG: "asylg", AufenthG: "aufenthg",
  AuslBG: "auslbg", AVRAG: "avrag", AWG: "awg", BBG: "bbg", BewG: "bewg",
  BVerGG: "bvergg", "B-VG": "b-vg", ChemG: "chemg", ECG: "ecg",
  "E-GovG": "e-govg", Eiwog: "eiwog", EPG: "epig", EstG: "estg",
  ForstG: "forstg", FPG: "fpg", GebG: "gebg", GlBG: "glbg", GWG: "gwg",
  KAG: "kag", KartG: "kartg", KStG: "kstg", MedienG: "medieng",
  MSchG: "mschg", "N-G": "n-g", PStG: "pstg", SPG: "spg", StBG: "stbg",
  StRegG: "stregg", TilgG: "tilgg", TKG: "tkg", TschG: "tschg",
  UStG: "ustg", VKGG: "vkgg", VVG: "vvg", WaffG: "waffg",
  GlbG: "glbg", StbG: "stbg", UWG: "uwg", VKgG: "vkgg",
};

const targetSlugs = new Set<string>();
let totalRefs = 0;
let mappable = 0;

for (const src of sourcesToRun) {
  const dir = join(import.meta.dir, "..", "..", "law-corpus", SOURCE_DIRS[src]);
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith(".md"));
  } catch {
    console.log(`  ${src}: directory not found, skipping`);
    continue;
  }
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf-8");
    const refs = extractAllNormReferences(content);
    for (const r of refs) {
      totalRefs++;
      const abbr = JUDIKATUR_CODE_MAP[r.code];
      if (!abbr) continue;
      mappable++;
      targetSlugs.add(`legal/statutes/at/${abbr}/p-${r.ref}`);
    }
  }
  console.log(`  ${src}: ${files.length} files scanned`);
}

console.log("\nTotal norm refs:", totalRefs);
console.log("Mappable to known codes:", mappable);
console.log("Unique target slugs:", targetSlugs.size);

const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
const { createEngine } = await import("../src/core/engine-factory.ts");
const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
const { configureGateway } = await import("../src/core/ai/gateway.ts");

const cfg = loadConfig();
if (!cfg) throw new Error("No config — set DATABASE_URL or ~/.gbrain/config.json");
configureGateway(buildGatewayConfig(cfg));
const engine = await createEngine(toEngineConfig(cfg));
await engine.connect(toEngineConfig(cfg));

// Batch check: query all target slugs at once via ANY()
const slugList = [...targetSlugs];
let existing = 0;
let missing = 0;
const missingSlugs: string[] = [];
const BATCH = 500;

for (let i = 0; i < slugList.length; i += BATCH) {
  const batch = slugList.slice(i, i + BATCH);
  const rows = await engine.executeRaw(
    "SELECT slug FROM pages WHERE slug = ANY($1)",
    [batch]
  ) as any[];
  const foundSet = new Set(rows.map((r: any) => r.slug));
  for (const slug of batch) {
    if (foundSet.has(slug)) existing++;
    else {
      missing++;
      if (missingSlugs.length < 20) missingSlugs.push(slug);
    }
  }
}

console.log("\nTarget slugs existing in DB:", existing);
console.log("Target slugs missing (phantom):", missing);
console.log(`Phantom rate: ${((missing / targetSlugs.size) * 100).toFixed(1)}%`);
console.log("Sample missing:", missingSlugs);

await engine.disconnect();
