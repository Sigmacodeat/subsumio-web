/**
 * Embedding bake-off, step 3: score every embedded model and write the report.
 *
 * For each model directory under <out>/vectors with complete docs + queries:
 *   dense   — exact nearest neighbours over the sample
 *   hybrid  — dense fused with the production keyword ranking exactly as
 *             search/hybrid.ts does it (RRF, then 0.7·RRF + 0.3·cosine),
 *             i.e. what a lawyer actually gets from search
 * Metrics per page: Recall@1/5/10, MRR@10, nDCG@10, overall and per question
 * category, plus a paired bootstrap of hybrid nDCG@10 against the current
 * production model (te3-small) so "better" means better beyond sample luck.
 *
 * Usage:
 *   bun run src/eval/embedding-bakeoff/score.ts [--out /data/eval/embedding-bakeoff]
 */

import { parseArgs } from "util";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { BAKEOFF_MODELS } from "./models.ts";
import {
  meanMetrics,
  pagesFromChunks,
  pairedBootstrap,
  productionHybrid,
  scoreRanking,
  topKDot,
  type RankingMetrics,
} from "./metrics.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out: { type: "string", default: "/data/eval/embedding-bakeoff" },
    baseline: { type: "string", default: "te3-small" },
  },
});

const OUT = String(values.out);
const TOP_CHUNKS = 200;

