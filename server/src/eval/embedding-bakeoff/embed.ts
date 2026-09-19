/**
 * Embedding bake-off, step 2: embed the sample and the questions with one model.
 *
 * Output (per model, under <out>/vectors/<key>[-raw][-or]/):
 *   docs.f32       — row i = vector of corpus.jsonl line i, normalized, `dims` floats
 *   queries.f32    — row i = vector of queries.jsonl line i
 *   progress.json  — rows done, dims, tokens billed, route actually used
 * Resumable: a killed run continues at the last complete batch.
 *
 * Usage:
 *   bun run src/eval/embedding-bakeoff/embed.ts --model voyage-4-large
 *   bun run src/eval/embedding-bakeoff/embed.ts --model te3-small --no-prefix
 *   bun run src/eval/embedding-bakeoff/embed.ts --model qwen3-embedding-8b --limit 500   (smoke test)
 */

import { parseArgs } from "util";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { findModel, type BakeoffModel } from "./models.ts";
import { truncateAndNormalize } from "./metrics.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out: { type: "string", default: "/data/eval/embedding-bakeoff" },
    model: { type: "string" },
    "no-prefix": { type: "boolean", default: false },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "batch-size": { type: "string", default: "64" },
  },
});

if (!values.model) {
  console.error("--model fehlt");
  process.exit(2);
}

const OUT = String(values.out);
const NO_PREFIX = Boolean(values["no-prefix"]);
const CONCURRENCY = Number(values.concurrency);
const BATCH_SIZE = Number(values["batch-size"]);
/** Keep each request well under every provider's per-request token cap. */
const BATCH_CHAR_BUDGET = 120_000;

type Kind = "query" | "document";

interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} ist nicht gesetzt`);
  return v;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as Record<string, any>;
    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 6) {
      throw new Error(`HTTP ${res.status} von ${url}: ${text.slice(0, 400)}`);
    }
    const wait = Math.min(60_000, 2000 * 2 ** attempt);
    log(`  HTTP ${res.status}, neuer Versuch in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

