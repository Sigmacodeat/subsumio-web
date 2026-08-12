#!/usr/bin/env bun
/**
 * Judikatur-Dubletten: Merge + Quarantäne + Soft-Delete.
 *
 * Führt den von judikatur-dedupe-plan.ts erzeugten Plan aus. Jeder Schritt ist
 * umkehrbar:
 *
 *   1. MERGE     Zusatzfelder (normen, entscheidungsart, document_id, dokumenttyp)
 *                aus der Dubletten-Datei in die Datum-Datei übernehmen.
 *   2. QUARANTÄNE Dubletten-Datei nach law-corpus/_quarantine/<dir>/ VERSCHIEBEN
 *                (kein rm — Rückgängigmachen ist ein mv zurück).
 *   3. SOFT-DELETE Die zugehörige DB-Seite bekommt deleted_at=now()
 *                (kein DELETE — Rückgängigmachen ist deleted_at=NULL).
 *
 *   bun run server/scripts/judikatur-dedupe-apply.ts                 # dry-run
 *   bun run server/scripts/judikatur-dedupe-apply.ts --apply
 *   bun run server/scripts/judikatur-dedupe-apply.ts --apply --court asylgh
 *   bun run server/scripts/judikatur-dedupe-apply.ts --undo          # alles zurück
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from "fs";
import { join, dirname } from "path";
import postgres from "postgres";

function arg(name: string, fb?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb;
}
const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
/**
 * --repair: gleicht die DB gegen das Quarantäne-Verzeichnis ab. Nötig, wenn ein
 * Lauf zwischen "Datei verschoben" und "DB-Seite soft-deleted" abgebrochen ist —
 * der normale Lauf überspringt solche Paare, weil die Quelldatei fehlt.
 * Idempotent: fasst nur Seiten an, die noch aktiv sind.
 */
const REPAIR = process.argv.includes("--repair");
const COURT = arg("court");
const PLAN = arg("plan", ".windsurf/plans/judikatur-dedupe-plan.json")!;
const DB_URL = arg("db", process.env.DATABASE_URL ?? "postgres://sigmabrain@localhost:15432/sigmabrain")!;
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const QUARANTINE = join(CORPUS_ROOT, "_quarantine");

/** dir → slugPrefix, gespiegelt aus import-judikatur.ts SOURCE_CONFIGS. */
const SLUG_PREFIX: Record<string, { prefix: string; sourceId: string }> = {
  "at-judikatur": { prefix: "legal/judikatur/at", sourceId: "law-at-judikatur" },
  "at-judikatur-vfgh": { prefix: "legal/judikatur/at/vfgh", sourceId: "law-at-judikatur-vfgh" },
  "at-judikatur-vwgh": { prefix: "legal/judikatur/at/vwgh", sourceId: "law-at-judikatur-vwgh" },
  "at-judikatur-bvwg": { prefix: "legal/judikatur/at/bvwg", sourceId: "law-at-judikatur-bvwg" },
  "at-judikatur-lvwg": { prefix: "legal/judikatur/at/lvwg", sourceId: "law-at-judikatur-lvwg" },
  "at-judikatur-asylgh": { prefix: "legal/judikatur/at/asylgh", sourceId: "law-at-judikatur-asylgh" },
  "at-judikatur-uvs": { prefix: "legal/judikatur/at/uvs", sourceId: "law-at-judikatur-uvs" },
  "at-judikatur-dsk": { prefix: "legal/judikatur/at/dsk", sourceId: "law-at-judikatur-dsk" },
  "at-judikatur-gbk": { prefix: "legal/judikatur/at/gbk", sourceId: "law-at-judikatur-gbk" },
  "at-judikatur-pvak": { prefix: "legal/judikatur/at/pvak", sourceId: "law-at-judikatur-pvak" },
  "at-judikatur-dok": { prefix: "legal/judikatur/at/dok", sourceId: "law-at-judikatur-dok" },
  "at-judikatur-ubas": { prefix: "legal/judikatur/at/ubas", sourceId: "law-at-judikatur-ubas" },
  "at-judikatur-umse": { prefix: "legal/judikatur/at/umse", sourceId: "law-at-judikatur-umse" },
};

const MERGE_FIELDS = ["normen", "entscheidungsart", "document_id", "dokumenttyp"];

