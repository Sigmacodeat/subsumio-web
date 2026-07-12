/**
 * A/B Model Comparison via Engine HTTP API
 *
 * Runs legal reasoning questions through the engine (localhost:8080)
 * with two different model overrides and compares:
 *   1. §-citation accuracy
 *   2. Hallucination rate (invented paragraphs)
 *   3. German language rate
 *   4. Law reference rate
 *   5. Latency
 *   6. Guardrail warnings
 *
 * Tests AT, DE, and CH jurisdictions.
 *
 * Usage:
 *   bun run scripts/ab-test-models.ts
 *
 * Output: /tmp/ab-model-comparison-results.json
 */

export {};

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:8080";
const API_KEY = process.env.SUBSUMIO_API_KEY ?? process.env.SUBSUMIO_WEB_API_KEY ?? "";

interface TestCase {
  id: string;
  question: string;
  jurisdiction: "AT" | "DE" | "CH";
  expected_paragraphs: string[];
  expected_laws: string[];
  forbidden_laws: string[];
  area: string;
}

const TEST_CASES: TestCase[] = [
  // AT cases
  {
    id: "at-001",
    question: "Welche Anspruchsgrundlage gilt für Schmerzensgeld bei einer Körperverletzung nach österreichischem Recht?",
    jurisdiction: "AT",
    expected_paragraphs: ["1325"],
    expected_laws: ["ABGB"],
    forbidden_laws: ["BGB"],
    area: "Schadenersatz AT",
  },
  {
    id: "at-002",
    question: "Unter welchen Voraussetzungen haftet der Bund für Amtshaftung? Nennen Sie die einschlägigen Paragraphen.",
    jurisdiction: "AT",
    expected_paragraphs: [],
    expected_laws: ["AHG"],
    forbidden_laws: ["BGB"],
    area: "Amtshaftung AT",
  },
  {
    id: "at-003",
    question: "Was regelt § 1489 ABGB über die Verjährung von Schadenersatzansprüchen?",
    jurisdiction: "AT",
    expected_paragraphs: ["1489"],
    expected_laws: ["ABGB"],
    forbidden_laws: ["BGB"],
    area: "Verjährung AT",
  },
  // DE cases
  {
    id: "de-001",
    question: "Wie lange ist die reguläre Verjährungsfrist für Schadenersatzansprüche im deutschen Recht?",
    jurisdiction: "DE",
    expected_paragraphs: ["195"],
    expected_laws: ["BGB"],
    forbidden_laws: ["ABGB"],
    area: "Verjährung DE",
  },
  {
    id: "de-002",
    question: "Was regelt § 823 BGB über die Schadensersatzpflicht bei unerlaubter Handlung?",
    jurisdiction: "DE",
    expected_paragraphs: ["823"],
    expected_laws: ["BGB"],
    forbidden_laws: ["ABGB"],
    area: "Unerlaubte Handlung DE",
  },
  // CH cases
  {
    id: "ch-001",
    question: "Was regelt Art. 41 OR über die Haftung für Schaden? Nennen Sie die Voraussetzungen.",
    jurisdiction: "CH",
    expected_paragraphs: ["41"],
    expected_laws: ["OR"],
    forbidden_laws: ["BGB", "ABGB"],
    area: "Haftung CH",
  },
  {
    id: "ch-002",
    question: "Welche Strafen sieht das Schweizerische Strafgesetzbuch für vorsätzliche Tötung vor?",
    jurisdiction: "CH",
    expected_paragraphs: [],
    expected_laws: ["StGB"],
    forbidden_laws: ["BGB"],
    area: "Strafrecht CH",
  },
];

interface ModelResult {
  answer: string;
  latency_ms: number;
  warnings: string[];
  citations: number;
}

interface TestComparison {
  case_id: string;
  area: string;
  jurisdiction: string;
  question: string;
  expected_paragraphs: string[];
  deepseek: ModelResult;
  grok: ModelResult;
  metrics: {
    deepseek: {
      found_paragraphs: string[];
      hallucinated_paragraphs: string[];
      found_laws: string[];
      forbidden_laws_found: string[];
      is_german: boolean;
      has_law_ref: boolean;
      latency_ms: number;
    };
    grok: {
      found_paragraphs: string[];
      hallucinated_paragraphs: string[];
      found_laws: string[];
      forbidden_laws_found: string[];
      is_german: boolean;
      has_law_ref: boolean;
      latency_ms: number;
    };
  };
}