async function embedOpenRouter(model: string, texts: string[]): Promise<EmbedResult> {
  const json = await postJson(
    "https://openrouter.ai/api/v1/embeddings",
    { authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}` },
    { model, input: texts }
  );
  const data = (json.data as Array<{ embedding: number[]; index: number }>)
    .slice()
    .sort((a, b) => a.index - b.index);
  if (data.length !== texts.length) {
    throw new Error(`OpenRouter lieferte ${data.length} statt ${texts.length} Vektoren`);
  }
  return {
    vectors: data.map((d) => d.embedding),
    tokens: Number(json.usage?.prompt_tokens ?? json.usage?.total_tokens ?? 0),
  };
}

async function embedVoyage(m: BakeoffModel, texts: string[], kind: Kind): Promise<EmbedResult> {
  const json = await postJson(
    "https://api.voyageai.com/v1/embeddings",
    { authorization: `Bearer ${requireEnv("VOYAGE_API_KEY")}` },
    {
      model: m.apiModel,
      input: texts,
      input_type: kind,
      output_dimension: m.dims,
      truncation: true,
    }
  );
  const data = (json.data as Array<{ embedding: number[]; index: number }>)
    .slice()
    .sort((a, b) => a.index - b.index);
  return { vectors: data.map((d) => d.embedding), tokens: Number(json.usage?.total_tokens ?? 0) };
}

async function embedCohere(m: BakeoffModel, texts: string[], kind: Kind): Promise<EmbedResult> {
  // EU endpoint: the default host routes to the US even for EU accounts.
  const json = await postJson(
    "https://api.eu.cohere.com/v2/embed",
    { authorization: `Bearer ${requireEnv("COHERE_API_KEY")}` },
    {
      model: m.apiModel,
      texts,
      input_type: kind === "query" ? "search_query" : "search_document",
      embedding_types: ["float"],
      output_dimension: m.dims,
      truncate: "END",
    }
  );
  return {
    vectors: json.embeddings.float as number[][],
    tokens: Number(json.meta?.billed_units?.input_tokens ?? 0),
  };
}

/** Which route really runs: Voyage falls back to OpenRouter without its own key. */
function resolveRoute(m: BakeoffModel): { route: BakeoffModel["route"]; viaOpenRouter: boolean } {
  if (m.route === "voyage" && !process.env.VOYAGE_API_KEY) {
    log("VOYAGE_API_KEY fehlt → voyage-4-large über OpenRouter (ohne input_type)");
    return { route: "openrouter", viaOpenRouter: true };
  }
  return { route: m.route, viaOpenRouter: false };
}

async function embedTexts(
  m: BakeoffModel,
  route: BakeoffModel["route"],
  texts: string[],
  kind: Kind
): Promise<EmbedResult> {
  const input =
    kind === "query" && m.queryInstruction ? texts.map((t) => m.queryInstruction + t) : texts;
  switch (route) {
    case "voyage":
      return embedVoyage(m, input, kind);
    case "cohere":
      return embedCohere(m, input, kind);
    case "openrouter": {
      const apiModel = m.route === "voyage" ? `voyageai/${m.apiModel}` : m.apiModel;
      return embedOpenRouter(apiModel, input);
    }
  }
}

function batches(texts: string[], start: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = start;
  while (i < texts.length) {
    let j = i;
    let chars = 0;
    while (
      j < texts.length &&
      j - i < BATCH_SIZE &&
      (j === i || chars + texts[j]!.length <= BATCH_CHAR_BUDGET)
    ) {
      chars += texts[j]!.length;
      j++;
    }
    out.push([i, j]);
    i = j;
  }
  return out;
}

interface Progress {
  model: string;
  route: string;
  prefix: boolean;
  dims: number;
  docs_done: number;
  docs_total: number;
  queries_done: boolean;
  tokens: number;
}

async function embedFile(
  m: BakeoffModel,
  route: BakeoffModel["route"],
  texts: string[],
  kind: Kind,
  file: string,
  progress: Progress,
  saveProgress: () => void,
  startRow: number
): Promise<number> {
  // Drop a half-written tail from a killed run.
  const bytesPerRow = m.dims * 4;
  if (existsSync(file) && statSync(file).size !== startRow * bytesPerRow) {
    truncateSync(file, startRow * bytesPerRow);
  }
  let done = startRow;
  const plan = batches(texts, startRow);
  const t0 = Date.now();
  for (let w = 0; w < plan.length; w += CONCURRENCY) {
    const window = plan.slice(w, w + CONCURRENCY);
    const results = await Promise.all(
      window.map(([a, b]) => embedTexts(m, route, texts.slice(a, b), kind))
    );
    for (let k = 0; k < window.length; k++) {
      const [a, b] = window[k]!;
      const res = results[k]!;
      if (res.vectors.length !== b - a) {
        throw new Error(`Batch ${a}-${b}: ${res.vectors.length} Vektoren statt ${b - a}`);
      }
      const buf = new Float32Array((b - a) * m.dims);
      res.vectors.forEach((v, r) => {
        if (v.length < m.dims)
          throw new Error(`Vektor hat ${v.length} statt ${m.dims} Dimensionen`);
        buf.set(truncateAndNormalize(v, m.dims), r * m.dims);
      });
      appendFileSync(file, Buffer.from(buf.buffer));
      done = b;
      progress.tokens += res.tokens;
    }
    if (kind === "document") {
      progress.docs_done = done;
      saveProgress();
      const rate = (done - startRow) / Math.max((Date.now() - t0) / 1000, 1);
      log(
        `  ${done}/${texts.length} Chunks (${rate.toFixed(0)}/s, ${(progress.tokens / 1e6).toFixed(1)} Mio. Tokens)`
      );
    }
  }
  return done;
}

async function main() {
  const m = findModel(String(values.model));
  const { route, viaOpenRouter } = resolveRoute(m);
  const dir = join(
    OUT,
    "vectors",
    `${m.key}${NO_PREFIX ? "-raw" : ""}${viaOpenRouter ? "-or" : ""}`
  );
  mkdirSync(dir, { recursive: true });

  const corpus = readFileSync(join(OUT, "corpus.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { embed_text: string; raw_text: string });
  const limit = values.limit ? Number(values.limit) : corpus.length;
  const docTexts = corpus.slice(0, limit).map((c) => (NO_PREFIX ? c.raw_text : c.embed_text));
  const questions = readFileSync(join(OUT, "queries.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => (JSON.parse(l) as { question: string }).question);

  const progressPath = join(dir, "progress.json");
  const progress: Progress = existsSync(progressPath)
    ? (JSON.parse(readFileSync(progressPath, "utf8")) as Progress)
    : {
        model: m.apiModel,
        route,
        prefix: !NO_PREFIX,
        dims: m.dims,
        docs_done: 0,
        docs_total: docTexts.length,
        queries_done: false,
        tokens: 0,
      };
  if (progress.dims !== m.dims)
    throw new Error("Dimension geändert — Ordner löschen und neu starten");
  progress.docs_total = docTexts.length;
  const saveProgress = () => writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  log(
    `${m.label} via ${route}${NO_PREFIX ? " (ohne Präfix)" : ""}: ${docTexts.length} Chunks, ${questions.length} Fragen, ${m.dims} Dim.`
  );

  if (!progress.queries_done) {
    writeFileSync(join(dir, "queries.f32"), "");
    await embedFile(
      m,
      route,
      questions,
      "query",
      join(dir, "queries.f32"),
      progress,
      saveProgress,
      0
    );
    progress.queries_done = true;
    saveProgress();
    log(`Fragen eingebettet`);
  }

  if (progress.docs_done < docTexts.length) {
    await embedFile(
      m,
      route,
      docTexts,
      "document",
      join(dir, "docs.f32"),
      progress,
      saveProgress,
      progress.docs_done
    );
  }
  const usd = (progress.tokens / 1e6) * m.usdPerMTok;
  log(
    `Fertig: ${progress.docs_done} Chunks, ${(progress.tokens / 1e6).toFixed(1)} Mio. Tokens ≈ ${usd.toFixed(2)} $ → ${dir}`
  );
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
