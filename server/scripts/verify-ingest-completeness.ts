#!/usr/bin/env bun
/**
 * verify-ingest-completeness — 1:1 Vollständigkeitsprüfung der Ingest-Pipeline.
 *
 * Prüft drei Stufen auf stille Verluste:
 *   1. RIS-Liste → Festplatte:  Jede Norm aus /tmp/ris-inforce.jsonl muss
 *      entweder eine Datei auf der Platte haben ODER ein bewusster Ausschluss
 *      sein (§ 0 — Inhaltsverzeichnis ohne Normtext).
 *   2. Festplatte → DB:         Jede .md-Datei in law-corpus/at-normen/ muss
 *      entweder eine Page in der DB haben ODER im Quality-Fail-Log stehen.
 *   3. DB → Embeddings:         Jede Page muss Chunks haben, jeder Chunk muss
 *      ein Embedding haben (falls nicht --no-embed).
 *
 *   bun run server/scripts/verify-ingest-completeness.ts [--ris /tmp/ris-inforce.jsonl]
 *                                                        [--source law-at]
 *                                                        [--disk-dir law-corpus/at-normen]
 *                                                        [--db <postgres-url>]
 *                                                        [--skip-embeddings]
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import postgres from "postgres";

function arg(name: string, fb?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb;
}

const RIS_FILE = arg("ris", "/tmp/ris-inforce.jsonl")!;
const SOURCE_ID = arg("source", "law-at")!;
const DISK_DIR = arg("disk-dir", join(import.meta.dir, "..", "..", "law-corpus", "at-normen"))!;
const DB_URL = arg(
  "db",
  process.env.DATABASE_URL ?? "postgres://sigmabrain@localhost:15432/sigmabrain"
)!;
const SKIP_EMBEDDINGS = process.argv.includes("--skip-embeddings");

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** "§ 1152" → "p-1152", "Art. 5" → "art-5", "Anl. 2" → "anl-2". § 0 → null. */
function normKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  if (/^§+\s*0\s*$/.test(s)) return null;
  const teile: string[] = [];
  const rx = /(§+|Art\.?|Anl\.?)\s*([0-9]+[a-zA-Z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s)) !== null) {
    const art = m[1].toLowerCase();
    const praefix = art.startsWith("§") ? "p" : art.startsWith("art") ? "art" : "anl";
    teile.push(`${praefix}-${m[2].toLowerCase()}`);
  }
  if (teile.length === 0) return null;
  return teile.join("-");
}

