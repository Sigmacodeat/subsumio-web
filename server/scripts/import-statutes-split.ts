#!/usr/bin/env bun
/**
 * Import AT/DE/CH statutes from law-corpus/ into the brain — ONE PAGE PER §.
 *
 *   bun run server/scripts/import-statutes-split.ts [--only estg,bao] [--no-embed]
 *                                                   [--db <path>] [--dry-run]
 *
 * Unlike import-statutes.ts (one monolithic page per law — too large to embed),
 * this splits each code into per-§ pages via src/core/legal/split-statute.ts so
 * each paragraph is an independently embeddable, retrievable unit. That is what
 * steuer-subsumption / legal-subsumption need: retrieve the exact §, not the
 * whole code.
 *
 *   slug: legal/statutes/<jur>/<abbr>/<section-id>   e.g. legal/statutes/de/estg/p-15
 *   type: law   (classified by gbrain-legal / gbrain-tax packs)
 *
 * --dry-run prints the section counts without touching a DB (no engine needed).
 * --db <path> targets a throwaway brain instead of the configured ~/.gbrain.
 *
 * HONESTY SCOPE (mirrors /compare): citable statute text with a version stamp.
 * Not legal research à la beck-online (no Kommentare / Rechtsprechungsketten);
 * the brain still never computes legal conclusions — answers cite §§.
 */

import { join } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";

const args = Bun.argv.slice(2);
const NO_EMBED = args.includes("--no-embed");
const DRY = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY =
  onlyIdx !== -1 ? new Set(args[onlyIdx + 1].split(",").map((s) => s.trim().toLowerCase())) : null;
// Also build a jurisdiction-prefixed set (e.g. "de:estg") so --only can
// distinguish AT estg from DE estg. Bare abbr matches all jurisdictions;
// prefixed (jur:abbr) matches only that jurisdiction.
const ONLY_PREFIXED =
  onlyIdx !== -1
    ? new Set(
        args[onlyIdx + 1]
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.includes(":"))
      )
    : null;
const dbIdx = args.indexOf("--db");
const DB_OVERRIDE = dbIdx !== -1 ? args[dbIdx + 1] : null;
// Target source. For the hosted SaaS the statutes live in ONE shared, public
// `law-at`/`law-de` source that every tenant reads (the text is public — no
// per-tenant copy). Omit for the local/host brain (default scope).
const srcIdx = args.indexOf("--source");
const SOURCE_ID = srcIdx !== -1 ? args[srcIdx + 1] : null;

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");

interface StatuteFile {
  file: string; // relative to law-corpus/
  abbr: string; // slug segment, lowercase
  jurisdiction: "at" | "de" | "ch" | "eu";
}

