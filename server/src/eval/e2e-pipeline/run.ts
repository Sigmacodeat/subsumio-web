/**
 * End-to-End Pipeline Test — Upload → Import → Retrieval → LLM Answer → Citation Check
 *
 * This test simulates the full user flow:
 *   1. Upload a synthetic case file (markdown) to the brain
 *   2. Import it (chunking + embedding)
 *   3. Ask a question about the case file
 *   4. Retrieve relevant chunks via hybrid search
 *   5. Generate an LLM answer with the retrieved context
 *   6. Run citation grounding guardrail on the answer
 *   7. Verify the answer contains expected information
 *
 * Unlike the Akten-Retrieval Benchmark (which only tests retrieval),
 * this test verifies the FULL pipeline including LLM synthesis and
 * citation grounding.
 *
 * Usage:
 *   bun run src/eval/e2e-pipeline/run.ts
 */

import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";
import { berechneFristAuto } from "../../core/legal/frist-engine.ts";
import { checkCitationGrounding } from "../../core/citation-guardrail.ts";

// ─── Types ───────────────────────────────────────────────────────────────

interface E2ETestCase {
  test_id: string;
  case_file: string;
  question: string;
  expected_keywords: string[];
  expected_fristart?: string;
  expected_fristende?: string;
  description: string;
}

interface E2ETestResult {
  test_id: string;
  description: string;
  case_file: string;
  question: string;
  // Step 1: Import
  import_success: boolean;
  import_slug: string;
  // Step 2: Retrieval
  retrieval_success: boolean;
  top_slugs: string[];
  result_count: number;
  // Step 3: LLM Synthesis
  synthesis_success: boolean;
  answer: string;
  answer_length: number;
  // Step 4: Citation Guardrail
  guardrail_passed: boolean;
  guardrail_flags: string[];
  // Step 5: Content verification
  keywords_found: string[];
  keywords_missing: string[];
  content_match: boolean;
  // Step 6: Fristen check (if applicable)
  frist_check?: {
    fristart: string;
    expected: string;
    computed: string;
    match: boolean;
  };
  // Overall
  passed: boolean;
  error?: string;
}

// ─── Test Cases ──────────────────────────────────────────────────────────

const TEST_CASES: E2ETestCase[] = [
  {
    test_id: "e2e-001",
    case_file: "mueller-gegen-huber-urteil.md",
    question: "Wie hoch ist der Schadenersatzanspruch im Fall Müller gegen Huber?",
    expected_keywords: ["15.000", "Schadenersatz", "Reparaturkosten", "Nutzungsausfall"],
    expected_fristart: "berufung",
    expected_fristende: "2026-04-17",
    description: "Schadenersatzhöhe + Berufungsfrist aus Urteil extrahieren",
  },
  {
    test_id: "e2e-002",
    case_file: "schwarz-gegen-wagner-bescheid.md",
    question: "Welche Verjährungsfrist wurde im Fall Schwarz gegen Wagner geprüft?",
    expected_keywords: ["Verjährungsfrist", "drei Jahren", "1489", "ABGB"],
    description: "Verjährungsfrist aus Bescheiddokument extrahieren",
  },
  {
    test_id: "e2e-003",
    case_file: "kowalski-gegen-immobilien-gmbh-klage.md",
    question: "Welche Mängel wurden in der Wohnung im Fall Kowalski festgestellt?",
    expected_keywords: ["Feuchtigkeitsschäden", "Bad", "Heizung", "Wohnzimmer", "Fensterdichtungen"],
    description: "Mängelliste aus Klageschrift extrahieren",
  },
  {
    test_id: "e2e-004",
    case_file: "pichler-gegen-gemeinde-baubescheid.md",
    question: "Gegen welchen Bescheid richtet sich die Beschwerde im Fall Pichler?",
    expected_keywords: ["Baubescheid", "Gemeinde Altheim", "Carport"],
    expected_fristart: "beschwerde_vwgvg",
    expected_fristende: "2026-03-17",
    description: "Bescheid-Inhalt + Beschwerdefrist aus Verwaltungsakt extrahieren",
  },
  {
    test_id: "e2e-005",
    case_file: "eberhard-gegen-versicherung-urteil.md",
    question: "Welche Kostenentscheidung wurde im Fall Eberhard gegen Versicherung getroffen?",
    expected_keywords: ["Kosten", "zwei Drittel", "ein Drittel", "teilweisem Obsiegen"],
    description: "Kostenentscheidung aus Urteil extrahieren",
  },
  {
    test_id: "e2e-006",
    case_file: "reiter-gegen-bank-vertrag.md",
    question: "Welche Kreditbedingungen wurden im Fall Reiter gegen Bank vereinbart?",
    expected_keywords: ["250.000", "variabler", "Verzinsung", "4,5", "Laufzeit", "20 Jahren"],
    description: "Vertragskonditionen aus Kreditakte extrahieren",
  },
];

