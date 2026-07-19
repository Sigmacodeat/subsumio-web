/**
 * Embedding Model Sweep — A/B/C/D-Vergleich von Embedding-Modellen fuer
 * DACH Legal Retrieval (Fokus: AT-Schwaeche, MRR 0.670 vs DE 0.842).
 *
 * Hintergrund: Die bestehende Prod-Spalte `embedding` (text-embedding-3-small,
 * 1536d) ist die Baseline. Jeder Kandidat bekommt eine eigene pgvector-Spalte
 * in content_chunks, in die ein DETERMINISTISCHES, fuer alle Modelle
 * IDENTISCHES Chunk-Subset embedded wird (alle Chunks der Gold-Antwort-Pages
 * + Distraktor-Pool). Danach laeuft der DACH-Benchmark pro Kandidat ueber
 * die SearchOpts.embeddingColumn-Naht (ResolvedColumn-Deskriptor, gleiches
 * Muster wie run.ts) — Query-Seite folgt dem Deskriptor automatisch
 * (hybrid.ts gibt embeddingModel/dimensions an embedQuery weiter).
 *
 * Fairness:
 *   - Gleiches Subset, gleiche Fragen, gleiche Retrieval-Parameter.
 *   - Keyword-Arm (tsvector) ist modellunabhaengig und damit konstant.
 *   - Kandidaten-Spalten bekommen per Default einen HNSW-Index, damit
 *     approximative Suche wie in Prod gilt (sonst haetten Kandidaten mit
 *     exaktem kNN einen unfairen Vorteil gegenueber der HNSW-Baseline).
 *
 * Usage (aus server/ heraus):
 *   bun run src/eval/dach-legal-retrieval/embedding-model-sweep.ts [options]
 *
 * Phasen (Default: alle nacheinander):
 *   --phase subset    Subset bestimmen + speichern (einmalig, deterministisch)
 *   --phase prepare   Kandidaten-Spalten anlegen + Subset embedden (resumable)
 *   --phase run       Benchmark pro Kandidat laufen lassen
 *   --phase report    Vergleichstabelle erzeugen
 *
 * Optionen:
 *   --config PATH        Kandidaten-Config (Default: embedding-model-sweep.config.json neben diesem Script)
 *   --jurisdiction J     Gold-Set: at|de (Default: at)
 *   --with-de            Zusaetzlich DE als Kontrollgruppe messen
 *   --top-k N            Top-K (Default: 8)
 *   --llm-rerank         LLM-Reranker aktivieren (Top-25, wie Prod-Empfehlung)
 *   --max-chunks N       Subset-Groesse inkl. Distraktoren (Default: 150000)
 *   --batch-size N       Embedding-Batch (Default: 100)
 *   --database-url URL   Postgres-URL (Default: env DATABASE_URL)
 *   --output-dir DIR     Ergebnisse (Default: ./embedding-model-sweep-out)
 *   --no-index           Keine HNSW-Indizes auf Kandidaten-Spalten
 *   --dry-run            Nur Zaehlungen/Kostenschaetzung, keine Writes/API-Calls
 *   --help
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = join(SCRIPT_DIR, "embedding-model-sweep.config.json");

// ─── Types ───────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  column: string;
  embeddingModel: string;
  dimensions: number;
  prepare: boolean;
  price_per_mtok_usd?: number;
  note?: string;
}

interface SweepFileConfig {
  subset: { max_chunks: number; sources_by_jurisdiction: Record<string, string[]> };
  candidates: Candidate[];
}

interface SubsetFile {
  jurisdiction: string;
  created_at: string;
  chunk_ids: number[];
  expected_count: number;
  distractor_count: number;
}

interface CandidateResult {
  candidate: Candidate;
  total: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
  duration_ms: number;
  missing_embeddings: number;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  phase: "all" | "subset" | "prepare" | "run" | "report";
  configPath: string;
  jurisdiction: "at" | "de";
  withDe: boolean;
  topK: number;
  llmRerank: boolean;
  maxChunks?: number;
  batchSize: number;
  databaseUrl?: string;
  outputDir: string;
  withIndex: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    phase: "all",
    configPath: DEFAULT_CONFIG,
    jurisdiction: "at",
    withDe: false,
    topK: 8,
    llmRerank: false,
    batchSize: 100,
    outputDir: join(SCRIPT_DIR, "embedding-model-sweep-out"),
    withIndex: true,
    dryRun: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--phase" && i + 1 < args.length) {
      out.phase = args[++i] as ParsedArgs["phase"];
      continue;
    }
    if (a === "--config" && i + 1 < args.length) {
      out.configPath = args[++i];
      continue;
    }
    if (a === "--jurisdiction" && i + 1 < args.length) {
      out.jurisdiction = args[++i] as "at" | "de";
      continue;
    }
    if (a === "--with-de") {
      out.withDe = true;
      continue;
    }
    if (a === "--top-k" && i + 1 < args.length) {
      out.topK = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--llm-rerank") {
      out.llmRerank = true;
      continue;
    }
    if (a === "--max-chunks" && i + 1 < args.length) {
      out.maxChunks = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--batch-size" && i + 1 < args.length) {
      out.batchSize = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--database-url" && i + 1 < args.length) {
      out.databaseUrl = args[++i];
      continue;
    }
    if (a === "--output-dir" && i + 1 < args.length) {
      out.outputDir = args[++i];
      continue;
    }
    if (a === "--no-index") {
      out.withIndex = false;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        "Siehe Header-Kommentar. Phasen: subset|prepare|run|report (Default: all).\n"
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const COLUMN_NAME_REGEX = /^[a-z_][a-z0-9_]*$/;

function validateCandidates(cfg: SweepFileConfig): void {
  const seen = new Set<string>();
  for (const c of cfg.candidates) {
    if (!COLUMN_NAME_REGEX.test(c.column)) {
      throw new Error(`Ungueltiger Spaltenname "${c.column}" (Regex: ${COLUMN_NAME_REGEX})`);
    }
    if (seen.has(c.column)) throw new Error(`Doppelte Spalte "${c.column}" in Config`);
    seen.add(c.column);
    if (!c.embeddingModel.includes(":")) {
      throw new Error(`embeddingModel "${c.embeddingModel}" muss 'provider:model' sein`);
    }
    if (c.dimensions < 1 || c.dimensions > 8192) {
      throw new Error(`dimensions ${c.dimensions} ausserhalb 1..8192 (${c.id})`);
    }
  }
}

function loadSweepConfig(path: string): SweepFileConfig {
  const cfg = JSON.parse(readFileSync(path, "utf-8")) as SweepFileConfig;
  validateCandidates(cfg);
  return cfg;
}

function subsetPath(opts: ParsedArgs, jurisdiction: string): string {
  return join(opts.outputDir, `subset-${jurisdiction}.json`);
}

function resultsPath(opts: ParsedArgs): string {
  return join(opts.outputDir, "sweep-results.json");
}

function vecToString(v: Float32Array): string {
  return `[${Array.from(v).join(",")}]`;
}

async function connectSql(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Keine DB-Verbindung. --database-url postgresql://... oder env DATABASE_URL setzen " +
        "(Prod: SSH-Tunnel, z. B. postgresql://user:pass@localhost:15432/db)."
    );
  }
  const { default: postgres } = await import("postgres");
  return postgres(url, { max: 4, prepare: false });
}

/** Gold-Antwort-Slug-Patterns pro Jurisdiktion (spiegelt slugMatches aus run.ts). */
function expectedSlugPatterns(questions: any[], jurisdiction: string): string[] {
  const patterns = new Set<string>();
  for (const q of questions) {
    if (q.expected_slug) {
      patterns.add(`${q.expected_slug}%`);
    } else if (q.answer_slug) {
      const jur = q.jurisdiction === "xj" ? jurisdiction : q.jurisdiction;
      patterns.add(`legal/statutes/${jur}/${q.answer_slug}/%`);
      patterns.add(`law/${jur}/${q.answer_slug}%`);
    }
  }
  return [...patterns];
}

