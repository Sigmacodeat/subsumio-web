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
import { readdirSync, readFileSync } from "fs";
import { splitStatute } from "../src/core/legal/split-statute.ts";
import { extractCitations, extractCrossCodeCitations } from "../src/core/legal/citation-graph.ts";
import { createProgress } from "../src/core/progress.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY: Set<string> | null =
  onlyIdx >= 0 && args[onlyIdx + 1] ? new Set(args[onlyIdx + 1].split(",")) : null;

/** Abbreviations deliberately excluded from KNOWN_ABBRS because they collide
 *  between two different statutes we hold, making cross-code citation
 *  resolution ambiguous. Fail-closed: a missed cross-reference costs
 *  nothing; a wrong one would be a hallucinated citation.
 *
 *  MSchG — Markenschutzgesetz vs Mutterschutzgesetz
 *  NAG   — Niederlassungsverordnung vs Aufenthaltsgesetz (informally "NAG")
 *  KAG   — Körperschaftsabgabengesetz vs Krankenanstaltengesetz
 *  VVG   — Versicherungsaufsichtsgesetz vs Versicherungsvertragsgesetz */
const EXCLUDE_ABBRS = new Set(["MSchG", "NAG", "KAG", "VVG"]);

/** Generic frontmatter `abbreviation` values that are NOT statute
 *  abbreviations — they're the first word of the title or a category
 *  label. Filtering these prevents non-statute files from polluting
 *  the citation graph. */
const GENERIC_ABBR_VALUES = new Set([
  "ADR", "Abkommen", "Akademischer", "Akkreditierung", "Allgemeine",
  "ADN", "Abgabe", "Abschluss", "Abkürzung", "Abschaffung",
  "Abfallnachweisverordnung", "Agrarstrukturstatistik-Verordnung",
  "Abgeltung", "Aliquotierungsverordnung", "Alkoholsteuergesetz",
  "Akkreditierungszeichenverordnung", "Akkreditierungsgesetz",
  "Akkreditierungsversicherungsverordnung", "Aerosolpackungsverordnung",
  "Abfallbehandlungspflichten", "Abfallbehandlungspflichtenverordnung",
  "Abfallverbrennungsverordnung", "Abfallverzeichnisverordnung",
  "Abfallwirtschaftsgesetz", "Abgeltungsv", "Abgrenzungsverordnung",
  "Adressregisterverordnung", "ADV-Form-Verordnung",
  "Aerosolpackungslagerungsverordnung",
]);

/** RIS-printed abbreviation → our slug abbr, for CROSS-code citations
 *  ("§ 29 IO" cited from inside ABGB). Deliberately conservative: only codes
 *  whose RIS abbreviation is unambiguous are listed. Several real AT codes
 *  are omitted on purpose because their common abbreviation collides between
 *  two different statutes we hold (e.g. "MSchG" is used for BOTH the
 *  Markenschutzgesetz and — informally — Mutterschutzgesetz citations in the
 *  wild) or because the abbreviation is uncertain (NAG vs "AufenthG", KAG,
 *  VVG). Fail-closed: a missed cross-reference costs nothing; a wrong one
 *  would be a hallucinated citation, which is the one thing this whole
 *  citation-graph effort exists to prevent.
 *
 *  This base map is extended at runtime by generateAtFilesAndAbbrs() which
 *  scans law-corpus/at/ frontmatter and adds any new valid abbreviations. */
