/**
 * German Legal Retrieval — Phase 5b: Quality Gate WITH Guardrail
 *
 * Architecture: Generate → Guardrail Check → Regenerate (if flagged) → Judge
 *
 * Flow per question:
 *   1. Hybrid search → context
 *   2. DeepSeek generates answer (Layer 1)
 *   3. Deterministic guardrail checks citations (Tier 0, FREE)
 *   4. If guardrail flags → regenerate with stricter prompt (max 2 retries)
 *   5. GPT-4o judges final answer (Layer 3)
 *
 * This proves whether the guardrail reduces hallucinations from 20% → ≤10%.
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval/phase5b-guardrail-test.ts \
 *     test/fixtures/de-legal-retrieval.jsonl \
 *     --output /tmp/de-legal-phase5b.jsonl \
 *     --judge-model openrouter:openai/gpt-4o \
 *     --limit 20
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

interface Phase5bResult {
  question_id: string;
  question: string;
  legal_area: string;
  // Retrieval
  hit_at_5: boolean;
  top_slugs: string[];
  // Layer 1: Initial answer
  initial_answer: string;
  initial_model: string;
  // Guardrail
  guardrail_passed: boolean;
  guardrail_flags_count: number;
  guardrail_flag_types: string[];
  guardrail_ungrounded_citations: string[];
  guardrail_non_existent_laws: string[];
  guardrail_fabricated_references: string[];
  guardrail_hedging: string[];
  guardrail_cross_law: string[];
  // Regeneration
  regeneration_count: number; // 0, 1, or 2
  final_answer: string;
  final_guardrail_passed: boolean;
  final_guardrail_flags_count: number;
  // Judge
  judge_model: string;
  judge_score: number;
  judge_correct: boolean;
  judge_hallucination: boolean;
  judge_issues: string[];
  judge_feedback: string;
  // Heuristic
  heuristic_german: boolean;
  heuristic_references_law: boolean;
  heuristic_grounded: boolean;
  // Errors
  retrieval_error?: string;
  initial_llm_error?: string;
  regenerate_llm_error?: string;
  judge_error?: string;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  outputPath?: string;
  judgeModel: string;
  generateModel: string;
  limit?: number;
  maxRegenerations: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    judgeModel: "openrouter:openai/gpt-4o",
    generateModel: "openrouter:deepseek/deepseek-chat",
    maxRegenerations: 2,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--judge-model" && i + 1 < args.length) { out.judgeModel = args[++i]; continue; }
    if (a === "--generate-model" && i + 1 < args.length) { out.generateModel = args[++i]; continue; }
    if (a === "--limit" && i + 1 < args.length) { out.limit = parseInt(args[++i], 10); continue; }
    if (a === "--max-regen" && i + 1 < args.length) { out.maxRegenerations = parseInt(args[++i], 10); continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/de-legal-retrieval/phase5b-guardrail-test.ts <fixture.jsonl> [options]\n` +
        `  --output PATH         Write JSONL results to PATH\n` +
        `  --judge-model MODEL   Judge model (default: openrouter:openai/gpt-4o)\n` +
        `  --generate-model MODEL  Generate model (default: openrouter:deepseek/deepseek-chat)\n` +
        `  --limit N             Only run first N questions\n` +
        `  --max-regen N         Max regenerations after guardrail flag (default: 2)\n`
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

  if (isOpenRouter) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: { "HTTP-Referer": "https://subsum.io", "X-Title": "subsumio-phase5b" },
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

  throw new Error(`Unsupported model: ${model}. Use openrouter: or openai: prefix.`);
}

// ─── Heuristic evaluators ────────────────────────────────────────────────

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

// ─── Prompts ─────────────────────────────────────────────────────────────

const BASE_SYSTEM =
  `Du bist ein deutscher Rechtsassistent (Legal Copilot) für die Kanzlei-Software Subsumio. ` +
  `Du beantwortest Rechtsfragen basierend auf den bereitgestellten Rechtsquellen.\n\n` +
  `Wichtige Regeln:\n` +
  `1. Antworte NUR auf Basis der bereitgestellten Rechtsquellen.\n` +
  `2. Zitiere den konkreten Paragraphen (z.B. "§ 12 BGB") wenn möglich.\n` +
  `3. Antworte auf Deutsch in klarer, professioneller Rechtssprache.\n` +
  `4. Wenn die Rechtsquellen keine ausreichende Antwort enthalten, sage dies offen.\n` +
  `5. Gib keine rechtlichen Ratschläge, sondern erkläre die Rechtslage objektiv.\n` +
  `6. Halte die Antwort prägnant (max. 3-5 Sätze).\n` +
  `7. VERWENDE NUR Paragraphen und Gesetze, die wörtlich in den Rechtsqueln vorkommen.\n` +
  `8. ERFINDE KEINE EU-Richtlinien, Artikel, Verordnungen oder anderen Referenzen.\n` +
  `9. Wenn du eine Information nicht in den Quellen findest, sage: "Diese Information ist in den bereitgestellten Rechtsquellen nicht enthalten."\n` +
  `10. LEITE KEINE Definitionen oder Rechtsbegriffe ab oder her. Wenn eine Definition nicht wörtlich in den Quellen steht, sage dies explizit.\n` +
  `11. SUCHE in ALLEN bereitgestellten Rechtsquellen nach der relevanten Definition. Prüfe jeden Abschnitt sorgfältig.\n` +
  `12. Wenn ein Begriff in den Quellen definiert wird (z.B. "§ 12 — Betriebstätte"), zitiere DIESE Definition wörtlich.\n`;

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

// ─── Generate answer ─────────────────────────────────────────────────────

async function generateAnswer(
  client: LLMClient, model: string, systemPrompt: string, question: string, context: string
): Promise<string> {
  const userPrompt =
    `Frage: ${question}\n\n` +
    `Rechtsquellen:\n${context}\n\n` +
    `Anweisung: Beantworte die Frage basierend auf den oben genannten Rechtsquellen.\n` +
    `SUCHE sorgfältig in allen Abschnitten nach der relevanten Definition oder Regelung.\n` +
    `Zitiere den relevanten Paragraphen EXAKT wie er in den Quellen steht.\n` +
    `Antworte auf Deutsch. Verwende NUR Zitate die wörtlich in den Quellen vorkommen.\n` +
    `Wenn die Antwort nicht in den Quellen steht, sage: "Diese Information ist in den bereitgestellten Rechtsquellen nicht enthalten."`;

  const response = await client.create({
    model, max_tokens: 512, system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// ─── Judge ───────────────────────────────────────────────────────────────

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
    model, max_tokens: 512, system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

  // Robust JSON parsing — try multiple strategies
  let parsed: any = null;
  let jsonStr = raw;

  // Strategy 1: Extract from code block
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  // Strategy 2: Find first { to last }
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  // Strategy 3: Try parsing
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Strategy 4: Fix common JSON issues (trailing commas, smart quotes)
    try {
      const fixed = jsonStr
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\u2018|\u2019/g, "'");
      parsed = JSON.parse(fixed);
    } catch {
      // Strategy 5: Regex extraction of individual fields
      const scoreMatch = raw.match(/"?score"?\s*[:=]\s*(\d+)/i);
      const correctMatch = raw.match(/"?correct"?\s*[:=]\s*(true|false)/i);
      const halluMatch = raw.match(/"?hallucination"?\s*[:=]\s*(true|false)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
      parsed = {
        score,
        correct: correctMatch ? correctMatch[1] === "true" : score >= 7,
        hallucination: halluMatch ? halluMatch[1] === "true" : /hallucin/i.test(raw),
        issues: ["JSON parse failed (regex fallback)"],
        feedback: raw.slice(0, 300),
      };
    }
  }

  return {
    score: typeof parsed.score === "number" ? parsed.score : 0,
    correct: parsed.correct === true || (typeof parsed.score === "number" && parsed.score >= 7),
    hallucination: parsed.hallucination === true,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
  };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);
  const corpusFiles = loadLawCorpus();

  let testQuestions = questions;
  if (opts.limit && opts.limit > 0) testQuestions = questions.slice(0, opts.limit);

  process.stderr.write(`[phase5b] loaded ${testQuestions.length} questions, ${corpusFiles.length} corpus files\n`);
  process.stderr.write(`[phase5b] generate: ${opts.generateModel}\n`);
  process.stderr.write(`[phase5b] judge: ${opts.judgeModel}\n`);
  process.stderr.write(`[phase5b] max regenerations: ${opts.maxRegenerations}\n`);

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");
  const { checkCitationGrounding, buildRegenerationPrompt } = await import("../../core/citation-guardrail.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);

  const { client: genClient, resolvedModel: genModel } = await createLLMClient(opts.generateModel);
  const { client: judgeClient, resolvedModel: judgeModel } = await createLLMClient(opts.judgeModel);
  process.stderr.write(`[phase5b] LLM clients ready: gen=${genModel}, judge=${judgeModel}\n`);

  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  process.stderr.write(`[phase5b] importing ${corpusFiles.length} law files...\n`);
  for (const cf of corpusFiles) {
    await importFromContent(engine, `law/de/${cf.slug}`, cf.content, { noEmbed: false });
  }
  process.stderr.write(`[phase5b] import complete\n`);

  const emitter = opts.outputPath ? new JsonlEmitter(opts.outputPath) : null;
  const results: Phase5bResult[] = [];
  let qIdx = 0;

  for (const q of testQuestions) {
    qIdx++;
    const question = q.question;
    const legalArea = q.legal_area;
    const expectedSlug = `law/de/${q.answer_slug}`;

    process.stderr.write(`[phase5b] ${qIdx}/${testQuestions.length} ${q.question_id}...`);

    const result: Phase5bResult = {
      question_id: q.question_id,
      question,
      legal_area: legalArea,
      hit_at_5: false,
      top_slugs: [],
      initial_answer: "",
      initial_model: genModel,
      guardrail_passed: false,
      guardrail_flags_count: 0,
      guardrail_flag_types: [],
      guardrail_ungrounded_citations: [],
      guardrail_non_existent_laws: [],
      guardrail_fabricated_references: [],
      guardrail_hedging: [],
      guardrail_cross_law: [],
      regeneration_count: 0,
      final_answer: "",
      final_guardrail_passed: false,
      final_guardrail_flags_count: 0,
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
        limit: 8, autocut: false, embeddingColumn: EMBEDDING_COLUMN,
      });
      const rankedSlugs = searchResults.map((r) => r.slug);
      result.top_slugs = rankedSlugs.slice(0, 8);
      result.hit_at_5 = rankedSlugs.slice(0, 5).includes(expectedSlug);

      if (searchResults.length === 0) {
        result.retrieval_error = "no results";
        process.stderr.write(` EMPTY-SEARCH`);
      } else {
        const context = assembleContext(
          searchResults.slice(0, 8).map((r) => ({
            slug: r.slug, title: r.title, chunk_text: r.chunk_text, score: r.score,
          }))
        );

        // Step 2: Generate initial answer
        let currentAnswer = "";
        let currentSystem = BASE_SYSTEM;
        try {
          currentAnswer = await generateAnswer(genClient, genModel, currentSystem, question, context);
          result.initial_answer = currentAnswer;
          result.heuristic_german = isGermanAnswer(currentAnswer);
          result.heuristic_references_law = referencesLaw(currentAnswer, legalArea);
          result.heuristic_grounded = isGrounded(currentAnswer, context);
          process.stderr.write(` gen=${currentAnswer.length}ch`);
        } catch (err: any) {
          result.initial_llm_error = String(err?.message ?? err);
          process.stderr.write(` GEN-ERROR`);
        }

        // Step 3: Guardrail check + regeneration loop
        if (currentAnswer) {
          let guardResult = checkCitationGrounding({
            answer: currentAnswer,
            context,
            topSlugs: result.top_slugs,
          });

          result.guardrail_passed = guardResult.passed;
          result.guardrail_flags_count = guardResult.flags.length;
          result.guardrail_flag_types = [...new Set(guardResult.flags.map((f) => f.type))];
          result.guardrail_ungrounded_citations = guardResult.ungrounded_citations;
          result.guardrail_non_existent_laws = guardResult.non_existent_laws;
          result.guardrail_fabricated_references = guardResult.fabricated_references;
          result.guardrail_hedging = guardResult.hedging_phrases;
          result.guardrail_cross_law = guardResult.cross_law_contamination;

          if (!guardResult.passed) {
            process.stderr.write(` GUARDRAIL-FLAG(${guardResult.flags.length})`);

            // Regeneration loop
            for (let regen = 0; regen < opts.maxRegenerations; regen++) {
              result.regeneration_count = regen + 1;
              process.stderr.write(` regen${regen + 1}`);

              // Build stricter prompt with guardrail feedback
              const strictSystem = buildRegenerationPrompt(BASE_SYSTEM, guardResult, context);

              try {
                const regenerated = await generateAnswer(genClient, genModel, strictSystem, question, context);
                if (regenerated) {
                  // Re-check guardrail
                  const recheck = checkCitationGrounding({
                    answer: regenerated,
                    context,
                    topSlugs: result.top_slugs,
                  });

                  if (recheck.passed) {
                    currentAnswer = regenerated;
                    result.final_guardrail_passed = true;
                    result.final_guardrail_flags_count = 0;
                    process.stderr.write(` GUARDRAIL-PASS`);
                    break;
                  } else if (recheck.flags.length < guardResult.flags.length) {
                    // Improvement — use the better answer
                    currentAnswer = regenerated;
                    guardResult = recheck;
                    result.final_guardrail_passed = recheck.passed;
                    result.final_guardrail_flags_count = recheck.flags.length;
                    process.stderr.write(` improved(${recheck.flags.length})`);
                  } else {
                    // No improvement — keep original
                    process.stderr.write(` no-improve`);
                  }
                }
              } catch (err: any) {
                result.regenerate_llm_error = String(err?.message ?? err);
                process.stderr.write(` REGEN-ERROR`);
                break;
              }
            }
          } else {
            result.final_guardrail_passed = true;
            process.stderr.write(` GUARDRAIL-PASS`);
          }

          result.final_answer = currentAnswer;

          // Step 4: Judge the final answer
          if (currentAnswer) {
            try {
              const judgeRes = await judgeAnswer(judgeClient, judgeModel, question, context, currentAnswer);
              result.judge_score = judgeRes.score;
              result.judge_correct = judgeRes.correct;
              result.judge_hallucination = judgeRes.hallucination;
              result.judge_issues = judgeRes.issues;
              result.judge_feedback = judgeRes.feedback;
              process.stderr.write(` judge=${judgeRes.score}/10 ${judgeRes.correct ? "✓" : "✗"}${judgeRes.hallucination ? " HALLU" : ""}`);
            } catch (err: any) {
              result.judge_error = String(err?.message ?? err);
              process.stderr.write(` JUDGE-ERROR`);
            }
          }
        }
      }
    } catch (searchErr: any) {
      result.retrieval_error = String(searchErr?.message ?? searchErr);
      process.stderr.write(` SEARCH-ERROR`);
    }

    results.push(result);
    if (emitter) emitter.emit({ kind: "phase5b_result", ...result } as any);
    process.stderr.write(`\n`);
  }

  // ── Build report ──
  const n = results.length || 1;
  const byArea = new Map<string, Phase5bResult[]>();
  for (const r of results) {
    const list = byArea.get(r.legal_area) ?? [];
    list.push(r);
    byArea.set(r.legal_area, list);
  }

  // Print summary
  process.stderr.write(`\n[phase5b] ═══ QUALITY GATE + GUARDRAIL SUMMARY ═══\n`);
  process.stderr.write(`  Questions:                ${results.length}\n`);
  process.stderr.write(`  Retrieval Hit@5:          ${(results.filter((r) => r.hit_at_5).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  Guardrail Metrics:\n`);
  process.stderr.write(`    Initial pass rate:      ${(results.filter((r) => r.guardrail_passed).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Final pass rate:        ${(results.filter((r) => r.final_guardrail_passed).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Regenerated:            ${results.filter((r) => r.regeneration_count > 0).length}/${results.length}\n`);
  process.stderr.write(`    Avg regen count:        ${(results.reduce((s, r) => s + r.regeneration_count, 0) / n).toFixed(2)}\n`);
  process.stderr.write(`\n  Heuristic Metrics:\n`);
  process.stderr.write(`    German:                 ${(results.filter((r) => r.heuristic_german).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`    References law (§):     ${(results.filter((r) => r.heuristic_references_law).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Grounded:               ${(results.filter((r) => r.heuristic_grounded).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  LLM-as-Judge Metrics:\n`);
  process.stderr.write(`    Avg judge score:        ${(results.reduce((s, r) => s + r.judge_score, 0) / n).toFixed(2)}/10\n`);
  process.stderr.write(`    Correct (≥7/10):        ${(results.filter((r) => r.judge_correct).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`    Hallucination rate:     ${(results.filter((r) => r.judge_hallucination).length / n * 100).toFixed(1)}%\n`);
  process.stderr.write(`\n  Guardrail Flag Breakdown:\n`);
  const flagTypeCounts: Record<string, number> = {};
  for (const r of results) {
    for (const ft of r.guardrail_flag_types) {
      flagTypeCounts[ft] = (flagTypeCounts[ft] ?? 0) + 1;
    }
  }
  for (const [ft, count] of Object.entries(flagTypeCounts)) {
    process.stderr.write(`    ${ft}: ${count}\n`);
  }

  process.stderr.write(`\n  Per-Area (Judge):\n`);
  for (const [area, list] of byArea) {
    const an = list.length || 1;
    process.stderr.write(
      `    ${area} (n=${list.length}): score=${(list.reduce((s, r) => s + r.judge_score, 0) / an).toFixed(2)} ` +
      `correct=${(list.filter((r) => r.judge_correct).length / an * 100).toFixed(0)}% ` +
      `hallu=${(list.filter((r) => r.judge_hallucination).length / an * 100).toFixed(0)}% ` +
      `guardrail_pass=${(list.filter((r) => r.final_guardrail_passed).length / an * 100).toFixed(0)}%\n`
    );
  }

  // Comparison with Phase 5 (no guardrail)
  process.stderr.write(`\n  Phase 5 vs 5b Comparison:\n`);
  process.stderr.write(`    Phase 5  (no guardrail):  correct=65.0% hallu=20.0%\n`);
  process.stderr.write(`    Phase 5b (with guardrail): correct=${(results.filter((r) => r.judge_correct).length / n * 100).toFixed(1)}% hallu=${(results.filter((r) => r.judge_hallucination).length / n * 100).toFixed(1)}%\n`);

  // Sample answers
  process.stderr.write(`\n  Sample Answers (first 3):\n`);
  for (const r of results.slice(0, 3)) {
    process.stderr.write(`\n    Q: ${r.question}\n`);
    process.stderr.write(`    Initial: ${r.initial_answer.slice(0, 150)}...\n`);
    if (r.regeneration_count > 0) {
      process.stderr.write(`    Regenerated ${r.regeneration_count}x, guardrail: ${r.guardrail_passed ? "FAIL→" : ""}${r.final_guardrail_passed ? "PASS" : "STILL-FLAGGED"}\n`);
      process.stderr.write(`    Final: ${r.final_answer.slice(0, 150)}...\n`);
    }
    process.stderr.write(`    Judge: ${r.judge_score}/10 ${r.judge_correct ? "✓" : "✗"}${r.judge_hallucination ? " HALLU" : ""}\n`);
    if (r.judge_feedback) process.stderr.write(`    Feedback: ${r.judge_feedback.slice(0, 150)}\n`);
  }

  // Guardrail-flagged answers that still hallucinated (missed by guardrail)
  const guardrailPassedButHallu = results.filter((r) => r.final_guardrail_passed && r.judge_hallucination);
  if (guardrailPassedButHallu.length > 0) {
    process.stderr.write(`\n  ⚠️ Guardrail PASSED but Judge found HALLUCINATION (${guardrailPassedButHallu.length}):\n`);
    for (const r of guardrailPassedButHallu) {
      process.stderr.write(`    ${r.question_id} (${r.legal_area}): score=${r.judge_score}\n`);
      process.stderr.write(`    Issues: ${r.judge_issues.join("; ")}\n`);
    }
  }

  // Verdict
  const judgePass = results.filter((r) => r.judge_correct).length / n >= 0.8;
  const hallucinationPass = results.filter((r) => r.judge_hallucination).length / n <= 0.1;
  const guardrailEffectiveness = results.filter((r) => r.final_guardrail_passed).length / n;

  process.stderr.write(`\n[phase5b] ═══ FINAL VERDICT ═══\n`);
  process.stderr.write(`  Judge correct (≥80%):       ${judgePass ? "✅ PASS" : "❌ FAIL"} (${(results.filter((r) => r.judge_correct).length / n * 100).toFixed(1)}%)\n`);
  process.stderr.write(`  Hallucination (≤10%):       ${hallucinationPass ? "✅ PASS" : "❌ FAIL"} (${(results.filter((r) => r.judge_hallucination).length / n * 100).toFixed(1)}%)\n`);
  process.stderr.write(`  Guardrail pass rate:        ${(guardrailEffectiveness * 100).toFixed(1)}%\n`);
  process.stderr.write(`  Guardrail caught halluc:    ${results.filter((r) => !r.final_guardrail_passed && r.judge_hallucination).length}/${results.filter((r) => r.judge_hallucination).length} hallucinations were guardrail-flagged\n`);
  process.stderr.write(`  Overall:                    ${judgePass && hallucinationPass ? "✅ ALL PASS" : "❌ FAILURES"}\n`);

  if (emitter) {
    emitter.emit({
      kind: "final_report",
      total: results.length,
      judge_correct_rate: results.filter((r) => r.judge_correct).length / n,
      hallucination_rate: results.filter((r) => r.judge_hallucination).length / n,
      guardrail_pass_rate: guardrailEffectiveness,
      regen_count: results.filter((r) => r.regeneration_count > 0).length,
    } as any);
    process.stderr.write(`\n[phase5b] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`\n[phase5b] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