// ─── Phase: subset ───────────────────────────────────────────────────────

async function phaseSubset(opts: ParsedArgs, cfg: SweepFileConfig, jurisdiction: string) {
  const runModule: any = await import("./run.ts");
  const questions = runModule.loadAllQuestions(jurisdiction) as any[];
  if (questions.length === 0) throw new Error(`Keine Fragen fuer ${jurisdiction} gefunden.`);
  const patterns = expectedSlugPatterns(questions, jurisdiction);
  const sources = cfg.subset.sources_by_jurisdiction[jurisdiction];
  if (!sources) throw new Error(`Keine Sources fuer ${jurisdiction} in Config.`);
  const maxChunks = opts.maxChunks ?? cfg.subset.max_chunks;

  const sql = await connectSql(opts.databaseUrl);
  try {
    const expectedRows = await sql<{ id: number }[]>`
      SELECT cc.id
      FROM content_chunks cc
      JOIN pages p ON p.id = cc.page_id
      WHERE p.slug LIKE ANY(${patterns})
      ORDER BY cc.id`;
    const expectedIds = expectedRows.map((r) => r.id);
    process.stderr.write(
      `[subset] ${jurisdiction}: ${expectedIds.length} Gold-Chunks auf ${patterns.length} Slug-Patterns\n`
    );

    const remaining = Math.max(0, maxChunks - expectedIds.length);
    const distractorRows = await sql<{ id: number }[]>`
      SELECT cc.id
      FROM content_chunks cc
      JOIN pages p ON p.id = cc.page_id
      WHERE p.source_id = ANY(${sources})
        AND NOT (cc.id = ANY(${expectedIds.length > 0 ? expectedIds : [-1]}))
      ORDER BY md5(cc.id::text)
      LIMIT ${remaining}`;
    const distractorIds = distractorRows.map((r) => r.id);
    process.stderr.write(
      `[subset] ${jurisdiction}: ${distractorIds.length} Distraktoren (Ziel: ${remaining})\n`
    );

    const subset: SubsetFile = {
      jurisdiction,
      created_at: new Date().toISOString(),
      chunk_ids: [...expectedIds, ...distractorIds],
      expected_count: expectedIds.length,
      distractor_count: distractorIds.length,
    };
    mkdirSync(opts.outputDir, { recursive: true });
    writeFileSync(subsetPath(opts, jurisdiction), JSON.stringify(subset));
    process.stderr.write(
      `[subset] geschrieben: ${subsetPath(opts, jurisdiction)} (${subset.chunk_ids.length} Chunks)\n`
    );
  } finally {
    await sql.end();
  }
}