async function runQuery(
  query: string,
  jurisdiction: string,
  model: string
): Promise<ModelResult> {
  const start = Date.now();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-subsumio-api-key": API_KEY,
    "x-subsumio-jurisdiction": jurisdiction,
  };

  try {
    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        mode: "conservative",
        model,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      return {
        answer: `ERROR: HTTP ${res.status}`,
        latency_ms: Date.now() - start,
        warnings: [],
        citations: 0,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    let answer = "";
    const warnings: string[] = [];
    let citations = 0;

    if (contentType.includes("text/event-stream")) {
      const reader = res.body?.getReader();
      if (!reader) {
        return { answer: "ERROR: no body", latency_ms: Date.now() - start, warnings, citations };
      }
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (typeof parsed.chunk === "string") answer += parsed.chunk;
              if (Array.isArray(parsed.warnings)) {
                for (const w of parsed.warnings) {
                  if (typeof w === "string") warnings.push(w);
                }
              }
              if (Array.isArray(parsed.citations)) {
                citations = parsed.citations.length;
              }
              if (typeof parsed.answer === "string" && !answer) {
                answer = parsed.answer;
              }
            } catch {
              // skip non-JSON
            }
          }
        }
      }
    } else {
      const data = (await res.json()) as { answer?: string; warnings?: string[]; citations?: unknown[] };
      answer = data.answer ?? "";
      if (data.warnings) warnings.push(...data.warnings);
      citations = data.citations?.length ?? 0;
    }

    return {
      answer,
      latency_ms: Date.now() - start,
      warnings,
      citations,
    };
  } catch (err) {
    return {
      answer: `ERROR: ${err instanceof Error ? err.message : "unknown"}`,
      latency_ms: Date.now() - start,
      warnings: [],
      citations: 0,
    };
  }
}

function extractParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  const regex = /§\s*(\d+[a-z]?(?:\s*(?:Abs\.|Absatz)\s*\d+)?)\s*(?:[A-Z]{2,5})?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    paragraphs.push(match[1]!.trim());
  }
  // Also match Art. N for Swiss law
  const artRegex = /Art\.?\s*(\d+[a-z]?)\s*(?:[A-Z]{2,5})?/g;
  while ((match = artRegex.exec(text)) !== null) {
    paragraphs.push(match[1]!.trim());
  }
  return [...new Set(paragraphs)];
}

function extractLaws(text: string): string[] {
  const laws: string[] = [];
  const lawRegex = /\b(BGB|ABGB|StGB|ZPO|StPO|HGB|AO|OR|ZGB|AHG|UGB|UWG|DSG|B-VG|EMRK)\b/g;
  let match;
  while ((match = lawRegex.exec(text)) !== null) {
    laws.push(match[1]!);
  }
  return [...new Set(laws)];
}

function isGerman(text: string): boolean {
  const germanIndicators = /\b(der|die|das|und|ist|wird|nach|gemäß|laut|zufolge|Absatz|Paragraph|Artikel|Gesetz|Recht|Anspruch|Schaden|Haftung|Verjährung)\b/i;
  return germanIndicators.test(text);
}

function hasLawReference(text: string): boolean {
  return /§\s*\d+|Art\.?\s*\d+|[A-Z]{3,5}\s*(?:G|O|B)/.test(text);
}