type Norm = {
  nor: string;
  gnr: string;
  kurztitel: string;
  abk: string | null;
  apa: string | null;
  inkraft: string | null;
};

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — 1:1 Ingest-Vollständigkeitsprüfung");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`RIS-Liste:  ${RIS_FILE}`);
  console.log(`Festplatte: ${DISK_DIR}`);
  console.log(`DB-Source:  ${SOURCE_ID}`);
  console.log(`Datenbank: ${DB_URL.replace(/\/\/[^@]*@/, "//***@")}`);
  console.log("");

  let exitCode = 0;

  // ── 1. RIS-Liste laden ──────────────────────────────────────────────
  let norms: Norm[] = [];
  if (existsSync(RIS_FILE)) {
    norms = readFileSync(RIS_FILE, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Norm)
      .filter((n) => n.nor && n.gnr);
  }
  console.log(`RIS-Liste: ${norms.length} Normen geladen`);

  // Kollisionstabelle aus dem VOLLSTÄNDIGEN Bestand (wie ris-xml-fetch-normen.ts)
  const abkZuGnrs = new Map<string, Set<string>>();
  for (const n of norms) {
    if (!n.abk) continue;
    const s = slugify(n.abk);
    if (!abkZuGnrs.has(s)) abkZuGnrs.set(s, new Set());
    abkZuGnrs.get(s)!.add(n.gnr);
  }
  const mehrfachSchluessel = new Set<string>();
  {
    const proGesetzKey = new Map<string, Set<string>>();
    for (const n of norms) {
      const k = normKey(n.apa);
      if (!k) continue;
      const id = `${n.gnr}|${k}`;
      if (!proGesetzKey.has(id)) proGesetzKey.set(id, new Set());
      proGesetzKey.get(id)!.add(n.nor);
    }
    for (const [id, nors] of proGesetzKey) if (nors.size > 1) mehrfachSchluessel.add(id);
  }

  // ── 2. Festplatte scannen ───────────────────────────────────────────
  const diskFiles = new Set<string>();
  let diskTotal = 0;
  let diskNoHash = 0;
  if (existsSync(DISK_DIR)) {
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith(".md")) {
          diskTotal++;
          const content = readFileSync(full, "utf-8");
          if (!content.includes("content_hash:")) diskNoHash++;
          // Slug relativ zum Disk-Root (wie batch-import-from-disk --slug-from-path)
          const rel = full
            .replace(DISK_DIR.endsWith("/") ? DISK_DIR : `${DISK_DIR}/`, "")
            .replace(/\.md$/, "");
          diskFiles.add(rel);
        }
      }
    }
    walk(DISK_DIR);
  }
  console.log(`Festplatte: ${diskTotal} Dateien (${diskNoHash} ohne content_hash)`);

  // ── 3. DB abfragen ──────────────────────────────────────────────────
  const sql = postgres(DB_URL, { max: 3, idle_timeout: 20 });
  const dbSlugs = new Set<string>();
  let dbPages = 0;
  let dbChunks = 0;
  let dbEmbedded = 0;
  try {
    const pageRows = await sql<{ slug: string }[]>`
      SELECT slug FROM pages
      WHERE source_id = ${SOURCE_ID} AND deleted_at IS NULL
    `;
    for (const r of pageRows) {
      dbPages++;
      // Slug relativ zum Source-Präfix (legal/statutes/at/ → relativ)
      const prefix = SOURCE_ID === "law-at" ? "legal/statutes/at/" : "legal/";
      if (r.slug.startsWith(prefix)) {
        dbSlugs.add(r.slug.slice(prefix.length));
      } else {
        dbSlugs.add(r.slug);
      }
    }

    const statsRows = await sql<{ pages: string; chunks: string; embedded: string }[]>`
      SELECT count(DISTINCT p.id)::text as pages,
             count(c.id)::text as chunks,
             count(c.embedding)::text as embedded
      FROM pages p
      LEFT JOIN content_chunks c ON c.page_id = p.id
      WHERE p.source_id = ${SOURCE_ID} AND p.deleted_at IS NULL
    `;
    if (statsRows.length > 0) {
      dbChunks = parseInt(statsRows[0].chunks);
      dbEmbedded = parseInt(statsRows[0].embedded);
    }
  } catch (e) {
    console.error(`! DB-Verbindung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    console.error("  (DB-Prüfung übersprungen — nur RIS→Platte geprüft)");
  }
  console.log(`Datenbank: ${dbPages} Pages, ${dbChunks} Chunks, ${dbEmbedded} eingebettet`);
  console.log("");

  // ── 4. Stufe 1: RIS → Festplatte (1:1) ──────────────────────────────
  console.log("── Stufe 1: RIS → Festplatte ──────────────────────────────");
  let risTotal = 0;
  let risExcluded = 0; // § 0 — bewusster Ausschluss
  let risOnDisk = 0;
  let risMissing = 0;
  const missingFromDisk: string[] = [];

  for (const n of norms) {
    risTotal++;
    const basisKey = normKey(n.apa);
    if (!basisKey) {
      risExcluded++;
      continue;
    }

    // Slug wie ris-xml-fetch-normen.ts: dirFor + key
    const dir = n.abk
      ? (abkZuGnrs.get(slugify(n.abk))?.size ?? 0) > 1
        ? `${slugify(n.abk)}-${n.gnr}`
        : slugify(n.abk)
      : `gnr-${n.gnr}`;
    const key = mehrfachSchluessel.has(`${n.gnr}|${basisKey}`)
      ? `${basisKey}-${n.nor.toLowerCase()}`
      : basisKey;
    const rel = `${dir}/${key}`;

    if (diskFiles.has(rel)) {
      risOnDisk++;
    } else {
      risMissing++;
      if (missingFromDisk.length < 50) missingFromDisk.push(rel);
    }
  }

  // Soll = alles außer den bewusst ausgeschlossenen § 0. Früher stand hier
  // `risOnDisk + risMissing + risExcluded === risTotal` — das ist
  // tautologisch immer wahr und meldete "✓ 1:1" auch bei 101.868 fehlenden
  // Normen. Ein falsches Grün ist schlimmer als gar keine Prüfung.
  const risSoll = risTotal - risExcluded;
  console.log(`  RIS-Normen:     ${risTotal}`);
  console.log(`  Soll (ohne §0): ${risSoll}`);
  console.log(`  Auf Platte:     ${risOnDisk} (${((risOnDisk / risSoll) * 100).toFixed(2)}%)`);
  console.log(`  Ausgeschlossen: ${risExcluded} (§ 0 — Inhaltsverzeichnis)`);
  console.log(`  Fehlend:        ${risMissing}`);
  console.log(
    `  Vollständigkeit:${risOnDisk}/${risSoll} ${risOnDisk === risSoll ? "✓ 1:1" : "✗ unvollständig"}`
  );
  if (missingFromDisk.length > 0) {
    console.log(`  Fehlende Dateien (max 50):`);
    for (const m of missingFromDisk) console.log(`    ${m}`);
  }
  if (risMissing > 0) {
    console.error(
      `  ✗ ${risMissing} Normen auf der Platte fehlen — ris-xml-fetch-normen.ts neu laufen.`
    );
    exitCode = 1;
  } else {
    console.log(`  ✓ Alle ${risTotal - risExcluded} geltenden Normen liegen auf der Platte.`);
  }
  console.log("");

  // ── 5. Stufe 2: Festplatte → DB (1:1) ───────────────────────────────
  if (dbPages > 0) {
    console.log("── Stufe 2: Festplatte → DB ────────────────────────────────");
    let diskInDb = 0;
    let diskNotInDb = 0;
    const notInDb: string[] = [];

    for (const rel of diskFiles) {
      if (dbSlugs.has(rel)) {
        diskInDb++;
      } else {
        diskNotInDb++;
        if (notInDb.length < 50) notInDb.push(rel);
      }
    }

    console.log(`  Dateien:        ${diskTotal}`);
    console.log(`  In DB:          ${diskInDb} (${((diskInDb / diskTotal) * 100).toFixed(2)}%)`);
    console.log(`  Nicht in DB:    ${diskNotInDb}`);
    if (diskNoHash > 0) {
      console.log(`  Ohne hash:      ${diskNoHash} (werden vom Quality-Gate übersprungen)`);
    }
    if (notInDb.length > 0) {
      console.log(`  Fehlende in DB (max 50):`);
      for (const m of notInDb) console.log(`    ${m}`);
    }
    if (diskNotInDb > 0) {
      console.error(
        `  ✗ ${diskNotInDb} Dateien nicht in DB — batch-import-from-disk.ts neu laufen.`
      );
      exitCode = 1;
    } else {
      console.log(`  ✓ Alle ${diskTotal} Dateien sind in der DB.`);
    }
    console.log("");
  }

  // ── 6. Stufe 3: DB → Embeddings (1:1) ──────────────────────────────
  if (dbPages > 0 && !SKIP_EMBEDDINGS) {
    console.log("── Stufe 3: DB → Embeddings ───────────────────────────────");
    const embedMissing = dbChunks - dbEmbedded;
    console.log(`  Pages:          ${dbPages}`);
    console.log(`  Chunks:         ${dbChunks}`);
    console.log(
      `  Eingebettet:    ${dbEmbedded} (${dbChunks > 0 ? ((dbEmbedded / dbChunks) * 100).toFixed(2) : 0}%)`
    );
    console.log(`  Ohne Embedding: ${embedMissing}`);
    if (embedMissing > 0) {
      console.error(`  ✗ ${embedMissing} Chunks ohne Embedding — auto-embed-pg.ts neu laufen.`);
      exitCode = 1;
    } else {
      console.log(`  ✓ Alle ${dbChunks} Chunks haben Embeddings.`);
    }
    console.log("");
  }

  // ── Ergebnis ────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  if (exitCode === 0) {
    console.log("  ✓ ALLE STUFEN VOLLSTÄNDIG — 1:1 garantiert");
  } else {
    console.log("  ✗ LÜCKEN GEFUNDEN — siehe oben");
  }
  console.log("═══════════════════════════════════════════════════════════");

  await sql.end();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