type Pair = { key: string; dateFile: string; dupFile: string; kind: string };
type Court = { dir: string; pairs: Pair[] };

function splitFrontmatter(raw: string): { fm: string; body: string } | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
}

function fmKeys(fm: string): Set<string> {
  const s = new Set<string>();
  for (const l of fm.split("\n")) {
    const m = l.match(/^([a-z_]+):/i);
    if (m) s.add(m[1]);
  }
  return s;
}

function fmValue(fm: string, key: string): string | null {
  for (const l of fm.split("\n")) {
    const m = l.match(new RegExp(`^${key}:\\s*(.*)$`, "i"));
    if (m) return m[1].trim();
  }
  return null;
}

async function undo(sql: postgres.Sql) {
  console.log("Mache Quarantäne und Soft-Deletes rückgängig …\n");
  let moved = 0;
  if (existsSync(QUARANTINE)) {
    for (const dir of readdirSync(QUARANTINE)) {
      const from = join(QUARANTINE, dir);
      const to = join(CORPUS_ROOT, dir);
      for (const f of readdirSync(from)) {
        renameSync(join(from, f), join(to, f));
        moved++;
      }
    }
  }
  const res = await sql`
    UPDATE pages SET deleted_at = NULL
    WHERE deleted_at IS NOT NULL AND frontmatter->>'dedupe_removed' = 'true'
  `;
  console.log(`  ${moved} Dateien zurückverschoben, ${res.count} DB-Seiten reaktiviert.`);
  console.log("  Hinweis: gemergte Frontmatter-Felder bleiben — sie sind additiv und schaden nicht.");
}

/**
 * Soft-deleted jede DB-Seite, deren Datei bereits in Quarantäne liegt. Schließt
 * die Lücke, die ein abgebrochener Lauf hinterlässt.
 */