function checkForbiddenLaws(text: string, forbidden: string[]): string[] {
  const found: string[] = [];
  for (const law of forbidden) {
    // Use word boundary to avoid false positives (e.g. ABGB contains BGB)
    const regex = new RegExp(`(?<![A-Z])${law}(?![A-Z])`, "g");
    if (regex.test(text)) {
      found.push(law);
    }
  }
  return found;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  A/B Model Comparison — DeepSeek V4 Flash vs Grok 4.3");
  console.log("  Engine:", ENGINE_URL);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Health check
  try {
    const probe = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-subsumio-api-key": API_KEY },
      body: JSON.stringify({ query: "test", mode: "conservative" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!probe.ok) {
      console.error(`Engine not reachable: HTTP ${probe.status}`);
      process.exit(1);
    }
    probe.body?.cancel();
    console.log("✓ Engine reachable\n");
  } catch (err) {
    console.error("Engine not reachable:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const results: TestComparison[] = [];

  for (const tc of TEST_CASES) {
    console.log(`── ${tc.id} (${tc.area}) ──`);
    console.log(`  Q: ${tc.question.slice(0, 80)}...`);

    // Run DeepSeek
    console.log("  Running DeepSeek V4 Flash...");
    const dsResult = await runQuery(tc.question, tc.jurisdiction, "openrouter:deepseek/deepseek-chat");

    // Run Grok
    console.log("  Running Grok 4.3...");
    const grokResult = await runQuery(tc.question, tc.jurisdiction, "x-ai:grok-4-3");

    // Analyze
    const dsParagraphs = extractParagraphs(dsResult.answer);
    const grokParagraphs = extractParagraphs(grokResult.answer);
    const dsLaws = extractLaws(dsResult.answer);
    const grokLaws = extractLaws(grokResult.answer);

    const dsFoundParagraphs = tc.expected_paragraphs.filter((p) => dsParagraphs.includes(p));
    const grokFoundParagraphs = tc.expected_paragraphs.filter((p) => grokParagraphs.includes(p));
    const dsHallucinated = dsParagraphs.filter((p) => !tc.expected_paragraphs.includes(p));
    const grokHallucinated = grokParagraphs.filter((p) => !tc.expected_paragraphs.includes(p));

    const dsForbidden = checkForbiddenLaws(dsResult.answer, tc.forbidden_laws);
    const grokForbidden = checkForbiddenLaws(grokResult.answer, tc.forbidden_laws);

    const comparison: TestComparison = {
      case_id: tc.id,
      area: tc.area,
      jurisdiction: tc.jurisdiction,
      question: tc.question,
      expected_paragraphs: tc.expected_paragraphs,
      deepseek: dsResult,
      grok: grokResult,
      metrics: {
        deepseek: {
          found_paragraphs: dsFoundParagraphs,
          hallucinated_paragraphs: dsHallucinated,
          found_laws: dsLaws,
          forbidden_laws_found: dsForbidden,
          is_german: isGerman(dsResult.answer),
          has_law_ref: hasLawReference(dsResult.answer),
          latency_ms: dsResult.latency_ms,
        },
        grok: {
          found_paragraphs: grokFoundParagraphs,
          hallucinated_paragraphs: grokHallucinated,
          found_laws: grokLaws,
          forbidden_laws_found: grokForbidden,
          is_german: isGerman(grokResult.answer),
          has_law_ref: hasLawReference(grokResult.answer),
          latency_ms: grokResult.latency_ms,
        },
      },
    };

    results.push(comparison);

    // Print summary
    console.log(`  DeepSeek: ${dsResult.latency_ms}ms, ${dsResult.answer.length} chars, §§ found: ${dsFoundParagraphs.length}/${tc.expected_paragraphs.length}, forbidden: ${dsForbidden.length}`);
    console.log(`  Grok:     ${grokResult.latency_ms}ms, ${grokResult.answer.length} chars, §§ found: ${grokFoundParagraphs.length}/${tc.expected_paragraphs.length}, forbidden: ${grokForbidden.length}`);
    console.log(`  DS warnings: ${dsResult.warnings.length > 0 ? dsResult.warnings.join(", ") : "none"}`);
    console.log(`  Grok warnings: ${grokResult.warnings.length > 0 ? grokResult.warnings.join(", ") : "none"}`);
    console.log();
  }

  // Aggregate
  const dsAccuracy = results.filter((r) => r.metrics.deepseek.found_paragraphs.length > 0).length / results.length;
  const grokAccuracy = results.filter((r) => r.metrics.grok.found_paragraphs.length > 0).length / results.length;
  const dsHallucinationRate = results.filter((r) => r.metrics.deepseek.hallucinated_paragraphs.length > 0).length / results.length;
  const grokHallucinationRate = results.filter((r) => r.metrics.grok.hallucinated_paragraphs.length > 0).length / results.length;
  const dsContaminationRate = results.filter((r) => r.metrics.deepseek.forbidden_laws_found.length > 0).length / results.length;
  const grokContaminationRate = results.filter((r) => r.metrics.grok.forbidden_laws_found.length > 0).length / results.length;
  const dsAvgLatency = results.reduce((s, r) => s + r.metrics.deepseek.latency_ms, 0) / results.length;
  const grokAvgLatency = results.reduce((s, r) => s + r.metrics.grok.latency_ms, 0) / results.length;
  const dsGermanRate = results.filter((r) => r.metrics.deepseek.is_german).length / results.length;
  const grokGermanRate = results.filter((r) => r.metrics.grok.is_german).length / results.length;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Metric                  DeepSeek V4 Flash    Grok 4.3`);
  console.log(`  ─────────────────────── ──────────────────── ───────────`);
  console.log(`  §-Accuracy              ${(dsAccuracy * 100).toFixed(1)}%                ${(grokAccuracy * 100).toFixed(1)}%`);
  console.log(`  Hallucination Rate      ${(dsHallucinationRate * 100).toFixed(1)}%                ${(grokHallucinationRate * 100).toFixed(1)}%`);
  console.log(`  Jurisdiction Contam.    ${(dsContaminationRate * 100).toFixed(1)}%                ${(grokContaminationRate * 100).toFixed(1)}%`);
  console.log(`  German Language Rate    ${(dsGermanRate * 100).toFixed(1)}%                ${(grokGermanRate * 100).toFixed(1)}%`);
  console.log(`  Avg Latency             ${(dsAvgLatency / 1000).toFixed(1)}s                  ${(grokAvgLatency / 1000).toFixed(1)}s`);
  console.log(`  Cost per 1M tokens      $0.14/$0.28           $1.25/$2.50`);
  console.log();

  // Write results
  const outputPath = "/tmp/ab-model-comparison-results.json";
  await Bun.write(outputPath, JSON.stringify({ results, summary: {
    dsAccuracy, grokAccuracy, dsHallucinationRate, grokHallucinationRate,
    dsContaminationRate, grokContaminationRate, dsAvgLatency, grokAvgLatency,
    dsGermanRate, grokGermanRate,
  } }, null, 2));
  console.log(`Results written to ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
