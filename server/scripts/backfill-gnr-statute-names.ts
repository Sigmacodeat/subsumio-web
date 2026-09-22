#!/usr/bin/env bun
/**
 * Names the ~1,100 federal laws that carry no name at all.
 *
 * A federal norm page's slug is `legal/statutes/at/<gesetz>/<paragraph>`.
 * Most laws resolve `<gesetz>` to their abbreviation (`stgb`, `abgb`, `mrg`)
 * and every one of their pages titles itself "§ 134 StGB" — the pattern the
 * contextual-retrieval prefix (embedding-context.ts:buildLegalContextualPrefix)
 * and every citation the product shows both rely on.
 *
 * ~1,100 laws never got that treatment: their `<gesetz>` segment is RIS's
 * internal law number (`gnr-10001848`), every one of their pages carries the
 * identical bare title ("Urheberrechtsgesetz" — no paragraph, no
 * abbreviation), and `frontmatter.abbr` / `short_title` are both empty.
 * Measured 2026-09-21: 84,763 such pages. The contextual prefix falls back to
 * "AT § 42" for all of them — the same string for § 42 of any one of the
 * 1,100, which is exactly the Document-Level Retrieval Mismatch the prefix
 * exists to prevent (see the doc-comment on buildLegalContextualPrefix).
 *
 * This script does two independent things, deliberately kept separate
 * because their correctness bar differs:
 *
 * 1. **short_title, for every affected page.** Sourced from RIS's own
 *    in-force index (_state/ris-inforce.jsonl — the queue already fetched
 *    it, so this costs no RIS request). A full, distinctive law name is a
 *    correct disambiguator even without an abbreviation, and it needs no
 *    judgment call: it is RIS's own name for the law.
 *
 * 2. **abbr + title, for a short, hand-verified list of well-known laws**
 *    (ABBR below). RIS's in-force index does not carry an `abk` for most of
 *    these — official abbreviations are a matter of legal convention, not
 *    RIS data, so a mechanical fill would either come up empty or guess.
 *    A guessed abbreviation is worse than none: this corpus already uses
 *    "mschg" for the Mutterschutzgesetz, so a mechanical fill would have
 *    handed the Markenschutzgesetz the same abbreviation two different
 *    laws already claim. Every entry in ABBR was checked against the
 *    existing corpus (`frontmatter.abbr` AND the slug folder itself) for
 *    exactly that collision before being added; see the --check-abbr-list
 *    flag. Only pages with paragraph_ref not "§ 0" get the title rewritten
 *    to the "§ 42 UrhG" pattern the rest of the corpus uses — the law's own
 *    cover page keeps its descriptive title.
 *
 * Chunks belonging to a page whose name just changed are still carrying
 * vectors embedded against the OLD (ambiguous) prefix — most of these pages
 * were already embedded before this ran. This script resets
 * `embedding_qwen` (+ _model/_embedded_at) to NULL for exactly those chunks,
 * nothing else, so the running top-up embedder (which the corpus already
 * runs continuously) re-embeds them with the corrected prefix on its next
 * pass. It does not touch corpus_page_verified — these pages were already on
 * the verified list; a name/title change doesn't need a fresh plausibility
 * check.
 *
 * Usage:
 *   bun run scripts/backfill-gnr-statute-names.ts --dry-run
 *   bun run scripts/backfill-gnr-statute-names.ts
 *   bun run scripts/backfill-gnr-statute-names.ts --check-abbr-list   # collision check only, no DB writes needed to be a dry-run first
 *   bun run scripts/backfill-gnr-statute-names.ts --index /law-corpus/_state/ris-inforce.jsonl
 */

import { readFileSync, existsSync } from "node:fs";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const args = Bun.argv.slice(2);
const DRY = args.includes("--dry-run");
const CHECK_ONLY = args.includes("--check-abbr-list");
const SOURCE = argOf("--source") ?? "law-at-normen";
const INDEX = argOf("--index") ?? "/law-corpus/_state/ris-inforce.jsonl";
const BATCH = Number(argOf("--batch") ?? "500");

