import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { extractAllNormReferences } from "../src/core/legal/judikatur-citations.ts";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";

const JUDIKATUR_CODE_MAP: Record<string, string> = {
  StGB: "stgb", ABGB: "abgb", ZPO: "zpo", EO: "eo", AHG: "ahg",
  ArbVG: "arbvg", StPO: "stpo", AußStrG: "au-strg", DSG: "dsg",
  AngG: "angg", IO: "io", KSchG: "kschg", MRG: "mrg", EheG: "eheg",
  GmbHG: "gmbhg", UGB: "ugb", ASVG: "asvg", AVG: "avg", GewO: "gewo",
  StVO: "stvo", VStG: "vstg", JGG: "jgg", GOG: "gog",
};

const DIR = join(import.meta.dir, "..", "law-corpus", "at-judikatur");

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No config");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  const files = readdirSync(DIR).filter(f => f.endsWith(".md")).slice(0, 100);
  const unmappedCodes = new Map<string, number>();
  const mappedButMissing: Array<{ code: string; ref: string; slug: string }> = [];
  const found: Array<{ code: string; ref: string; slug: string }> = [];

  // Collect all norm refs
  const allRefs: Array<{ code: string; ref: string }> = [];
  for (const f of files) {
    const content = readFileSync(join(DIR, f), "utf-8");
    const refs = extractAllNormReferences(content);
    allRefs.push(...refs);
  }

  // Check each ref
  for (const r of allRefs) {
    const abbr = JUDIKATUR_CODE_MAP[r.code];
    if (!abbr) {
      unmappedCodes.set(r.code, (unmappedCodes.get(r.code) ?? 0) + 1);
      continue;
    }
    const slug = `legal/statutes/at/${abbr}/p-${r.ref}`;
    const rows = (await engine.executeRaw(
      `SELECT id FROM pages WHERE slug = $1 AND source_id = 'law-at'`, [slug]
    )) as any[];
    if (rows.length > 0) {
      found.push({ code: r.code, ref: r.ref, slug });
    } else {
      mappedButMissing.push({ code: r.code, ref: r.ref, slug });
    }
  }

  console.log(`Total norm refs (100 files): ${allRefs.length}`);
  console.log(`Found in DB: ${found.length}`);
  console.log(`Mapped but slug missing: ${mappedButMissing.length}`);
  console.log(`Unmapped codes: ${unmappedCodes.size}`);

  console.log("\n=== Unmapped codes (need to add to JUDIKATUR_CODE_MAP) ===");
  for (const [code, cnt] of [...unmappedCodes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code}: ${cnt}x`);
  }

  console.log("\n=== Mapped but slug missing (first 20) ===");
  for (const m of mappedButMissing.slice(0, 20)) {
    console.log(`  ${m.code} §${m.ref} → ${m.slug}`);
  }

  console.log("\n=== Found (first 10) ===");
  for (const f of found.slice(0, 10)) {
    console.log(`  ${f.code} §${f.ref} → ${f.slug}`);
  }

  await engine.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
