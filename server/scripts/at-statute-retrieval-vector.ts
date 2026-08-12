#!/usr/bin/env bun
/**
 * AT-Gesetzes-Retrieval: Vektor-Baseline direkt gegen die Datenbank.
 *
 * WOZU: Der Umstieg von der PDF- auf die XML-Fassung überschreibt die
 * Gesetzesseiten am selben Slug. Ohne Messwert VORHER lässt sich hinterher
 * nicht belegen, ob die Umstellung das Retrieval verbessert hat.
 *
 * WARUM VEKTOR statt Volltext: Ein rein lexikalischer Lauf misst die falsche
 * Sache. Beispiel at-001 — die Frage sagt "schuldhaft zugefügt", § 1295 ABGB
 * sagt "aus Verschulden zugefügt". Nach deutschem Stemming sind das
 * verschiedene Terme, der Volltexttreffer bleibt aus. Genau diese Lücke
 * schließt die Vektorsuche; ein Volltext-Benchmark bewertet also nicht das,
 * was das Produkt tatsächlich tut.
 *
 * WAS ES MISST: Kosinus-Ähnlichkeit über content_chunks.embedding, auf die
 * Seite aggregiert (bester Chunk gewinnt). Dasselbe Embedding-Modell wie beim
 * Korpus — sonst wäre der Vergleich sinnlos.
 *
 * WAS ES NICHT MISST: die produktive Hybrid-Suche (RRF über Volltext- und
 * Vektor-Arm, Intent-Gewichtung, relationale Expansion). Die Zahl ist eine
 * Untergrenze für den Vektor-Arm, keine Produktaussage.
 *
 *   bun run server/scripts/at-statute-retrieval-vector.ts --label vorher-pdf
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
const OUT = arg("out", join(import.meta.dir, "..", "..", ".windsurf", "plans", `at-retrieval-vektor-${LABEL}.json`))!;
const TOPK = Number(arg("topk", "8"));
const MODEL = arg("model", "openai/text-embedding-3-small")!;
/** Wie viele Chunk-Nachbarn geholt werden, bevor auf Seiten reduziert wird. */
const CHUNK_FANOUT = Number(arg("fanout", "40"));

type Q = { question_id: string; question: string; expected_slug: string; legal_area: string; question_type: string };

/** .env aus server/ lesen, ohne den Wert je auszugeben. */
function loadKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  for (const p of [join(import.meta.dir, "..", ".env"), join(import.meta.dir, "..", ".env.local")]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf-8").match(/^OPENROUTER_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("OPENROUTER_API_KEY nicht gefunden");
}

async function embed(texts: string[], key: string): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: 1536 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Embedding-API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as any;
  return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
}