function argOf(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** RIS index lines carry a non-breaking space in some titles; normalize both
 *  that and ordinary whitespace runs the same way the normalizer does. */
function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * Hand-verified: gnr → official abbreviation, for laws whose RIS index entry
 * carries no `abk`. Every one of these was checked with --check-abbr-list
 * against both `frontmatter.abbr` and the slug folder name before being
 * added — an abbreviation already claimed by a different law is a citation
 * error, worse than the "AT § 42" ambiguity this script exists to fix.
 */
const ABBR: Record<string, string> = {
  "10001848": "UrhG", // Urheberrechtsgesetz
  "10002181": "PatG", // Patentgesetz 1970
  "10001934": "WG", // Wechselgesetz 1955
  "10001935": "SchG", // Scheckgesetz 1955
  "10008186": "HAG", // Heimarbeitsgesetz 1960
  "10002137": "BewHG", // Bewährungshilfegesetz
  "20007043": "E-GeldG", // E-Geldgesetz 2010
};

interface IndexEntry {
  gnr?: string;
  kurztitel?: string | null;
}

/** gnr → law name, from the RIS in-force index. First entry per gnr wins
 *  (a law's many paragraph rows repeat the same kurztitel). */
function readIndex(path: string): Map<string, string> {
  const out = new Map<string, string>();
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let d: IndexEntry;
    try {
      d = JSON.parse(line) as IndexEntry;
    } catch {
      continue;
    }
    const gnr = d.gnr?.trim();
    const title = clean(d.kurztitel);
    if (!gnr || !title || out.has(gnr)) continue;
    out.set(gnr, title);
  }
  return out;
}