// ─── Phase: prepare ──────────────────────────────────────────────────────

async function phasePrepare(opts: ParsedArgs, cfg: SweepFileConfig, jurisdictions: string[]) {
  const subsets = jurisdictions.map((j) => {
    const p = subsetPath(opts, j);
    if (!existsSync(p))
      throw new Error(`Subset fehlt: ${p} — zuerst --phase subset laufen lassen.`);
    return JSON.parse(readFileSync(p, "utf-8")) as SubsetFile;
  });
  const allIds = [...new Set(subsets.flatMap((s) => s.chunk_ids))];
  process.stderr.write(
    `[prepare] ${allIds.length} unique Chunks ueber ${jurisdictions.join("+")}\n`
  );

  const sql = await connectSql(opts.databaseUrl);
  const { loadConfig } = await import("../../core/config.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, embed } = await import("../../core/ai/gateway.ts");
  const cfgEngine = loadConfig();
  if (!cfgEngine) throw new Error("Keine Engine-Config (~/.gbrain/config.json oder DATABASE_URL).");
  configureGateway(buildGatewayConfig(cfgEngine));

  try {
    for (const cand of cfg.candidates) {
      if (!cand.prepare) {
        process.stderr.write(`[prepare] ${cand.id}: Baseline, uebersprungen.\n`);
        continue;
      }
      process.stderr.write(
        `[prepare] ${cand.id}: Spalte "${cand.column}" vector(${cand.dimensions}) anlegen...\n`
      );
      if (!opts.dryRun) {
        await sql.unsafe(
          `ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS "${cand.column}" vector(${cand.dimensions})`
        );
      }

      // Fehlende Vektoren zaehlen (resumable). Spaltenname via unsafe
      // interpoliert — vorher durch validateCandidates() Regex-geprueft.
      const missingCountRows = await sql.unsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM content_chunks WHERE id = ANY($1) AND "${cand.column}" IS NULL`,
        [allIds]
      );
      const missing = missingCountRows[0].n;
      const estTokens = Math.round(missing * 350); // grob: ~350 Token/Chunk
      const estCost = cand.price_per_mtok_usd
        ? (estTokens / 1_000_000) * cand.price_per_mtok_usd
        : undefined;
      process.stderr.write(
        `[prepare] ${cand.id}: ${missing}/${allIds.length} fehlend, ~${(estTokens / 1e6).toFixed(1)}M Token` +
          (estCost !== undefined ? `, ~$${estCost.toFixed(2)}` : "") +
          "\n"
      );
      if (opts.dryRun || missing === 0) continue;

      const t0 = Date.now();
      let done = 0;
      for (let i = 0; i < allIds.length; i += opts.batchSize * 10) {
        const sliceIds = allIds.slice(i, i + opts.batchSize * 10);
        const rows = (await sql.unsafe(
          `SELECT id, chunk_text FROM content_chunks WHERE id = ANY($1) AND "${cand.column}" IS NULL ORDER BY id`,
          [sliceIds]
        )) as { id: number; chunk_text: string }[];
        for (let b = 0; b < rows.length; b += opts.batchSize) {
          const batch = rows.slice(b, b + opts.batchSize);
          const vecs = await embed(
            batch.map((r) => r.chunk_text),
            {
              embeddingModel: cand.embeddingModel,
              dimensions: cand.dimensions,
              inputType: "document",
            }
          );
          if (vecs.length !== batch.length) {
            throw new Error(
              `${cand.id}: Provider lieferte ${vecs.length} Vektoren fuer ${batch.length} Texte`
            );
          }
          const ids = batch.map((r) => r.id);
          const vecStrings = vecs.map(vecToString);
          await sql.unsafe(
            `UPDATE content_chunks cc SET "${cand.column}" = t.vec::vector
             FROM (SELECT * FROM unnest($1::int[], $2::text[])) AS t(id, vec)
             WHERE cc.id = t.id`,
            [ids, vecStrings]
          );
          done += batch.length;
          if (done % 5000 < opts.batchSize) {
            process.stderr.write(
              `[prepare] ${cand.id}: ${done}/${missing} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`
            );
          }
        }
      }
      process.stderr.write(
        `[prepare] ${cand.id}: fertig, ${done} Chunks in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`
      );

      if (opts.withIndex) {
        process.stderr.write(
          `[prepare] ${cand.id}: HNSW-Index erstellen (kann Minuten dauern)...\n`
        );
        await sql.unsafe(
          `CREATE INDEX IF NOT EXISTS "${cand.column}_hnsw_idx" ON content_chunks USING hnsw ("${cand.column}" vector_cosine_ops)`
        );
      }
    }
  } finally {
    await sql.end();
  }
}

// ─── Phase: run ──────────────────────────────────────────────────────────

async function phaseRun(opts: ParsedArgs, cfg: SweepFileConfig, jurisdictions: string[]) {
  const runModule: any = await import("./run.ts");
  const loadAllQuestions = runModule.loadAllQuestions as (j?: string) => any[];
  const slugMatches = runModule.slugMatches as (slug: string, q: any) => boolean;
  const getSearchOpts = runModule.getSearchOpts as (
    q: any,
    topK: number,
    rerank: boolean
  ) => Record<string, unknown>;

  const questions = jurisdictions.flatMap((j) => loadAllQuestions(j));
  process.stderr.write(
    `[run] ${questions.length} Fragen (${jurisdictions.join("+")}), top-k=${opts.topK}, rerank=${opts.llmRerank}\n`
  );

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../../core/ai/gateway.ts");

  const cfgEngine = loadConfig();
  if (!cfgEngine)
    throw new Error("Keine Engine-Config. DATABASE_URL / ~/.gbrain/config.json setzen.");
  configureGateway(buildGatewayConfig(cfgEngine));
  const engine = await createEngine(toEngineConfig(cfgEngine));
  await engine.connect(toEngineConfig(cfgEngine));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    /* non-fatal */
  }

  const sql = await connectSql(opts.databaseUrl);
  const allResults: CandidateResult[] = [];
  try {
    for (const cand of cfg.candidates) {
      // Coverage-Warnung auf dem Subset
      const subsetIds = jurisdictions.flatMap((j) => {
        const p = subsetPath(opts, j);
        return existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as SubsetFile).chunk_ids : [];
      });
      let missing = -1;
      if (subsetIds.length > 0) {
        const r = await sql.unsafe<{ n: number }[]>(
          `SELECT COUNT(*)::int AS n FROM content_chunks WHERE id = ANY($1) AND "${cand.column}" IS NULL`,
          [[...new Set(subsetIds)]]
        );
        missing = r[0].n;
        if (missing > 0) {
          process.stderr.write(
            `[run] WARNUNG ${cand.id}: ${missing} Subset-Chunks ohne Vektor — Ergebnis verfaelscht!\n`
          );
        }
      }

      const t0 = Date.now();
      let hit1 = 0,
        hit3 = 0,
        hit5 = 0,
        hit8 = 0,
        rrSum = 0;
      for (const q of questions) {
        const searchOpts = getSearchOpts(q, opts.topK, opts.llmRerank);
        searchOpts.embeddingColumn = {
          name: cand.column,
          type: "vector",
          dimensions: cand.dimensions,
          embeddingModel: cand.embeddingModel,
        };
        const res = await hybridSearch(engine, q.question, searchOpts);
        const firstHit = res.map((r: any) => r.slug).findIndex((s: string) => slugMatches(s, q));
        if (firstHit >= 0 && firstHit < 1) hit1++;
        if (firstHit >= 0 && firstHit < 3) hit3++;
        if (firstHit >= 0 && firstHit < 5) hit5++;
        if (firstHit >= 0 && firstHit < 8) hit8++;
        rrSum += firstHit >= 0 ? 1 / (firstHit + 1) : 0;
      }
      const n = questions.length;
      const result: CandidateResult = {
        candidate: cand,
        total: n,
        hit_at_1: hit1 / n,
        hit_at_3: hit3 / n,
        hit_at_5: hit5 / n,
        hit_at_8: hit8 / n,
        mrr: rrSum / n,
        duration_ms: Date.now() - t0,
        missing_embeddings: missing,
      };
      allResults.push(result);
      process.stderr.write(
        `[run] ${cand.id}: Hit@5=${(result.hit_at_5 * 100).toFixed(1)}% MRR=${result.mrr.toFixed(3)} (${(result.duration_ms / 1000).toFixed(0)}s)\n`
      );
    }

    mkdirSync(opts.outputDir, { recursive: true });
    writeFileSync(
      resultsPath(opts),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          jurisdictions,
          top_k: opts.topK,
          llm_rerank: opts.llmRerank,
          results: allResults,
        },
        null,
        2
      )
    );
    process.stderr.write(`[run] geschrieben: ${resultsPath(opts)}\n`);
  } finally {
    await sql.end();
    await engine.disconnect();
  }
}

// ─── Phase: report ───────────────────────────────────────────────────────

function phaseReport(opts: ParsedArgs) {
  const p = resultsPath(opts);
  if (!existsSync(p)) throw new Error(`Keine Ergebnisse: ${p} — zuerst --phase run.`);
  const data = JSON.parse(readFileSync(p, "utf-8")) as {
    results: CandidateResult[];
    jurisdictions: string[];
    llm_rerank: boolean;
  };
  const baseline = data.results.find((r) => r.candidate.column === "embedding");
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  const lines: string[] = [];
  lines.push(`# Embedding-Model-Sweep — Vergleich (${data.jurisdictions.join("+")})`);
  lines.push(``);
  lines.push(
    `Rerank: ${data.llm_rerank ? "an" : "aus"} · n=${data.results[0]?.total ?? 0} Fragen · generiert ${new Date().toISOString()}`
  );
  lines.push(``);
  lines.push(`| Modell | Dims | Hit@1 | Hit@3 | Hit@5 | Hit@8 | MRR | Δ MRR vs. Baseline |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const r of data.results) {
    const delta = baseline && r !== baseline ? r.mrr - baseline.mrr : 0;
    lines.push(
      `| ${r.candidate.id} | ${r.candidate.dimensions} | ${pct(r.hit_at_1)} | ${pct(r.hit_at_3)} | ${pct(r.hit_at_5)} | ${pct(r.hit_at_8)} | ${r.mrr.toFixed(3)} | ${r === baseline ? "—" : (delta >= 0 ? "+" : "") + delta.toFixed(3)} |`
    );
  }
  lines.push(``);
  const ranked = [...data.results].sort((a, b) => b.mrr - a.mrr);
  const winner = ranked[0];
  const margin = baseline && winner !== baseline ? winner.mrr - baseline.mrr : 0;
  lines.push(`## Bewertung`);
  lines.push(``);
  if (!baseline || winner === baseline) {
    lines.push(`Die Baseline (${winner.candidate.id}) bleibt vorn. Kein Wechsel empfohlen.`);
  } else if (margin < 0.02) {
    lines.push(
      `⚠️ ${winner.candidate.id} liegt vorn, aber nur +${margin.toFixed(3)} MRR — bei n=${winner.total} ist das im Rauschen. Empfehlung: mit --llm-rerank und DE-Kontrollgruppe bestaetigen, bevor ein Wechsel diskutiert wird.`
    );
  } else {
    lines.push(
      `✅ ${winner.candidate.id} schlaegt die Baseline um +${margin.toFixed(3)} MRR. Naechster Schritt: Ergebnis mit --llm-rerank und DE-Kontrollgruppe validieren, dann Kosten/Latenz des Re-Embeddings des Gesamtkorpus gegen den Qualitaetsgewinn abwaegen.`
    );
  }
  lines.push(``);
  lines.push(
    `Hinweis: n=80 (AT) hat eine statistische Unschaerfe von grob ±5–10 Prozentpunkten bei Hit-Metriken. Kandidaten, deren Subset-Coverage < 100% war (siehe missing_embeddings im JSON), sind nicht vergleichbar.`
  );

  const md = lines.join("\n");
  const outPath = join(opts.outputDir, "sweep-report.md");
  writeFileSync(outPath, md);
  process.stderr.write(`[report] geschrieben: ${outPath}\n`);
  process.stdout.write(md + "\n");
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const cfg = loadSweepConfig(opts.configPath);
  const jurisdictions = opts.withDe ? [opts.jurisdiction, "de"] : [opts.jurisdiction];

  const phases =
    opts.phase === "all" ? (["subset", "prepare", "run", "report"] as const) : [opts.phase];
  for (const ph of phases) {
    if (ph === "subset") {
      for (const j of jurisdictions) await phaseSubset(opts, cfg, j);
    } else if (ph === "prepare") {
      await phasePrepare(opts, cfg, jurisdictions);
    } else if (ph === "run") {
      await phaseRun(opts, cfg, jurisdictions);
    } else if (ph === "report") {
      phaseReport(opts);
    }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[embedding-model-sweep] FEHLER: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
