#!/usr/bin/env bun
/**
 * RIS ↔ DB Audit — 1:1-Abgleich des geltenden Bundesrechts.
 *
 * Vergleicht den RIS-Vollbestand (aus ris-inforce-crawl.ts) mit den
 * tatsächlich in der Datenbank liegenden Normen (source_id='law-at').
 *
 *   bun run server/scripts/ris-inforce-crawl.ts --out /tmp/ris-inforce.jsonl
 *   bun run server/scripts/ris-db-audit.ts --ris /tmp/ris-inforce.jsonl
 *
 * Erwartet PG-Verbindung über DATABASE_URL bzw. --db.
 */
import { readFileSync, writeFileSync } from "fs";
import postgres from "postgres";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const RIS_FILE = arg("ris", "/tmp/ris-inforce.jsonl")!;
const DB_URL = arg("db", process.env.DATABASE_URL ?? "postgres://sigmabrain@localhost:15432/sigmabrain")!;
const OUT = arg("out", "/tmp/ris-db-audit.json")!;

type RisNorm = {
  nor: string; gnr: string; kurztitel: string; abk: string | null;
  typ: string | null; apa: string | null; inkraft: string | null;
};

type LawAgg = {
  gnr: string; kurztitel: string; abk: string | null; typ: string | null;
  normen: Set<string>;
};

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(österreich\)/g, "")
    .replace(/[„""»«]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** "§ 1152" → "1152"; "Art. 5" → "art-5"; "Anl. 2" → "anl-2" */
function apaKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  let m = s.match(/^§+\s*([0-9]+[a-zA-Z]*)/);
  if (m) return m[1].toLowerCase();
  m = s.match(/^Art\.?\s*([0-9]+[a-zA-Z]*)/i);
  if (m) return `art-${m[1].toLowerCase()}`;
  m = s.match(/^Anl\.?\s*([0-9]+[a-zA-Z]*)/i);
  if (m) return `anl-${m[1].toLowerCase()}`;
  return s.toLowerCase().replace(/\s+/g, "-");
}

