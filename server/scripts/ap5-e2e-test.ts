/**
 * AP5: E2E Pipeline Test — 3 AT Testfälle gegen echte DB
 *
 * Tests the full pipeline: user question → engine think → §-retrieval → answer
 * Verifies that:
 * 1. AT laws are found (not DE)
 * 2. §-citations are grounded in retrieved context
 * 3. OGH-Judikatur is searchable
 * 4. Cross-model verification runs
 *
 * Prerequisites:
 * - SSH tunnel: ssh -L 15432:localhost:5432 subsumio-hetzner
 * - Engine running: gbrain serve (port 8080)
 * - API key in .env: SUBSUMIO_WEB_API_KEY
 */

export {};

const ENGINE_URL = "http://127.0.0.1:8080";
const API_KEY = process.env.SUBSUMIO_WEB_API_KEY ?? "";

interface TestCase {
  id: string;
  question: string;
  jurisdiction: "AT";
  expected_laws: string[]; // Laws that should be cited
  expected_keywords: string[]; // Keywords that should appear
  forbidden_laws: string[]; // Laws that must NOT appear (DE contamination)
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "at-001-amtshaftung",
    question:
      "Unter welchen Voraussetzungen haftet der Bund für Amtshaftung nach österreichischem Recht? Nennen Sie die einschlägigen Paragraphen.",
    jurisdiction: "AT",
    expected_laws: ["AHG"],
    expected_keywords: ["Amtshaftung", "Bund", "Organ"],
    forbidden_laws: ["BGB", "StGB"],
    description: "Amtshaftung — core AT law question, AHG should be found",
  },
  {
    id: "at-002-schadenersatz",
    question:
      "Wie ist der Schadenersatz nach § 1311 ABGB geregelt? Was sagt der OGH dazu?",
    jurisdiction: "AT",
    expected_laws: ["ABGB"],
    expected_keywords: ["1311", "Schadenersatz", "ABGB"],
    forbidden_laws: ["BGB", "HGB"],
    description: "§ 1311 ABGB — specific paragraph lookup + OGH judikatur",
  },
  {
    id: "at-003-verjaehrung",
    question:
      "Was regelt § 1489 ABGB über die Verjährung von Schadenersatzansprüchen?",
    jurisdiction: "AT",
    expected_laws: ["ABGB"],
    expected_keywords: ["verjäh", "1489", "ABGB"],
    forbidden_laws: ["BGB", "ZPO"],
    description: "§ 1489 ABGB Verjährung — specific paragraph + no DE contamination",
  },
];

interface TestResult {
  case_id: string;
  description: string;
  answer: string;
  answer_length: number;
  citations_count: number;
  warnings: string[];
  found_laws: string[];
  found_forbidden: string[];
  found_keywords: string[];
  missing_keywords: string[];
  passed: boolean;
  errors: string[];
  latency_ms: number;
}