const FILES: StatuteFile[] = [
  // AT
  { file: "at/abgb.md", abbr: "abgb", jurisdiction: "at" },
  { file: "at/ahg.md", abbr: "ahg", jurisdiction: "at" },
  { file: "at/bao.md", abbr: "bao", jurisdiction: "at" },
  { file: "at/eo.md", abbr: "eo", jurisdiction: "at" },
  { file: "at/stgb-at.md", abbr: "stgb", jurisdiction: "at" },
  { file: "at/stpo-at.md", abbr: "stpo", jurisdiction: "at" },
  { file: "at/ugb.md", abbr: "ugb", jurisdiction: "at" },
  { file: "at/zpo-at.md", abbr: "zpo", jurisdiction: "at" },
  // AT — tax (Austrian, NOT the German EStG/UStG)
  { file: "at/estg-at.md", abbr: "estg", jurisdiction: "at" },
  { file: "at/kstg-at.md", abbr: "kstg", jurisdiction: "at" },
  { file: "at/ustg-at.md", abbr: "ustg", jurisdiction: "at" },
  // AT — labour + social insurance
  { file: "at/asvg.md", abbr: "asvg", jurisdiction: "at" },
  { file: "at/arbvg.md", abbr: "arbvg", jurisdiction: "at" },
  { file: "at/angg.md", abbr: "angg", jurisdiction: "at" },
  // AT — consumer + tenancy
  { file: "at/kschg.md", abbr: "kschg", jurisdiction: "at" },
  { file: "at/mrg.md", abbr: "mrg", jurisdiction: "at" },
  // AT — corporate + insolvency
  { file: "at/gmbhg-at.md", abbr: "gmbhg", jurisdiction: "at" },
  { file: "at/aktg-at.md", abbr: "aktg", jurisdiction: "at" },
  { file: "at/io.md", abbr: "io", jurisdiction: "at" },
  // AT — administrative + traffic
  { file: "at/avg.md", abbr: "avg", jurisdiction: "at" },
  { file: "at/stvo-at.md", abbr: "stvo", jurisdiction: "at" },
  // AT — data protection + telecom + IP
  { file: "at/dsg-at.md", abbr: "dsg", jurisdiction: "at" },
  { file: "at/tkg.md", abbr: "tkg", jurisdiction: "at" },
  { file: "at/urhg-at.md", abbr: "urhg", jurisdiction: "at" },
  // AT — construction + housing + environment
  { file: "at/bao.md", abbr: "bao", jurisdiction: "at" },
  { file: "at/weg.md", abbr: "weg", jurisdiction: "at" },
  { file: "at/gebg.md", abbr: "gebg", jurisdiction: "at" },
  // AT — commercial + competition + energy
  { file: "at/gewo-at.md", abbr: "gewo", jurisdiction: "at" },
  { file: "at/kartg.md", abbr: "kartg", jurisdiction: "at" },
  { file: "at/ecg.md", abbr: "ecg", jurisdiction: "at" },
  // AT — financial + legal profession
  { file: "at/rao.md", abbr: "rao", jurisdiction: "at" },
  { file: "at/gog.md", abbr: "gog", jurisdiction: "at" },
  // AT — social + misc
  { file: "at/mschg.md", abbr: "mschg", jurisdiction: "at" },
  { file: "at/au-strg.md", abbr: "au-strg", jurisdiction: "at" },
  // DE
  { file: "de/ao.md", abbr: "ao", jurisdiction: "de" },
  { file: "de/bgb.md", abbr: "bgb", jurisdiction: "de" },
  { file: "de/estg.md", abbr: "estg", jurisdiction: "de" },
  { file: "de/famfg.md", abbr: "famfg", jurisdiction: "de" },
  { file: "de/gg.md", abbr: "gg", jurisdiction: "de" },
  { file: "de/gmbhg.md", abbr: "gmbhg", jurisdiction: "de" },
  { file: "de/hgb.md", abbr: "hgb", jurisdiction: "de" },
  { file: "de/inso.md", abbr: "inso", jurisdiction: "de" },
  { file: "de/stgb.md", abbr: "stgb", jurisdiction: "de" },
  { file: "de/stpo.md", abbr: "stpo", jurisdiction: "de" },
  { file: "de/ustg.md", abbr: "ustg", jurisdiction: "de" },
  { file: "de/uwg.md", abbr: "uwg", jurisdiction: "de" },
  { file: "de/zpo.md", abbr: "zpo", jurisdiction: "de" },
  // DE — additional
  { file: "de/kstg.md", abbr: "kstg", jurisdiction: "de" },
  { file: "de/baugb.md", abbr: "baugb", jurisdiction: "de" },
  { file: "de/bdsg.md", abbr: "bdsg", jurisdiction: "de" },
  { file: "de/betrvg.md", abbr: "betrvg", jurisdiction: "de" },
  { file: "de/gewo.md", abbr: "gewo", jurisdiction: "de" },
  { file: "de/rvg.md", abbr: "rvg", jurisdiction: "de" },
  { file: "de/urhg.md", abbr: "urhg", jurisdiction: "de" },
  { file: "de/vwgo.md", abbr: "vwgo", jurisdiction: "de" },
  { file: "de/zvg.md", abbr: "zvg", jurisdiction: "de" },
  // CH
  { file: "ch/or.md", abbr: "or", jurisdiction: "ch" },
  { file: "ch/zgb.md", abbr: "zgb", jurisdiction: "ch" },
  { file: "ch/stgb.md", abbr: "stgb", jurisdiction: "ch" },
  // EU
  { file: "eu/dsgvo.md", abbr: "dsgvo", jurisdiction: "eu" },
  { file: "eu/dsrl.md", abbr: "dsrl", jurisdiction: "eu" },
  { file: "eu/eprivacy.md", abbr: "eprivacy", jurisdiction: "eu" },
  { file: "eu/romi.md", abbr: "romi", jurisdiction: "eu" },
  { file: "eu/romii.md", abbr: "romii", jurisdiction: "eu" },
  { file: "eu/brusselsibis.md", abbr: "brusselsibis", jurisdiction: "eu" },
  { file: "eu/euco.md", abbr: "euco", jurisdiction: "eu" },
];