async function main() {
  // ── 1. RIS-Bestand laden, nach Gesetz gruppieren ──────────────────
  console.log(`Lade RIS-Bestand aus ${RIS_FILE} …`);
  const lines = readFileSync(RIS_FILE, "utf-8").split("\n").filter(Boolean);
  const risLaws = new Map<string, LawAgg>();
  let risNormCount = 0;

  for (const line of lines) {
    const n = JSON.parse(line) as RisNorm;
    if (!n.gnr) continue;
    risNormCount++;
    let law = risLaws.get(n.gnr);
    if (!law) {
      law = { gnr: n.gnr, kurztitel: n.kurztitel, abk: n.abk, typ: n.typ, normen: new Set() };
      risLaws.set(n.gnr, law);
    }
    if (!law.abk && n.abk) law.abk = n.abk;
    const k = apaKey(n.apa);
    if (k) law.normen.add(k);
  }
  console.log(`  ${risNormCount} Normen in ${risLaws.size} Gesetzen (geltende Fassung)`);

  // ── 2. DB-Bestand laden ───────────────────────────────────────────
  const sql = postgres(DB_URL, { max: 4, idle_timeout: 20 });
  const rows = await sql<{
    slug: string; title: string; statute: string | null;
    paragraph: string | null; gnr: string | null; abbreviation: string | null;
    len: number;
  }[]>`
    SELECT slug, title,
           frontmatter->>'statute'       AS statute,
           frontmatter->>'paragraph'     AS paragraph,
           frontmatter->>'gesetzesnummer' AS gnr,
           frontmatter->>'abbreviation'  AS abbreviation,
           length(compiled_truth)        AS len
    FROM pages
    WHERE source_id = 'law-at' AND deleted_at IS NULL
  `;
  console.log(`  ${rows.length} DB-Seiten in source_id='law-at'`);

  // DB nach Gesetz gruppieren (Schlüssel: normalisierter Langtitel aus `statute`)
  const dbLaws = new Map<string, { titel: string; normen: Set<string>; gnrs: Set<string>; pages: number }>();
  for (const r of rows) {
    const raw = r.statute ?? r.title ?? "";
    const titel = raw.includes("—") ? raw.split("—").slice(1).join("—").trim() : raw.trim();
    const key = normalizeTitle(titel);
    if (!key) continue;
    let e = dbLaws.get(key);
    if (!e) { e = { titel, normen: new Set(), gnrs: new Set(), pages: 0 }; dbLaws.set(key, e); }
    e.pages++;
    if (r.gnr) e.gnrs.add(r.gnr);
    const m = r.slug.match(/\/(p|art|anl)-([0-9a-z]+)$/i);
    if (m) e.normen.add(m[1].toLowerCase() === "p" ? m[2].toLowerCase() : `${m[1].toLowerCase()}-${m[2].toLowerCase()}`);
  }
  console.log(`  ${dbLaws.size} unterscheidbare Gesetze in der DB`);

  // ── 3. Matching RIS → DB ──────────────────────────────────────────
  const dbByGnr = new Map<string, string>(); // gnr -> dbKey
  for (const [key, e] of dbLaws) for (const g of e.gnrs) dbByGnr.set(g, key);

  const matched: any[] = [];
  const missingLaws: any[] = [];

  for (const [gnr, law] of risLaws) {
    let dbKey = dbByGnr.get(gnr);
    if (!dbKey) {
      const k = normalizeTitle(law.kurztitel);
      if (dbLaws.has(k)) dbKey = k;
    }
    if (!dbKey) {
      missingLaws.push({ gnr, kurztitel: law.kurztitel, abk: law.abk, typ: law.typ, risNormen: law.normen.size });
      continue;
    }
    const db = dbLaws.get(dbKey)!;
    const fehlend = [...law.normen].filter((n) => !db.normen.has(n));
    const ueberzaehlig = [...db.normen].filter((n) => !law.normen.has(n));
    matched.push({
      gnr, kurztitel: law.kurztitel, abk: law.abk,
      risNormen: law.normen.size, dbNormen: db.normen.size,
      fehlendeNormen: fehlend.length, ueberzaehligeNormen: ueberzaehlig.length,
      fehlendBeispiele: fehlend.slice(0, 10),
      vollstaendig: fehlend.length === 0,
    });
  }

  const dbMatchedKeys = new Set(matched.map((m) => normalizeTitle(m.kurztitel)));
  for (const [gnr] of risLaws) { const k = dbByGnr.get(gnr); if (k) dbMatchedKeys.add(k); }
  const orphans = [...dbLaws.entries()]
    .filter(([k]) => !dbMatchedKeys.has(k))
    .map(([k, e]) => ({ key: k, titel: e.titel, pages: e.pages }));

  // ── 4. Report ─────────────────────────────────────────────────────
  const risNormenGesamt = [...risLaws.values()].reduce((a, l) => a + l.normen.size, 0);
  const dbNormenErfasst = matched.reduce((a, m) => a + Math.min(m.dbNormen, m.risNormen), 0);
  const fehlendeNormenInGetroffenen = matched.reduce((a, m) => a + m.fehlendeNormen, 0);
  const normenInFehlendenGesetzen = missingLaws.reduce((a, l) => a + l.risNormen, 0);

  const p = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  RIS ↔ DB AUDIT — geltendes österreichisches Bundesrecht");
  console.log("══════════════════════════════════════════════════════════\n");
  console.log("  GESETZE (Gesetzesnummern)");
  console.log(`    RIS geltend:                 ${risLaws.size}`);
  console.log(`    davon in DB vorhanden:       ${matched.length}  (${p(matched.length, risLaws.size)} %)`);
  console.log(`    davon vollständig:           ${matched.filter((m) => m.vollstaendig).length}`);
  console.log(`    in DB fehlend:               ${missingLaws.length}  (${p(missingLaws.length, risLaws.size)} %)`);
  console.log(`    DB-Einträge ohne RIS-Match:  ${orphans.length}`);
  console.log("\n  NORMEN (§/Art/Anlage)");
  console.log(`    RIS geltend gesamt:          ${risNormenGesamt}`);
  console.log(`    in DB erfasst:               ${dbNormenErfasst}  (${p(dbNormenErfasst, risNormenGesamt)} %)`);
  console.log(`    fehlend in vorhandenen Ges.: ${fehlendeNormenInGetroffenen}`);
  console.log(`    fehlend durch fehlende Ges.: ${normenInFehlendenGesetzen}`);

  console.log("\n  GRÖSSTE LÜCKEN — komplett fehlende Gesetze (Top 30 nach Normenzahl)");
  for (const l of missingLaws.sort((a, b) => b.risNormen - a.risNormen).slice(0, 30)) {
    console.log(`    ${String(l.risNormen).padStart(5)} Normen  ${(l.abk ?? "–").padEnd(14)} ${l.kurztitel.slice(0, 70)}`);
  }

  console.log("\n  UNVOLLSTÄNDIGE GESETZE (Top 25 nach fehlenden Normen)");
  for (const m of matched.filter((x) => x.fehlendeNormen > 0).sort((a, b) => b.fehlendeNormen - a.fehlendeNormen).slice(0, 25)) {
    console.log(`    ${String(m.fehlendeNormen).padStart(5)} fehlen von ${String(m.risNormen).padStart(5)}  ${(m.abk ?? "–").padEnd(12)} ${m.kurztitel.slice(0, 55)}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    risFile: RIS_FILE,
    summary: {
      risLaws: risLaws.size, matchedLaws: matched.length,
      completeLaws: matched.filter((m) => m.vollstaendig).length,
      missingLaws: missingLaws.length, orphanDbLaws: orphans.length,
      risNorms: risNormenGesamt, dbNormsCovered: dbNormenErfasst,
      missingNormsInMatchedLaws: fehlendeNormenInGetroffenen,
      missingNormsFromMissingLaws: normenInFehlendenGesetzen,
      normCoveragePct: Number(p(dbNormenErfasst, risNormenGesamt)),
      lawCoveragePct: Number(p(matched.length, risLaws.size)),
    },
    missingLaws: missingLaws.sort((a, b) => b.risNormen - a.risNormen),
    incompleteLaws: matched.filter((m) => m.fehlendeNormen > 0).sort((a, b) => b.fehlendeNormen - a.fehlendeNormen),
    orphanDbLaws: orphans,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n✓ Vollreport → ${OUT}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
