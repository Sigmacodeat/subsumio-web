/**
 * Embedding bake-off, step 1: questions, gold answers and the corpus sample.
 *
 * Runs against the live AT corpus (engine container on the server). Writes:
 *   queries.jsonl  — {qid, category, question, gold_page_ids, gold_slug}
 *   corpus.jsonl   — {id, page_id, source_id, embed_text, raw_text}
 *   keyword.jsonl  — {qid, chunk_ids}: the production keyword arm's ranking
 *   manifest.json  — counts and parameters
 *
 * Question sources:
 *   fixture     — the hand-written AT gold set (test/fixtures/at-legal-retrieval.jsonl)
 *   statute     — federal norms (half from the laws lawyers use most)
 *   landesrecht — state law; the question names the Bundesland, the other
 *                 eight states' laws on the same subject are in the sample
 *   decision    — Rechtssätze of OGH, VwGH and VfGH
 * Generated questions come from Claude, which is told not to name the §,
 * the abbreviation or the case number and not to copy phrases, so a model
 * cannot win by string matching.
 *
 * Corpus sample = every chunk of every gold page
 *               + the rest of each gold statute (same statute_id)
 *               + for state law: the other states' laws on the same subject
 *               + the top 200 chunks of the production keyword search per question
 *               + a seeded random sample of the live AT corpus.
 * The distractors are chosen without any embedding model, so no candidate
 * is favoured by how the sample was built.
 *
 * Usage (inside the engine container):
 *   bun run src/eval/embedding-bakeoff/build-dataset.ts --out /data/eval/embedding-bakeoff
 */

import { parseArgs } from "util";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadConfig, toEngineConfig } from "../../core/config.ts";
import { createEngine } from "../../core/engine-factory.ts";
import { buildGatewayConfig } from "../../core/ai/build-gateway-config.ts";
import { chat, configureGateway } from "../../core/ai/gateway.ts";
import {
  buildContextualPrefix,
  buildLegalContextualPrefix,
  isCourtDecisionPage,
  isLegalPage,
  sanitizeTitle,
  wrapChunkForEmbedding,
} from "../../core/embedding-context.ts";
import { buildRelaxedLegalKeywordQuery } from "../../core/search/hybrid.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out: { type: "string", default: "/data/eval/embedding-bakeoff" },
    fixture: { type: "string", default: "test/fixtures/at-legal-retrieval.jsonl" },
    statutes: { type: "string", default: "110" },
    landesrecht: { type: "string", default: "50" },
    decisions: { type: "string", default: "90" },
    random: { type: "string", default: "50000" },
    "gen-model": { type: "string", default: "anthropic:claude-opus-5" },
    concurrency: { type: "string", default: "6" },
    "keyword-concurrency": { type: "string", default: "4" },
    seed: { type: "string", default: "7" },
    "skip-generation": { type: "boolean", default: false },
  },
});

const OUT = String(values.out);
const SEED = Number(values.seed);
const GEN_MODEL = String(values["gen-model"]);
const CONCURRENCY = Number(values.concurrency);

/** The laws Austrian lawyers look up most; half the federal questions come from these. */
const CORE_LAWS = [
  "ABGB",
  "UGB",
  "ZPO",
  "EO",
  "IO",
  "StGB",
  "StPO",
  "ASVG",
  "AVG",
  "B-VG",
  "BAO",
  "MRG",
  "KSchG",
  "GmbHG",
  "AktG",
  "ArbVG",
  "AngG",
  "AZG",
  "UrlG",
  "EheG",
  "AußStrG",
  "GewO 1994",
  "EStG 1988",
  "UStG 1994",
  "WEG 2002",
  "VStG",
  "VwGVG",
  "JN",
  "DSG",
];

type Row = Record<string, unknown>;
type Engine = { executeRaw(sql: string, params?: unknown[]): Promise<unknown[]> };

interface Query {
  qid: string;
  category: "fixture" | "statute" | "landesrecht" | "decision";
  question: string;
  gold_page_ids: number[];
  gold_slug: string;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

async function rows<T = Row>(engine: Engine, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await engine.executeRaw(sql, params)) as T[];
}

