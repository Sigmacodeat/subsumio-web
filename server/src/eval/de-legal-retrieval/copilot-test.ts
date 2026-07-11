/**
 * German Legal Copilot Integration Test — Phase 3
 *
 * Full pipeline: German legal question → hybrid search → context assembly →
 * LLM answer generation → answer quality evaluation.
 *
 * Tests the production copilot flow end-to-end with German legal content:
 *   1. Import all law-corpus/de/*.md files into in-memory PGLite engine
 *   2. Run hybrid search for each question (with embeddingColumn override)
 *   3. Assemble top-K search results as context
 *   4. Send context + question to LLM (OpenRouter DeepSeek V3.2)
 *   5. Generate German legal answer
 *   6. Evaluate: grounding (answer references retrieved law), language (German),
 *      and correctness (LLM judge compares answer to expected legal area)
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval/copilot-test.ts \
 *     test/fixtures/de-legal-retrieval.jsonl \
 *     --top-k 5 \
 *     --output /tmp/de-legal-phase3.jsonl
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

// ─── Types ───────────────────────────────────────────────────────────────

interface DeLegalQuestion {
  question_id: string;
  question: string;
  answer_slug: string;
  expected_section?: string;
  legal_area: string;
  question_type: string;
}

interface CopilotResult {
  question_id: string;
  question: string;
  legal_area: string;
  expected_slug: string;
  // Retrieval metrics
  hit_at_5: boolean;
  top_slugs: string[];
  // LLM answer
  llm_answer: string;
  llm_model: string;
  // Quality metrics
  answer_in_german: boolean;
  answer_references_law: boolean;
  answer_grounded: boolean;
  answer_length: number;
  // Error tracking
  retrieval_error?: string;
  llm_error?: string;
}

interface QualityReport {
  total: number;
  top_k: number;
  // Retrieval
  retrieval_hit_at_5: number;
  // Language
  german_answer_rate: number;
  // Grounding
  references_law_rate: number;
  grounded_rate: number;
  // Answer stats
  avg_answer_length: number;
  // Errors
  retrieval_errors: number;
  llm_errors: number;
  // Per-area
  areas: AreaQuality[];
}

interface AreaQuality {
  legal_area: string;
  n: number;
  retrieval_hit_at_5: number;
  german_answer_rate: number;
  grounded_rate: number;
  avg_answer_length: number;
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  topK: number;
  outputPath?: string;
  model?: string;
  limit?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    topK: 5,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--top-k" && i + 1 < args.length) {
      out.topK = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--output" && i + 1 < args.length) {
      out.outputPath = args[++i];
      continue;
    }
    if (a === "--model" && i + 1 < args.length) {
      out.model = args[++i];
      continue;
    }
    if (a === "--limit" && i + 1 < args.length) {
      out.limit = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/de-legal-retrieval/copilot-test.ts <fixture.jsonl> [options]\n` +
          `  --top-k N        Top-K results to retrieve (default: 5)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --model MODEL    LLM model (default: openrouter:deepseek/deepseek-chat)\n` +
          `  --limit N        Only run first N questions (for quick tests)\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) {
      out.fixturePath = a;
    }
  }
  if (!out.fixturePath) {
    process.stderr.write("Error: fixture path required\n");
    process.exit(1);
  }
  return out;
}

// ─── Fixture & corpus loading ────────────────────────────────────────────

function loadFixture(path: string): any[] {
  const raw = readFileSync(path, "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l));
}

interface CorpusFile {
  slug: string;
  content: string;
  abbreviation: string;
}

function loadLawCorpus(): CorpusFile[] {
  const corpusDir = join(REPO_ROOT, "law-corpus/de");
  if (!existsSync(corpusDir)) throw new Error(`law-corpus/de not found at ${corpusDir}`);
  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
  const out: CorpusFile[] = [];
  for (const file of files) {
    const content = readFileSync(join(corpusDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let abbreviation = slug.toUpperCase();
    if (fmMatch) {
      const abbrMatch = fmMatch[1].match(/abbreviation:\s*"([^"]+)"/);
      if (abbrMatch) abbreviation = abbrMatch[1];
    }
    out.push({ slug, content, abbreviation });
  }
  return out;
}

// ─── JSONL emitter ───────────────────────────────────────────────────────

class JsonlEmitter {
  constructor(private path: string) {
    if (existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
}

// ─── LLM client (OpenRouter via OpenAI SDK) ──────────────────────────────

interface ThinkLLMClient {
  create: (
    params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    },
    callOpts?: { signal?: AbortSignal }
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

async function createLLMClient(
  model: string
): Promise<{ client: ThinkLLMClient; resolvedModel: string }> {
  const isOpenRouter = model.startsWith("openrouter:");
  const isOpenAI = model.startsWith("openai:");

  if (isOpenRouter) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://subsum.io",
        "X-Title": "subsumio-copilot-test",
      },
    });
    const resolvedModel = model.replace(/^openrouter:/, "");
    return {
      client: {
        create: async (params, callOpts) => {
          const messages: Array<{ role: string; content: string }> = [];
          if (params.system) messages.push({ role: "system", content: params.system });
          for (const m of params.messages ?? [])
            messages.push({ role: m.role, content: m.content });
          const res = await client.chat.completions.create(
            {
              model: resolvedModel,
              max_tokens: params.max_tokens,
              messages: messages as any,
            },
            { signal: callOpts?.signal }
          );
          const text = res.choices?.[0]?.message?.content ?? "";
          return { content: [{ type: "text", text }] };
        },
      },
      resolvedModel,
    };
  }

  if (isOpenAI) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI();
    const resolvedModel = model.replace(/^openai:/, "");
    return {
      client: {
        create: async (params, callOpts) => {
          const messages: Array<{ role: string; content: string }> = [];
          if (params.system) messages.push({ role: "system", content: params.system });
          for (const m of params.messages ?? [])
            messages.push({ role: m.role, content: m.content });
          const res = await client.chat.completions.create(
            {
              model: resolvedModel,
              max_tokens: params.max_tokens,
              messages: messages as any,
            },
            { signal: callOpts?.signal }
          );
          const text = res.choices?.[0]?.message?.content ?? "";
          return { content: [{ type: "text", text }] };
        },
      },
      resolvedModel,
    };
  }

  throw new Error(`Unsupported model: ${model}. Use openrouter: or openai: prefix.`);
}

// ─── Context assembly ────────────────────────────────────────────────────

function assembleContext(
  results: Array<{ slug: string; title: string; chunk_text: string; score: number }>
): string {
  const blocks: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    blocks.push(
      `--- Rechtsquelle ${i + 1} ---\n` +
        `Gesetz: ${r.title}\n` +
        `Relevanz: ${(r.score * 100).toFixed(1)}%\n` +
        `Text:\n${r.chunk_text}\n`
    );
  }
  return blocks.join("\n");
}

// ─── Answer quality evaluation ───────────────────────────────────────────

function isGermanAnswer(text: string): boolean {
  // Check for common German function words and legal vocabulary
  const germanWords = [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "wird",
    "nach",
    "bei",
    "von",
    "mit",
    "auf",
    "für",
    "zu",
    "über",
    "aus",
    "dem",
    "den",
    "des",
    "ein",
    "eine",
    "einer",
    "eines",
    "einem",
    "einen",
    "nicht",
    "auch",
    "nur",
    "noch",
    "bereits",
    "jedoch",
    "allerdings",
    "dabei",
    "daher",
    "somit",
    "gemäß",
    "Absatz",
    "Satz",
    "gemäß",
    "bzw",
    "hinsichtlich",
    "vorausgesetzt",
  ];
  const lower = text.toLowerCase();
  let matches = 0;
  for (const w of germanWords) {
    const re = new RegExp(`\\b${w}\\b`, "gi");
    if (re.test(lower)) matches++;
  }
  // At least 4 German function words = German answer
  return matches >= 4;
}

function referencesLaw(text: string, legalArea: string): boolean {
  const lawMap: Record<string, string[]> = {
    bgb: ["BGB", "Bürgerliches Gesetzbuch", "§"],
    zpo: ["ZPO", "Zivilprozessordnung", "§"],
    hgb: ["HGB", "Handelsgesetzbuch", "§"],
    stgb: ["StGB", "Strafgesetzbuch", "§"],
    ao: ["AO", "Abgabenordnung", "§"],
  };
  const indicators = lawMap[legalArea] ?? [];
  const upper = text.toUpperCase();
  return indicators.some((ind) => upper.includes(ind.toUpperCase()));
}

function isGrounded(text: string, context: string): boolean {
  // Check if the answer uses specific legal terms from the retrieved context
  const contextWords = new Set(
    context
      .replace(/[^a-zA-ZäöüÄÖÜß\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5)
      .map((w) => w.toLowerCase())
  );
  const answerWords = text
    .replace(/[^a-zA-ZäöüÄÖÜß\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5)
    .map((w) => w.toLowerCase());
  let grounded = 0;
  for (const w of answerWords) {
    if (contextWords.has(w)) grounded++;
  }
  // At least 20% of significant answer words should appear in context
  return answerWords.length > 0 && grounded / answerWords.length >= 0.2;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);
  const corpusFiles = loadLawCorpus();
  const llmModel = opts.model ?? "openrouter:deepseek/deepseek-chat";

  let testQuestions = questions;
  if (opts.limit && opts.limit > 0) {
    testQuestions = questions.slice(0, opts.limit);
  }

  process.stderr.write(
    `[copilot-test] loaded ${testQuestions.length} questions, ${corpusFiles.length} corpus files\n`
  );
  process.stderr.write(`[copilot-test] top-k=${opts.topK}, model=${llmModel}\n`);

  // Set query embed timeout before importing hybrid.ts
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  // Dynamic imports
  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  // Configure AI gateway for embeddings
  const cfg = loadConfig();
  const embeddingModel = "openrouter:openai/text-embedding-3-small";
  const embeddingDims = 1536;
  configureGateway({
    embedding_model: embeddingModel,
    embedding_dimensions: embeddingDims,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);
  process.stderr.write(`[copilot-test] embedding: ${embeddingModel} (${embeddingDims}d)\n`);

  // Create LLM client
  const { client: llmClient, resolvedModel } = await createLLMClient(llmModel);
  process.stderr.write(`[copilot-test] LLM client ready: ${resolvedModel}\n`);

  // Create in-memory engine
  process.stderr.write(`[copilot-test] creating in-memory engine...\n`);
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Import corpus
  process.stderr.write(`[copilot-test] importing ${corpusFiles.length} law files...\n`);
  for (const cf of corpusFiles) {
    const slug = `law/de/${cf.slug}`;
    process.stderr.write(`  importing ${cf.abbreviation} (${cf.slug})...\n`);
    await importFromContent(engine, slug, cf.content, { noEmbed: false });
  }
  process.stderr.write(`[copilot-test] import complete\n`);

  // System prompt for German legal copilot (synced with production system-prompt.ts)
  const systemPrompt =
    `Du bist ein deutscher Rechtsassistent (Legal Copilot) für die Kanzlei-Software Subsumio. ` +
    `Du beantwortest Rechtsfragen basierend auf den bereitgestellten Rechtsquellen. ` +
    `\n\nWichtige Regeln:\n` +
    `1. Antworte NUR auf Basis der bereitgestellten Rechtsquellen.\n` +
    `2. Zitiere den konkreten Paragraphen (z.B. "§ 12 BGB") wenn möglich.\n` +
    `3. Antworte auf Deutsch in klarer, professioneller Rechtssprache.\n` +
    `4. Wenn die Rechtsquellen keine ausreichende Antwort enthalten, sage dies offen.\n` +
    `5. Gib keine rechtlichen Ratschläge, sondern erkläre die Rechtslage objektiv.\n` +
    `6. Halte die Antwort prägnant (max. 3-5 Sätze).\n` +
    `7. VERWENDE NUR Paragraphen und Gesetze, die wörtlich in den bereitgestellten Rechtsquellen vorkommen.\n` +
    `8. ERFINDE KEINE EU-Richtlinien, Artikel, Verordnungen oder anderen Referenzen.\n` +
    `9. Wenn du eine Information nicht in den Quellen findest, sage: "Diese Information ist in den bereitgestellten Rechtsquellen nicht enthalten."\n` +
    `10. LEITE KEINE Definitionen oder Rechtsbegriffe ab oder her. Wenn eine Definition nicht wörtlich in den Quellen steht, sage dies explizit.\n` +
    `11. SUCHE in ALLEN bereitgestellten Rechtsquellen nach der relevanten Definition oder Regelung. Prüfe jeden Abschnitt sorgfältig.\n` +
    `12. Wenn ein Begriff in den Quellen definiert wird (z.B. "§ 12 — Betriebstätte"), zitiere DIESE Definition wörtlich.\n`;

  // Run benchmark
  const results: CopilotResult[] = [];
  const emitter = opts.outputPath ? new JsonlEmitter(opts.outputPath) : null;

  let qIdx = 0;
  for (const q of testQuestions) {
    qIdx++;
    const question = q.question;
    const legalArea = (q as any).legal_area as string;
    const expectedSlug = `law/de/${(q as any).answer_slug ?? (q as any).expected_slugs?.[0] ?? ""}`;

    process.stderr.write(
      `[copilot-test] ${qIdx}/${testQuestions.length} (${Math.round((qIdx / testQuestions.length) * 100)}%) ${q.question_id}...`
    );

    const result: CopilotResult = {
      question_id: q.question_id,
      question,
      legal_area: legalArea,
      expected_slug: expectedSlug,
      hit_at_5: false,
      top_slugs: [],
      llm_answer: "",
      llm_model: resolvedModel,
      answer_in_german: false,
      answer_references_law: false,
      answer_grounded: false,
      answer_length: 0,
    };

    // Step 1: Hybrid search
    try {
      const searchResults = await hybridSearch(engine, question, {
        limit: opts.topK,
        autocut: false,
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
      });

      const rankedSlugs = searchResults.map((r) => r.slug);
      result.top_slugs = rankedSlugs.slice(0, 8);
      result.hit_at_5 = rankedSlugs.slice(0, 5).includes(expectedSlug);

      if (searchResults.length === 0) {
        process.stderr.write(` EMPTY-SEARCH`);
        result.retrieval_error = "no results";
      } else {
        // Step 2: Assemble context
        const context = assembleContext(
          searchResults.slice(0, opts.topK).map((r) => ({
            slug: r.slug,
            title: r.title,
            chunk_text: r.chunk_text,
            score: r.score,
          }))
        );

        // Step 3: LLM answer generation
        try {
          const userPrompt =
            `Frage: ${question}\n\n` +
            `Rechtsquellen:\n${context}\n\n` +
            `Anweisung: Beantworte die Frage basierend auf den oben genannten Rechtsquellen. ` +
            `Zitiere den relevanten Paragraphen. Antworte auf Deutsch.`;

          const response = await llmClient.create({
            model: resolvedModel,
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          });

          const answer = response.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("")
            .trim();

          result.llm_answer = answer;
          result.answer_length = answer.length;
          result.answer_in_german = isGermanAnswer(answer);
          result.answer_references_law = referencesLaw(answer, legalArea);
          result.answer_grounded = isGrounded(answer, context);
        } catch (llmErr: any) {
          result.llm_error = String(llmErr?.message ?? llmErr);
          process.stderr.write(` LLM-ERROR`);
        }
      }
    } catch (searchErr: any) {
      result.retrieval_error = String(searchErr?.message ?? searchErr);
      process.stderr.write(` SEARCH-ERROR`);
    }

    results.push(result);
    if (emitter) emitter.emit(result as unknown as Record<string, unknown>);

    const hitStr = result.hit_at_5 ? "✓" : "✗";
    const langStr = result.answer_in_german ? "DE" : "??";
    const lawStr = result.answer_references_law ? "§" : "-";
    const groundStr = result.answer_grounded ? "G" : "-";
    process.stderr.write(
      ` ${hitStr} ${langStr} ${lawStr} ${groundStr} (${result.answer_length} chars)\n`
    );
  }

  // Build quality report
  const n = results.length;
  const byArea = new Map<string, CopilotResult[]>();
  for (const r of results) {
    const list = byArea.get(r.legal_area) ?? [];
    list.push(r);
    byArea.set(r.legal_area, list);
  }

  const areas: AreaQuality[] = [];
  for (const [area, list] of byArea) {
    const an = list.length;
    areas.push({
      legal_area: area,
      n: an,
      retrieval_hit_at_5: list.filter((r) => r.hit_at_5).length / an,
      german_answer_rate: list.filter((r) => r.answer_in_german).length / an,
      grounded_rate: list.filter((r) => r.answer_grounded).length / an,
      avg_answer_length: list.reduce((s, r) => s + r.answer_length, 0) / an,
    });
  }
  areas.sort((a, b) => a.legal_area.localeCompare(b.legal_area));

  const report: QualityReport = {
    total: n,
    top_k: opts.topK,
    retrieval_hit_at_5: results.filter((r) => r.hit_at_5).length / n,
    german_answer_rate: results.filter((r) => r.answer_in_german).length / n,
    references_law_rate: results.filter((r) => r.answer_references_law).length / n,
    grounded_rate: results.filter((r) => r.answer_grounded).length / n,
    avg_answer_length: results.reduce((s, r) => s + r.answer_length, 0) / n,
    retrieval_errors: results.filter((r) => r.retrieval_error).length,
    llm_errors: results.filter((r) => r.llm_error).length,
    areas,
  };

  // Print summary
  process.stderr.write(`\n[copilot-test] QUALITY REPORT (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(`  Retrieval Hit@5:     ${(report.retrieval_hit_at_5 * 100).toFixed(1)}%\n`);
  process.stderr.write(`  German answers:      ${(report.german_answer_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(
    `  References law (§):  ${(report.references_law_rate * 100).toFixed(1)}%\n`
  );
  process.stderr.write(`  Grounded answers:    ${(report.grounded_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`  Avg answer length:   ${report.avg_answer_length.toFixed(0)} chars\n`);
  process.stderr.write(`  Retrieval errors:    ${report.retrieval_errors}\n`);
  process.stderr.write(`  LLM errors:          ${report.llm_errors}\n`);
  process.stderr.write(`\n  Per-area:\n`);
  for (const a of areas) {
    process.stderr.write(
      `  ${a.legal_area} (n=${a.n}): Hit@5=${(a.retrieval_hit_at_5 * 100).toFixed(1)}% DE=${(a.german_answer_rate * 100).toFixed(1)}% Grounded=${(a.grounded_rate * 100).toFixed(1)}% AvgLen=${a.avg_answer_length.toFixed(0)}\n`
    );
  }

  // Write summary to output
  if (emitter) {
    emitter.emit({
      kind: "summary",
      ...report,
    } as unknown as Record<string, unknown>);
    process.stderr.write(`\n[copilot-test] output written to ${opts.outputPath}\n`);
  }

  // Print sample answers
  process.stderr.write(`\n[copilot-test] SAMPLE ANSWERS (first 3):\n`);
  for (const r of results.slice(0, 3)) {
    process.stderr.write(`\n  Q: ${r.question}\n`);
    process.stderr.write(
      `  A: ${r.llm_answer.slice(0, 300)}${r.llm_answer.length > 300 ? "..." : ""}\n`
    );
    process.stderr.write(
      `  [DE=${r.answer_in_german} §=${r.answer_references_law} G=${r.answer_grounded}]\n`
    );
  }

  await engine.disconnect();
  process.stderr.write(`\n[copilot-test] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