async function repair(sql: postgres.Sql) {
  if (!existsSync(QUARANTINE)) {
    console.log("Keine Quarantäne vorhanden — nichts zu reparieren.");
    return;
  }
  console.log(APPLY ? "REPARATUR (--apply)\n" : "REPARATUR — Probelauf, es wird nichts geändert.\n");
  let total = 0;
  for (const dir of readdirSync(QUARANTINE)) {
    const cfg = SLUG_PREFIX[dir];
    if (!cfg) {
      console.log(`  ! ${dir}: kein slugPrefix bekannt — übersprungen`);
      continue;
    }
    const slugs = readdirSync(join(QUARANTINE, dir)).map((f) => `${cfg.prefix}/${f.replace(/\.md$/, "")}`);
    let offen = 0;
    for (let i = 0; i < slugs.length; i += 1000) {
      const batch = slugs.slice(i, i + 1000);
      if (APPLY) {
        const res = await sql`
          UPDATE pages
          SET deleted_at = now(),
              frontmatter = frontmatter || '{"dedupe_removed":"true"}'::jsonb
          WHERE source_id = ${cfg.sourceId} AND slug IN ${sql(batch)} AND deleted_at IS NULL
        `;
        offen += res.count;
      } else {
        const rows = await sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pages
          WHERE source_id = ${cfg.sourceId} AND slug IN ${sql(batch)} AND deleted_at IS NULL
        `;
        offen += rows[0].n;
      }
    }
    total += offen;
    console.log(`  ${dir.replace("at-judikatur-", "").padEnd(10)} Quarantäne ${String(slugs.length).padStart(7)} · offene DB-Seiten ${String(offen).padStart(7)}`);
  }
  console.log(`\n  ${APPLY ? "Nachgezogen" : "Offen"}: ${total} DB-Seiten`);
  if (!APPLY) console.log("  Mit --repair --apply ausführen.");
}

async function main() {
  const sql = postgres(DB_URL, { max: 4, idle_timeout: 20 });

  if (UNDO) {
    await undo(sql);
    await sql.end();
    return;
  }

  if (REPAIR) {
    await repair(sql);
    await sql.end();
    return;
  }

  const plan = JSON.parse(readFileSync(PLAN, "utf-8")) as { courts: Court[] };
  const courts = plan.courts.filter((c) => (COURT ? c.dir === `at-judikatur-${COURT}` : true));

  console.log(APPLY ? "AUSFÜHRUNG (--apply)\n" : "PROBELAUF — es wird nichts geändert. Mit --apply ausführen.\n");

  let merged = 0;
  let fieldsAdded = 0;
  let quarantined = 0;
  let softDeleted = 0;
  let missingFile = 0;

  for (const c of courts) {
    const cfg = SLUG_PREFIX[c.dir];
    if (!cfg) {
      console.log(`  ! ${c.dir}: kein slugPrefix bekannt — übersprungen`);
      continue;
    }
    if (c.pairs.length === 0) continue;

    const qdir = join(QUARANTINE, c.dir);
    if (APPLY && !existsSync(qdir)) mkdirSync(qdir, { recursive: true });

    const slugsToDelete: string[] = [];
    let cMerged = 0;
    let cFields = 0;

    for (const p of c.pairs) {
      const datePath = join(CORPUS_ROOT, c.dir, p.dateFile);
      const dupPath = join(CORPUS_ROOT, c.dir, p.dupFile);
      if (!existsSync(datePath) || !existsSync(dupPath)) {
        missingFile++;
        continue;
      }

      // 1. MERGE
      const dateRaw = readFileSync(datePath, "utf-8");
      const dupRaw = readFileSync(dupPath, "utf-8");
      const dateParts = splitFrontmatter(dateRaw);
      const dupParts = splitFrontmatter(dupRaw);
      if (dateParts && dupParts) {
        const have = fmKeys(dateParts.fm);
        const add: string[] = [];
        for (const f of MERGE_FIELDS) {
          if (have.has(f)) continue;
          const v = fmValue(dupParts.fm, f);
          if (v && v !== "''" && v !== '""') add.push(`${f}: ${v}`);
        }
        if (add.length > 0) {
          if (APPLY) {
            writeFileSync(datePath, `---\n${dateParts.fm}\n${add.join("\n")}\n---\n${dateParts.body}`);
          }
          cMerged++;
          cFields += add.length;
        }
      }

      // 2. QUARANTÄNE
      if (APPLY) renameSync(dupPath, join(qdir, p.dupFile));
      quarantined++;

      // 3. Slug für Soft-Delete vormerken
      slugsToDelete.push(`${cfg.prefix}/${p.dupFile.replace(/\.md$/, "")}`);
    }

    merged += cMerged;
    fieldsAdded += cFields;

    // 3. SOFT-DELETE in Blöcken
    let cDeleted = 0;
    if (APPLY) {
      for (let i = 0; i < slugsToDelete.length; i += 1000) {
        const batch = slugsToDelete.slice(i, i + 1000);
        const res = await sql`
          UPDATE pages
          SET deleted_at = now(),
              frontmatter = frontmatter || '{"dedupe_removed":"true"}'::jsonb
          WHERE source_id = ${cfg.sourceId} AND slug IN ${sql(batch)} AND deleted_at IS NULL
        `;
        cDeleted += res.count;
      }
    } else {
      for (let i = 0; i < slugsToDelete.length; i += 1000) {
        const batch = slugsToDelete.slice(i, i + 1000);
        const rows = await sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pages
          WHERE source_id = ${cfg.sourceId} AND slug IN ${sql(batch)} AND deleted_at IS NULL
        `;
        cDeleted += rows[0].n;
      }
    }
    softDeleted += cDeleted;

    console.log(
      `  ${c.dir.replace("at-judikatur-", "").padEnd(8)} Paare ${String(c.pairs.length).padStart(6)} · gemergt ${String(cMerged).padStart(6)} · Quarantäne ${String(c.pairs.length).padStart(6)} · DB-Seiten ${String(cDeleted).padStart(6)}`
    );
  }

  console.log("\n  ── SUMME ──");
  console.log(`  Dateien gemergt:        ${merged}  (${fieldsAdded} Felder übernommen)`);
  console.log(`  Dateien in Quarantäne:  ${quarantined}`);
  console.log(`  DB-Seiten soft-deleted: ${softDeleted}`);
  if (missingFile > 0) console.log(`  Übersprungen (Datei fehlt): ${missingFile}`);
  if (!APPLY) console.log("\n  Nichts geändert. Mit --apply ausführen, mit --undo zurücknehmen.");
  else console.log(`\n  Quarantäne: ${QUARANTINE}\n  Rückgängig: bun run server/scripts/judikatur-dedupe-apply.ts --undo`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
