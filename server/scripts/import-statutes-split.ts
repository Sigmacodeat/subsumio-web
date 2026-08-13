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
import {
  assertLegalSourceJurisdiction,
  LEGAL_SOURCE_BY_JURISDICTION,
} from "../src/core/legal/jurisdiction.ts";
import { legalVersionId } from "../src/core/legal/versioning.ts";
import { isQuarantinedLegalSource } from "../src/core/legal/corpus-policy.ts";

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
const AUTO_AT = args.includes("--auto-at");
const jurIdx = args.indexOf("--jurisdiction");
const JURISDICTION_FILTER = jurIdx !== -1 ? args[jurIdx + 1] : null;
const dbIdx = args.indexOf("--db");
const DB_OVERRIDE = dbIdx !== -1 ? args[dbIdx + 1] : null;
// Target source. Legal reference sources are canonical and cannot be
// overridden: AT material always belongs in law-at, DE in law-de, etc.
// This prevents an operator typo from contaminating a shared source.
const srcIdx = args.indexOf("--source");
const SOURCE_ID = srcIdx !== -1 ? args[srcIdx + 1] : null;

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");

interface StatuteFile {
  file: string; // relative to law-corpus/
  abbr: string; // slug segment, lowercase
  jurisdiction: "at" | "de" | "ch" | "eu";
}