async function checkAbbrCollisions(engine: Awaited<ReturnType<typeof createEngine>>) {
  console.log("Kollisionsprüfung — jedes Kürzel gegen frontmatter.abbr UND den Slug-Ordner:");
  let anyCollision = false;
  for (const [gnr, abbr] of Object.entries(ABBR)) {
    const folder = abbr.toLowerCase();
    const rows = (await engine.executeRaw(
      `SELECT count(*)::int AS n
         FROM pages
        WHERE source_id = $1 AND deleted_at IS NULL
          AND split_part(slug, '/', 4) != $2
          AND (upper(frontmatter->>'abbr') = upper($3) OR split_part(slug, '/', 4) = $4)`,
      [SOURCE, `gnr-${gnr}`, abbr, folder]
    )) as Array<{ n: number }>;
    const collisions = rows[0]?.n ?? 0;
    if (collisions > 0) {
      anyCollision = true;
      console.log(`  ✗ ${abbr} (gnr-${gnr}): ${collisions} Seite(n) beanspruchen es schon`);
    } else {
      console.log(`  ✓ ${abbr} (gnr-${gnr}): frei`);
    }
  }
  if (anyCollision) {
    console.error("\nMindestens ein Kürzel kollidiert — ABBR korrigieren, dann erneut prüfen.");
    process.exit(1);
  }
  console.log("\nAlle Kürzel sind kollisionsfrei.");
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engineConfig = toEngineConfig(fileCfg);
  const engine = await createEngine(engineConfig);
  await engine.connect(engineConfig);

  if (CHECK_ONLY) {
    await checkAbbrCollisions(engine);
    await engine.disconnect();
    return;
  }

  if (!existsSync(INDEX)) {
    console.error(`Index fehlt: ${INDEX}`);
    process.exit(1);
  }
  const index = readIndex(INDEX);
  console.log(`RIS-Index: ${index.size} Gesetze mit Titel`);
  await checkAbbrCollisions(engine);

  // Every page whose law-group is RIS's internal law number and which has
  // neither a short name nor an abbreviation yet.
  const rows = (await engine.executeRaw(
    `SELECT id, slug, frontmatter->>'paragraph_ref' AS paragraph_ref
       FROM pages
      WHERE deleted_at IS NULL
        AND source_id = $1
        AND slug ~ '/gnr-[0-9]+/'
        AND coalesce(frontmatter->>'abbr', frontmatter->>'abbreviation') IS NULL
        AND coalesce(frontmatter->>'short_title', frontmatter->>'statute') IS NULL
      ORDER BY id`,
    [SOURCE]
  )) as Array<{ id: number; slug: string; paragraph_ref: string | null }>;

  console.log(`Normen ohne Gesetzesnamen: ${rows.length}`);

  type Pending = {
    id: number;
    shortTitle: string;
    abbr: string | null;
    newTitle: string | null;
  };
  const pending: Pending[] = [];
  let unknown = 0;
  const unknownGnrs = new Set<string>();

  for (const row of rows) {
    const gnr = /\/gnr-([0-9]+)\//.exec(row.slug)?.[1];
    const kurztitel = gnr ? index.get(gnr) : undefined;
    if (!kurztitel) {
      unknown++;
      if (gnr) unknownGnrs.add(gnr);
      continue;
    }
    const abbr = gnr ? (ABBR[gnr] ?? null) : null;
    // The law's own cover page ("§ 0" — short title, amendment history, no
    // section of the law itself) keeps its descriptive title even when the
    // law has an abbreviation: "§ 0 UrhG" names nothing.
    const newTitle =
      abbr && row.paragraph_ref && row.paragraph_ref !== "§ 0"
        ? `${row.paragraph_ref} ${abbr}`
        : null;
    pending.push({ id: row.id, shortTitle: kurztitel, abbr, newTitle });
  }

  const withAbbr = pending.filter((p) => p.abbr).length;
  console.log(`  benennbar: ${pending.length} (davon ${withAbbr} mit Kürzel)`);
  console.log(`  ohne Eintrag im Index: ${unknown} (${unknownGnrs.size} Gesetze)`);

  if (DRY) {
    const seen = new Set<string>();
    for (const p of pending) {
      const key = p.abbr ?? p.shortTitle;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  Beispiel: ${p.newTitle ?? p.shortTitle}${p.abbr ? "" : " (kein Kürzel)"}`);
      if (seen.size >= 12) break;
    }
    console.log("Probelauf — nichts geschrieben.");
    await engine.disconnect();
    return;
  }

  let updated = 0;
  let titledPages = 0;
  let chunksReset = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    for (const p of slice) {
      // jsonb_strip_nulls keeps the object clean when there is no abbr.
      // Raw object, never JSON.stringify into a ::jsonb cast.
      await engine.executeRaw(
        `UPDATE pages
            SET frontmatter = frontmatter || jsonb_strip_nulls($2::jsonb),
                title = coalesce($3, title),
                updated_at = now()
          WHERE id = $1`,
        [p.id, { short_title: p.shortTitle, abbr: p.abbr }, p.newTitle]
      );
      updated++;
      if (p.newTitle) titledPages++;

      // Force re-embedding: the chunks under this page may already carry a
      // vector computed against the old, unnamed prefix.
      const reset = (await engine.executeRaw(
        `UPDATE content_chunks
            SET embedding_qwen = NULL, embedding_qwen_model = NULL, embedding_qwen_embedded_at = NULL
          WHERE page_id = $1 AND embedding_qwen IS NOT NULL
          RETURNING id`,
        [p.id]
      )) as Array<{ id: number }>;
      chunksReset += reset.length;
    }
    console.log(`  ${Math.min(i + BATCH, pending.length)}/${pending.length} geschrieben`);
  }

  console.log(
    `✓ ${updated} Normen benannt (${titledPages} mit neuem Titel), ${unknown} ohne Index-Eintrag, ` +
      `${chunksReset} Abschnitte zur Neu-Einbettung freigegeben.`
  );
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