const KNOWN_ABBRS_BASE: Record<string, string> = {
  ABGB: "abgb",
  "B-VG": "b-vg",
  BVergG: "bvergg",
  StGB: "stgb",
  StPO: "stpo",
  JGG: "jgg",
  EO: "eo",
  ZPO: "zpo",
  AußStrG: "au-strg",
  EStG: "estg",
  KStG: "kstg",
  UStG: "ustg",
  BAO: "bao",
  UGB: "ugb",
  GmbHG: "gmbhg",
  AktG: "aktg",
  IO: "io",
  GewO: "gewo",
  KartG: "kartg",
  ASVG: "asvg",
  ArbVG: "arbvg",
  AngG: "angg",
  AZG: "azg",
  AVRAG: "avrag",
  BUAG: "buag",
  AlVG: "alvg",
  KSchG: "kschg",
  MRG: "mrg",
  WEG: "weg",
  GebG: "gebg",
  GuKG: "gukg",
  AVG: "avg",
  StVO: "stvo",
  SPG: "spg",
  AsylG: "asylg",
  AuslBG: "auslbg",
  WaffG: "waffg",
  AWG: "awg",
  DSG: "dsg",
  TKG: "tkg",
  UrhG: "urhg",
  PatG: "patg",
  MedienG: "medieng",
  AMG: "amg",
  SMG: "smg",
  ChemG: "chemg",
  ForstG: "forstg",
  EpiG: "epig",
  RAO: "rao",
  GOG: "gog",
  BDG: "bdg",
  AHG: "ahg",
  ECG: "ecg",
  EheG: "eheg",
  FPG: "fpg",
  GlBG: "glbg",
  PStG: "pstg",
  StRegG: "stregg",
  TSchG: "tschg",
  VStG: "vstg",
  WRG: "wrg",
  ZustG: "zustg",
  // Extended — codes from the expanded corpus that are unambiguous
  BewG: "bewg",
  GWG: "gwg",
  BBG: "bbg",
  ARG: "arg",
  BRAG: "brag",
  JN: "jn",
  "N-G": "n-g",
  StBG: "stbg",
  TilgG: "tilgg",
  VBVG: "vbvg",
  VKGG: "vkgg",
  GRestG: "grstg",
  "E-GovG": "e-govg",
  Eiwog: "eiwog",
  ALVG: "alvg",
  BVerGG: "bvergg",
  AufenthG: "aufenthg",
  GlbG: "glbg",
  StbG: "stbg",
  UWG: "uwg",
  VKgG: "vkgg",
};

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");

interface StatuteFile {
  file: string;
  abbr: string;
  jurisdiction: "at" | "de" | "ch";
}

/** Parse YAML frontmatter from a markdown file and extract the `abbreviation` field.
 *  Returns null if the file has no frontmatter or no abbreviation field. */
function parseFrontmatterAbbr(filePath: string): string | null {
  const content = readFileSync(filePath, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];
  const abbrMatch = fm.match(/^abbreviation:\s*"?([^"\n]+)"?/m);
  if (!abbrMatch) return null;
  return abbrMatch[1].trim();
}

/** Validate that a frontmatter abbreviation looks like a real statute
 *  abbreviation rather than a generic word or number.
 *
 *  Rules (fail-closed):
 *  - Must be >= 2 characters
 *  - Must not be a pure number
 *  - Must start with an uppercase letter
 *  - Must contain >= 2 uppercase letters OR contain a hyphen (B-VG, E-GovG)
 *  - Must not be in GENERIC_ABBR_VALUES
 *  - Must not be in EXCLUDE_ABBRS (collision list)
 *  - Must be <= 20 characters */
function isValidStatuteAbbr(abbr: string): boolean {
  if (abbr.length < 2 || abbr.length > 20) return false;
  if (/^\d+$/.test(abbr)) return false;
  if (!/^[A-ZÄÖÜ]/.test(abbr)) return false;
  const upperCount = (abbr.match(/[A-ZÄÖÜ]/g) || []).length;
  if (upperCount < 2 && !abbr.includes("-")) return false;
  if (GENERIC_ABBR_VALUES.has(abbr)) return false;
  if (EXCLUDE_ABBRS.has(abbr)) return false;
  return true;
}

/** Derive the slug abbreviation from a filename.
 *  Rule: filename without `.md`, strip `-at` suffix unless there's a
 *  duplicate file without the suffix (e.g. mschg.md + mschg-at.md ->
 *  keep both slugs distinct). */
function deriveSlugFromFilename(filename: string, allBases: Set<string>): string {
  const base = filename.replace(/\.md$/, "");
  if (base.endsWith("-at")) {
    const withoutSuffix = base.slice(0, -3);
    if (!allBases.has(withoutSuffix)) {
      return withoutSuffix;
    }
  }
  return base;
}

