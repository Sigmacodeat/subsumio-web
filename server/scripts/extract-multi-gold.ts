#!/usr/bin/env bun
/**
 * Multi-Gold Extraktor für Legal Retrieval Benchmark.
 *
 * Liest echte Schriftsätze / juristische Analysen und extrahiert:
 *   1. Sachverhalt (faktischer Teil)
 *   2. Zitierte Normen (Multi-Gold, graded)
 *   3. Query = Sachverhalt-Abschnitt
 *
 * Output: JSONL mit Multi-Gold-Format:
 *   { query, gold: [{ slug, grade, context }], source_file, doc_type }
 *
 * Grade:
 *   3 = tragende Norm (in Subsumtion/Rechtsgrundlage aktiv angewendet)
 *   2 = mitangewendet (im rechtlichen Teil zitiert, aber nicht subsumiert)
 *   1 = Verfahrensnorm / Hilfsnorm (im Sachverhalt oder prozessual erwähnt)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, basename, extname } from "path";

// ─── Types ─────────────────────────────────────────────────────────────

interface GoldEntry {
  slug: string;
  grade: 1 | 2 | 3;
  context: string; // surrounding text where § was cited
  norm_text: string; // e.g. "§ 1 AHG"
}

interface MultiGoldFixture {
  query_id: string;
  query: string; // Sachverhalt
  gold: GoldEntry[];
  source_file: string;
  doc_type: "schriftsatz" | "analyse" | "klage" | "strafanzeige" | "stellungnahme";
  legal_area: string;
  date_extracted: string;
}

// ─── Norm-Extraktion ───────────────────────────────────────────────────

/**
 * Extrahiert alle §-Zitate aus einem Text.
 * Erkennt: § 1 AHG, § 1295 ABGB, § 278 StGB, § 100 Abs 2 StPO, etc.
 */
function extractNorms(text: string): { norm: string; context: string; full_match: string }[] {
  const norms: { norm: string; context: string; full_match: string }[] = [];

  // Pattern: § <number>[a-z] [Abs <number>] [Z <number>] <LAW>
  // Laws: AHG, ABGB, StGB, StPO, ZPO, UGB, ASVG, AngG, ArbVG, IO, KartG, GewO, etc.
  const lawPattern =
    /§\s*(\d+[a-z]?)\s*(?:Abs\.?\s*(\d+))?\s*(?:Z\s*(\d+))?\s*(AHG|ABGB|StGB|StPO|ZPO|UGB|ASVG|AngG|ArbVG|IO|KartG|GewO|EheG|DSG|DSGVO|StPO|SPG|BAO|BVG|VwGVG|Avg|AVG|JN|Buag|BUAG|APG|AktG|GmbHG|EO|EU|EUGH|EGMR)/g;

  let match;
  while ((match = lawPattern.exec(text)) !== null) {
    const [fullMatch, paraNum, absNum, zNum, lawRaw] = match;
    const law = normalizeLawName(lawRaw);
    const norm = `§ ${paraNum}${absNum ? ` Abs ${absNum}` : ""}${zNum ? ` Z ${zNum}` : ""} ${law}`;

    // Context: 100 chars before and after
    const start = Math.max(0, match.index - 100);
    const end = Math.min(text.length, match.index + fullMatch.length + 100);
    const context = text.substring(start, end).replace(/\n/g, " ").trim();

    norms.push({ norm, context, full_match: fullMatch });
  }

  return norms;
}

function normalizeLawName(raw: string): string {
  const map: Record<string, string> = {
    AHG: "AHG",
    ABGB: "ABGB",
    StGB: "StGB",
    StPO: "StPO",
    ZPO: "ZPO",
    UGB: "UGB",
    ASVG: "ASVG",
    AngG: "AngG",
    ArbVG: "ArbVG",
    IO: "IO",
    KartG: "KartG",
    GewO: "GewO",
    EheG: "EheG",
    DSG: "DSG",
    DSGVO: "DSGVO",
    SPG: "SPG",
    BAO: "BAO",
    BVG: "BVG",
    VwGVG: "VwGVG",
    Avg: "AVG",
    AVG: "AVG",
    JN: "JN",
    Buag: "BUAG",
    BUAG: "BUAG",
    APG: "APG",
    AktG: "AktG",
    GmbHG: "GmbHG",
    EO: "EO",
  };
  return map[raw] || raw;
}

