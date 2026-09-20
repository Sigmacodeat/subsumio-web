#!/usr/bin/env bun
/**
 * Writes the state onto every piece of state law that has none.
 *
 * Why this matters before embedding: nine states legislate on the same
 * subjects in near-identical words. `buildLegalContextualPrefix` puts the
 * state into the context line ("AT Tirol § 5 | Tiroler Straßengesetz"), and
 * the embedding bake-off lost 3.7 nDCG points on state-law questions when it
 * was missing. Measured on 2026-09-20, 8,793 of 149,998 pages had no `region`.
 *
 * The state is already in the data twice over, so nothing is guessed and no
 * RIS request is needed:
 *   - `doc_id` starts with L + the state code ("LWI40018339" → Wien)
 *   - the ELI / source URL carries it as "lgbl/<code>/" ("lgbl/WI/" → Wien)
 * Both alphabets were read back off ~140,000 rows that already carry a
 * region; each code maps to exactly one state.
 *
 * Usage:
 *   bun run scripts/backfill-landesrecht-region.ts --dry-run
 *   bun run scripts/backfill-landesrecht-region.ts
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const args = Bun.argv.slice(2);
const DRY = args.includes("--dry-run");
const SOURCE = argOf("--source") ?? "law-at-landesrecht";

function argOf(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Code in `doc_id` (L**) → state. Verified against the rows that have one. */
const DOC_ID_CODE: Record<string, string> = {
  BG: "Burgenland",
  KT: "Kärnten",
  NO: "Niederösterreich",
  OO: "Oberösterreich",
  SB: "Salzburg",
  ST: "Steiermark",
  TI: "Tirol",
  VB: "Vorarlberg",
  WI: "Wien",
};

/** Code in the ELI path (lgbl/**) → state. A different alphabet, same states. */
const ELI_CODE: Record<string, string> = {
  BU: "Burgenland",
  KA: "Kärnten",
  NI: "Niederösterreich",
  OB: "Oberösterreich",
  SA: "Salzburg",
  ST: "Steiermark",
  TI: "Tirol",
  VO: "Vorarlberg",
  WI: "Wien",
};

function regionOf(docId: string | null, eli: string | null): string | undefined {
  const byDoc = /^L([A-Z]{2})/.exec(docId ?? "")?.[1];
  if (byDoc && DOC_ID_CODE[byDoc]) return DOC_ID_CODE[byDoc];
  const byEli = /lgbl\/([A-Za-z]{2})\//.exec(eli ?? "")?.[1]?.toUpperCase();
  if (byEli && ELI_CODE[byEli]) return ELI_CODE[byEli];
  return undefined;
}

async function main() {
  const engineConfig = toEngineConfig(loadConfig());
  const engine = await createEngine(engineConfig);
  await engine.connect(engineConfig);

  const rows = (await engine.executeRaw(
    `SELECT id,
            frontmatter->>'doc_id' AS doc_id,
            coalesce(frontmatter->>'eli', frontmatter->>'source_url') AS eli
       FROM pages
      WHERE deleted_at IS NULL
        AND source_id = $1
        AND frontmatter->>'region' IS NULL
      ORDER BY id`,
    [SOURCE]
  )) as Array<{ id: number; doc_id: string | null; eli: string | null }>;

  console.log(`Seiten ohne Bundesland: ${rows.length}`);

  const pending: Array<{ id: number; region: string }> = [];
  let unknown = 0;
  for (const row of rows) {
    const region = regionOf(row.doc_id, row.eli);
    if (!region) {
      unknown++;
      continue;
    }
    pending.push({ id: row.id, region });
  }

  const perRegion = new Map<string, number>();
  for (const p of pending) perRegion.set(p.region, (perRegion.get(p.region) ?? 0) + 1);
  for (const [region, n] of [...perRegion].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${region.padEnd(18)} ${n}`);
  }
  console.log(`  ohne erkennbares Land: ${unknown}`);

  if (DRY) {
    console.log("Probelauf — nichts geschrieben.");
    await engine.disconnect();
    return;
  }

  // One statement per state: the id list is the only thing that varies, and
  // a raw object goes into the jsonb cast (never JSON.stringify).
  let updated = 0;
  for (const [region, n] of perRegion) {
    const ids = pending.filter((p) => p.region === region).map((p) => p.id);
    await engine.executeRaw(
      `UPDATE pages
          SET frontmatter = frontmatter || $2::jsonb,
              updated_at = now()
        WHERE id = ANY($1::int[])`,
      [ids, { region }]
    );
    updated += n;
    console.log(`  ✓ ${region}: ${n}`);
  }

  console.log(`✓ ${updated} Seiten mit Bundesland versehen, ${unknown} ohne erkennbares Land.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