/** Deterministic order for sampling: same seed → same pages. */
const seededOrder = `md5(p.id::text || '-' || ${SEED})`;

async function pageText(engine: Engine, pageId: number, maxChars = 6000): Promise<string> {
  const r = await rows<{ chunk_text: string }>(
    engine,
    `SELECT chunk_text FROM content_chunks WHERE page_id = $1 ORDER BY chunk_index`,
    [pageId]
  );
  return r
    .map((x) => x.chunk_text)
    .join("\n")
    .slice(0, maxChars);
}

// ─── Question generation ──────────────────────────────────────────────────

const GEN_SYSTEM = `Du erstellst Testfragen für die Suchmaschine eines juristischen Recherchesystems für österreichisches Recht.
Du bekommst eine Rechtsquelle (Paragraph eines Gesetzes oder Rechtssatz einer Entscheidung).
Schreibe genau EINE Frage, wie sie eine Anwältin, ein Konzipient oder ein Mandant realistisch stellen würde, und die genau diese Quelle beantwortet.

Regeln:
- Nenne KEINE Paragraphen- oder Artikelnummer, KEINE Gesetzesabkürzung, KEIN Gesetzesnamen-Zitat und KEINE Geschäftszahl.
- Übernimm keine Formulierungen aus dem Text: höchstens drei aufeinanderfolgende Wörter dürfen identisch sein. Umschreibe mit eigenen Worten, gerne als konkreter Lebenssachverhalt.
- Wenn ein Bundesland angegeben ist, nenne es in der Frage (z. B. "in Tirol").
- Die Frage muss ohne die Quelle verständlich sein und darf nicht mehrere Themen mischen.
- Ist die Quelle für eine sinnvolle Frage ungeeignet (nur Inkrafttreten, Außerkrafttreten, Verweise, Überschrift, Übergangsbestimmung, reine Zuständigkeitsverschiebung, Tabelle ohne Aussage), setze usable auf false.

Antworte nur mit JSON: {"usable": true|false, "question": "..."}`;

