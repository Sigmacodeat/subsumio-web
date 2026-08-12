#!/usr/bin/env bun
/**
 * Frische Korpus-Datenbank aufsetzen und den kanonischen Korpus importieren.
 *
 * WARUM NEUE DB STATT AUFRÄUMEN: Ein DELETE von 565.000 Pages und 2,7 Mio
 * Chunks hinterlässt tote Tupel; das Freigeben verlangt VACUUM FULL — mit
 * exklusiver Sperre und dem doppelten Tabellenplatz auf einer Platte, die zu
 * 92 % voll ist. `DROP DATABASE` gibt alles auf einen Schlag frei. Und bis
 * zur Abnahme bleibt die alte DB als Rückfall stehen: der Umstieg ist
 * umkehrbar.
 *
 * WIEDERVERWENDUNG statt Neubau:
 *   Schema    → engine.initSchema() (fährt die MIGRATIONS-Kette hoch,
 *               inklusive der Vorfilter-Indizes aus Migration 123)
 *   Import    → batch-import-from-disk.ts (Cursor, Batches, Resume, Rate-Limit)
 * Neu ist hier nur die Klammer: Datenbank anlegen, Suchkonfiguration setzen,
 * Korpora in der richtigen Reihenfolge einspielen, Abnahme fahren.
 *
 *   bun server/scripts/setup-corpus-db.ts --db subsumio_law_v2 --dry-run
 *   bun server/scripts/setup-corpus-db.ts --db subsumio_law_v2 --schema-only
 *   bun server/scripts/setup-corpus-db.ts --db subsumio_law_v2
 *   bun server/scripts/setup-corpus-db.ts --db subsumio_law_v2 --verify-only
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { $ } from "bun";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const NEW_DB = arg("--db", "subsumio_law_v2")!;
const DRY = args.includes("--dry-run");
const SCHEMA_ONLY = args.includes("--schema-only");
const VERIFY_ONLY = args.includes("--verify-only");
const BATCH = arg("--batch-size", "200")!;

const ROOT = join(import.meta.dir, "..", "..");
const NORMALIZED = join(ROOT, "law-corpus", "_normalized");

/**
 * Verzeichnis → source_id. Die IDs bleiben exakt die der alten Datenbank,
 * damit Slug-Ableitung, Auswertungen und gespeicherte Abfragen weiter passen.
 * `at-judikatur` heißt als Quelle `law-at-judikatur-ogh` — historisch gewachsen,
 * bewusst nicht angefasst.
 */
const SOURCE_MAP: Record<string, string> = {
  "at": "law-at",
  "at-normen": "law-at-normen",
  "at-landesrecht": "law-at-landesrecht",
  "at-gemeinden": "law-at-gemeinden",
  "at-bezirke": "law-at-bezirke",
  "at-bmerl": "law-at-bmerl",
  "at-avn": "law-at-avn",
  "at-avsv": "law-at-avsv",
  "at-kmger": "law-at-kmger",
  "at-spg": "law-at-spg",
  "at-staatsvertraege": "law-at-staatsvertraege",
  "at-literatur": "law-at-literatur",
  "at-judikatur": "law-at-judikatur-ogh",
  "at-judikatur-vwgh": "law-at-judikatur-vwgh",
  "at-judikatur-vfgh": "law-at-judikatur-vfgh",
  "at-judikatur-bvwg": "law-at-judikatur-bvwg",
  "at-judikatur-lvwg": "law-at-judikatur-lvwg",
  "at-judikatur-asylgh": "law-at-judikatur-asylgh",
  "at-judikatur-uvs": "law-at-judikatur-uvs",
  "at-judikatur-ubas": "law-at-judikatur-ubas",
  "at-judikatur-umse": "law-at-judikatur-umse",
  "at-judikatur-gbk": "law-at-judikatur-gbk",
  "at-judikatur-dok": "law-at-judikatur-dok",
  "at-judikatur-dsk": "law-at-judikatur-dsk",
  "at-judikatur-pvak": "law-at-judikatur-pvak",
};

