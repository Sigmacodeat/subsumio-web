#!/usr/bin/env bun
/**
 * AT-Gesetzes-Retrieval: Volltext-Baseline direkt gegen die Datenbank.
 *
 * WOZU: Der Umstieg von der PDF- auf die XML-Fassung überschreibt die
 * Gesetzesseiten am selben Slug. Ohne einen Messwert VORHER lässt sich
 * hinterher nicht mehr belegen, ob die Umstellung das Retrieval verbessert
 * hat. Dieses Skript sichert diesen Wert.
 *
 * WAS ES MISST: lexikalisches Retrieval über `pages.search_vector`
 * (Postgres-Volltext, deutsche Konfiguration) — also genau die Ebene, auf die
 * sich Textqualität auswirkt: PDF-Kopfzeilen ("Bundesrecht konsolidiert
 * www.ris.bka.gv.at Seite 29 von 191") und doppelte RIS-Sprachausgabe
 * ("§. 197.Paragraph 197,") verwässern den tsvector und drücken den Rang.
 *
 * WAS ES NICHT MISST: die produktive Hybrid-Suche (Vektor-Arm, RRF,
 * Intent-Gewichtung, relationale Expansion). Für einen Vorher/Nachher-Vergleich
 * ist das unerheblich, solange beide Läufe dieselbe Methode nutzen — für eine
 * Aussage über die Produktqualität aber NICHT ausreichend.
 *
 *   bun run server/scripts/at-statute-retrieval-baseline.ts --label vorher-pdf
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import postgres from "postgres";

function arg(name: string, fb?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb;
}

const FIXTURE = arg("fixture", join(import.meta.dir, "..", "test", "fixtures", "at-legal-retrieval.jsonl"))!;
const DB_URL = arg("db", process.env.DATABASE_URL ?? "postgres://sigmabrain@localhost:15432/sigmabrain")!;
const LABEL = arg("label", "baseline")!;
const OUT = arg("out", join(import.meta.dir, "..", "..", ".windsurf", "plans", `at-retrieval-${LABEL}.json`))!;
const TOPK = Number(arg("topk", "8"));

type Q = { question_id: string; question: string; expected_slug: string; legal_area: string; question_type: string };

/**
 * Die Frage in eine websearch_to_tsquery-taugliche Form bringen. Fragewörter
 * und Füllwörter tragen nichts bei und verwässern den Treffer.
 */
const STOPP = new Set([
  "wer", "was", "wie", "wann", "wo", "warum", "welche", "welcher", "welches", "welchen",
  "ist", "sind", "hat", "haben", "wird", "werden", "kann", "können", "muss", "müssen",
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen",
  "und", "oder", "aber", "für", "mit", "von", "zu", "im", "in", "auf", "an", "bei",
  "sich", "man", "es", "er", "sie", "dass", "ob", "nach", "aus", "über", "unter",
]);

function toQuery(frage: string): string {
  return frage
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s§]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPP.has(w))
    .slice(0, 12)
    .join(" ");
}

async function main() {
  if (!existsSync(FIXTURE)) {
    console.error(`Fixture fehlt: ${FIXTURE}`);
    process.exit(1);
  }
  const fragen: Q[] = readFileSync(FIXTURE, "utf-8")
    .trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l));

  const sql = postgres(DB_URL, { max: 2, idle_timeout: 20 });

  console.log(`AT-Gesetzes-Retrieval — Volltext-Baseline "${LABEL}"`);
  console.log(`  ${fragen.length} Fragen, Top-${TOPK}\n`);

  const results: any[] = [];
  let h1 = 0, h3 = 0, h5 = 0, hk = 0, mrrSum = 0, leer = 0;

  for (const q of fragen) {
    const suchtext = toQuery(q.question);
    let slugs: string[] = [];
    try {
      const rows = await sql<{ slug: string }[]>`
        SELECT slug
        FROM pages
        WHERE source_id = 'law-at'
          AND deleted_at IS NULL
          AND search_vector @@ websearch_to_tsquery('german', ${suchtext})
        ORDER BY ts_rank(search_vector, websearch_to_tsquery('german', ${suchtext})) DESC
        LIMIT ${TOPK}
      `;
      slugs = rows.map((r) => r.slug);
    } catch (e) {
      slugs = [];
    }
    if (slugs.length === 0) leer++;

    const idx = slugs.indexOf(q.expected_slug);
    const mrr = idx < 0 ? 0 : 1 / (idx + 1);
    if (idx === 0) h1++;
    if (idx >= 0 && idx < 3) h3++;
    if (idx >= 0 && idx < 5) h5++;
    if (idx >= 0) hk++;
    mrrSum += mrr;

    results.push({
      question_id: q.question_id, legal_area: q.legal_area,
      expected_slug: q.expected_slug, rank: idx < 0 ? null : idx + 1,
      top_slugs: slugs.slice(0, 5), mrr,
    });
  }

  const n = fragen.length;
  const p = (x: number) => `${((x / n) * 100).toFixed(1)} %`;

  console.log("  ── ERGEBNIS ──");
  console.log(`    Hit@1     ${String(h1).padStart(3)}/${n}   ${p(h1)}`);
  console.log(`    Hit@3     ${String(h3).padStart(3)}/${n}   ${p(h3)}`);
  console.log(`    Hit@5     ${String(h5).padStart(3)}/${n}   ${p(h5)}`);
  console.log(`    Hit@${TOPK}     ${String(hk).padStart(3)}/${n}   ${p(hk)}`);
  console.log(`    MRR       ${(mrrSum / n).toFixed(4)}`);
  console.log(`    ohne Treffer: ${leer}`);

  const perArea: Record<string, { n: number; hit5: number }> = {};
  for (let i = 0; i < fragen.length; i++) {
    const a = fragen[i].legal_area;
    perArea[a] ??= { n: 0, hit5: 0 };
    perArea[a].n++;
    const r = results[i].rank;
    if (r !== null && r <= 5) perArea[a].hit5++;
  }
  console.log("\n  ── nach Rechtsgebiet (Hit@5) ──");
  for (const [a, v] of Object.entries(perArea).sort((x, y) => y[1].n - x[1].n)) {
    console.log(`    ${a.padEnd(16)} ${String(v.hit5).padStart(3)}/${String(v.n).padEnd(3)}  ${((v.hit5 / v.n) * 100).toFixed(0)} %`);
  }

  writeFileSync(OUT, JSON.stringify({
    label: LABEL, timestamp: new Date().toISOString(),
    methode: "postgres websearch_to_tsquery('german') über pages.search_vector, source_id=law-at",
    hinweis: "Nur lexikalisch — nicht die produktive Hybrid-Suche. Vergleichbar nur mit Läufen derselben Methode.",
    fixture: FIXTURE, fragen: n, topk: TOPK,
    metrics: { hit_at_1: h1, hit_at_3: h3, hit_at_5: h5, [`hit_at_${TOPK}`]: hk, mrr: mrrSum / n, ohne_treffer: leer },
    results,
  }, null, 2));
  console.log(`\n  ✓ ${OUT}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