/**
 * Mapt eine Norm wie "§ 1 AHG" auf einen Corpus-Slug.
 * Gibt null zurück wenn die Norm nicht im Corpus existiert.
 */
function normToSlug(norm: string): string | null {
  const match = norm.match(
    /§\s*(\d+[a-z]?)\s*(?:Abs\s*\d+)?\s*(?:Z\s*\d+)?\s+(AHG|ABGB|StGB|StPO|ZPO|UGB|ASVG|AngG|ArbVG|IO|KartG|GewO|EheG|DSG|SPG|BAO|VwGVG|AVG|JN|BUAG|APG|AktG|GmbHG|EO)/
  );
  if (!match) return null;

  const [, paraNum, law] = match;
  const lawSlug = law.toLowerCase().replace(/[^a-z0-9]/g, "-");

  // Special cases for laws with year in slug
  const lawSlugMap: Record<string, string> = {
    kartg: "kartg-2005",
    gewo: "gewo-1994-10007517",
    dsg: "dsg",
    asylg: "asylg-2005",
    estg: "estg-1988",
    ustg: "ustg-1994-10004873",
  };

  const finalLawSlug = lawSlugMap[lawSlug] || lawSlug;

  // AngG has art-1 prefix
  if (law === "AngG") {
    return `legal/statutes/at/angg/art-1-p-${paraNum}`;
  }

  // DSG has art-2 prefix
  if (law === "DSG") {
    return `legal/statutes/at/dsg/art-2-p-${paraNum}`;
  }

  return `legal/statutes/at/${finalLawSlug}/p-${paraNum}`;
}

// ─── Sachverhalt-Extraktion ────────────────────────────────────────────

/**
 * Extrahiert den Sachverhalt aus einem Dokument.
 *
 * Strategie:
 * 1. Suche nach "SACHVERHALT" / "Sachverhalt" / "Tatbestand" / "Verfahrensbezug" heading
 * 2. Nehme den Text bis zum nächsten "rechtliche" Heading
 * 3. Falls kein Heading gefunden: nehme ersten 30% des Dokuments
 */
function extractSachverhalt(text: string): { sachverhalt: string; rechtlicherTeil: string } {
  const lines = text.split("\n");

  // Marker für Sachverhalt-Start
  const sachverhaltMarkers = [
    /^#+\s*(I|1)\.\s*SACHVERHALT/i,
    /^#+\s*SACHVERHALT/i,
    /^#+\s*TATBESTAND/i,
    /^#+\s*Verfahrensbezug/i,
    /^#+\s*Kurzchronologie/i,
    /^#+\s*Tatmodell/i,
    /^#+\s*2\.\s*Verfahrensbezug/i,
  ];

  // Marker für rechtliche Beurteilung (Sachverhalt-Ende)
  const rechtlichMarkers = [
    /^#+\s*(II|2|III|3)\.\s*(RECHTLICHE|Rechtliche|RECHT|Recht)/i,
    /^#+\s*RECHTLICHE\s*WÜRDIGUNG/i,
    /^#+\s*Rechtliche\s*Beurteilung/i,
    /^#+\s*Rechtsgrundlage/i,
    /^#+\s*Subsumtion/i,
    /^#+\s*6\.\s*Rechtsgrundlagen/i,
    /^#+\s*RECHTLICHE\s*EINORDNUNG/i,
    /^#+\s*JURISTISCHE/i,
  ];

  let sachverhaltStart = -1;
  let rechtlichStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (sachverhaltStart === -1) {
      for (const marker of sachverhaltMarkers) {
        if (marker.test(line.trim())) {
          sachverhaltStart = i;
          break;
        }
      }
    }

    if (sachverhaltStart !== -1 && rechtlichStart === -1) {
      for (const marker of rechtlichMarkers) {
        if (marker.test(line.trim())) {
          rechtlichStart = i;
          break;
        }
      }
    }
  }

  // Fallback: wenn kein Sachverhalt-Marker, nehme ersten 30%
  if (sachverhaltStart === -1) {
    sachverhaltStart = 0;
    rechtlichStart = Math.floor(lines.length * 0.3);
  }

  // Fallback: wenn kein rechtlich-Marker, nehme 60% als Grenze
  if (rechtlichStart === -1) {
    rechtlichStart = Math.floor(lines.length * 0.6);
  }

  const sachverhalt = lines.slice(sachverhaltStart, rechtlichStart).join("\n").trim();
  const rechtlicherTeil = lines.slice(rechtlichStart).join("\n").trim();

  return { sachverhalt, rechtlicherTeil };
}