async function generateQuestion(source: {
  kind: string;
  header: string;
  region?: string | null;
  text: string;
}): Promise<string | null> {
  const prompt = [
    `Art der Quelle: ${source.kind}`,
    `Fundstelle (nur zu deiner Orientierung, NICHT in die Frage übernehmen): ${source.header}`,
    source.region ? `Bundesland: ${source.region}` : "",
    "",
    "Text:",
    source.text,
  ]
    .filter(Boolean)
    .join("\n");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await chat({
        model: GEN_MODEL,
        system: GEN_SYSTEM,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4000,
      });
      const match = res.text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as { usable?: boolean; question?: string };
      if (!parsed.usable || !parsed.question || parsed.question.length < 15) return null;
      return parsed.question.trim();
    } catch (e) {
      if (attempt === 2) {
        log(`  Generierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    })
  );
  return out;
}

interface Candidate {
  page_id: number;
  slug: string;
  category: Query["category"];
  kind: string;
  header: string;
  region: string | null;
  text: string;
}

async function statuteCandidates(engine: Engine, n: number): Promise<Candidate[]> {
  const pick = async (core: boolean, limit: number) =>
    rows<{ id: number; slug: string; abbr: string | null; par: string | null; title: string }>(
      engine,
      `SELECT p.id, p.slug, p.frontmatter->>'abbr' AS abbr,
              p.frontmatter->>'paragraph_ref' AS par, p.title
         FROM pages p
        WHERE p.source_id = 'law-at-normen' AND p.deleted_at IS NULL
          AND ${core ? "" : "NOT"} (coalesce(p.frontmatter->>'abbr','') = ANY($1::text[]))
          AND p.frontmatter->>'paragraph_ref' ~ '^(§|Art)'
          AND (SELECT sum(length(chunk_text)) FROM content_chunks c WHERE c.page_id = p.id)
              BETWEEN 300 AND 5000
        ORDER BY ${seededOrder}
        LIMIT $2`,
      [CORE_LAWS, limit]
    );
  // Oversample: some sources are unusable (Inkrafttreten, Verweise).
  const core = await pick(true, Math.ceil(n * 0.5 * 1.5));
  const rest = await pick(false, Math.ceil(n * 0.5 * 1.5));
  const out: Candidate[] = [];
  for (const r of [...core, ...rest]) {
    out.push({
      page_id: r.id,
      slug: r.slug,
      category: "statute",
      kind: "Paragraph eines österreichischen Bundesgesetzes oder einer Verordnung",
      header: `${r.abbr ?? r.title} ${r.par ?? ""}`.trim(),
      region: null,
      text: await pageText(engine, r.id),
    });
  }
  return out;
}

async function landesrechtCandidates(engine: Engine, n: number): Promise<Candidate[]> {
  const r = await rows<{
    id: number;
    slug: string;
    region: string;
    title: string;
    par: string | null;
  }>(
    engine,
    `SELECT p.id, p.slug, p.frontmatter->>'region' AS region, p.title,
            p.frontmatter->>'paragraph_ref' AS par
       FROM pages p
      WHERE p.source_id = 'law-at-landesrecht' AND p.deleted_at IS NULL
        AND coalesce(p.frontmatter->>'region','') <> ''
        AND p.frontmatter->>'paragraph_ref' ~ '^(§|Art)'
        AND (SELECT sum(length(chunk_text)) FROM content_chunks c WHERE c.page_id = p.id)
            BETWEEN 300 AND 5000
      ORDER BY ${seededOrder}
      LIMIT $1`,
    [Math.ceil(n * 1.5)]
  );
  const out: Candidate[] = [];
  for (const x of r) {
    out.push({
      page_id: x.id,
      slug: x.slug,
      category: "landesrecht",
      kind: "Paragraph eines österreichischen Landesgesetzes",
      header: `${x.title} ${x.par ?? ""}`.trim(),
      region: x.region,
      text: await pageText(engine, x.id),
    });
  }
  return out;
}

async function decisionCandidates(engine: Engine, n: number): Promise<Candidate[]> {
  const perSource: Array<[string, number]> = [
    ["law-at-judikatur", Math.ceil(n * 0.4)],
    ["law-at-judikatur-vwgh", Math.ceil(n * 0.4)],
    ["law-at-judikatur-vfgh", Math.ceil(n * 0.2)],
  ];
  const out: Candidate[] = [];
  for (const [source, count] of perSource) {
    const r = await rows<{ id: number; slug: string; court: string; cn: string; text: string }>(
      engine,
      `SELECT p.id, p.slug, p.frontmatter->>'court' AS court,
              p.frontmatter->>'case_number' AS cn, c.chunk_text AS text
         FROM pages p
         JOIN LATERAL (
           SELECT chunk_text FROM content_chunks c
            WHERE c.page_id = p.id AND c.chunk_role = 'leitsatz'
            ORDER BY c.chunk_index LIMIT 1
         ) c ON true
        WHERE p.source_id = $1 AND p.deleted_at IS NULL
          AND length(c.chunk_text) BETWEEN 250 AND 1800
        ORDER BY ${seededOrder}
        LIMIT $2`,
      [source, Math.ceil(count * 1.4)]
    );
    for (const x of r) {
      out.push({
        page_id: x.id,
        slug: x.slug,
        category: "decision",
        kind: "Rechtssatz / Leitsatz einer Entscheidung eines österreichischen Höchstgerichts",
        header: `${x.court ?? ""} ${x.cn ?? ""}`.trim(),
        region: null,
        text: x.text,
      });
    }
  }
  return out;
}

async function buildQueries(engine: Engine): Promise<Query[]> {
  const path = join(OUT, "queries.jsonl");
  const existing = readJsonl<Query>(path);
  if (values["skip-generation"]) {
    log(`Fragen: ${existing.length} vorhandene übernommen (--skip-generation)`);
    return existing;
  }
  const done = new Set(existing.map((q) => q.gold_slug));
  const queries = [...existing];
  const append = (q: Query) => {
    queries.push(q);
    appendFileSync(path, JSON.stringify(q) + "\n");
  };

  // Fixture questions: hand-written, gold resolved to live page ids.
  if (!existing.some((q) => q.category === "fixture")) {
    const fixture = readJsonl<{ question_id: string; question: string; expected_slug: string }>(
      String(values.fixture)
    );
    const found = await rows<{ id: number; slug: string }>(
      engine,
      `SELECT id, slug FROM pages WHERE deleted_at IS NULL AND slug = ANY($1::text[])`,
      [fixture.map((f) => f.expected_slug)]
    );
    const idBySlug = new Map(found.map((f) => [f.slug, f.id]));
    let skipped = 0;
    for (const f of fixture) {
      const id = idBySlug.get(f.expected_slug);
      if (!id) {
        skipped++;
        continue;
      }
      append({
        qid: `fixture-${f.question_id}`,
        category: "fixture",
        question: f.question,
        gold_page_ids: [id],
        gold_slug: f.expected_slug,
      });
    }
    log(`Fixture: ${fixture.length - skipped} übernommen, ${skipped} ohne lebende Seite`);
  }

  const targets: Array<[Query["category"], number, () => Promise<Candidate[]>]> = [
    ["statute", Number(values.statutes), () => statuteCandidates(engine, Number(values.statutes))],
    [
      "landesrecht",
      Number(values.landesrecht),
      () => landesrechtCandidates(engine, Number(values.landesrecht)),
    ],
    [
      "decision",
      Number(values.decisions),
      () => decisionCandidates(engine, Number(values.decisions)),
    ],
  ];
  for (const [category, want, load] of targets) {
    let have = queries.filter((q) => q.category === category).length;
    if (have >= want) continue;
    const candidates = (await load()).filter((c) => !done.has(c.slug) && c.text.length > 0);
    log(`${category}: ${candidates.length} Kandidaten, Ziel ${want}, vorhanden ${have}`);
    // Process in rounds so we stop once the target is reached.
    for (let i = 0; i < candidates.length && have < want; i += CONCURRENCY * 2) {
      const batch = candidates.slice(i, i + CONCURRENCY * 2);
      const qs = await mapLimit(batch, CONCURRENCY, (c) => generateQuestion(c));
      batch.forEach((c, j) => {
        const q = qs[j];
        if (!q || have >= want) return;
        have++;
        done.add(c.slug);
        append({
          qid: `${category}-${c.page_id}`,
          category,
          question: q,
          gold_page_ids: [c.page_id],
          gold_slug: c.slug,
        });
      });
      log(`  ${category}: ${have}/${want}`);
    }
  }
  return queries;
}

// ─── Keyword arm (production shape) ───────────────────────────────────────

const AT_SOURCE_FILTER = `p.source_id LIKE 'law-at%'`;

async function keywordRanking(engine: Engine, question: string, limit = 200): Promise<number[]> {
  const run = async (q: string) =>
    rows<{ id: number }>(
      engine,
      `SELECT c.id
         FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE c.search_vector @@ websearch_to_tsquery('german', $1)
          AND p.deleted_at IS NULL AND ${AT_SOURCE_FILTER}
        ORDER BY ts_rank(c.search_vector, websearch_to_tsquery('german', $1)) DESC, c.id
        LIMIT $2`,
      [q, limit]
    );
  // A query that hits the database statement timeout counts as "no hits"
  // for that arm instead of aborting the whole build.
  const safeRun = async (q: string) => {
    try {
      return await run(q);
    } catch (e) {
      if ((e as { code?: string }).code !== "57014") throw e;
      log(`  Keyword-Zeitlimit: ${q.slice(0, 60)}`);
      return [];
    }
  };
  const strict = (await safeRun(question)).map((r) => r.id);
  // Production falls back to a bounded OR query when the strict arm returns
  // fewer than 3 hits (search/hybrid.ts).
  if (strict.length >= 3) return strict;
  const relaxed = buildRelaxedLegalKeywordQuery(question);
  if (!relaxed) return strict;
  const seen = new Set(strict);
  const merged = [...strict];
  for (const r of await safeRun(relaxed)) {
    if (!seen.has(r.id) && merged.length < limit) {
      seen.add(r.id);
      merged.push(r.id);
    }
  }
  return merged;
}

/** Core noun of a state law title: "Tiroler Bauordnung 2022" → "Bauordnung". */
function lawStem(title: string): string | null {
  const words = title.match(/[\p{L}-]+/gu) ?? [];
  const law = words.filter((w) => /(gesetz|ordnung|verordnung)$/i.test(w));
  const pick = (law.length ? law : words.filter((w) => w.length >= 8)).sort(
    (a, b) => b.length - a.length
  )[0];
  return pick && pick.length >= 6 ? pick : null;
}

// ─── Corpus sample ────────────────────────────────────────────────────────

async function buildSample(engine: Engine, queries: Query[], keyword: Map<string, number[]>) {
  const ids = new Set<number>();
  const addIds = (list: Array<{ id: number }>) => list.forEach((r) => ids.add(r.id));
  const goldPages = [...new Set(queries.flatMap((q) => q.gold_page_ids))];

  // 1. Every chunk of every gold page.
  addIds(
    await rows(engine, `SELECT id FROM content_chunks WHERE page_id = ANY($1::int[])`, [goldPages])
  );
  log(`Stichprobe: ${ids.size} Chunks aus ${goldPages.length} Gold-Seiten`);

  // 2. The rest of each gold statute (same statute_id), capped per law.
  addIds(
    await rows(
      engine,
      `WITH laws AS (
         SELECT DISTINCT frontmatter->>'statute_id' AS sid FROM pages
          WHERE id = ANY($1::int[]) AND frontmatter->>'statute_id' IS NOT NULL
       ), ranked AS (
         SELECT c.id, row_number() OVER (PARTITION BY p.frontmatter->>'statute_id' ORDER BY c.id) AS rn
           FROM laws l
           JOIN pages p ON p.frontmatter->>'statute_id' = l.sid AND p.deleted_at IS NULL
           JOIN content_chunks c ON c.page_id = p.id
       )
       SELECT id FROM ranked WHERE rn <= 2500`,
      [goldPages]
    )
  );
  log(`Stichprobe: ${ids.size} nach ganzen Gold-Gesetzen`);

  // 3. State law: the same law of the other eight states. legal_area is
  // mostly empty for state law, so match on the law's core noun
  // ("Steiermärkisches Feuerwehrgesetz" → every "…Feuerwehrgesetz").
  const statePages = await rows<{ title: string; region: string | null }>(
    engine,
    `SELECT DISTINCT title, frontmatter->>'region' AS region FROM pages
      WHERE id = ANY($1::int[]) AND source_id = 'law-at-landesrecht'`,
    [goldPages]
  );
  for (const sp of statePages) {
    const stem = lawStem(sp.title);
    if (!stem) continue;
    addIds(
      await rows(
        engine,
        `SELECT c.id FROM pages p JOIN content_chunks c ON c.page_id = p.id
          WHERE p.source_id = 'law-at-landesrecht' AND p.deleted_at IS NULL
            AND p.title ILIKE '%' || $1 || '%'
            AND p.frontmatter->>'region' IS DISTINCT FROM $2
          ORDER BY md5(c.id::text) LIMIT 1500`,
        [stem, sp.region]
      )
    );
  }
  log(`Stichprobe: ${ids.size} nach Landesrecht-Nachbarn`);

  // 4. Keyword top 200 per question (lexically confusable distractors).
  for (const list of keyword.values()) list.forEach((id) => ids.add(id));
  log(`Stichprobe: ${ids.size} nach Keyword-Distraktoren`);

  // 5. Seeded random sample of the live AT corpus.
  const want = Number(values.random);
  const total = await rows<{ n: string }>(
    engine,
    `SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'content_chunks'`
  );
  const pct = Math.min(100, ((want * 1.6) / Math.max(Number(total[0]?.n ?? 1), 1)) * 100);
  addIds(
    await rows(
      engine,
      `SELECT c.id FROM content_chunks c TABLESAMPLE BERNOULLI(${pct.toFixed(4)}) REPEATABLE(${SEED})
         JOIN pages p ON p.id = c.page_id
        WHERE p.deleted_at IS NULL AND ${AT_SOURCE_FILTER} AND length(c.chunk_text) > 0
        LIMIT $1`,
      [want]
    )
  );
  log(`Stichprobe: ${ids.size} nach Zufallsstichprobe`);
  return [...ids].sort((a, b) => a - b);
}

async function exportCorpus(engine: Engine, chunkIds: number[]) {
  const path = join(OUT, "corpus.jsonl");
  writeFileSync(path, "");
  const prefixCache = new Map<number, string | null>();
  for (let i = 0; i < chunkIds.length; i += 5000) {
    const batch = chunkIds.slice(i, i + 5000);
    const r = await rows<{
      id: number;
      page_id: number;
      source_id: string;
      chunk_text: string;
      chunk_source: string | null;
      title: string | null;
      type: string | null;
      frontmatter: Record<string, unknown> | string | null;
    }>(
      engine,
      `SELECT c.id, c.page_id, p.source_id, c.chunk_text, c.chunk_source,
              p.title, p.type, p.frontmatter
         FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE c.id = ANY($1::int[]) ORDER BY c.id`,
      [batch]
    );
    const lines: string[] = [];
    for (const x of r) {
      if (!prefixCache.has(x.page_id)) {
        const fm =
          typeof x.frontmatter === "string"
            ? (JSON.parse(x.frontmatter) as Record<string, unknown>)
            : (x.frontmatter ?? {});
        const title = sanitizeTitle(x.title ?? "");
        const legal =
          isLegalPage(fm) ||
          isCourtDecisionPage(fm) ||
          ["law", "statute", "court_decision", "judgement"].includes(x.type ?? "");
        // Same prefix the bulk embedder sends (scripts/auto-embed-pg.ts).
        prefixCache.set(
          x.page_id,
          legal ? buildLegalContextualPrefix(title, fm, null) : buildContextualPrefix(title, null)
        );
      }
      lines.push(
        JSON.stringify({
          id: x.id,
          page_id: x.page_id,
          source_id: x.source_id,
          embed_text: wrapChunkForEmbedding(
            x.chunk_text,
            prefixCache.get(x.page_id) ?? null,
            x.chunk_source
          ),
          raw_text: x.chunk_text,
        })
      );
    }
    appendFileSync(path, lines.join("\n") + "\n");
    log(`Export: ${Math.min(i + 5000, chunkIds.length)}/${chunkIds.length}`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  // Registering the generator as chat model lets the gateway accept it even
  // when the Anthropic recipe's model list predates it.
  configureGateway({ ...buildGatewayConfig(cfg), chat_model: GEN_MODEL });
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  const queries = await buildQueries(engine);
  log(`Fragen gesamt: ${queries.length}`);

  const keywordPath = join(OUT, "keyword.jsonl");
  const keyword = new Map(
    readJsonl<{ qid: string; chunk_ids: number[] }>(keywordPath).map((k) => [k.qid, k.chunk_ids])
  );
  // Relaxed OR queries scan large parts of the corpus; run a few at once.
  const pending = queries.filter((q) => !keyword.has(q.qid));
  let kwDone = 0;
  await mapLimit(pending, Number(values["keyword-concurrency"]), async (q) => {
    const ids = await keywordRanking(engine, q.question);
    keyword.set(q.qid, ids);
    appendFileSync(keywordPath, JSON.stringify({ qid: q.qid, chunk_ids: ids }) + "\n");
    if (++kwDone % 20 === 0) log(`  Keyword-Arm: ${kwDone}/${pending.length}`);
  });
  log(`Keyword-Arm: ${keyword.size} Fragen`);

  const sample = await buildSample(engine, queries, keyword);
  await exportCorpus(engine, sample);

  const byCategory: Record<string, number> = {};
  for (const q of queries) byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        seed: SEED,
        gen_model: GEN_MODEL,
        queries: queries.length,
        by_category: byCategory,
        corpus_chunks: sample.length,
      },
      null,
      2
    )
  );
  log(`Fertig: ${queries.length} Fragen, ${sample.length} Chunks → ${OUT}`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