/** Generate the FILES list dynamically by scanning law-corpus/at/ frontmatter.
 *  Applies fail-closed abbreviation validation: only files with valid
 *  statute abbreviations are included.
 *
 *  Also returns the RIS abbreviation -> slug mapping for KNOWN_ABBRS. */
function generateAtFilesAndAbbrs(): {
  files: StatuteFile[];
  abbrs: Record<string, string>;
} {
  const atDir = join(CORPUS, "at");
  const allFiles = readdirSync(atDir).filter(
    (f) => f.endsWith(".md") && !f.includes("/")
  );
  const allBases = new Set(allFiles.map((f) => f.replace(/\.md$/, "")));

  // ALL .md files go into FILES — within-statute edge extraction doesn't
  // need an abbreviation, only the slug (from filename). This includes
  // treaties, regulations, and other non-statute documents that may still
  // have §-structure worth graphing.
  const files: StatuteFile[] = [];
  const abbrs: Record<string, string> = { ...KNOWN_ABBRS_BASE };
  let abbrAccepted = 0;
  let abbrSkipped = 0;

  // Track abbreviation → slug mappings to detect collisions (same abbreviation
  // in multiple files). If an abbreviation maps to >1 distinct slug, it's
  // ambiguous and must be excluded from KNOWN_ABBRS (fail-closed).
  const abbrToSlugs = new Map<string, Set<string>>();

  for (const filename of allFiles) {
    const filePath = join(atDir, filename);
    const slug = deriveSlugFromFilename(filename, allBases);
    files.push({ file: `at/${filename}`, abbr: slug, jurisdiction: "at" as const });

    const risAbbr = parseFrontmatterAbbr(filePath);
    if (!risAbbr) {
      abbrSkipped++;
      continue;
    }

    // Strip -AT suffix (e.g. "StGB-AT" → "StGB") for cross-code citation
    const canonicalRis = risAbbr.replace(/-AT$/, "");

    // Track all slug mappings for collision detection
    if (!abbrToSlugs.has(canonicalRis)) {
      abbrToSlugs.set(canonicalRis, new Set());
    }
    abbrToSlugs.get(canonicalRis)!.add(slug);
  }

  // Build KNOWN_ABBRS: only add abbreviations that are
  // 1. Valid statute abbreviations (not generic words/numbers)
  // 2. Not in the EXCLUDE_ABBRS collision list
  // 3. Not ambiguous (maps to exactly 1 slug)
  for (const [ris, slugs] of abbrToSlugs) {
    if (EXCLUDE_ABBRS.has(ris)) {
      abbrSkipped++;
      continue;
    }
    if (slugs.size > 1) {
      // Ambiguous: same abbreviation maps to multiple statutes
      abbrSkipped++;
      continue;
    }
    if (!isValidStatuteAbbr(ris)) {
      abbrSkipped++;
      continue;
    }
    const slug = [...slugs][0];
    if (!abbrs[ris]) {
      abbrs[ris] = slug;
      abbrAccepted++;
    }
  }

  console.log(`  Frontmatter-Scan: ${files.length} Dateien, ${abbrAccepted} Abkuerzungen akzeptiert, ${abbrSkipped} uebersprungen (fail-closed)`);
  return { files, abbrs };
}

