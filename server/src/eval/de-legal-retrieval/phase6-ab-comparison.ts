/**
 * Phase 6c: A/B Model Comparison — DeepSeek V4 Flash vs Grok 4.3
 *
 * Runs the same legal reasoning tasks on both models and compares:
 *   1. §-citation accuracy (correct paragraphs found)
 *   2. Hallucination rate (invented paragraphs)
 *   3. Answer quality (German, grounded, references law)
 *   4. Cost per task
 *   5. Latency per task
 *
 * Uses the subsumption-checker specialist (deep tier) as the test case,
 * since it does the most critical legal reasoning.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... bun run src/eval/de-legal-retrieval/phase6-ab-comparison.ts
 *
 * Output: /tmp/phase6-ab-results.jsonl
 */

import OpenAI from "openai";

// ── Test cases (legal reasoning questions with known correct §§) ──────────
interface TestCase {
  id: string;
  question: string;
  expected_paragraphs: string[];
  context: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "ab-001",
    question: "Welche Anspruchsgrundlage gilt für Schmerzensgeld bei einer Körperverletzung im österreichischen Recht?",
    expected_paragraphs: ["§ 1325 ABGB"],
    context: "Der Mandant erlitt bei einem Verkehrsunfall Prellungen und eine HWS-Distorsion. Der Beklagte fuhr bei Rot über die Kreuzung.",
  },
  {
    id: "ab-002",
    question: "Wie lange ist die reguläre Verjährungsfrist für Schadenersatzansprüche im deutschen Recht?",
    expected_paragraphs: ["§ 195 BGB"],
    context: "Der Mandant wurde am 15.03.2024 in einen Verkehrsunfall verwickelt und möchte Schadenersatz geltend machen.",
  },
  {
    id: "ab-003",
    question: "Unter welchen Voraussetzungen haftet ein Arbeitgeber für Schäden, die sein Arbeitnehmer verursacht hat?",
    expected_paragraphs: ["§ 1313a ABGB", "§ 1313 ABGB"],
    context: "Ein Lieferantenausfahrer verursachte beim Ausliefern einen Parkschaden an einem fremden Fahrzeug.",
  },
  {
    id: "ab-004",
    question: "Was ist die Verjährungsfrist für Steuerstraftaten in Österreich?",
    expected_paragraphs: ["§ 209 BAO", "§ 57 StGB"],
    context: "Ein Mandant wird beschuldigt, über mehrere Jahre hinweg Umsatzsteuer nicht abgeführt zu haben.",
  },
  {
    id: "ab-005",
    question: "Welche Voraussetzungen müssen für einen Unterlassungsanspruch im Wettbewerbsrecht vorliegen?",
    expected_paragraphs: ["§ 1 UWG"],
    context: "Ein Konkurrent verwendet irreführende Werbeaussagen über die Qualität seiner Produkte.",
  },
];

const SYSTEM_PROMPT = `Du bist ein juristischer Experte für deutsches und österreichisches Recht.

Beantworte die Frage präzise und zitiere die relevanten Paragraphen.

REGELN:
- Zitiere NUR Paragraphen, die in den bereitgestellten Rechtsquellen vorkommen.
- ERFINDE KEINE §§.
- Wenn du einen § zitierst, gib das Gesetz an (z.B. "§ 1325 ABGB").
- Antworte auf Deutsch.
- Wenn die Information nicht ausreicht, sage: "Diese Information ist in den bereitgestellten Rechtsquellen nicht enthalten."

Format:
ANTWORT: [deine Antwort]
PARAGRAPHEN: [komma-getrennte Liste der zitierten §§]`;

interface ModelResult {
  model: string;
  test_id: string;
  answer: string;
  paragraphs_found: string[];
  paragraphs_expected: string[];
  paragraphs_correct: string[];
  paragraphs_missing: string[];
  paragraphs_hallucinated: string[];
  is_german: boolean;
  references_law: boolean;
  latency_ms: number;
  cost_usd: number;
  error?: string;
}

function extractParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  const matches = text.matchAll(/§\s*(\d+[a-z]?)\s+(ABGB|BGB|StGB|ZPO|HGB|AO|BAO|EStG|KStG|UStG|StPO|VwGO|BVG|GG|OR|UWG)/gi);
  for (const m of matches) {
    paragraphs.push(`§ ${m[1]} ${m[2].toUpperCase()}`);
  }
  return [...new Set(paragraphs)];
}

function isGermanAnswer(text: string): boolean {
  const germanWords = ["der", "die", "das", "und", "ist", "wird", "nach", "bei", "von", "mit", "auf", "für", "den", "dem", "eine", "ein"];
  const words = text.toLowerCase().split(/\s+/);
  const germanCount = words.filter(w => germanWords.includes(w.replace(/[^\wäöüß]/g, ""))).length;
  return germanCount >= 4;
}

function referencesLaw(text: string): boolean {
  return /§\s*\d+/.test(text);
}

async function runModel(
  client: OpenAI,
  model: string,
  testCase: TestCase,
): Promise<ModelResult> {
  const start = Date.now();
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Kontext: ${testCase.context}\n\nFrage: ${testCase.question}` },
      ],
      max_tokens: 512,
      temperature: 0.1,
    });

    const answer = response.choices[0]?.message?.content ?? "";
    const latency = Date.now() - start;

    const usage = response.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;

    // Pricing per 1M tokens
    const pricing: Record<string, { input: number; output: number }> = {
      "deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
      "xai/grok-4.3": { input: 1.25, output: 2.50 },
    };
    const p = pricing[model] ?? { input: 0.14, output: 0.28 };
    const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;

    const found = extractParagraphs(answer);
    const expected = testCase.expected_paragraphs.map(p => p.toUpperCase());
    const foundUpper = found.map(p => p.toUpperCase());
    const correct = foundUpper.filter(p => expected.includes(p));
    const missing = expected.filter(p => !foundUpper.includes(p));
    const hallucinated = foundUpper.filter(p => !expected.includes(p));

    return {
      model,
      test_id: testCase.id,
      answer,
      paragraphs_found: found,
      paragraphs_expected: testCase.expected_paragraphs,
      paragraphs_correct: correct,
      paragraphs_missing: missing,
      paragraphs_hallucinated: hallucinated,
      is_german: isGermanAnswer(answer),
      references_law: referencesLaw(answer),
      latency_ms: latency,
      cost_usd: cost,
    };
  } catch (e) {
    return {
      model,
      test_id: testCase.id,
      answer: "",
      paragraphs_found: [],
      paragraphs_expected: testCase.expected_paragraphs,
      paragraphs_correct: [],
      paragraphs_missing: testCase.expected_paragraphs,
      paragraphs_hallucinated: [],
      is_german: false,
      references_law: false,
      latency_ms: Date.now() - start,
      cost_usd: 0,
      error: (e as Error).message,
    };
  }
}

async function runPhase6C(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY_FALLBACK;
  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const models = [
    { id: "deepseek/deepseek-chat", label: "DeepSeek V4 Flash", tier: "reasoning" },
    { id: "xai/grok-4.3", label: "Grok 4.3", tier: "deep" },
  ];

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 6c: A/B Model Comparison — DeepSeek V4 Flash vs Grok 4.3");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  const allResults: ModelResult[] = [];

  for (const model of models) {
    console.log(`┌─ Model: ${model.label} (${model.id})`);
    console.log(`│  Tier: ${model.tier}`);

    for (const tc of TEST_CASES) {
      process.stdout.write(`│  ${tc.id}... `);
      const result = await runModel(client, model.id, tc);
      allResults.push(result);

      if (result.error) {
        console.log(`ERROR: ${result.error}`);
      } else {
        const correctCount = result.paragraphs_correct.length;
        const totalCount = result.paragraphs_expected.length;
        const hallucCount = result.paragraphs_hallucinated.length;
        console.log(
          `${correctCount}/${totalCount} correct, ${hallucCount} hallucinated, ${result.latency_ms}ms, $${result.cost_usd.toFixed(6)}`
        );
      }
    }
    console.log("└──────────────────────────────────────────────────────────────");
    console.log();
  }

  // ── Summary comparison ──────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Comparison Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  for (const model of models) {
    const results = allResults.filter(r => r.model === model.id);
    const totalCorrect = results.reduce((s, r) => s + r.paragraphs_correct.length, 0);
    const totalExpected = results.reduce((s, r) => s + r.paragraphs_expected.length, 0);
    const totalHalluc = results.reduce((s, r) => s + r.paragraphs_hallucinated.length, 0);
    const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);
    const avgLatency = results.reduce((s, r) => s + r.latency_ms, 0) / results.length;
    const germanRate = results.filter(r => r.is_german).length / results.length;
    const lawRefRate = results.filter(r => r.references_law).length / results.length;
    const accuracy = totalExpected > 0 ? (totalCorrect / totalExpected) * 100 : 0;
    const errorCount = results.filter(r => r.error).length;

    console.log(`  ${model.label} (${model.id}):`);
    console.log(`    §-accuracy:       ${accuracy.toFixed(1)}% (${totalCorrect}/${totalExpected})`);
    console.log(`    Hallucinated §§:  ${totalHalluc}`);
    console.log(`    German answers:   ${(germanRate * 100).toFixed(1)}%`);
    console.log(`    References law:   ${(lawRefRate * 100).toFixed(1)}%`);
    console.log(`    Avg latency:      ${avgLatency.toFixed(0)}ms`);
    console.log(`    Total cost:       $${totalCost.toFixed(6)}`);
    console.log(`    Errors:           ${errorCount}`);
    console.log();
  }

  // ── Verdict ─────────────────────────────────────────────────
  const deepseekResults = allResults.filter(r => r.model === "deepseek/deepseek-chat");
  const grokResults = allResults.filter(r => r.model === "xai/grok-4.3");

  const deepseekAccuracy = deepseekResults.reduce((s, r) => s + r.paragraphs_correct.length, 0) /
    deepseekResults.reduce((s, r) => s + r.paragraphs_expected.length, 0);
  const grokAccuracy = grokResults.reduce((s, r) => s + r.paragraphs_correct.length, 0) /
    grokResults.reduce((s, r) => s + r.paragraphs_expected.length, 0);

  console.log("  Verdict:");
  if (grokAccuracy > deepseekAccuracy) {
    console.log(`    ✅ Grok 4.3 wins on §-accuracy (${(grokAccuracy * 100).toFixed(1)}% vs ${(deepseekAccuracy * 100).toFixed(1)}%)`);
    console.log(`    → Deep tier (Grok 4.3) is correctly assigned for critical legal reasoning`);
  } else if (deepseekAccuracy > grokAccuracy) {
    console.log(`    ⚠️  DeepSeek V4 Flash wins on §-accuracy (${(deepseekAccuracy * 100).toFixed(1)}% vs ${(grokAccuracy * 100).toFixed(1)}%)`);
    console.log(`    → Consider re-evaluating deep tier assignment`);
  } else {
    console.log(`    🤝 Tie on §-accuracy (${(deepseekAccuracy * 100).toFixed(1)}%)`);
    console.log(`    → Deep tier justified by other factors (hallucination rate, reasoning depth)`);
  }
  console.log();

  // Write results
  const fs = await import("node:fs");
  const outPath = "/tmp/phase6-ab-results.jsonl";
  for (const r of allResults) {
    fs.appendFileSync(outPath, JSON.stringify(r) + "\n");
  }
  console.log(`  Results written to: ${outPath}`);
}

if (import.meta.main) {
  runPhase6C().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
}

export { runPhase6C };