const FILES: StatuteFile[] = [
  // AT — civil + constitutional
  { file: "at/abgb.md", abbr: "abgb", jurisdiction: "at" },
  { file: "at/b-vg.md", abbr: "b-vg", jurisdiction: "at" },
  { file: "at/bvergg.md", abbr: "bvergg", jurisdiction: "at" },
  // AT — criminal + procedure
  { file: "at/stgb-at.md", abbr: "stgb", jurisdiction: "at" },
  { file: "at/stpo-at.md", abbr: "stpo", jurisdiction: "at" },
  { file: "at/jgg-at.md", abbr: "jgg", jurisdiction: "at" },
  // AT — civil procedure + enforcement
  { file: "at/eo.md", abbr: "eo", jurisdiction: "at" },
  { file: "at/zpo-at.md", abbr: "zpo", jurisdiction: "at" },
  { file: "at/au-strg.md", abbr: "au-strg", jurisdiction: "at" },
  { file: "at/jn.md", abbr: "jn", jurisdiction: "at" },
  // AT — tax
  { file: "at/estg-at.md", abbr: "estg", jurisdiction: "at" },
  { file: "at/kstg-at.md", abbr: "kstg", jurisdiction: "at" },
  { file: "at/ustg-at.md", abbr: "ustg", jurisdiction: "at" },
  { file: "at/bao.md", abbr: "bao", jurisdiction: "at" },
  { file: "at/bewg.md", abbr: "bewg", jurisdiction: "at" },
  // AT — corporate + commercial
  { file: "at/ugb.md", abbr: "ugb", jurisdiction: "at" },
  { file: "at/gmbhg-at.md", abbr: "gmbhg", jurisdiction: "at" },
  { file: "at/aktg-at.md", abbr: "aktg", jurisdiction: "at" },
  { file: "at/io.md", abbr: "io", jurisdiction: "at" },
  { file: "at/gewo-at.md", abbr: "gewo", jurisdiction: "at" },
  { file: "at/gwg.md", abbr: "gwg", jurisdiction: "at" },
  { file: "at/kartg.md", abbr: "kartg", jurisdiction: "at" },
  // AT — labour + social
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
  // AT — consumer + tenancy + housing
  { file: "at/kschg.md", abbr: "kschg", jurisdiction: "at" },
  { file: "at/mrg.md", abbr: "mrg", jurisdiction: "at" },
  { file: "at/weg.md", abbr: "weg", jurisdiction: "at" },
  { file: "at/gebg.md", abbr: "gebg", jurisdiction: "at" },
  { file: "at/grstg.md", abbr: "grstg", jurisdiction: "at" },
  { file: "at/gukg.md", abbr: "gukg", jurisdiction: "at" },
  // AT — administrative + traffic + security
  { file: "at/avg.md", abbr: "avg", jurisdiction: "at" },
  { file: "at/stvo-at.md", abbr: "stvo", jurisdiction: "at" },
  { file: "at/spg.md", abbr: "spg", jurisdiction: "at" },
  { file: "at/asylg.md", abbr: "asylg", jurisdiction: "at" },
  { file: "at/aufenthg.md", abbr: "aufenthg", jurisdiction: "at" },
  { file: "at/auslbg.md", abbr: "auslbg", jurisdiction: "at" },
  { file: "at/waffg.md", abbr: "waffg", jurisdiction: "at" },
  { file: "at/awg.md", abbr: "awg", jurisdiction: "at" },
  // AT — data protection + telecom + IP
  { file: "at/dsg-at.md", abbr: "dsg", jurisdiction: "at" },
  { file: "at/tkg.md", abbr: "tkg", jurisdiction: "at" },
  { file: "at/urhg-at.md", abbr: "urhg", jurisdiction: "at" },
  { file: "at/patg.md", abbr: "patg", jurisdiction: "at" },
  { file: "at/medieng.md", abbr: "medieng", jurisdiction: "at" },
  // AT — health + food + chemicals
  { file: "at/amg.md", abbr: "amg", jurisdiction: "at" },
  { file: "at/smg.md", abbr: "smg", jurisdiction: "at" },
  { file: "at/chemg.md", abbr: "chemg", jurisdiction: "at" },
  // AT — energy + environment + forestry
  { file: "at/eiwog.md", abbr: "eiwog", jurisdiction: "at" },
  { file: "at/forstg.md", abbr: "forstg", jurisdiction: "at" },
  { file: "at/epig.md", abbr: "epig", jurisdiction: "at" },
  // AT — financial + legal profession + government
  { file: "at/rao.md", abbr: "rao", jurisdiction: "at" },
  { file: "at/gog.md", abbr: "gog", jurisdiction: "at" },
  { file: "at/bdg.md", abbr: "bdg", jurisdiction: "at" },
  { file: "at/e-govg.md", abbr: "e-govg", jurisdiction: "at" },
  // AT — misc + small laws
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

  // DE — core
  { file: "de/bgb.md", abbr: "bgb", jurisdiction: "de" },
  { file: "de/stgb.md", abbr: "stgb", jurisdiction: "de" },
  { file: "de/stpo.md", abbr: "stpo", jurisdiction: "de" },
  { file: "de/zpo.md", abbr: "zpo", jurisdiction: "de" },
  { file: "de/hgb.md", abbr: "hgb", jurisdiction: "de" },
  { file: "de/gg.md", abbr: "gg", jurisdiction: "de" },
  // DE — tax
  { file: "de/ao.md", abbr: "ao", jurisdiction: "de" },
  { file: "de/estg.md", abbr: "estg", jurisdiction: "de" },
  { file: "de/ustg.md", abbr: "ustg", jurisdiction: "de" },
  { file: "de/kstg.md", abbr: "kstg", jurisdiction: "de" },
  { file: "de/gewstg.md", abbr: "gewstg", jurisdiction: "de" },
  { file: "de/erbstg.md", abbr: "erbstg", jurisdiction: "de" },
  { file: "de/bewg.md", abbr: "bewg", jurisdiction: "de" },
  { file: "de/grestg.md", abbr: "grestg", jurisdiction: "de" },
  { file: "de/lstdv.md", abbr: "lstdv", jurisdiction: "de" },
  { file: "de/rvg.md", abbr: "rvg", jurisdiction: "de" },
  { file: "de/stberg.md", abbr: "stberg", jurisdiction: "de" },
  { file: "de/stbvv.md", abbr: "stbvv", jurisdiction: "de" },
  // DE — corporate + commercial
  { file: "de/gmbhg.md", abbr: "gmbhg", jurisdiction: "de" },
  { file: "de/inso.md", abbr: "inso", jurisdiction: "de" },
  { file: "de/uwg.md", abbr: "uwg", jurisdiction: "de" },
  // DE — administrative + regulatory
  { file: "de/baugb.md", abbr: "baugb", jurisdiction: "de" },
  { file: "de/bdsg.md", abbr: "bdsg", jurisdiction: "de" },
  { file: "de/betrvg.md", abbr: "betrvg", jurisdiction: "de" },
  { file: "de/gewo.md", abbr: "gewo", jurisdiction: "de" },
  { file: "de/vwgo.md", abbr: "vwgo", jurisdiction: "de" },
  { file: "de/zvg.md", abbr: "zvg", jurisdiction: "de" },
  // DE — IP + family
  { file: "de/urhg.md", abbr: "urhg", jurisdiction: "de" },
  { file: "de/famfg.md", abbr: "famfg", jurisdiction: "de" },
  // DE — index
  { file: "de/ao-index.md", abbr: "ao-index", jurisdiction: "de" },

  // CH — core
  { file: "ch/or.md", abbr: "or", jurisdiction: "ch" },
  { file: "ch/zgb.md", abbr: "zgb", jurisdiction: "ch" },
  { file: "ch/stgb.md", abbr: "stgb", jurisdiction: "ch" },
  { file: "ch/stpo.md", abbr: "stpo", jurisdiction: "ch" },
  { file: "ch/zpo.md", abbr: "zpo", jurisdiction: "ch" },
  // CH — additional
  { file: "ch/bgfa.md", abbr: "bgfa", jurisdiction: "ch" },
  { file: "ch/bvg.md", abbr: "bvg", jurisdiction: "ch" },
  { file: "ch/dsg.md", abbr: "dsg", jurisdiction: "ch" },
  { file: "ch/schkg.md", abbr: "schkg", jurisdiction: "ch" },
  { file: "ch/uwg.md", abbr: "uwg", jurisdiction: "ch" },
  { file: "ch/vwvg.md", abbr: "vwvg", jurisdiction: "ch" },

  // EU
  { file: "eu/dsgvo.md", abbr: "dsgvo", jurisdiction: "eu" },
  { file: "eu/dsrl.md", abbr: "dsrl", jurisdiction: "eu" },
  { file: "eu/eprivacy.md", abbr: "eprivacy", jurisdiction: "eu" },
  { file: "eu/romi.md", abbr: "romi", jurisdiction: "eu" },
  { file: "eu/romii.md", abbr: "romii", jurisdiction: "eu" },
  { file: "eu/brusselsibis.md", abbr: "brusselsibis", jurisdiction: "eu" },
  { file: "eu/euco.md", abbr: "euco", jurisdiction: "eu" },
];