async function main() {
  if (!existsSync(FIXTURE)) {
    console.error(`Fixture fehlt: ${FIXTURE}`);
    process.exit(1);
  }
  const fragen: Q[] = readFileSync(FIXTURE, "utf-8")
    .trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l));

  console.log(`AT-Gesetzes-Retrieval — Vektor-Baseline "${LABEL}"`);
  console.log(`  ${fragen.length} Fragen, Top-${TOPK}, Modell ${MODEL}\n`);

  const key = loadKey();
  console.log("  Fragen einbetten …");
  const vecs: number[][] = [];
  for (let i = 0; i < fragen.length; i += 32) {
    vecs.push(...(await embed(fragen.slice(i, i + 32).map((q) => q.question), key)));
  }
  console.log(`  ${vecs.length} Vektoren erhalten\n`);

  const sql = postgres(DB_URL, { max: 2, idle_timeout: 20 });
  const results: any[] = [];
  let h1 = 0, h3 = 0, h5 = 0, hk = 0, mrrSum = 0, fehlend = 0;

  for (let i = 0; i < fragen.length; i++) {
    const q = fragen[i];
    const lit = `[${vecs[i].join(",")}]`;
    // GROUP BY + min(distance) verhindert die Nutzung des HNSW-Index und führt
    // zum Vollscan über alle Chunks. Stattdessen: Chunk-Nachbarn über den Index
    // holen (das kann er), danach in der Anwendung auf Seiten eindampfen.
    // CHUNK_FANOUT > TOPK, weil mehrere Treffer zur selben Seite gehören können.
    const rows = await sql<{ slug: string }[]>`
      SELECT p.slug
      FROM content_chunks c
      JOIN pages p ON p.id = c.page_id
      WHERE c.document_type = 'statute' AND p.deleted_at IS NULL AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${lit}::vector
      LIMIT ${CHUNK_FANOUT}
    `;
    const slugs: string[] = [];
    for (const r of rows) {
      if (!slugs.includes(r.slug)) slugs.push(r.slug);
      if (slugs.length >= TOPK) break;
    }

    // Zielseite überhaupt vorhanden? Sonst ist die Frage nicht beantwortbar.
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pages
      WHERE deleted_at IS NULL AND slug = ${q.expected_slug}
    `;
    if (n === 0) fehlend++;

    const idx = slugs.indexOf(q.expected_slug);
    const mrr = idx < 0 ? 0 : 1 / (idx + 1);
    if (idx === 0) h1++;
    if (idx >= 0 && idx < 3) h3++;
    if (idx >= 0 && idx < 5) h5++;
    if (idx >= 0) hk++;
    mrrSum += mrr;

    results.push({
      question_id: q.question_id, legal_area: q.legal_area,
      expected_slug: q.expected_slug, ziel_vorhanden: n > 0,
      rank: idx < 0 ? null : idx + 1, top_slugs: slugs.slice(0, 5), mrr,
    });
    process.stderr.write(`\r  ${i + 1}/${fragen.length}`);
  }
  process.stderr.write("\n");

  const n = fragen.length;
  const erreichbar = n - fehlend;
  const p = (x: number, d: number) => `${((x / d) * 100).toFixed(1)} %`;

  console.log("\n  ── ERGEBNIS (alle Fragen) ──");
  console.log(`    Hit@1   ${String(h1).padStart(3)}/${n}   ${p(h1, n)}`);
  console.log(`    Hit@3   ${String(h3).padStart(3)}/${n}   ${p(h3, n)}`);
  console.log(`    Hit@5   ${String(h5).padStart(3)}/${n}   ${p(h5, n)}`);
  console.log(`    Hit@${TOPK}   ${String(hk).padStart(3)}/${n}   ${p(hk, n)}`);
  console.log(`    MRR     ${(mrrSum / n).toFixed(4)}`);
  console.log(`\n  ${fehlend} Fragen zielen auf Seiten, die es NICHT gibt (nicht beantwortbar).`);
  if (erreichbar > 0) {
    console.log(`  Auf die ${erreichbar} erreichbaren bezogen: Hit@5 ${p(h5, erreichbar)}, Hit@${TOPK} ${p(hk, erreichbar)}`);
  }

  writeFileSync(OUT, JSON.stringify({
    label: LABEL, timestamp: new Date().toISOString(), modell: MODEL,
    // Gefiltert wird über document_type='statute', nicht über eine einzelne
    // source_id: die Gesetze liegen inzwischen über law-at-normen,
    // law-at-landesrecht, law-at-gemeinden und sechs weitere Quellen verteilt.
    // Ein Filter auf 'law-at' träfe nur noch 1.174 von 345.356 Chunks.
    methode: "Kosinus über content_chunks.embedding, auf Seite aggregiert (bester Chunk), document_type=statute",
    hinweis: "Nur der Vektor-Arm — nicht die produktive Hybrid-Suche. Vergleichbar nur mit Läufen derselben Methode.",
    fixture: FIXTURE, fragen: n, ziel_fehlt: fehlend, topk: TOPK,
    metrics: { hit_at_1: h1, hit_at_3: h3, hit_at_5: h5, [`hit_at_${TOPK}`]: hk, mrr: mrrSum / n },
    results,
  }, null, 2));
  console.log(`\n  ✓ ${OUT}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
