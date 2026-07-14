/**
 * Quick check: how many judikatur-cites target slugs actually exist in the DB.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { extractNormReferences } from "../src/core/legal/judikatur-citations.ts";

const JUDIKATUR_CODE_MAP: Record<string, string> = {
  StGB: "stgb", ABGB: "abgb", ZPO: "zpo", EO: "eo", AHG: "ahg",
  ArbVG: "arbvg", StPO: "stpo", AußStrG: "au-strg", DSG: "dsg",
  AngG: "angg", IO: "io", KSchG: "kschg", MRG: "mrg", EheG: "eheg",
  GmbHG: "gmbhg", UGB: "ugb", ASVG: "asvg", AVG: "avg", GewO: "gewo",
  StVO: "stvo", VStG: "vstg", JGG: "jgg", GOG: "gog",
};

const dir = join(import.meta.dir, "..", "law-corpus", "at-judikatur");
const files = readdirSync(dir).filter(f => f.endsWith(".md"));

const targetSlugs = new Set<string>();
let totalRefs = 0;
let mappable = 0;

for (const f of files) {
  const content = readFileSync(join(dir, f), "utf-8");
  const refs = extractNormReferences(content);
  for (const r of refs) {
    totalRefs++;
    const abbr = JUDIKATUR_CODE_MAP[r.code];
    if (!abbr) continue;
    mappable++;
    targetSlugs.add(`legal/statutes/at/${abbr}/p-${r.ref}`);
  }
}

console.log("Total refs:", totalRefs);
console.log("Mappable:", mappable);
console.log("Unique target slugs:", targetSlugs.size);

const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
const { createEngine } = await import("../src/core/engine-factory.ts");
const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
const { configureGateway } = await import("../src/core/ai/gateway.ts");

const cfg = loadConfig();
if (!cfg) throw new Error("No config");
configureGateway(buildGatewayConfig(cfg));
const engine = await createEngine(toEngineConfig(cfg));
await engine.connect(toEngineConfig(cfg));

let existing = 0;
let missing = 0;
const missingSlugs: string[] = [];
for (const slug of targetSlugs) {
  const rows = await engine.executeRaw("SELECT 1 FROM pages WHERE slug = $1", [slug]) as any[];
  if (rows.length > 0) existing++;
  else {
    missing++;
    if (missingSlugs.length < 15) missingSlugs.push(slug);
  }
}

console.log("Target slugs existing in DB:", existing);
console.log("Target slugs missing:", missing);
console.log("Sample missing:", missingSlugs);

await engine.disconnect();