/**
 * Korpora, die gerade noch geholt werden. Sie zu importieren hieße, einen
 * halben Stand einzufrieren — der Rest käme nie nach, weil der Cursor sie
 * als erledigt führt. Wird beim Lauf geprüft, nicht geraten.
 */
const IN_FLIGHT = ["at-landesrecht", "at-bezirke", "at-kmger"];

/**
 * Suchkonfiguration. Sie lebt in der Config-Tabelle IN der Datenbank, nicht
 * im Code — eine frische DB stünde sonst auf Standardwerten, ohne dass es
 * jemand merkt. Werte übernommen aus dem Stand der alten Datenbank.
 */
const SEARCH_CONFIG: Record<string, string> = {
  "search.mode": "tokenmax",
  "search.expansion": "true",
  "search.relationalRetrieval": "true",
  "search.searchLimit": "50",
  "search.intentWeighting": "true",
  "search.cache.enabled": "true",
};

function adminUrl(): string {
  const u = process.env.SUBSUMIO_LAW_DB_URL ?? process.env.DATABASE_URL;
  if (!u) {
    console.error("Keine DB-URL. Setze SUBSUMIO_LAW_DB_URL (Admin-Rechte nötig zum Anlegen).");
    process.exit(1);
  }
  return u;
}

/** URL auf eine andere Datenbank umbiegen, Zugangsdaten unverändert. */
function withDb(url: string, db: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${db}$1`);
}

const redact = (u: string) => u.replace(/:\/\/[^@]*@/, "://***:***@");

async function psql(url: string, sql: string): Promise<string> {
  return (await $`psql ${url} -tAc ${sql}`.quiet()).stdout.toString().trim();
}

/**
 * Erreichbarkeit vorab prüfen. Ohne diesen Schritt bricht der erste
 * psql-Aufruf mit einem rohen ShellError-Stacktrace ab, aus dem niemand
 * abliest, dass schlicht der Docker-Daemon aus ist.
 */
async function isReachable(url: string): Promise<boolean> {
  try {
    await $`psql ${url} -tAc ${"SELECT 1"}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function step1_createDatabase(base: string) {
  console.log(`\n─── 1. Datenbank ${NEW_DB} anlegen ───`);
  const exists = await psql(base, `SELECT 1 FROM pg_database WHERE datname = '${NEW_DB}'`);
  if (exists === "1") {
    console.log(`   ${NEW_DB} existiert bereits — wird weiterverwendet.`);
    return;
  }
  if (DRY) { console.log(`   [DRY] CREATE DATABASE ${NEW_DB}`); return; }
  await $`psql ${base} -c ${`CREATE DATABASE ${NEW_DB}`}`.quiet();
  console.log(`   ${NEW_DB} angelegt.`);
}

async function step2_schema(target: string) {
  console.log(`\n─── 2. Schema + Migrationen ───`);
  if (DRY) { console.log("   [DRY] initSchema() über die Migrations-Kette"); return; }
  // initSchema() fährt MIGRATIONS bis LATEST_VERSION hoch — inklusive
  // Migration 123 (Vorfilter-Indizes), die vorher nur von Hand existierte.
  // NICHT `gbrain init` — das ist ein Assistent, der ~/.gbrain/config.json
  // schreibt und damit die laufende Installation auf die neue, leere DB
  // umbiegen würde. init-schema-only.ts ruft ausschließlich initSchema().
  const env = { ...process.env, GBRAIN_ENGINE: "postgres", GBRAIN_DATABASE_URL: target, DATABASE_URL: target };
  const proc = Bun.spawn(["bun", "run", join(ROOT, "server", "scripts", "init-schema-only.ts")], {
    cwd: ROOT, env, stdout: "inherit", stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`Schema-Init fehlgeschlagen (exit ${code})`);
  const v = await psql(target, `SELECT value FROM config WHERE key = 'version'`);
  console.log(`   Schema-Version: ${v || "unbekannt"}`);
}

async function step3_searchConfig(target: string) {
  console.log(`\n─── 3. Suchkonfiguration ───`);
  for (const [k, v] of Object.entries(SEARCH_CONFIG)) {
    if (DRY) { console.log(`   [DRY] ${k} = ${v}`); continue; }
    await psql(
      target,
      `INSERT INTO config (key, value) VALUES ('${k}', '${v}')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
    console.log(`   ${k.padEnd(28)} = ${v}`);
  }
}

function corporaToImport(): { dir: string; source: string; files: number }[] {
  if (!existsSync(NORMALIZED)) {
    console.error(`Kanonischer Korpus fehlt: ${NORMALIZED}`);
    process.exit(1);
  }
  const out: { dir: string; source: string; files: number }[] = [];
  for (const dir of readdirSync(NORMALIZED).sort()) {
    if (dir.startsWith("_")) continue;
    const source = SOURCE_MAP[dir];
    if (!source) { console.log(`   ⚠ ${dir}: keine source_id hinterlegt — übersprungen`); continue; }
    if (IN_FLIGHT.includes(dir)) { console.log(`   ⏸ ${dir}: wird gerade noch geholt — übersprungen`); continue; }
    const n = countMd(join(NORMALIZED, dir));
    if (n === 0) continue;
    out.push({ dir, source, files: n });
  }
  return out;
}

function countMd(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countMd(join(dir, e.name));
    else if (e.name.endsWith(".md")) n++;
  }
  return n;
}

/** Zeigt den Importplan ohne Datenbankzugriff — für Dry-Runs bei totem Daemon. */
function printPlan() {
  const list = corporaToImport();
  const total = list.reduce((s, c) => s + c.files, 0);
  console.log(`   ${"Korpus".padEnd(24)} ${"source_id".padEnd(28)} Dateien`);
  console.log("   " + "─".repeat(64));
  for (const { dir, source, files } of list) {
    console.log(`   ${dir.padEnd(24)} ${source.padEnd(28)} ${files.toLocaleString("de-AT").padStart(9)}`);
  }
  console.log("   " + "─".repeat(64));
  console.log(`   ${"SUMME".padEnd(53)} ${total.toLocaleString("de-AT").padStart(9)}`);
}

async function step4_import(target: string) {
  console.log(`\n─── 4. Import des kanonischen Korpus ───`);
  const list = corporaToImport();
  const total = list.reduce((s, c) => s + c.files, 0);
  console.log(`   ${list.length} Korpora, ${total.toLocaleString("de-AT")} Dateien\n`);

  for (const { dir, source, files } of list) {
    console.log(`   ▶ ${source.padEnd(28)} ${files.toLocaleString("de-AT").padStart(9)} Dateien`);
    if (DRY) continue;
    const proc = Bun.spawn([
      "bun", "run", join(ROOT, "server", "scripts", "batch-import-from-disk.ts"),
      "--source", source,
      "--disk-dir", join("law-corpus", "_normalized", dir),
      "--batch-size", BATCH,
      "--sleep-ms", "20",
      "--no-embed",              // Embeddings erst nach der Abnahme — sonst
      "--slug-from-path",        // zahlen wir für Vektoren auf ungeprüfte Daten
      // Cursor je Zieldatenbank. Der Standardpfad ist
      // /tmp/import-cursor-<source>.json und kennt die Datenbank nicht: der
      // Lauf gegen die frische DB fand dort den Cursor des alten Imports vor
      // und meldete "alles schon importiert" — bei 0 Pages in der Zieldatenbank.
      "--cursor-file", `/tmp/import-cursor-${NEW_DB}-${source}.json`,
    ], {
      cwd: ROOT,
      env: { ...process.env, GBRAIN_ENGINE: "postgres", GBRAIN_DATABASE_URL: target, DATABASE_URL: target },
      stdout: "inherit", stderr: "inherit",
    });
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`   ✗ Import von ${source} fehlgeschlagen (exit ${code}) — Lauf gestoppt.`);
      process.exit(1);
    }
  }
}

async function step5_verify(target: string) {
  console.log(`\n─── 5. Abnahme ───`);
  const q = async (label: string, sql: string) => {
    const r = await psql(target, sql).catch(() => "FEHLER");
    console.log(`   ${label.padEnd(42)} ${r}`);
    return r;
  };

  await q("Pages", "SELECT count(*) FROM pages");
  await q("Chunks", "SELECT count(*) FROM content_chunks");
  await q("Quellen", "SELECT count(DISTINCT source_id) FROM pages");

  console.log("");
  // Die Kennzahlen, an denen der alte Bestand gescheitert ist:
  await q("Chunks ohne chunk_role (soll: 0)",
    "SELECT count(*) FROM content_chunks WHERE chunk_role IS NULL");
  await q("Chunks ohne document_type (soll: 0)",
    "SELECT count(*) FROM content_chunks WHERE document_type IS NULL");
  await q("unstrukturiert 'full' (soll: gering)",
    "SELECT round(100.0*count(*) FILTER (WHERE chunk_role='full')/nullif(count(*),0),1)||' %' FROM content_chunks");
  await q("Navigationsmüll (soll: 0)",
    "SELECT count(*) FROM content_chunks WHERE chunk_text LIKE '%Accesskey%' OR chunk_text LIKE '%Seitenbereiche:%'");
  await q("Chunks über 12.000 Zeichen (soll: 0)",
    "SELECT count(*) FROM content_chunks WHERE length(chunk_text) > 12000");
  await q("doppelte content_hash (soll: 0)",
    "SELECT coalesce(sum(n-1),0) FROM (SELECT count(*) n FROM pages WHERE content_hash IS NOT NULL GROUP BY content_hash HAVING count(*)>1) t");

  console.log("");
  await q("statute: paragraph_ref gesetzt",
    "SELECT round(100.0*count(paragraph_ref)/nullif(count(*),0),1)||' %' FROM content_chunks WHERE document_type='statute'");
  await q("decision: court gesetzt",
    "SELECT round(100.0*count(court)/nullif(count(*),0),1)||' %' FROM content_chunks WHERE document_type='decision'");
  await q("decision: decision_date gesetzt",
    "SELECT round(100.0*count(decision_date)/nullif(count(*),0),1)||' %' FROM content_chunks WHERE document_type='decision'");
  await q("Embeddings (erst nach Abnahme)",
    "SELECT count(embedding) FROM content_chunks");
}

async function main() {
  const base = adminUrl();
  const target = withDb(base, NEW_DB);

  console.log("═".repeat(72));
  console.log(`Korpus-Datenbank aufsetzen: ${NEW_DB}`);
  console.log(`Ziel:   ${redact(target)}`);
  console.log(`Quelle: law-corpus/_normalized`);
  if (DRY) console.log("MODUS:  DRY-RUN — es wird nichts geschrieben");
  console.log("═".repeat(72));

  if (!(await isReachable(base))) {
    console.log("\n⚠  Datenbank nicht erreichbar.");
    console.log(`   ${redact(base)}`);
    console.log("   subsumio_law läuft in Docker — vermutlich ist der Daemon aus.");
    console.log("   Starten mit:  open -a Docker    (oder: colima start)\n");
    if (!DRY) process.exit(1);
    console.log("DRY-RUN: zeige trotzdem, was importiert würde.\n");
    printPlan();
    return;
  }

  if (VERIFY_ONLY) { await step5_verify(target); return; }

  await step1_createDatabase(base);
  await step2_schema(target);
  await step3_searchConfig(target);
  if (SCHEMA_ONLY) {
    console.log("\n--schema-only: Import übersprungen.");
    return;
  }
  await step4_import(target);
  await step5_verify(target);

  console.log(`\n${"═".repeat(72)}`);
  console.log("Fertig. Die alte Datenbank ist unangetastet und bleibt als Rückfall.");
  console.log("Nach bestandener Abnahme:");
  console.log("   1. Embeddings erzeugen");
  console.log("   2. Anwendung auf die neue DB umstellen");
  console.log(`   3. Erst dann:  DROP DATABASE subsumio_law   (gibt den Platz sofort frei)`);
}

if (import.meta.main) await main();