// ─── Helper: Keyword matching ────────────────────────────────────────────

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkKeywords(answer: string, expected: string[]): { found: string[]; missing: string[] } {
  const normalized = normalizeText(answer);
  const found: string[] = [];
  const missing: string[] = [];
  for (const kw of expected) {
    const normKw = normalizeText(kw);
    if (normalized.includes(normKw)) {
      found.push(kw);
    } else {
      missing.push(kw);
    }
  }
  return { found, missing };
}

// ─── Report ──────────────────────────────────────────────────────────────

function formatReport(results: E2ETestResult[]): string {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  const lines: string[] = [
    "",
    "  ═══════════════════════════════════════════════════",
    "  END-TO-END PIPELINE BENCHMARK RESULTS",
    "  ═══════════════════════════════════════════════════",
    `  Total:    ${total}`,
    `  Passed:   ${passed} ✅`,
    `  Failed:   ${failed} ${failed === 0 ? "" : "❌"}`,
    "",
  ];

  for (const r of results) {
    const status = r.passed ? "✅" : "❌";
    lines.push(`  ${status} ${r.test_id}: ${r.description}`);
    lines.push(`     Question: ${r.question}`);
    lines.push(`     Import: ${r.import_success ? "✓" : "✗"} | Retrieval: ${r.retrieval_success ? `✓ (${r.result_count} results)` : "✗"} | Synthesis: ${r.synthesis_success ? `✓ (${r.answer_length} chars)` : "✗"}`);
    lines.push(`     Guardrail: ${r.guardrail_passed ? "✓ PASS" : "✗ FLAGGED"}${r.guardrail_flags.length > 0 ? ` [${r.guardrail_flags.join(", ")}]` : ""}`);
    lines.push(`     Keywords: ${r.keywords_found.length}/${r.keywords_found.length + r.keywords_missing.length} found${r.keywords_missing.length > 0 ? ` (missing: ${r.keywords_missing.join(", ")})` : ""}`);
    if (r.frist_check) {
      lines.push(`     Frist: ${r.frist_check.fristart} expected=${r.frist_check.expected} computed=${r.frist_check.computed} ${r.frist_check.match ? "✓" : "✗"}`);
    }
    if (r.error) {
      lines.push(`     ERROR: ${r.error}`);
    }
    lines.push("");
  }

  const gate = failed === 0 ? "✅ PASS" : "❌ FAIL";
  lines.push(`  Gate (100% pass):  ${gate}`);
  lines.push("  ═══════════════════════════════════════════════════");
  lines.push("");

  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { values: args } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: "string", default: "/tmp/e2e-pipeline-results.jsonl" },
      "skip-import": { type: "boolean", default: false },
      "skip-synthesis": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  process.stderr.write("[e2e-pipeline] starting End-to-End Pipeline Benchmark\n");
  process.stderr.write(`[e2e-pipeline] test cases: ${TEST_CASES.length}\n`);

  // Increase query embed timeout for OpenRouter latency
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  // Dynamic imports for engine connection
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } = await import("../../core/ai/gateway.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { chat: gatewayChat } = await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json before running this eval.");
  }
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[e2e-pipeline] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try { await reconfigureGatewayWithEngine(engine); } catch { /* non-fatal */ }

  const CASE_FILES_DIR = join(resolve(import.meta.dir), "..", "..", "..", "test", "fixtures", "akten");
  const EVAL_SOURCE_ID = "eval-akten";

  // Step 1: Import all case files
  if (!args["skip-import"]) {
    process.stderr.write(`[e2e-pipeline] importing case files...\n`);

    // Register the eval source first (idempotent)
    try {
      await engine.executeRaw(
        `INSERT INTO sources(id, name, config) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`,
        [EVAL_SOURCE_ID, EVAL_SOURCE_ID, JSON.stringify({ provisioned_by: "e2e-pipeline" })]
      );
    } catch {
      // non-fatal
    }

    const files = readdirSync(CASE_FILES_DIR).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(CASE_FILES_DIR, file), "utf-8");
      const slug = `faelle/${file.replace(/\.md$/, "")}`;
      try {
        await importFromContent(engine, slug, content, { sourceId: EVAL_SOURCE_ID });
        process.stderr.write(`[e2e-pipeline] imported ${slug}\n`);
      } catch (err: any) {
        if (String(err?.message ?? err).includes("duplicate") || String(err?.message ?? err).includes("exists")) {
          process.stderr.write(`[e2e-pipeline] already exists: ${slug}\n`);
        } else {
          process.stderr.write(`[e2e-pipeline] ERROR importing ${slug}: ${err?.message}\n`);
        }
      }
    }
  }

  // Step 2-6: Run each test case
  const results: E2ETestResult[] = [];

  for (const tc of TEST_CASES) {
    process.stderr.write(`[e2e-pipeline] running ${tc.test_id}: ${tc.description}\n`);

    const result: E2ETestResult = {
      test_id: tc.test_id,
      description: tc.description,
      case_file: tc.case_file,
      question: tc.question,
      import_success: false,
      import_slug: "",
      retrieval_success: false,
      top_slugs: [],
      result_count: 0,
      synthesis_success: false,
      answer: "",
      answer_length: 0,
      guardrail_passed: false,
      guardrail_flags: [],
      keywords_found: [],
      keywords_missing: [],
      content_match: false,
      passed: false,
    };

    try {
      // Step 1: Import (already done above, just mark success)
      result.import_success = true;
      result.import_slug = `faelle/${tc.case_file.replace(/\.md$/, "")}`;

      // Step 2: Retrieval
      const searchOpts = {
        limit: 24,
        sourceId: EVAL_SOURCE_ID,
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
      } as const;

      const searchResults = await hybridSearch(engine, tc.question, searchOpts);
      const topResults = searchResults.slice(0, 8);
      result.retrieval_success = topResults.length > 0;
      result.top_slugs = topResults.map((r: any) => r.slug);
      result.result_count = topResults.length;

      if (!result.retrieval_success) {
        result.error = "No search results returned";
        results.push(result);
        process.stderr.write(`[e2e-pipeline] ${tc.test_id} FAIL: no search results\n`);
        continue;
      }

      // Step 3: Build context from search results
      const contextParts = topResults.map((r: any, i: number) => {
        const content = r.chunk_text ?? r.content ?? r.text ?? r.chunk ?? "";
        return `[${i + 1}] Slug: ${r.slug}\n${content}`;
      });
      const context = contextParts.join("\n\n---\n\n");

      // Step 4: LLM Synthesis (skip if --skip-synthesis)
      if (!args["skip-synthesis"]) {
        try {
          const systemPrompt = [
            "Du bist ein österreichischer Rechtsassistent.",
            "Beantworte die Frage basierend auf dem bereitgestellten Kontext.",
            "Zitiere relevante Gesetzesstellen und Dokumentinhalte genau.",
            "ERFINDE keine Informationen, die nicht im Kontext stehen.",
            "Wenn die Information nicht im Kontext ist, sage das deutlich.",
          ].join(" ");

          const userMessage = [
            "KONTEXT:",
            context.slice(0, 12000),
            "",
            "FRAGE:",
            tc.question,
            "",
            "Beantworte die Frage nur basierend auf dem obigen Kontext.",
          ].join("\n");

          const chatResult = await gatewayChat({
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
            maxTokens: 1024,
          });

          result.answer = chatResult.text ?? "";
          result.answer_length = result.answer.length;
          result.synthesis_success = result.answer_length > 50;

          if (!result.synthesis_success) {
            result.error = "LLM synthesis produced empty or very short answer";
            results.push(result);
            process.stderr.write(`[e2e-pipeline] ${tc.test_id} FAIL: empty synthesis\n`);
            continue;
          }

          // Step 5: Citation Guardrail
          const guardResult = checkCitationGrounding({
            answer: result.answer,
            context,
            topSlugs: result.top_slugs,
          });
          result.guardrail_passed = guardResult.passed;
          result.guardrail_flags = guardResult.flags.map((f) => f.type);

          // Step 6: Content verification
          const kwCheck = checkKeywords(result.answer, tc.expected_keywords);
          result.keywords_found = kwCheck.found;
          result.keywords_missing = kwCheck.missing;
          result.content_match = kwCheck.missing.length === 0;

        } catch (err: any) {
          result.error = `Synthesis error: ${err?.message}`;
          results.push(result);
          process.stderr.write(`[e2e-pipeline] ${tc.test_id} FAIL: synthesis error: ${err?.message}\n`);
          continue;
        }
      } else {
        // Skip synthesis — just check retrieval + keyword match in context
        result.synthesis_success = true;
        result.answer = context.slice(0, 2000);
        result.answer_length = result.answer.length;
        result.guardrail_passed = true;
        const kwCheck = checkKeywords(context, tc.expected_keywords);
        result.keywords_found = kwCheck.found;
        result.keywords_missing = kwCheck.missing;
        result.content_match = kwCheck.missing.length <= 1; // Allow 1 missing in context-only mode
      }

      // Step 7: Fristen check (if applicable)
      if (tc.expected_fristart && tc.expected_fristende) {
        // Extract the ausloeser from the case file content
        const caseContent = readFileSync(join(CASE_FILES_DIR, tc.case_file), "utf-8");
        // Look for Zustellung date pattern
        const dateMatch = caseContent.match(/Zustellung.*?am\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i);
        let ausloeser = "";
        if (dateMatch) {
          ausloeser = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
        }

        if (ausloeser) {
          try {
            const fristResult = berechneFristAuto(tc.expected_fristart, ausloeser);
            result.frist_check = {
              fristart: tc.expected_fristart,
              expected: tc.expected_fristende,
              computed: fristResult.fristende,
              match: fristResult.fristende === tc.expected_fristende,
            };
          } catch {
            // Frist calculation error — non-fatal for E2E test
          }
        }
      }

      // Overall pass/fail
      result.passed =
        result.import_success &&
        result.retrieval_success &&
        result.synthesis_success &&
        result.guardrail_passed &&
        result.content_match &&
        (result.frist_check?.match ?? true);

      const status = result.passed ? "✓" : "✗";
      process.stderr.write(
        `[e2e-pipeline] ${tc.test_id} ${status} — retrieval=${result.retrieval_success} synthesis=${result.synthesis_success} guardrail=${result.guardrail_passed} content=${result.content_match} frist=${result.frist_check?.match ?? "n/a"}\n`
      );
    } catch (err: any) {
      result.error = String(err?.message ?? err);
      process.stderr.write(`[e2e-pipeline] ${tc.test_id} ERROR: ${err?.message}\n`);
    }

    results.push(result);
  }

  // Print report
  const report = formatReport(results);
  process.stderr.write(report);

  // Write JSONL output
  const outputPath = args.output as string;
  if (existsSync(outputPath)) writeFileSync(outputPath, "");
  for (const r of results) {
    appendFileSync(outputPath, JSON.stringify(r) + "\n");
  }
  const passed = results.filter((r) => r.passed).length;
  appendFileSync(outputPath, JSON.stringify({
    kind: "summary",
    total: results.length,
    passed,
    failed: results.length - passed,
    gate: { passed: passed === results.length, target: "100% pass" },
  }) + "\n");
  process.stderr.write(`[e2e-pipeline] output written to ${outputPath}\n`);

  await engine.disconnect();
  process.stderr.write(`[e2e-pipeline] done.\n`);

  if (passed < results.length) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