interface Query {
  qid: string;
  category: string;
  question: string;
  gold_page_ids: number[];
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function loadF32(path: string): Float32Array {
  const buf = readFileSync(path);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

const pct = (x: number) => (x * 100).toFixed(1);

function main() {
  const queries = readJsonl<Query>(join(OUT, "queries.jsonl"));
  const corpus = readJsonl<{ id: number; page_id: number }>(join(OUT, "corpus.jsonl"));
  const chunkIdOfRow = corpus.map((c) => c.id);
  const pageOfChunk = new Map(corpus.map((c) => [c.id, c.page_id]));
  const rowOfChunk = new Map(corpus.map((c, i) => [c.id, i]));
  const keyword = new Map(
    readJsonl<{ qid: string; chunk_ids: number[] }>(join(OUT, "keyword.jsonl")).map((k) => [
      k.qid,
      k.chunk_ids,
    ])
  );
  const golds = queries.map((q) => new Set(q.gold_page_ids));

  // Keyword arm alone, as a reference line.
  const keywordPages = queries.map((q) => pagesFromChunks(keyword.get(q.qid) ?? [], pageOfChunk));
  const keywordRows = keywordPages.map((p, i) => scoreRanking(p, golds[i]!));

  interface ModelResult {
    dir: string;
    label: string;
    dims: number;
    tokens: number;
    usd: number;
    residency: string;
    openWeights: boolean;
    dense: RankingMetrics[];
    hybrid: RankingMetrics[];
  }
  const results: ModelResult[] = [];
  const vecRoot = join(OUT, "vectors");
  const dirs = existsSync(vecRoot) ? readdirSync(vecRoot).sort() : [];
  for (const dir of dirs) {
    const progressPath = join(vecRoot, dir, "progress.json");
    if (!existsSync(progressPath)) continue;
    const progress = JSON.parse(readFileSync(progressPath, "utf8")) as {
      dims: number;
      docs_done: number;
      queries_done: boolean;
      tokens: number;
      prefix: boolean;
    };
    if (!progress.queries_done || progress.docs_done !== corpus.length) {
      console.log(`übersprungen (unvollständig): ${dir} ${progress.docs_done}/${corpus.length}`);
      continue;
    }
    const key = dir.replace(/(-raw|-or)+$/, "");
    const model = BAKEOFF_MODELS.find((m) => m.key === key);
    const docs = loadF32(join(vecRoot, dir, "docs.f32"));
    const qv = loadF32(join(vecRoot, dir, "queries.f32"));
    const dims = progress.dims;
    console.log(`bewerte ${dir} (${dims} Dim.) …`);
    const dense: RankingMetrics[] = [];
    const hybrid: RankingMetrics[] = [];
    queries.forEach((q, i) => {
      const query = qv.subarray(i * dims, (i + 1) * dims);
      const denseChunks = topKDot(query, docs, dims, TOP_CHUNKS).map((r) => chunkIdOfRow[r]!);
      dense.push(scoreRanking(pagesFromChunks(denseChunks, pageOfChunk), golds[i]!));
      const cosineOf = (chunkId: number) => {
        const row = rowOfChunk.get(chunkId);
        if (row === undefined) return 0;
        let s = 0;
        const off = row * dims;
        for (let j = 0; j < dims; j++) s += query[j]! * docs[off + j]!;
        return s;
      };
      const fused = productionHybrid(denseChunks, keyword.get(q.qid) ?? [], cosineOf);
      hybrid.push(scoreRanking(pagesFromChunks(fused, pageOfChunk), golds[i]!));
    });
    results.push({
      dir,
      label: `${model?.label ?? key}${dir.endsWith("-raw") ? " — ohne Präfix" : ""}${dir.includes("-or") ? " (via OpenRouter)" : ""}`,
      dims,
      tokens: progress.tokens,
      usd: (progress.tokens / 1e6) * (model?.usdPerMTok ?? 0),
      residency: model?.residency ?? "?",
      openWeights: model?.openWeights ?? false,
      dense,
      hybrid,
    });
  }

  results.sort((a, b) => meanMetrics(b.hybrid).ndcg10 - meanMetrics(a.hybrid).ndcg10);
  const base = results.find((r) => r.dir === String(values.baseline));
  const categories = [...new Set(queries.map((q) => q.category))];

  const lines: string[] = [];
  lines.push(`# Embedding-Vergleich österreichisches Recht`);
  lines.push("");
  lines.push(
    `${queries.length} Fragen (${categories.map((c) => `${c}: ${queries.filter((q) => q.category === c).length}`).join(", ")}), ${corpus.length.toLocaleString("de-AT")} Chunks in der Stichprobe. Relevanz pro Seite (§ bzw. Entscheidung).`
  );
  lines.push("");
  lines.push(`## Gesamt (hybrid = Vektor + Stichwortsuche, wie in Produktion)`);
  lines.push("");
  lines.push(
    `| Modell | nDCG@10 hybrid | Recall@10 hybrid | Recall@1 hybrid | nDCG@10 nur Vektor | Δ nDCG@10 zu ${values.baseline} (95 %-KI) | Dim. | Kosten Stichprobe | Datenstandort |`
  );
  lines.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const h = meanMetrics(r.hybrid);
    const d = meanMetrics(r.dense);
    let delta = "—";
    if (base && r !== base) {
      const bs = pairedBootstrap(
        r.hybrid.map((x) => x.ndcg10),
        base.hybrid.map((x) => x.ndcg10)
      );
      const sig = bs.lo > 0 || bs.hi < 0 ? " **" : "";
      delta = `${bs.diff >= 0 ? "+" : ""}${pct(bs.diff)} (${pct(bs.lo)} … ${pct(bs.hi)})${sig}`;
    }
    lines.push(
      `| ${r.label} | ${pct(h.ndcg10)} | ${pct(h.recall10)} | ${pct(h.recall1)} | ${pct(d.ndcg10)} | ${delta} | ${r.dims} | ${r.usd.toFixed(2)} $ | ${r.residency}${r.openWeights ? ", offene Gewichte" : ""} |`
    );
  }
  const kw = meanMetrics(keywordRows);
  lines.push(
    `| *nur Stichwortsuche* | ${pct(kw.ndcg10)} | ${pct(kw.recall10)} | ${pct(kw.recall1)} | — | — | — | — | — |`
  );
  lines.push("");
  lines.push(
    `** = Unterschied zur Basis liegt außerhalb des Zufallsbereichs (95 %-Intervall schließt 0 aus).`
  );
  lines.push("");
  lines.push(`## Nach Fragetyp (nDCG@10 hybrid)`);
  lines.push("");
  lines.push(`| Modell | ${categories.join(" | ")} |`);
  lines.push(`|---|${categories.map(() => "---").join("|")}|`);
  for (const r of results) {
    const cells = categories.map((c) => {
      const rows = r.hybrid.filter((_, i) => queries[i]!.category === c);
      return pct(meanMetrics(rows).ndcg10);
    });
    lines.push(`| ${r.label} | ${cells.join(" | ")} |`);
  }
  const kwCells = categories.map((c) =>
    pct(meanMetrics(keywordRows.filter((_, i) => queries[i]!.category === c)).ndcg10)
  );
  lines.push(`| *nur Stichwortsuche* | ${kwCells.join(" | ")} |`);
  lines.push("");

  const report = lines.join("\n");
  writeFileSync(join(OUT, "report.md"), report + "\n");
  writeFileSync(
    join(OUT, "report.json"),
    JSON.stringify(
      results.map((r) => ({
        dir: r.dir,
        label: r.label,
        dims: r.dims,
        tokens: r.tokens,
        usd: r.usd,
        hybrid: meanMetrics(r.hybrid),
        dense: meanMetrics(r.dense),
        per_query_hybrid_ndcg10: r.hybrid.map((x) => x.ndcg10),
      })),
      null,
      2
    )
  );
  console.log(report);
}

main();