function yamlEscape(v: string): string {
  return JSON.stringify(v);
}

/** Build the per-§ page markdown (frontmatter + heading + body). */
function sectionPage(
  sf: StatuteFile,
  meta: {
    abbreviation?: string;
    title?: string;
    version_date?: string;
    source_url?: string;
    license?: string;
  },
  section: { marker: "§" | "Art."; ref: string; title: string; body: string }
): string {
  const abbr = meta.abbreviation || sf.abbr.toUpperCase();
  const head = `${section.marker} ${section.ref} ${abbr}`;
  const heading = section.title ? `${head} — ${section.title}` : head;
  const fm: Record<string, string> = {
    title: heading,
    type: "law",
    jurisdiction: sf.jurisdiction,
    abbreviation: abbr,
    paragraph: section.ref,
    statute: meta.title || abbr,
  };
  if (meta.version_date) fm.version_date = meta.version_date;
  if (meta.source_url) fm.source_url = meta.source_url;
  if (meta.license) fm.license = meta.license;
  const front = `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${yamlEscape(v)}`)
    .join("\n")}\n---\n`;
  return `${front}\n# ${heading}\n\n${section.body}\n`;
}

async function main() {
  const selected = FILES.filter(
    (f) =>
      !ONLY ||
      ONLY.has(f.abbr) ||
      ONLY.has(`${f.jurisdiction}:${f.abbr}`) ||
      ONLY.has(f.file.replace("/", ":"))
  );

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Gesetze-Import (pro § / per-paragraph)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : NO_EMBED ? "import, no-embed" : "import + embed"}`
  );
  console.log("");

  // Lazy-load the engine only when actually importing — keeps --dry-run dependency-free.
  let engine: any = null;
  if (!DRY) {
    const { importFromContent } = await import("../src/core/import-file.ts");
    if (DB_OVERRIDE) {
      // Explicit throwaway / local PGLite brain (verification runs).
      // Configure gateway from env so embeddings work (mirrors cli.ts).
      const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
      const { configureGateway } = await import("../src/core/ai/gateway.ts");
      configureGateway(buildGatewayConfig({} as any));
      const { PGLiteEngine } = await import("../src/core/pglite-engine.ts");
      engine = new PGLiteEngine();
      await engine.connect({ database_path: DB_OVERRIDE });
    } else {
      // Respect the CONFIGURED engine: Postgres in production (DATABASE_URL is
      // set on the Hetzner engine), PGLite for a local file brain. Hardcoding
      // PGLite here meant the per-§ corpus could never reach the Postgres prod
      // brain — statutes would only ever be the unembeddable monolith there.
      const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
      const { createEngine } = await import("../src/core/engine-factory.ts");
      const cfg = loadConfig();
      if (!cfg) {
        throw new Error(
          "No engine configured. Set DATABASE_URL (Postgres) or a PGLite database_path " +
            "in ~/.gbrain/config.json, or pass --db <path> for a throwaway brain."
        );
      }
      // Configure the AI gateway BEFORE engine connect — importFromContent
      // needs embeddings, and the gateway must be configured or it throws
      // "AI gateway is not configured". Mirrors cli.ts#connectEngine.
      const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
      const { configureGateway } = await import("../src/core/ai/gateway.ts");
      configureGateway(buildGatewayConfig(cfg));

      engine = await createEngine(toEngineConfig(cfg));
      await engine.connect(toEngineConfig(cfg));

      // Re-stamp gateway with DB-plane config overrides (same as cli.ts).
      try {
        const { reconfigureGatewayWithEngine } = await import("../src/core/ai/gateway.ts");
        await reconfigureGatewayWithEngine(engine);
      } catch {
        // Non-fatal: pre-v39 brains may not have a usable config table.
      }
    }
    await engine.initSchema();
    // Create source rows so the FK holds under the multi-tenant fail-closed schema.
    // When --source is set explicitly, create that one. Otherwise create all
    // jurisdiction-based sources (law-at, law-de, law-ch, law-eu) since the
    // auto-derived sourceId will reference them.
    const sourceIdsToCreate = SOURCE_ID
      ? [SOURCE_ID]
      : ['law-at', 'law-de', 'law-ch', 'law-eu'];
    for (const sid of sourceIdsToCreate) {
      await engine.executeRaw(
        `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
        [sid]
      );
    }
    // expose for the loop
    (globalThis as any).__importFromContent = importFromContent;
  }

  let totalSections = 0;
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
    const { meta, sections } = splitStatute(raw);
    if (sections.length === 0) {
      console.error(`  ⚠️  ${sf.file}: 0 sections parsed (unexpected format?)`);
      continue;
    }

    if (DRY) {
      console.log(`  ${sf.jurisdiction}/${sf.abbr}: ${sections.length} §-sections`);
      totalSections += sections.length;
      continue;
    }

    const importFromContent = (globalThis as any).__importFromContent;
    // Auto-derive sourceId from jurisdiction when no explicit --source is set.
    // This prevents cross-jurisdiction contamination: AT statutes go to law-at,
    // DE statutes go to law-de, etc.
    const effectiveSourceId = SOURCE_ID ?? `law-${sf.jurisdiction}`;
    let okForLaw = 0;
    let skippedForLaw = 0;
    for (const section of sections) {
      const slug = `legal/statutes/${sf.jurisdiction}/${sf.abbr}/${section.id}`;
      try {
        const result = await importFromContent(engine, slug, sectionPage(sf, meta, section), {
          noEmbed: NO_EMBED,
          sourceId: effectiveSourceId,
        });
        if (result.status === 'imported') {
          okForLaw++;
        } else if (result.status === 'skipped') {
          skippedForLaw++;
        } else {
          totalErrors++;
          console.error(`  ❌ ${slug}: ${result.error || result.status}`);
        }
      } catch (e) {
        totalErrors++;
        console.error(`  ❌ ${slug}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    totalSections += okForLaw;
    console.log(`  ✅ ${sf.jurisdiction}/${sf.abbr}: ${okForLaw}/${sections.length} §-pages${skippedForLaw > 0 ? ` (${skippedForLaw} skipped)` : ''}`);
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `  GESAMT: ${totalSections} §-Seiten${DRY ? " (dry-run)" : " importiert"}, ${totalErrors} Fehler`
  );
  console.log("═══════════════════════════════════════════════════════════");
  if (!DRY && NO_EMBED) {
    console.log(
      "⚠️  Embedding übersprungen. Nachholen: bun run server/scripts/auto-embed-pending.ts"
    );
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