// ── Dynamic AT discovery ──────────────────────────────────────────────
// When --auto-at is passed, scan the at/ corpus directory for all .md files
// not already in the hardcoded FILES list. This picks up the hundreds of
// Verordnungen and smaller Gesetze fetched from RIS.
if (AUTO_AT) {
  const atDir = join(CORPUS, "at");
  let discovered = 0;
  try {
    const entries = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: atDir }));
    const existing = new Set(FILES.filter((f) => f.jurisdiction === "at").map((f) => f.file));
    for (const file of entries.sort()) {
      const rel = `at/${file}`;
      if (existing.has(rel)) continue;
      // Derive abbr from filename (without .md), normalized to lowercase
      const abbr = file.replace(/\.md$/, "").toLowerCase();
      FILES.push({ file: rel, abbr, jurisdiction: "at" });
      discovered++;
    }
    console.log(`[auto-at] Discovered ${discovered} additional AT statute files.`);
  } catch (e) {
    console.warn(`[auto-at] Could not scan ${atDir}: ${e}`);
  }
}

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
  if (meta.version_date) {
    fm.version_date = meta.version_date;
    fm.legal_version_id = legalVersionId(sf.jurisdiction, sf.abbr, meta.version_date);
  }
  if (meta.source_url) fm.source_url = meta.source_url;
  if (meta.license) fm.license = meta.license;
  const front = `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${yamlEscape(v)}`)
    .join("\n")}\n---\n`;
  return `${front}\n# ${heading}\n\n${section.body}\n`;
}

function versionedSectionSlug(slug: string, versionDate: string): string {
  return `${slug}--v-${versionDate}`;
}