// ─── Graded Relevance ──────────────────────────────────────────────────

/**
 * Bewertet die Relevanz einer Norm:
 *   3 = tragend (in Subsumtion/Rechtsgrundlage aktiv angewendet)
 *   2 = mitangewendet (im rechtlichen Teil zitiert)
 *   1 = Verfahrensnorm (im Sachverhalt oder prozessual erwähnt)
 */
function gradeNorm(
  norm: string,
  sachverhalt: string,
  rechtlicherTeil: string,
  context: string
): 1 | 2 | 3 {
  // Prüfe ob Norm in Subsumtion/Rechtsgrundlage aktiv angewendet wird
  const subsumtionPattern = new RegExp(
    `(Subsumtion|Rechtsgrundlage|Anwendung|haftet|gemäß|nach|gem\\.|vorausgesetzt).{0,50}${escapeRegex(norm)}`,
    "i"
  );

  if (subsumtionPattern.test(rechtlicherTeil)) {
    return 3;
  }

  // Prüfe ob Norm im rechtlichen Teil zitiert wird
  if (rechtlicherTeil.includes(norm) || rechtlicherTeil.includes(context.substring(0, 50))) {
    return 2;
  }

  // Sonst: Verfahrensnorm / im Sachverhalt erwähnt
  return 1;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Dokument-Typ-Erkennung ────────────────────────────────────────────

function detectDocType(filename: string, content: string): MultiGoldFixture["doc_type"] {
  const lower = filename.toLowerCase() + " " + content.substring(0, 500).toLowerCase();

  if (lower.includes("strafanzeige")) return "strafanzeige";
  if (lower.includes("klage") || lower.includes("klageschrift")) return "klage";
  if (
    lower.includes("stellungnahme") ||
    lower.includes("erwiderung") ||
    lower.includes("widerlegung")
  )
    return "stellungnahme";
  if (lower.includes("schriftsatz")) return "schriftsatz";
  return "analyse";
}

function detectLegalArea(norms: { norm: string }[]): string {
  const lawCount: Record<string, number> = {};
  for (const n of norms) {
    const match = n.norm.match(
      /§\s*\d+[a-z]?\s+(AHG|ABGB|StGB|StPO|ZPO|UGB|ASVG|AngG|ArbVG|IO|KartG|GewO|EheG|DSG|SPG|BAO|VwGVG|AVG|JN|BUAG|APG|AktG|GmbHG|EO)/
    );
    if (match) {
      const law = match[1];
      lawCount[law] = (lawCount[law] || 0) + 1;
    }
  }

  const sorted = Object.entries(lawCount).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "misc";
}

// ─── Haupt-Extraktion ──────────────────────────────────────────────────

function processDocument(filePath: string, validSlugs: Set<string>): MultiGoldFixture | null {
  const content = readFileSync(filePath, "utf-8");

  // Mindestanforderungen: > 500 Zeichen, enthält §-Zitate
  if (content.length < 500) return null;

  const allNorms = extractNorms(content);
  if (allNorms.length < 3) return null; // braucht mindestens 3 Norm-Zitate

  const { sachverhalt, rechtlicherTeil } = extractSachverhalt(content);

  if (sachverhalt.length < 200) return null; // Sachverhalt zu kurz

  // Baue Gold-Entries mit Grading
  const gold: GoldEntry[] = [];
  const seenSlugs = new Set<string>();

  for (const normEntry of allNorms) {
    const slug = normToSlug(normEntry.norm);
    if (!slug || !validSlugs.has(slug)) continue; // nur Normen die im Corpus existieren
    if (seenSlugs.has(slug)) continue; // keine Duplikate

    seenSlugs.add(slug);
    const grade = gradeNorm(normEntry.norm, sachverhalt, rechtlicherTeil, normEntry.context);

    gold.push({
      slug,
      grade,
      context: normEntry.context.substring(0, 200),
      norm_text: normEntry.norm,
    });
  }

  if (gold.length < 2) return null; // braucht mindestens 2 validierbare Gold-Normen

  // Query = Sachverhalt (gekürzt auf max 2000 Zeichen für Eval)
  const query = sachverhalt.substring(0, 2000);

  const filename = basename(filePath);

  return {
    query_id: `mg-${filename.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
    query,
    gold,
    source_file: filePath,
    doc_type: detectDocType(filename, content),
    legal_area: detectLegalArea(allNorms),
    date_extracted: new Date().toISOString(),
  };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const outputPath = args[0] || "/tmp/multi-gold-benchmark.jsonl";
  const dryRun = args.includes("--dry-run");

  console.log("=== Multi-Gold Extraktor ===");
  console.log(`Output: ${outputPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("");

  // 1. Lade alle validen Slugs aus der DB
  console.log("Lade valide Slugs aus DB...");
  const { execSync } = await import("child_process");
  const slugsRaw = execSync(
    `psql -h localhost -p 15432 -U sigmabrain -d subsumio_law_v2 -t -A -c "SELECT DISTINCT p.slug FROM pages p JOIN content_chunks cc ON cc.page_id = p.id WHERE cc.source_id = 'law-at-normen' AND p.slug LIKE 'legal/statutes/at/%'"`,
    {
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "" },
      maxBuffer: 10 * 1024 * 1024,
    }
  )
    .toString()
    .trim();

  const validSlugs = new Set(slugsRaw.split("\n").filter(Boolean));
  console.log(`✅ ${validSlugs.size} valide Slugs aus DB geladen`);

  // 2. Sammle alle Dokumente
  const searchDirs = [
    "/Users/msc/.windsurf/worktrees/rciid-clean/rciid-clean-ff1440c3/public/docs/legal",
    "/Users/msc/Toni Gericht/ARCHIV_Analysen",
  ];

  const files: string[] = [];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isFile() && (entry.endsWith(".md") || entry.endsWith(".txt"))) {
        files.push(fullPath);
      }
    }
  }

  console.log(`📁 ${files.length} Dokumente gefunden`);

  // 3. Verarbeite jedes Dokument
  const fixtures: MultiGoldFixture[] = [];
  let skipped = 0;

  for (const file of files) {
    const fixture = processDocument(file, validSlugs);
    if (fixture) {
      fixtures.push(fixture);
      console.log(
        `  ✅ ${basename(file)}: ${fixture.gold.length} Gold-Normen (area: ${fixture.legal_area})`
      );
    } else {
      skipped++;
    }
  }

  console.log("");
  console.log(`=== ERGEBNIS ===`);
  console.log(`✅ ${fixtures.length} Multi-Gold-Fixtures extrahiert`);
  console.log(`⏭️  ${skipped} Dokumente übersprungen (zu wenig Normen oder Sachverhalt)`);
  console.log(`📊 Gold-Normen gesamt: ${fixtures.reduce((sum, f) => sum + f.gold.length, 0)}`);
  console.log(
    `📊 Durchschnittliche Gold-Größe: ${(fixtures.reduce((sum, f) => sum + f.gold.length, 0) / fixtures.length).toFixed(1)}`
  );

  // Grade-Verteilung
  const gradeDist = { 1: 0, 2: 0, 3: 0 };
  for (const f of fixtures) {
    for (const g of f.gold) {
      gradeDist[g.grade]++;
    }
  }
  console.log(`📊 Grade-Verteilung: G3=${gradeDist[3]} G2=${gradeDist[2]} G1=${gradeDist[1]}`);

  // Legal-Area-Verteilung
  const areaDist: Record<string, number> = {};
  for (const f of fixtures) {
    areaDist[f.legal_area] = (areaDist[f.legal_area] || 0) + 1;
  }
  console.log(`📊 Legal-Areas:`, areaDist);

  if (!dryRun) {
    // 4. Schreibe JSONL
    const jsonl = fixtures.map((f) => JSON.stringify(f)).join("\n");
    writeFileSync(outputPath, jsonl + "\n");
    console.log(`💾 Geschrieben: ${outputPath}`);
  }

  // 5. Zeige erste Fixture als Preview
  if (fixtures.length > 0) {
    console.log("");
    console.log("=== PREVIEW: Erste Fixture ===");
    const first = fixtures[0];
    console.log(`Query-ID: ${first.query_id}`);
    console.log(`Source: ${basename(first.source_file)}`);
    console.log(`Doc-Type: ${first.doc_type}`);
    console.log(`Legal-Area: ${first.legal_area}`);
    console.log(`Query (first 300 chars): ${first.query.substring(0, 300)}...`);
    console.log(`Gold (${first.gold.length} Normen):`);
    for (const g of first.gold) {
      console.log(`  G${g.grade} ${g.norm_text} → ${g.slug}`);
    }
  }
}

main().catch(console.error);
