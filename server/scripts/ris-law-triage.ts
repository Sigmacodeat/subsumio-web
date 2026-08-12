#!/usr/bin/env bun
/**
 * Bestandsaufnahme Gesetz für Gesetz: Was haben wir, was fehlt, woher füllen.
 *
 * Grundsatz: Was schon korrekt da ist, wird NICHT neu geholt. Für jede Lücke
 * wird zuerst die Festplatte geprüft (law-corpus/at-normen/ bzw. law-corpus/at/),
 * und nur was dort auch fehlt, kommt aus dem RIS.
 *
 * Quellen:
 *   - RIS-Sollbestand: /tmp/ris-inforce.jsonl (aus ris-inforce-crawl.ts)
 *   - Festplatte:      law-corpus/at-normen/<abk>/<p-N>.md  (XML, normgenau)
 *                      law-corpus/at/<slug>.md              (PDF, ganzes Gesetz)
 *   - Datenbank:       pages, source_id='law-at'
 *
 * Einstufung je Gesetz:
 *   OK          DB vollständig — nichts tun
 *   IMPORT      Normen liegen als XML auf der Platte, nur Import fehlt
 *   TEILIMPORT  ein Teil auf der Platte, Rest muss aus RIS
 *   FETCH       nichts Brauchbares da — komplett aus RIS holen
 *
 *   bun run server/scripts/ris-law-triage.ts                  # alle
 *   bun run server/scripts/ris-law-triage.ts --limit 200      # erste 200
 *   bun run server/scripts/ris-law-triage.ts --json out.json
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

function arg(name: string, fb?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb;
}
const RIS_FILE = arg("ris", "/tmp/ris-inforce.jsonl")!;
const DB_URL = arg("db", process.env.DATABASE_URL ?? "postgres://sigmabrain@localhost:15432/sigmabrain")!;
const LIMIT = Number(arg("limit", "0"));
const ONLY_NAMED = !process.argv.includes("--all-laws");
const JSON_OUT = arg("json");
const CORPUS = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

/**
 * "§ 1152" → "p-1152", "Art. 5" → "art-5", "Anl. 2" → "anl-2"
 *
 * § 0 wird bewusst ausgeschlossen: RIS führt für jedes Gesetz einen
 * Inhaltsverzeichnis-Eintrag als "§ 0", der keinen Normtext enthält. Er zählt
 * nicht zum Sollbestand — sonst gilt jedes vollständige Gesetz als lückenhaft
 * (ABGB stünde bei 1351/1352, UWG bei 65/66).
 */
function normKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  if (/^§+\s*0\s*$/.test(s)) return null;
  let m = s.match(/^§+\s*([0-9]+[a-zA-Z]*)/); if (m) return `p-${m[1].toLowerCase()}`;
  m = s.match(/^Art\.?\s*([0-9]+[a-zA-Z]*)/i); if (m) return `art-${m[1].toLowerCase()}`;
  m = s.match(/^Anl\.?\s*([0-9]+[a-zA-Z]*)/i); if (m) return `anl-${m[1].toLowerCase()}`;
  return null;
}

type Law = { gnr: string; abk: string | null; titel: string; soll: Set<string> };