async function preservePreviousVersion(
  engine: any,
  importFromContent: any,
  slug: string,
  sourceId: string,
  currentVersionId: string,
  noEmbed: boolean
): Promise<void> {
  const previous = await engine.getPage(slug, { sourceId });
  if (!previous) return;
  const previousVersionId =
    typeof previous.frontmatter?.legal_version_id === "string"
      ? previous.frontmatter.legal_version_id
      : "";
  if (!previousVersionId || previousVersionId === currentVersionId) return;
  const previousDate = previousVersionId.split(":").at(-1);
  if (!previousDate || !/^\d{4}-\d{2}-\d{2}$/.test(previousDate)) {
    console.warn(`  ⚠️  ${slug}: existing version has no valid legal_version_id; archive skipped`);
    return;
  }

  const archiveSlug = versionedSectionSlug(slug, previousDate);
  const archiveFrontmatter = {
    ...(previous.frontmatter ?? {}),
    type: "law",
    legal_version_id: previousVersionId,
    version_date: previousDate,
    archived_version: true,
  };
  const archiveMarkdown = `---\n${Object.entries(archiveFrontmatter)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n\n${previous.compiled_truth}\n`;
  await importFromContent(engine, archiveSlug, archiveMarkdown, {
    noEmbed,
    sourceId,
  });
}

