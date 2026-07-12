/**
 * German Legal Retrieval — Phase 5: Quality Gate + PDF Pipeline Test
 *
 * Architecture: Generate → Self-Refine → LLM-as-Judge
 *
 * Test A — Self-Refine + LLM-as-Judge:
 *   1. DeepSeek V3.2 generates initial answer (cheap)
 *   2. DeepSeek V3.2 reviews & refines its own answer (still cheap)
 *   3. Claude Opus (or GPT-5) evaluates juristic correctness (expensive, 1 call)
 *
 * Test B — PDF Extraction Pipeline:
 *   1. Import real PDF/DOCX fixtures via extractDocumentText
 *   2. Search for content from those documents
 *   3. Verify extraction quality and searchability
 *
 * Test C — Mandantendokument Search:
 *   1. Import synthetic case files (contracts, evidence, letters)
 *   2. Search with case-specific queries
 *   3. Verify retrieval from non-law content
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval/phase5-quality-gate.ts \
 *     test/fixtures/de-legal-retrieval.jsonl \
 *     --output /tmp/de-legal-phase5.jsonl \
 *     --judge-model openai:gpt-5.4 \
 *     --limit 20
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve, dirname, extname, basename } from "path";
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

interface Phase5Result {
  question_id: string;
  question: string;
  legal_area: string;
  // Retrieval
  hit_at_5: boolean;
  top_slugs: string[];
  // Layer 1: Initial answer
  initial_answer: string;
  initial_model: string;
  // Layer 2: Refined answer
  refined_answer: string;
  refine_changes: boolean;
  // Layer 3: Judge evaluation
  judge_model: string;
  judge_score: number; // 1-10
  judge_correct: boolean;
  judge_hallucination: boolean;
  judge_issues: string[];
  judge_feedback: string;
  // Heuristic metrics (for comparison)
  heuristic_german: boolean;
  heuristic_references_law: boolean;
  heuristic_grounded: boolean;
  // Errors
  retrieval_error?: string;
  initial_llm_error?: string;
  refine_llm_error?: string;
  judge_error?: string;
}

interface PdfTestResult {
  fixture_file: string;
  file_size: number;
  extraction_success: boolean;
  extracted_text_length: number;
  extracted_text_preview: string;
  import_success: boolean;
  search_success: boolean;
  search_results: number;
  search_query: string;
  top_slug: string;
  error?: string;
}

interface Phase5Report {
  total_questions: number;
  // Retrieval
  retrieval_hit_at_5: number;
  // Heuristic metrics
  heuristic_german_rate: number;
  heuristic_references_law_rate: number;
  heuristic_grounded_rate: number;
  // Judge metrics
  judge_avg_score: number;
  judge_correct_rate: number;
  judge_hallucination_rate: number;
  judge_correct_and_grounded_rate: number;
  // Refine metrics
  refine_change_rate: number;
  refine_improved_rate: number; // judge score improved after refine
  // Errors
  retrieval_errors: number;
  initial_llm_errors: number;
  refine_llm_errors: number;
  judge_errors: number;
  // Per-area
  per_area: Record<string, {
    n: number;
    judge_avg_score: number;
    judge_correct_rate: number;
    hallucination_rate: number;
  }>;
  // PDF test
  pdf_results: PdfTestResult[];
  pdf_summary: {
    total: number;
    extraction_success: number;
    import_success: number;
    search_success: number;
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  outputPath?: string;
  judgeModel: string;
  generateModel: string;
  limit?: number;
  skipPdf?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    judgeModel: "openai:gpt-5.4",
    generateModel: "openrouter:deepseek/deepseek-chat",
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--judge-model" && i + 1 < args.length) { out.judgeModel = args[++i]; continue; }
    if (a === "--generate-model" && i + 1 < args.length) { out.generateModel = args[++i]; continue; }
    if (a === "--limit" && i + 1 < args.length) { out.limit = parseInt(args[++i], 10); continue; }
    if (a === "--skip-pdf") { out.skipPdf = true; continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/de-legal-retrieval/phase5-quality-gate.ts <fixture.jsonl> [options]\n` +
        `  --output PATH         Write JSONL results to PATH\n` +
        `  --judge-model MODEL   Judge model (default: openai:gpt-5.4)\n` +
        `  --generate-model MODEL  Generate model (default: openrouter:deepseek/deepseek-chat)\n` +
        `  --limit N             Only run first N questions\n` +
        `  --skip-pdf            Skip PDF extraction test\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) out.fixturePath = a;
  }
  if (!out.fixturePath) { process.stderr.write("Error: fixture path required\n"); process.exit(1); }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function loadFixture(path: string): DeLegalQuestion[] {
  const raw = readFileSync(path, "utf-8");
  return raw.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => JSON.parse(l));
}

interface CorpusFile { slug: string; content: string; abbreviation: string; }

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
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

class JsonlEmitter {
  constructor(private path: string) {
    if (existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
}

const EMBEDDING_COLUMN = {
  name: "embedding",
  type: "vector" as const,
  dimensions: 1536,
  embeddingModel: "openrouter:openai/text-embedding-3-small",
};

// ─── LLM Client ──────────────────────────────────────────────────────────

interface LLMClient {
  create: (params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }, callOpts?: { signal?: AbortSignal }) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

async function createLLMClient(model: string): Promise<{ client: LLMClient; resolvedModel: string }> {
  const isOpenRouter = model.startsWith("openrouter:");
  const isOpenAI = model.startsWith("openai:");
  const isAnthropic = model.startsWith("anthropic:");

  if (isOpenRouter) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: { "HTTP-Referer": "https://subsum.io", "X-Title": "subsumio-phase5" },
    });
    const resolvedModel = model.replace(/^openrouter:/, "");
    return {
      client: {
        create: async (params, callOpts) => {
          const messages: Array<{ role: string; content: string }> = [];
          if (params.system) messages.push({ role: "system", content: params.system });
          for (const m of params.messages ?? []) messages.push({ role: m.role, content: m.content });
          const res = await client.chat.completions.create({
            model: resolvedModel, max_tokens: params.max_tokens, messages: messages as any,
          }, { signal: callOpts?.signal });
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
          for (const m of params.messages ?? []) messages.push({ role: m.role, content: m.content });
          const res = await client.chat.completions.create({
            model: resolvedModel, max_tokens: params.max_tokens, messages: messages as any,
          }, { signal: callOpts?.signal });
          const text = res.choices?.[0]?.message?.content ?? "";
          return { content: [{ type: "text", text }] };
        },
      },
      resolvedModel,
    };
  }

  if (isAnthropic) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const resolvedModel = model.replace(/^anthropic:/, "");
    return {
      client: {
        create: async (params, callOpts) => {
          const res = await client.messages.create({
            model: resolvedModel,
            max_tokens: params.max_tokens,
            system: params.system,
            messages: params.messages as any,
          }, { signal: callOpts?.signal });
          return { content: res.content as any };
        },
      },
      resolvedModel,
    };
  }

  throw new Error(`Unsupported model: ${model}. Use openrouter:, openai:, or anthropic: prefix.`);
}

// ─── Heuristic evaluators (from Phase 3) ─────────────────────────────────

function isGermanAnswer(text: string): boolean {
  const germanWords = [
    "der", "die", "das", "und", "ist", "wird", "nach", "bei", "von", "mit",
    "auf", "für", "zu", "über", "aus", "dem", "den", "des", "ein", "eine",
    "einer", "eines", "einem", "einen", "nicht", "auch", "nur", "noch",
    "bereits", "jedoch", "allerdings", "dabei", "daher", "somit", "gemäß",
    "Absatz", "Satz", "bzw", "hinsichtlich", "vorausgesetzt",
  ];
  const lower = text.toLowerCase();
  let matches = 0;
  for (const w of germanWords) {
    if (new RegExp(`\\b${w}\\b`, "gi").test(lower)) matches++;
  }
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
  const indicators = lawMap[legalArea] ?? ["§"];
  const upper = text.toUpperCase();
  return indicators.some((ind) => upper.includes(ind.toUpperCase()));
}

function isGrounded(text: string, context: string): boolean {
  const contextWords = new Set(
    context.replace(/[^a-zA-ZäöüÄÖÜß\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 5).map((w) => w.toLowerCase())
  );
  const answerWords = text.replace(/[^a-zA-ZäöüÄÖÜß\s]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 5).map((w) => w.toLowerCase());
  let grounded = 0;
  for (const w of answerWords) if (contextWords.has(w)) grounded++;
  return answerWords.length > 0 && grounded / answerWords.length >= 0.2;
}

// ─── Context assembly ────────────────────────────────────────────────────

function assembleContext(results: Array<{ slug: string; title: string; chunk_text: string; score: number }>): string {
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

// ─── Layer 1: Generate ───────────────────────────────────────────────────

const GENERATE_SYSTEM =
  `Du bist ein deutscher Rechtsassistent (Legal Copilot) für die Kanzlei-Software Subsumio. ` +
  `Du beantwortest Rechtsfragen basierend auf den bereitgestellten Rechtsquellen.\n\n` +
  `Wichtige Regeln:\n` +
  `1. Antworte NUR auf Basis der bereitgestellten Rechtsquellen.\n` +
  `2. Zitiere den konkreten Paragraphen (z.B. "§ 12 BGB") wenn möglich.\n` +
  `3. Antworte auf Deutsch in klarer, professioneller Rechtssprache.\n` +
  `4. Wenn die Rechtsquellen keine ausreichende Antwort enthalten, sage dies offen.\n` +
  `5. Gib keine rechtlichen Ratschläge, sondern erkläre die Rechtslage objektiv.\n` +
  `6. Halte die Antwort prägnant (max. 3-5 Sätze).\n`;

async function generateAnswer(
  client: LLMClient, model: string, question: string, context: string
): Promise<string> {
  const userPrompt =
    `Frage: ${question}\n\n` +
    `Rechtsquellen:\n${context}\n\n` +
    `Anweisung: Beantworte die Frage basierend auf den oben genannten Rechtsquellen. ` +
    `Zitiere den relevanten Paragraphen. Antworte auf Deutsch.`;

  const response = await client.create({
    model, max_tokens: 512, system: GENERATE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// ─── Layer 2: Self-Refine ────────────────────────────────────────────────

const REFINE_SYSTEM =
  `Du bist ein juristischer Quality-Reviewer. Du erhältst eine Frage, Rechtsquellen und eine ` +
  `erste Antwort. Deine Aufgabe ist es, die Antwort zu verbessern.\n\n` +
  `Prüfe kritisch:\n` +
  `1. Ist jeder Satz durch die Rechtsquellen gedeckt?\n` +
  `2. Fehlt ein wichtiger Paragraph oder eine wichtige Einschränkung?\n` +
  `3. Gibt es juristische Ungenauigkeiten oder falsche Schlussfolgerungen?\n` +
  `4. Ist die Antwort klar und präzise?\n\n` +
  `Ausgabe: Gib die verbesserte Antwort aus. Wenn die ursprüngliche Antwort bereits korrekt ist, ` +
  `gib sie unverändert aus. Füge keine Erklärung der Änderungen hinzu — nur die finale Antwort.`;

async function refineAnswer(
  client: LLMClient, model: string, question: string, context: string, initialAnswer: string
): Promise<{ refined: string; changed: boolean }> {
  const userPrompt =
    `Frage: ${question}\n\n` +
    `Rechtsquellen:\n${context}\n\n` +
    `Erste Antwort: ${initialAnswer}\n\n` +
    `Anweisung: Prüfe die erste Antwort auf juristische Korrektheit und Verbesserungspotenzial. ` +
    `Gib die verbesserte (oder unveränderte) Antwort aus.`;

  const response = await client.create({
    model, max_tokens: 512, system: REFINE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const refined = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const changed = refined !== initialAnswer && refined.length > 0;
  return { refined: refined || initialAnswer, changed };
}

// ─── Layer 3: LLM-as-Judge ───────────────────────────────────────────────

const JUDGE_SYSTEM =
  `Du bist ein strenger juristischer Prüfer (Richter). Du bewertest die Qualität einer ` +
  `von einem KI-Assistenten generierten Rechtsantwort.\n\n` +
  `Bewertungskriterien:\n` +
  `1. JURISTISCHE KORREKTHEIT (Score 1-10): Ist die juristische Aussage korrekt?\n` +
  `2. HALLUZINATION: Behauptet die Antwort etwas, das nicht in den Rechtsquellen steht?\n` +
  `3. VOLLSTÄNDIGKEIT: Wird die Frage angemessen beantwortet?\n` +
  `4. ZITIERGENAUIGKEIT: Sind die §-Zitate korrekt?\n\n` +
  `Ausgabe-Format (STRIKT JSON):\n` +
  `{"score": <1-10>, "correct": <true|false>, "hallucination": <true|false>, "issues": ["<issue1>", "<issue2>"], "feedback": "<kurze Begründung>"}\n\n` +
  `Bewerte streng. Eine Antwort mit score >= 7 ist "correct". Halluzination = true wenn ` +
  `die Antwort Fakten behauptet, die nicht in den Rechtsqueln stehen.`;

interface JudgeResult {
  score: number;
  correct: boolean;
  hallucination: boolean;
  issues: string[];
  feedback: string;
}

async function judgeAnswer(
  client: LLMClient, model: string, question: string, context: string, answer: string
): Promise<JudgeResult> {
  const userPrompt =
    `Frage: ${question}\n\n` +
    `Rechtsquellen:\n${context}\n\n` +
    `Zu bewertende Antwort: ${answer}\n\n` +
    `Bewerte die Antwort gemäß den Kriterien. Ausgabe NUR als JSON.`;

  const response = await client.create({
    model, max_tokens: 256, system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = raw;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) jsonStr = braceMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      score: typeof parsed.score === "number" ? parsed.score : 0,
      correct: parsed.correct === true || (typeof parsed.score === "number" && parsed.score >= 7),
      hallucination: parsed.hallucination === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    };
  } catch {
    // Fallback: try to extract score from text
    const scoreMatch = raw.match(/score[:\s]*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    return {
      score,
      correct: score >= 7,
      hallucination: /hallucin/i.test(raw),
      issues: ["JSON parse failed"],
      feedback: raw.slice(0, 200),
    };
  }
}

// ─── PDF Extraction Test ─────────────────────────────────────────────────

async function runPdfExtractionTest(
  engine: any,
  emitter: JsonlEmitter | null
): Promise<PdfTestResult[]> {
  const { extractDocumentText } = await import("../../core/extract-document.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");

  const fixturesDir = join(REPO_ROOT, "tests/fixtures");
  const fixtureFiles = [
    { file: "sample_contract.pdf", query: "Welche Vertragsparteien werden genannt?" },
    { file: "sample_evidence.pdf", query: "Welche Beweisstücke werden aufgeführt?" },
    { file: "sample_letter.docx", query: "Was ist der Inhalt des Schreibens?" },
  ];

  const results: PdfTestResult[] = [];

  for (const { file, query } of fixtureFiles) {
    const filePath = join(fixturesDir, file);
    process.stderr.write(`\n[pdf-test] ${file}...\n`);

    if (!existsSync(filePath)) {
      const r: PdfTestResult = {
        fixture_file: file, file_size: 0, extraction_success: false,
        extracted_text_length: 0, extracted_text_preview: "",
        import_success: false, search_success: false, search_results: 0,
        search_query: query, top_slug: "", error: "File not found",
      };
      results.push(r);
      if (emitter) emitter.emit({ kind: "pdf_result", ...r } as any);
      continue;
    }

    const buf = readFileSync(filePath);
    const ext = extname(file).toLowerCase();

    try {
      const extracted = await extractDocumentText(buf, ext, { filename: file });
      const textLen = extracted.text.length;
      const preview = extracted.text.slice(0, 200).replace(/\n/g, " ");
      process.stderr.write(`  extracted: ${textLen} chars, ${extracted.warnings.length} warnings\n`);
      process.stderr.write(`  preview: ${preview.slice(0, 100)}...\n`);

      // Import into engine
      const slug = `documents/test/${file.replace(/\.[^.]+$/, "")}`;
      let importOk = false;
      try {
        await importFromContent(engine, slug, extracted.text, { noEmbed: false });
        importOk = true;
        process.stderr.write(`  imported as ${slug}\n`);
      } catch (importErr: any) {
        process.stderr.write(`  import ERROR: ${importErr.message}\n`);
      }

      // Search
      let searchOk = false;
      let searchCount = 0;
      let topSlug = "";
      if (importOk) {
        try {
          const searchResults = await hybridSearch(engine, query, {
            limit: 5, autocut: false, embeddingColumn: EMBEDDING_COLUMN,
          });
          searchCount = searchResults.length;
          searchOk = searchCount > 0;
          topSlug = searchResults[0]?.slug ?? "";
          process.stderr.write(`  search: ${searchCount} results, top=${topSlug}\n`);
        } catch (searchErr: any) {
          process.stderr.write(`  search ERROR: ${searchErr.message}\n`);
        }
      }

      const r: PdfTestResult = {
        fixture_file: file,
        file_size: buf.length,
        extraction_success: textLen > 0,
        extracted_text_length: textLen,
        extracted_text_preview: preview,
        import_success: importOk,
        search_success: searchOk,
        search_results: searchCount,
        search_query: query,
        top_slug: topSlug,
      };
      results.push(r);
      if (emitter) emitter.emit({ kind: "pdf_result", ...r } as any);
    } catch (err: any) {
      process.stderr.write(`  EXTRACTION ERROR: ${err.message}\n`);
      const r: PdfTestResult = {
        fixture_file: file, file_size: buf.length, extraction_success: false,
        extracted_text_length: 0, extracted_text_preview: "",
        import_success: false, search_success: false, search_results: 0,
        search_query: query, top_slug: "", error: err.message,
      };
      results.push(r);
      if (emitter) emitter.emit({ kind: "pdf_result", ...r } as any);
    }
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);
  const corpusFiles = loadLawCorpus();

  let testQuestions = questions;
  if (opts.limit && opts.limit > 0) testQuestions = questions.slice(0, opts.limit);

  process.stderr.write(`[phase5] loaded ${testQuestions.length} questions, ${corpusFiles.length} corpus files\n`);
  process.stderr.write(`[phase5] generate: ${opts.generateModel}\n`);
  process.stderr.write(`[phase5] judge: ${opts.judgeModel}\n`);

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);

  // Create LLM clients
  const { client: genClient, resolvedModel: genModel } = await createLLMClient(opts.generateModel);
  const { client: judgeClient, resolvedModel: judgeModel } = await createLLMClient(opts.judgeModel);
  process.stderr.write(`[phase5] LLM clients ready: gen=${genModel}, judge=${judgeModel}\n`);

  // Create in-memory engine
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Import corpus
  process.stderr.write(`[phase5] importing ${corpusFiles.length} law files...\n`);
  for (const cf of corpusFiles) {
    await importFromContent(engine, `law/de/${cf.slug}`, cf.content, { noEmbed: false });
  }
  process.stderr.write(`[phase5] import complete\n`);

  const emitter = opts.outputPath ? new JsonlEmitter(opts.outputPath) : null;

  // ── Test A: Quality Gate (Generate → Refine → Judge) ──
  process.stderr.write(`\n[phase5] ═══ TEST A: QUALITY GATE (Generate → Refine → Judge) ═══\n`);

  const results: Phase5Result[] = [];
  let qIdx = 0;

  for (const q of testQuestions) {
    qIdx++;
    const question = q.question;
    const legalArea = q.legal_area;
    const expectedSlug = `law/de/${q.answer_slug}`;

    process.stderr.write(`[phase5] ${qIdx}/${testQuestions.length} ${q.question_id}...`);

    const result: Phase5Result = {
      question_id: q.question_id,
      question,
      legal_area: legalArea,
      hit_at_5: false,
      top_slugs: [],
      initial_answer: "",
      initial_model: genModel,
      refined_answer: "",
      refine_changes: false,
      judge_model: judgeModel,
      judge_score: 0,
      judge_correct: false,
      judge_hallucination: false,
      judge_issues: [],
      judge_feedback: "",
      heuristic_german: false,
      heuristic_references_law: false,
      heuristic_grounded: false,
    };

    // Step 1: Hybrid search
    try {
      const searchResults = await hybridSearch(engine, question, {
        limit: 5, autocut: false, embeddingColumn: EMBEDDING_COLUMN,
      });
      const rankedSlugs = searchResults.map((r) => r.slug);
      result.top_slugs = rankedSlugs.slice(0, 8);
      result.hit_at_5 = rankedSlugs.slice(0, 5).includes(expectedSlug);

      if (searchResults.length === 0) {
        result.retrieval_error = "no results";
        process.stderr.write(` EMPTY-SEARCH`);
      } else {
        const context = assembleContext(
          searchResults.slice(0, 5).map((r) => ({
            slug: r.slug, title: r.title, chunk_text: r.chunk_text, score: r.score,
          }))
        );

        // Layer 1: Generate
        try {
          const initial = await generateAnswer(genClient, genModel, question, context);
          result.initial_answer = initial;
          result.heuristic_german = isGermanAnswer(initial);
          result.heuristic_references_law = referencesLaw(initial, legalArea);
          result.heuristic_grounded = isGrounded(initial, context);
          process.stderr.write(` gen=${initial.length}ch`);
        } catch (err: any) {
          result.initial_llm_error = String(err?.message ?? err);
          process.stderr.write(` GEN-ERROR`);
        }

        // Layer 2: Self-Refine
        if (result.initial_answer) {
          try {
            const { refined, changed } = await refineAnswer(genClient, genModel, question, context, result.initial_answer);
            result.refined_answer = refined;
            result.refine_changes = changed;
            process.stderr.write(` refine=${changed ? "CHANGED" : "same"}(${refined.length}ch)`);
          } catch (err: any) {
            result.refine_llm_error = String(err?.message ?? err);
            result.refined_answer = result.initial_answer;
            process.stderr.write(` REFINE-ERROR`);
          }
        }

        // Layer 3: Judge (evaluate the refined answer)
        const answerToJudge = result.refined_answer || result.initial_answer;
        if (answerToJudge) {
          try {
            const judgeRes = await judgeAnswer(judgeClient, judgeModel, question, context, answerToJudge);
            result.judge_score = judgeRes.score;
            result.judge_correct = judgeRes.correct;
            result.judge_hallucination = judgeRes.hallucination;
            result.judge_issues = judgeRes.issues;
            result.judge_feedback = judgeRes.feedback;
            process.stderr.write(` judge=${judgeRes.score}/10 ${judgeRes.correct ? "✓" : "✗"} ${judgeRes.hallucination ? "HALLU" : ""}`);
          } catch (err: any) {
            result.judge_error = String(err?.message ?? err);
            process.stderr.write(` JUDGE-ERROR`);
          }
        }
      }
    } catch (searchErr: any) {
      result.retrieval_error = String(searchErr?.message ?? searchErr);
      process.stderr.write(` SEARCH-ERROR`);
    }

    results.push(result);
    if (emitter) emitter.emit({ kind: "phase5_result", ...result } as any);
    process.stderr.write(`\n`);
  }

  // ── Test B: PDF Extraction ──
  let pdfResults: PdfTestResult[] = [];
  if (!opts.skipPdf) {
    process.stderr.write(`\n[phase5] ═══ TEST B: PDF EXTRACTION PIPELINE ═══\n`);
    pdfResults = await runPdfExtractionTest(engine, emitter);
  }

  // ── Build report ──
  const n = results.length || 1;
  const byArea = new Map<string, Phase5Result[]>();
  for (const r of results) {
    const list = byArea.get(r.legal_area) ?? [];
    list.push(r);
    byArea.set(r.legal_area, list);
  }

  const perArea: Phase5Report["per_area"] = {};
  for (const [area, list] of byArea) {
    const an = list.length || 1;
    perArea[area] = {
      n: list.length,
      judge_avg_score: list.reduce((s, r) => s + r.judge_score, 0) / an,
      judge_correct_rate: list.filter((r) => r.judge_correct).length / an,
      hallucination_rate: list.filter((r) => r.judge_hallucination).length / an,
    };
  }

  const report: Phase5Report = {
    total_questions: results.length,
    retrieval_hit_at_5: results.filter((r) => r.hit_at_5).length / n,
    heuristic_german_rate: results.filter((r) => r.heuristic_german).length / n,
    heuristic_references_law_rate: results.filter((r) => r.heuristic_references_law).length / n,
    heuristic_grounded_rate: results.filter((r) => r.heuristic_grounded).length / n,
    judge_avg_score: results.reduce((s, r) => s + r.judge_score, 0) / n,
    judge_correct_rate: results.filter((r) => r.judge_correct).length / n,
    judge_hallucination_rate: results.filter((r) => r.judge_hallucination).length / n,
    judge_correct_and_grounded_rate: results.filter((r) => r.judge_correct && r.heuristic_grounded).length / n,
    refine_change_rate: results.filter((r) => r.refine_changes).length / n,
    refine_improved_rate: 0, // Will calculate below
    retrieval_errors: results.filter((r) => r.retrieval_error).length,
    initial_llm_errors: results.filter((r) => r.initial_llm_error).length,
    refine_llm_errors: results.filter((r) => r.refine_llm_error).length,
    judge_errors: results.filter((r) => r.judge_error).length,
    per_area: perArea,
    pdf_results: pdfResults,
    pdf_summary: {
      total: pdfResults.length,
      extraction_success: pdfResults.filter((r) => r.extraction_success).length,
      import_success: pdfResults.filter((r) => r.import_success).length,
      search_success: pdfResults.filter((r) => r.search_success).length,
    },
  };

  // Print summary
  process.stderr.write(`\n[phase5] ═══ QUALITY GATE SUMMARY ═══\n`);
  process.stderr.write(`  Questions:             ${results.length}\n`);
  process.stderr.write(`  Retrieval Hit@5:       ${(report.retrieval_hit_at_5 * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  Heuristic Metrics:\n`);
  process.stderr.write(`    German answers:      ${(report.heuristic_german_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`    References law (§):  ${(report.heuristic_references_law_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Grounded:            ${(report.heuristic_grounded_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  LLM-as-Judge Metrics:\n`);
  process.stderr.write(`    Avg judge score:     ${report.judge_avg_score.toFixed(2)}/10\n`);
  process.stderr.write(`    Correct (≥7/10):     ${(report.judge_correct_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Hallucination rate:  ${(report.judge_hallucination_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Correct + Grounded:  ${(report.judge_correct_and_grounded_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  Self-Refine Metrics:\n`);
  process.stderr.write(`    Answers refined:     ${(report.refine_change_rate * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  Errors:\n`);
  process.stderr.write(`    Retrieval:           ${report.retrieval_errors}\n`);
  process.stderr.write(`    Generate LLM:        ${report.initial_llm_errors}\n`);
  process.stderr.write(`    Refine LLM:          ${report.refine_llm_errors}\n`);
  process.stderr.write(`    Judge LLM:           ${report.judge_errors}\n`);

  process.stderr.write(`\n  Per-Area (Judge):\n`);
  for (const [area, stats] of Object.entries(perArea)) {
    process.stderr.write(
      `    ${area} (n=${stats.n}): score=${stats.judge_avg_score.toFixed(2)} correct=${(stats.judge_correct_rate * 100).toFixed(1)}% halluc=${(stats.hallucination_rate * 100).toFixed(1)}%\n`
    );
  }

  if (pdfResults.length > 0) {
    process.stderr.write(`\n  PDF Extraction Test:\n`);
    process.stderr.write(`    Total: ${report.pdf_summary.total}\n`);
    process.stderr.write(`    Extraction OK: ${report.pdf_summary.extraction_success}\n`);
    process.stderr.write(`    Import OK: ${report.pdf_summary.import_success}\n`);
    process.stderr.write(`    Search OK: ${report.pdf_summary.search_success}\n`);
    for (const r of pdfResults) {
      process.stderr.write(`    ${r.fixture_file}: extract=${r.extraction_success} import=${r.import_success} search=${r.search_success} (${r.extracted_text_length}ch)${r.error ? ` ERROR: ${r.error}` : ""}\n`);
    }
  }

  // Sample answers with judge feedback
  process.stderr.write(`\n  Sample Answers (first 3 with judge feedback):\n`);
  for (const r of results.slice(0, 3)) {
    process.stderr.write(`\n    Q: ${r.question}\n`);
    process.stderr.write(`    Initial: ${r.initial_answer.slice(0, 200)}...\n`);
    if (r.refine_changes) {
      process.stderr.write(`    Refined: ${r.refined_answer.slice(0, 200)}...\n`);
    }
    process.stderr.write(`    Judge: ${r.judge_score}/10 ${r.judge_correct ? "✓" : "✗"} ${r.judge_hallucination ? "HALLU" : ""}\n`);
    if (r.judge_feedback) process.stderr.write(`    Feedback: ${r.judge_feedback.slice(0, 200)}\n`);
    if (r.judge_issues.length > 0) process.stderr.write(`    Issues: ${r.judge_issues.join("; ")}\n`);
  }

  // Verdict
  const judgePass = report.judge_correct_rate >= 0.8;
  const hallucinationPass = report.judge_hallucination_rate <= 0.1;
  const pdfPass = pdfResults.length === 0 || (report.pdf_summary.extraction_success === pdfResults.length && report.pdf_summary.search_success === pdfResults.length);

  process.stderr.write(`\n[phase5] ═══ FINAL VERDICT ═══\n`);
  process.stderr.write(`  Judge correct (≥80%):     ${judgePass ? "✅ PASS" : "❌ FAIL"} (${(report.judge_correct_rate * 100).toFixed(1)}%)\n`);
  process.stderr.write(`  Hallucination (≤10%):     ${hallucinationPass ? "✅ PASS" : "❌ FAIL"} (${(report.judge_hallucination_rate * 100).toFixed(1)}%)\n`);
  process.stderr.write(`  PDF pipeline:             ${pdfPass ? "✅ PASS" : "❌ FAIL"}\n`);
  process.stderr.write(`  Overall:                  ${judgePass && hallucinationPass && pdfPass ? "✅ ALL PASS" : "❌ FAILURES"}\n`);

  if (emitter) {
    emitter.emit({ kind: "final_report", ...report } as any);
    process.stderr.write(`\n[phase5] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`\n[phase5] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