async function main() {
  // ── 1. Sollbestand aus RIS ────────────────────────────────────────
  const laws = new Map<string, Law>();
  for (const line of readFileSync(RIS_FILE, "utf-8").split("\n")) {
    if (!line) continue;
    const n = JSON.parse(line);
    if (!n.gnr) continue;
    let l = laws.get(n.gnr);
    if (!l) { l = { gnr: n.gnr, abk: n.abk ?? null, titel: n.kurztitel ?? "", soll: new Set() }; laws.set(n.gnr, l); }
    if (!l.abk && n.abk) l.abk = n.abk;
    const k = normKey(n.apa);
    if (k) l.soll.add(k);
  }

  let list = [...laws.values()];
  if (ONLY_NAMED) list = list.filter((l) => l.abk);
  list.sort((a, b) => b.soll.size - a.soll.size);
  if (LIMIT > 0) list = list.slice(0, LIMIT);

  console.log(`RIS-Sollbestand: ${laws.size} Gesetze, geprüft werden ${list.length}` +
    (ONLY_NAMED ? " (nur mit Abkürzung)" : "") + "\n");

  // ── 2. Datenbank: welche Normen liegen je Gesetz? ─────────────────
  const sql = postgres(DB_URL, { max: 3, idle_timeout: 20 });
  const rows = await sql<{ slug: string }[]>`
    SELECT slug FROM pages
    WHERE source_id='law-at' AND deleted_at IS NULL AND slug LIKE 'legal/statutes/at/%'
  `;
  const dbByAbk = new Map<string, Set<string>>();
  for (const r of rows) {
    const m = r.slug.match(/^legal\/statutes\/at\/([^/]+)\/(.+)$/);
    if (!m) continue;
    if (!dbByAbk.has(m[1])) dbByAbk.set(m[1], new Set());
    dbByAbk.get(m[1])!.add(m[2]);
  }

  // ── 3. Festplatte: at-normen/<abk>/ ───────────────────────────────
  const normenRoot = join(CORPUS, "at-normen");
  const diskByDir = new Map<string, Set<string>>();
  if (existsSync(normenRoot)) {
    for (const d of readdirSync(normenRoot)) {
      const p = join(normenRoot, d);
      try {
        diskByDir.set(d, new Set(readdirSync(p).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""))));
      } catch { /* kein Verzeichnis */ }
    }
  }

  // ── 4. Einstufung ─────────────────────────────────────────────────
  const out: any[] = [];
  const zaehler: Record<string, number> = { OK: 0, IMPORT: 0, TEILIMPORT: 0, FETCH: 0 };

  for (const l of list) {
    const dir = l.abk ? slugify(l.abk) : `gnr-${l.gnr}`;
    const db = dbByAbk.get(dir) ?? new Set<string>();
    const disk = diskByDir.get(dir) ?? new Set<string>();

    const fehltInDb = [...l.soll].filter((k) => !db.has(k));
    const davonAufPlatte = fehltInDb.filter((k) => disk.has(k));
    const brauchtRis = fehltInDb.filter((k) => !disk.has(k));

    let status: string;
    if (fehltInDb.length === 0) status = "OK";
    else if (brauchtRis.length === 0) status = "IMPORT";
    else if (davonAufPlatte.length > 0) status = "TEILIMPORT";
    else status = "FETCH";
    zaehler[status]++;

    out.push({
      gnr: l.gnr, abk: l.abk, titel: l.titel, dir,
      soll: l.soll.size, in_db: l.soll.size - fehltInDb.length,
      fehlt: fehltInDb.length, auf_platte: davonAufPlatte.length, braucht_ris: brauchtRis.length,
      status,
      ris_keys: brauchtRis.slice(0, 200),
    });
  }

  // ── 5. Ausgabe ────────────────────────────────────────────────────
  const sollGesamt = out.reduce((a, x) => a + x.soll, 0);
  const inDb = out.reduce((a, x) => a + x.in_db, 0);
  const platte = out.reduce((a, x) => a + x.auf_platte, 0);
  const ris = out.reduce((a, x) => a + x.braucht_ris, 0);

  console.log("  ── GESETZE ──");
  console.log(`    OK          ${String(zaehler.OK).padStart(5)}  nichts zu tun`);
  console.log(`    IMPORT      ${String(zaehler.IMPORT).padStart(5)}  liegt fertig auf der Platte`);
  console.log(`    TEILIMPORT  ${String(zaehler.TEILIMPORT).padStart(5)}  teils Platte, Rest aus RIS`);
  console.log(`    FETCH       ${String(zaehler.FETCH).padStart(5)}  muss aus RIS`);
  console.log("\n  ── NORMEN ──");
  console.log(`    RIS-Soll:            ${sollGesamt}`);
  console.log(`    schon in der DB:     ${inDb}  (${((inDb / sollGesamt) * 100).toFixed(1)} %)`);
  console.log(`    liegt auf Platte:    ${platte}  → nur importieren`);
  console.log(`    muss aus RIS:        ${ris}  (${((ris / sollGesamt) * 100).toFixed(1)} %)`);

  console.log("\n  ── GRÖSSTE LÜCKEN (Top 20) ──");
  for (const x of out.filter((x) => x.fehlt > 0).sort((a, b) => b.fehlt - a.fehlt).slice(0, 20)) {
    console.log(`    ${x.status.padEnd(11)} ${String(x.fehlt).padStart(5)} fehlen von ${String(x.soll).padStart(5)}  ${(x.abk ?? "–").padEnd(14)} ${x.titel.slice(0, 45)}`);
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { gesetze: zaehler, normen: { soll: sollGesamt, in_db: inDb, auf_platte: platte, braucht_ris: ris } },
      laws: out,
    }, null, 2));
    console.log(`\n  ✓ ${JSON_OUT}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