async function main() {
  const requested = FILES.filter(
    (f) =>
      (!JURISDICTION_FILTER || f.jurisdiction === JURISDICTION_FILTER) &&
      (!ONLY ||
        ONLY.has(f.abbr) ||
        ONLY.has(`${f.jurisdiction}:${f.abbr}`) ||
        ONLY.has(f.file.replace("/", ":")))
  );
  const selected = requested.filter((file) => !isQuarantinedLegalSource(file.file));
  const skippedQuarantine = requested.length - selected.length;

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Gesetze-Import (pro § / per-paragraph)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : NO_EMBED ? "import, no-embed" : "import + embed"}`
  );
  console.log("");
  if (skippedQuarantine > 0) {
    console.log(
      `Quarantäne: ${skippedQuarantine} nicht-kanonische Quellen vom Import ausgeschlossen.`
    );
  }

  // Preflight the complete batch before opening the database or writing a
  // single source/version row. This makes corpus quality failures atomic:
  // an incomplete statute can no longer leave a half-imported batch behind.
  const prepared: Array<{
    sf: StatuteFile;
    meta: {
      abbreviation?: string;
      title?: string;
      version_date?: string;
      source_url?: string;
      license?: string;
    };
    sections: Array<{ id: string; marker: "§" | "Art."; ref: string; title: string; body: string }>;
  }> = [];
  const preflightErrors: string[] = [];
  for (const sf of selected) {
    const path = join(CORPUS, sf.file);
    let raw: string;
    try {
      raw = await Bun.file(path).text();
    } catch {
      preflightErrors.push(`${sf.file}: not found`);
      continue;
    }
    try {
      const { meta, sections } = splitStatute(raw);
      const effectiveSourceId = SOURCE_ID ?? `law-${sf.jurisdiction}`;
      assertLegalSourceJurisdiction(sf.jurisdiction, effectiveSourceId);
      if (!meta.version_date || !/^\d{4}-\d{2}-\d{2}$/.test(meta.version_date)) {
        preflightErrors.push(`${sf.file}: missing or invalid version_date (expected YYYY-MM-DD)`);
      }
      if (!meta.source_url || !/^https?:\/\//.test(meta.source_url)) {
        preflightErrors.push(`${sf.file}: missing or invalid source_url`);
      }
      if (sections.length === 0) {
        // Fallback for small Verordnungen / Gesetze with <10 inline § markers:
        // import the entire document as a single page so it's still searchable.
        const bodyStart = raw.indexOf("\n---", 3);
        const afterFm = bodyStart === -1 ? raw : raw.slice(raw.indexOf("\n", bodyStart + 1) + 1);
        sections.push({
          id: "full",
          marker: "§" as const,
          ref: "full",
          title: meta.title || sf.abbr,
          body: afterFm.trim(),
        });
      }
      prepared.push({ sf, meta, sections });
    } catch (error) {
      preflightErrors.push(`${sf.file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (preflightErrors.length > 0) {
    console.error(`[legal-import-preflight] FAILED (${preflightErrors.length} errors)`);
    for (const error of preflightErrors) console.error(`  ❌ ${error}`);
    process.exit(1);
  }

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
    const sourceIdsToCreate = SOURCE_ID ? [SOURCE_ID] : Object.values(LEGAL_SOURCE_BY_JURISDICTION);
    for (const sid of sourceIdsToCreate) {
      const jurisdiction = Object.entries(LEGAL_SOURCE_BY_JURISDICTION).find(
        ([, id]) => id === sid
      )?.[0];
      await engine.executeRaw(
        `INSERT INTO sources (id, name, jurisdiction, config)
         VALUES ($1, $1, $2::text, jsonb_build_object('federated', true, 'legal_reference', true, 'jurisdiction', $2::text))
         ON CONFLICT (id) DO UPDATE SET
           config = sources.config || EXCLUDED.config,
           jurisdiction = COALESCE(sources.jurisdiction, EXCLUDED.jurisdiction)`,
        [sid, jurisdiction ?? null]
      );
    }
    // expose for the loop
    (globalThis as any).__importFromContent = importFromContent;
  }

  let totalSections = 0;
  let totalErrors = 0;

  for (const { sf, meta, sections } of prepared) {
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
    assertLegalSourceJurisdiction(sf.jurisdiction, effectiveSourceId);
    const versionDate = meta.version_date!; // guaranteed by the batch preflight above
    const versionId = legalVersionId(sf.jurisdiction, sf.abbr, versionDate);
    await engine.executeRaw(
      `INSERT INTO legal_source_versions
         (id, source_id, jurisdiction, statute_abbr, version_date, source_url, valid_from)
       VALUES ($1, $2, $3, $4, $5::date, $6, $5::date)
       ON CONFLICT (source_id, statute_abbr, version_date) DO UPDATE SET
         source_url = EXCLUDED.source_url,
         retrieved_at = now(),
         status = 'current',
         valid_to = NULL`,
      [versionId, effectiveSourceId, sf.jurisdiction, sf.abbr, versionDate, meta.source_url ?? null]
    );
    await engine.executeRaw(
      `UPDATE legal_source_versions
          SET valid_to = ($1::date - 1), status = 'superseded'
        WHERE source_id = $2 AND statute_abbr = $3
          AND version_date < $1::date AND valid_to IS NULL AND id <> $4`,
      [versionDate, effectiveSourceId, sf.abbr, versionId]
    );
    let okForLaw = 0;
    let skippedForLaw = 0;
    for (const section of sections) {
      const slug = `legal/statutes/${sf.jurisdiction}/${sf.abbr}/${section.id}`;
      assertLegalSourceJurisdiction(sf.jurisdiction, effectiveSourceId, slug);
      try {
        // Skip preservePreviousVersion for initial bulk import — each
        // getPage() round-trip over SSH is ~50ms; 13k sections = 10+ min
        // of pure latency. Re-enable for versioned re-imports.
        if (!NO_EMBED) {
          await preservePreviousVersion(
            engine,
            importFromContent,
            slug,
            effectiveSourceId,
            versionId,
            NO_EMBED
          );
        }
        const result = await importFromContent(engine, slug, sectionPage(sf, meta, section), {
          noEmbed: NO_EMBED,
          sourceId: effectiveSourceId,
          skipContentDuplicates: true,
        });
        if (result.status === "imported") {
          okForLaw++;
        } else if (result.status === "skipped") {
          skippedForLaw++;
        } else {
          totalErrors++;
          console.error(`  ❌ ${slug}: ${result.error || result.status}`);
        }
      } catch (e) {
        totalErrors++;
        console.error(`  ❌ ${slug}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if ((okForLaw + skippedForLaw) % 100 === 0) {
        console.log(`    ... ${sf.abbr}: ${okForLaw + skippedForLaw}/${sections.length}`);
      }
    }
    totalSections += okForLaw;
    console.log(
      `  ✅ ${sf.jurisdiction}/${sf.abbr}: ${okForLaw}/${sections.length} §-pages${skippedForLaw > 0 ? ` (${skippedForLaw} skipped)` : ""}`
    );
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    `  GESAMT: ${totalSections} §-Seiten${DRY ? " (dry-run)" : " importiert"}, ${totalErrors} Fehler`
  );
  console.log("═══════════════════════════════════════════════════════════");
  if (!DRY && NO_EMBED) {
    console.log("⚠️  Embedding übersprungen. Nachholen: bun run server/scripts/auto-embed-pg.ts");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
