#!/usr/bin/env bun
/**
 * Writes the law's name onto every federal norm that has none.
 *
 * Why this matters before embedding: the contextual prefix names the document
 * a chunk belongs to. Measured on 2026-09-20, 84,763 of 149,746 norm pages
 * carried neither `abbr` nor `short_title`, so their prefix read "AT § 76" —
 * the same string for § 76 of any law. Vector search cannot tell those apart,
 * and a re-embedding run would bake the ambiguity in.
 *
 * The names come from the RIS in-force index the queue already fetched
 * (_state/ris-inforce.jsonl), so this costs no RIS request. It writes only
 * `short_title` (and `abbr` when RIS has one) and only where the field is
 * empty — an existing value is never overwritten.
 *
 * Usage:
 *   bun run scripts/backfill-statute-titles.ts --dry-run
 *   bun run scripts/backfill-statute-titles.ts
 *   bun run scripts/backfill-statute-titles.ts --index /law-corpus/_state/ris-inforce.jsonl
 */

import { readFileSync, existsSync } from "node:fs";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { clean } from "./normalize/normalize-corpus.ts";

const args = Bun.argv.slice(2);
const DRY = args.includes("--dry-run");
const SOURCE = argOf("--source") ?? "law-at-normen";
const INDEX = argOf("--index") ?? "/law-corpus/_state/ris-inforce.jsonl";
const BATCH = Number(argOf("--batch") ?? "500");

function argOf(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

interface IndexEntry {
  gnr?: string;
  kurztitel?: string | null;
  abk?: string | null;
}

/** gnr → { title, abbr } from the RIS in-force index. */
function readIndex(path: string): Map<string, { title: string; abbr: string | null }> {
  const out = new Map<string, { title: string; abbr: string | null }>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let d: IndexEntry;
    try {
      d = JSON.parse(line) as IndexEntry;
    } catch {
      continue;
    }
    // Through the normalizer's own clean(), not a bare trim(): the RIS index
    // writes non-breaking spaces into 9,284 of its lines ("VAG\u00a02016"), and
    // the first version of this script copied them into 1,474 short titles —
    // invisible, and unfindable for anyone typing an ordinary space.
    const gnr = d.gnr?.trim();
    const title = clean(d.kurztitel);
    if (!gnr || !title || out.has(gnr)) continue;
    out.set(gnr, { title, abbr: clean(d.abk) });
  }
  return out;
}

async function main() {
  if (!existsSync(INDEX)) {
    console.error(`Index fehlt: ${INDEX} — erst ris-inforce-crawl laufen lassen.`);
    process.exit(1);
  }
  const index = readIndex(INDEX);
  console.log(`RIS-Index: ${index.size} Gesetze mit Titel`);

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engineConfig = toEngineConfig(fileCfg);
  const engine = await createEngine(engineConfig);
  await engine.connect(engineConfig);

  // Only pages that carry the law number in their slug and have no name yet.
  const rows = (await engine.executeRaw(
    `SELECT id, slug
       FROM pages
      WHERE deleted_at IS NULL
        AND source_id = $1
        AND slug ~ 'gnr-[0-9]+'
        AND coalesce(frontmatter->>'abbr', frontmatter->>'abbreviation') IS NULL
        AND coalesce(frontmatter->>'short_title', frontmatter->>'statute') IS NULL
      ORDER BY id`,
    [SOURCE]
  )) as Array<{ id: number; slug: string }>;

  console.log(`Normen ohne Gesetzesnamen: ${rows.length}`);

  let updated = 0;
  let unknown = 0;
  const unknownGnrs = new Set<string>();
  const pending: Array<{ id: number; title: string; abbr: string | null }> = [];

  for (const row of rows) {
    const gnr = /gnr-([0-9]+)/.exec(row.slug)?.[1];
    const hit = gnr ? index.get(gnr) : undefined;
    if (!hit) {
      unknown++;
      if (gnr) unknownGnrs.add(gnr);
      continue;
    }
    pending.push({ id: row.id, title: hit.title, abbr: hit.abbr });
  }

  console.log(`  davon benennbar: ${pending.length}`);
  console.log(`  ohne Eintrag im Index: ${unknown} (${unknownGnrs.size} Gesetze)`);

  if (DRY) {
    const seen = new Set<string>();
    for (const p of pending) {
      if (seen.has(p.title)) continue;
      seen.add(p.title);
      console.log(`  Beispiel: ${p.abbr ? `${p.abbr} — ` : ""}${p.title}`);
      if (seen.size >= 5) break;
    }
    console.log("Probelauf — nichts geschrieben.");
    await engine.disconnect();
    return;
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    for (const p of slice) {
      // jsonb_strip_nulls keeps the object clean when RIS has no abbreviation.
      // Raw object, never JSON.stringify into a ::jsonb cast.
      await engine.executeRaw(
        `UPDATE pages
            SET frontmatter = frontmatter || jsonb_strip_nulls($2::jsonb),
                updated_at = now()
          WHERE id = $1`,
        [p.id, { short_title: p.title, abbr: p.abbr }]
      );
      updated++;
    }
    console.log(`  ${Math.min(i + BATCH, pending.length)}/${pending.length} geschrieben`);
  }

  console.log(`✓ ${updated} Normen benannt, ${unknown} ohne Index-Eintrag.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