async function main() {
  // Generate FILES list and KNOWN_ABBRS dynamically from frontmatter
  const { files: FILES, abbrs: KNOWN_ABBRS } = generateAtFilesAndAbbrs();

  const selected = FILES.filter(
    (f) => !ONLY || ONLY.has(f.abbr) || ONLY.has(`${f.jurisdiction}:${f.abbr}`)
  );

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — §-Zitiergraph-Import (link_source: citation-graph)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY ? "DRY-RUN (kein DB-Write)" : "import"}`);
  console.log(`Statuten: ${FILES.length} gesamt, ${selected.length} ausgewaehlt`);
  console.log(`KNOWN_ABBRS: ${Object.keys(KNOWN_ABBRS).length} Eintraege`);
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

  const progress = createProgress({ mode: "auto" });
  progress.start("parse-statutes", FILES.length);

  // Pass 1: parse every statute once. Cross-code validation needs the TARGET
  // statute's real § inventory (not just its abbreviation being recognized),
  // so all statutes must be loaded before any cross-code edge is emitted.
  const parsed = new Map<
    string,
    { sf: StatuteFile; sections: ReturnType<typeof splitStatute>["sections"] }
  >();
  const zeroSection = new Set<string>();
  for (const sf of FILES) {
    const path = join(CORPUS, sf.file);
    let raw: string;
    try {
      raw = await Bun.file(path).text();
    } catch {
      progress.tick(1, `skip ${sf.abbr}`);
      continue;
    }
    const { sections } = splitStatute(raw);
    if (sections.length > 0) parsed.set(sf.abbr, { sf, sections });
    else zeroSection.add(sf.abbr);
    progress.tick(1, `${sf.abbr} (${sections.length})`);
  }
  progress.finish(`${parsed.size} parsed, ${zeroSection.size} no-sections`);

  const refsByAbbr = new Map<string, Set<string>>();
  for (const [abbr, { sections }] of parsed) {
    refsByAbbr.set(abbr, new Set(sections.map((s) => s.ref)));
  }

  let totalWithinEdges = 0;
  let totalCrossEdges = 0;
  let totalWritten = 0;
  let totalErrors = 0;
  let totalNoSections = 0;

  progress.start("import-edges", selected.length);

  for (const sf of selected) {
    const entry = parsed.get(sf.abbr);
    if (!entry) {
      if (zeroSection.has(sf.abbr)) {
        totalNoSections++;
      } else {
        totalErrors++;
      }
      progress.tick(1, `skip ${sf.abbr}`);
      continue;
    }
    const { sections } = entry;
    const withinEdges = extractCitations(sections);
    const crossEdgesRaw = extractCrossCodeCitations(sections, sf.abbr, KNOWN_ABBRS);
    // Validate cross-code targets against the OTHER statute's real § inventory.
    const crossEdges = crossEdgesRaw.filter((e) => refsByAbbr.get(e.toAbbr)?.has(e.toRef));
    totalWithinEdges += withinEdges.length;
    totalCrossEdges += crossEdges.length;

    if (DRY) {
      progress.tick(1, `${sf.abbr}: ${withinEdges.length}+${crossEdges.length}`);
      continue;
    }

    const sourceId = `law-${sf.jurisdiction}`;
    const ownPrefix = `legal/statutes/${sf.jurisdiction}/${sf.abbr}/p-`;
    const links = [
      ...withinEdges.map((e) => ({
        from_slug: `${ownPrefix}${e.fromRef}`,
        to_slug: `${ownPrefix}${e.toRef}`,
        link_type: "cites",
        context: e.context,
        link_source: "citation-graph",
        from_source_id: sourceId,
        to_source_id: sourceId,
      })),
      ...crossEdges.map((e) => ({
        from_slug: `${ownPrefix}${e.fromRef}`,
        to_slug: `legal/statutes/${sf.jurisdiction}/${e.toAbbr}/p-${e.toRef}`,
        link_type: "cites",
        context: e.context,
        link_source: "citation-graph",
        from_source_id: sourceId,
        to_source_id: sourceId,
      })),
    ];

    try {
      const written = links.length > 0 ? await addLinksBatch!(links) : 0;
      totalWritten += written;
      progress.tick(1, `${sf.abbr}: ${written}/${links.length}`);
    } catch (e) {
      totalErrors++;
      progress.tick(1, `ERR ${sf.abbr}`);
      console.error(
        `  ERR ${sf.jurisdiction}/${sf.abbr}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  progress.finish(`${totalWritten} edges`);

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  if (DRY) {
    console.log(
      `  GESAMT: ${totalWithinEdges} interne + ${totalCrossEdges} Cross-Code-Kanten gefunden (dry-run)`
    );
  } else {
    console.log(`  GESAMT: ${totalWritten} Kanten geschrieben, ${totalErrors} Fehler`);
  }
  console.log(`  (${totalNoSections} Dateien ohne §-Struktur — erwartet, kein Fehler)`);
  console.log("═══════════════════════════════════════════════════════════");

  if (!DRY) await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