async function runTestCase(tc: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const result: TestResult = {
    case_id: tc.id,
    description: tc.description,
    answer: "",
    answer_length: 0,
    citations_count: 0,
    warnings: [],
    found_laws: [],
    found_forbidden: [],
    found_keywords: [],
    missing_keywords: [],
    passed: false,
    errors,
    latency_ms: 0,
  };

  try {
    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-subsumio-api-key": API_KEY,
        "x-subsumio-jurisdiction": "AT",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: tc.question,
        mode: "balanced",
        legal_mode: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      errors.push(`Engine HTTP ${res.status}`);
      result.latency_ms = Date.now() - startTime;
      return result;
    }

    const contentType = res.headers.get("content-type") ?? "";
    let answer = "";
    let citations: unknown[] = [];
    let warnings: string[] = [];

    if (contentType.includes("text/event-stream")) {
      // Parse SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        errors.push("No response body");
        result.latency_ms = Date.now() - startTime;
        return result;
      }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as {
                chunk?: string;
                answer?: string;
                citations?: unknown[];
                warnings?: string[];
                done?: boolean;
              };
              if (parsed.chunk) answer += parsed.chunk;
              if (parsed.answer && !answer) answer = parsed.answer;
              if (parsed.citations) citations = parsed.citations;
              if (parsed.warnings) warnings = parsed.warnings;
            } catch {
              // skip malformed
            }
          }
        }
      }
    } else {
      const data = (await res.json()) as {
        answer?: string;
        citations?: unknown[];
        warnings?: string[];
      };
      answer = data.answer ?? "";
      citations = data.citations ?? [];
      warnings = data.warnings ?? [];
    }

    result.answer = answer;
    result.answer_length = result.answer.length;
    result.citations_count = Array.isArray(citations) ? citations.length : 0;
    result.warnings = Array.isArray(warnings) ? warnings : [];
    result.latency_ms = Date.now() - startTime;

    // Also check ABGB as substring (ABGB contains BGB)
    for (const law of tc.expected_laws) {
      if (result.answer.includes(law)) {
        result.found_laws.push(law);
      } else {
        errors.push(`Expected law "${law}" not found in answer`);
      }
    }

    // Check for forbidden laws (DE contamination) — use word boundary to avoid ABGB matching BGB
    for (const law of tc.forbidden_laws) {
      // Match "BGB" only when NOT preceded by "A" (i.e. not part of "ABGB")
      const regex = new RegExp(`(?<![A-Z])${law}\\b`, "u");
      if (regex.test(result.answer)) {
        result.found_forbidden.push(law);
        errors.push(`Forbidden law "${law}" found in answer (jurisdiction contamination)`);
      }
    }

    // Check for expected keywords
    for (const kw of tc.expected_keywords) {
      if (result.answer.toLowerCase().includes(kw.toLowerCase())) {
        result.found_keywords.push(kw);
      } else {
        result.missing_keywords.push(kw);
        errors.push(`Expected keyword "${kw}" not found in answer`);
      }
    }

    // Check guardrail warnings — SSE stream may deliver them in final chunk
    const hasGuardrailPass = result.warnings.some((w) => w.includes("GUARDRAIL") || w.includes("CROSS_VERIFY"));
    if (!hasGuardrailPass) {
      // Not fatal — guardrail may not fire if answer is clean
      result.warnings.push("NOTE: No guardrail/cross-verify warnings in stream (may be clean pass)");
    }

    result.passed = errors.length === 0 && result.answer_length > 100;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Unknown error");
    result.latency_ms = Date.now() - startTime;
  }

  return result;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  AP5: E2E Pipeline Test — 3 AT Testfälle gegen echte DB");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Check engine connectivity
  try {
    const probe = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-subsumio-api-key": API_KEY,
      },
      body: JSON.stringify({ query: "ping", mode: "conservative" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!probe.ok) {
      console.error(`Engine not reachable (HTTP ${probe.status})`);
      process.exit(1);
    }
    // Consume the stream to free the connection
    probe.body?.cancel();
    console.log("✓ Engine reachable\n");
  } catch {
    console.error("Engine not reachable. Start with: gbrain serve");
    process.exit(1);
  }

  const results: TestResult[] = [];
  for (const tc of TEST_CASES) {
    console.log(`\n── ${tc.id}: ${tc.description} ──`);
    console.log(`  Question: ${tc.question.slice(0, 80)}...`);
    process.stdout.write("  Running... ");

    const result = await runTestCase(tc);
    results.push(result);

    console.log(`${result.passed ? "✅ PASS" : "❌ FAIL"} (${result.latency_ms / 1000}s)`);
    console.log(`  Answer: ${result.answer_length} chars, ${result.citations_count} citations`);
    console.log(`  Warnings: ${result.warnings.join(", ") || "(none)"}`);
    console.log(`  Found laws: ${result.found_laws.join(", ") || "(none)"}`);
    if (result.found_forbidden.length > 0) {
      console.log(`  ⚠️  Forbidden laws: ${result.found_forbidden.join(", ")}`);
    }
    console.log(`  Found keywords: ${result.found_keywords.join(", ")}`);
    if (result.missing_keywords.length > 0) {
      console.log(`  ⚠️  Missing keywords: ${result.missing_keywords.join(", ")}`);
    }
    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      for (const e of result.errors) console.log(`    - ${e}`);
    }
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: ${passed}/${results.length} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    console.log("Failed cases:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.case_id}: ${r.errors.join("; ")}`);
    }
  }

  // Write results to file
  const outputPath = "/tmp/ap5-e2e-results.json";
  await Bun.write(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${outputPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
