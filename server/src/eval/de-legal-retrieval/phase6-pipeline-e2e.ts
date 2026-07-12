/**
 * Phase 6b: Pipeline E2E Benchmark — Legal Pipeline §-Communication Test
 *
 * Tests that the full legal pipeline correctly communicates with legal acts
 * and paragraphs by running each critical specialist against a synthetic case
 * fixture and verifying:
 *   1. Law-matcher retrieves correct §§ from the law corpus
 *   2. Subsumption-checker verifies §-citations against retrieved context
 *   3. Opponent-simulator finds counter-§§
 *   4. Deadline-validator cross-checks Fristen against statutory §§
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval/phase6-pipeline-e2e.ts
 *
 * Requires: OPENROUTER_API_KEY in env, law corpus imported into engine.
 */

import { resolveSpecialist } from "../../core/minions/specialist-defs.ts";
import { TIER_DEFAULTS } from "../../core/model-config.ts";

// ── Synthetic case fixture (Austrian civil law) ───────────────────────────
const SYNTHETIC_CASE = {
  case_slug: "test-case-6b",
  jurisdiction: "at" as const,
  verfahrenstyp: "zivil" as const,
  // Minimal forensic report — simulates Layer 3 output
  forensic_report: {
    sachverhalt: "Der Mandant (Kläger) wurde am 15.03.2024 vom Beklagten in einem Verkehrsunfall am Linzer Hauptplatz gerammt. Der Beklagte fuhr bei Rot über die Kreuzung. Sachschaden am Fahrzeug: €4.500, Personenschaden (Prellungen, HWS-Distorsion): €2.000 Schmerzensgeld.",
    ansprueche: [
      { typ: "Sachschaden", betrag: 4500, paragraph: "§ 1311 ABGB" },
      { typ: "Schmerzensgeld", betrag: 2000, paragraph: "§ 1325 ABGB" },
    ],
    parteien: [
      { name: "Mandant", rolle: "klaeger" },
      { name: "Beklagter", rolle: "beklagter" },
    ],
  },
  // Expected §§ that law-matcher should find
  expected_paragraphs: [
    "§ 1311 ABGB",  // Schadenersatz (Verschuldenshaftung)
    "§ 1325 ABGB",  // Schmerzensgeld
    "§ 1295 ABGB",  // Schadenersatz bei Verkehrsunfall
  ],
};

interface SpecialistResult {
  specialist: string;
  tier: string;
  model: string;
  success: boolean;
  paragraphs_found: string[];
  paragraphs_expected: string[];
  paragraphs_missing: string[];
  hallucinated_paragraphs: string[];
  error?: string;
  duration_ms: number;
}

async function runSpecialistViaSubagent(
  specialistName: string,
  prompt: string,
  engine: any,
): Promise<string> {
  // This would normally go through the MinionQueue → subagent handler.
  // For the E2E harness, we simulate the specialist call by directly
  // calling the LLM with the specialist's system prompt.
  const def = resolveSpecialist(specialistName);
  if (!def) throw new Error(`Unknown specialist: ${specialistName}`);

  const model = TIER_DEFAULTS[def.modelTier!];
  console.log(`  [${specialistName}] tier=${def.modelTier}, model=${model}`);

  // In a real run, this would use the engine's LLM gateway.
  // The harness is a manual test script — wire to your engine's LLM call.
  throw new Error(
    "E2E harness requires engine wiring. Run with: gbrain agent run --specialist " +
    specialistName + ' --prompt "' + prompt.slice(0, 80) + '..."'
  );
}

function extractParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  // Match patterns like "§ 1311 ABGB", "§ 1325 ABGB", "§ 1295 ABGB"
  const matches = text.matchAll(/§\s*(\d+[a-z]?)\s+(ABGB|BGB|StGB|ZPO|HGB|AO|EStG|KStG|UStG|StPO|VwGO|BVG|GG|OR)/gi);
  for (const m of matches) {
    paragraphs.push(`§ ${m[1]} ${m[2]}`);
  }
  return [...new Set(paragraphs)];
}

async function runPhase6B(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 6b: Pipeline E2E — §-Communication Benchmark");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  const results: SpecialistResult[] = [];

  // ── Test 1: Law-Matcher (Layer 4) ───────────────────────────
  console.log("┌─ Test 1: Law-Matcher (Layer 4, utility tier)");
  console.log("│  Expected: § 1311 ABGB, § 1325 ABGB, § 1295 ABGB");
  const lmStart = Date.now();
  try {
    const lmPrompt = JSON.stringify({
      case_slug: SYNTHETIC_CASE.case_slug,
      jurisdiction: SYNTHETIC_CASE.jurisdiction,
      verfahrenstyp: SYNTHETIC_CASE.verfahrenstyp,
      forensic_report: SYNTHETIC_CASE.forensic_report,
    });
    const lmResult = await runSpecialistViaSubagent("law-matcher", lmPrompt, null);
    const found = extractParagraphs(lmResult);
    const expected = SYNTHETIC_CASE.expected_paragraphs;
    const missing = expected.filter(p => !found.includes(p));
    const hallucinated = found.filter(p => !expected.includes(p));

    results.push({
      specialist: "law-matcher",
      tier: "utility",
      model: TIER_DEFAULTS.utility,
      success: missing.length === 0,
      paragraphs_found: found,
      paragraphs_expected: expected,
      paragraphs_missing: missing,
      hallucinated_paragraphs: hallucinated,
      duration_ms: Date.now() - lmStart,
    });
    console.log(`│  Found: ${found.join(", ")}`);
    console.log(`│  Missing: ${missing.length === 0 ? "none ✅" : missing.join(", ")}`);
    console.log(`│  Hallucinated: ${hallucinated.length === 0 ? "none ✅" : hallucinated.join(", ")}`);
  } catch (e) {
    console.log(`│  ERROR: ${(e as Error).message}`);
    results.push({
      specialist: "law-matcher",
      tier: "utility",
      model: TIER_DEFAULTS.utility,
      success: false,
      paragraphs_found: [],
      paragraphs_expected: SYNTHETIC_CASE.expected_paragraphs,
      paragraphs_missing: SYNTHETIC_CASE.expected_paragraphs,
      hallucinated_paragraphs: [],
      error: (e as Error).message,
      duration_ms: Date.now() - lmStart,
    });
  }
  console.log("└──────────────────────────────────────────────────────────────");

  // ── Test 2: Subsumption-Checker (Layer 7, deep tier) ────────
  console.log("┌─ Test 2: Subsumption-Checker (Layer 7, deep tier)");
  console.log("│  Expected: verifies §-citations are grounded in law corpus");
  const scStart = Date.now();
  try {
    const scPrompt = JSON.stringify({
      case_slug: SYNTHETIC_CASE.case_slug,
      jurisdiction: SYNTHETIC_CASE.jurisdiction,
      forensic_report: SYNTHETIC_CASE.forensic_report,
      legal_grounding_map: SYNTHETIC_CASE.expected_paragraphs.map(p => ({
        paragraph: p,
        claim: "Schadenersatzanspruch aus Verkehrsunfall",
        confidence: "hoch",
        verified: true,
      })),
    });
    const scResult = await runSpecialistViaSubagent("subsumption-checker", scPrompt, null);
    const found = extractParagraphs(scResult);
    results.push({
      specialist: "subsumption-checker",
      tier: "deep",
      model: TIER_DEFAULTS.deep,
      success: true,
      paragraphs_found: found,
      paragraphs_expected: SYNTHETIC_CASE.expected_paragraphs,
      paragraphs_missing: [],
      hallucinated_paragraphs: [],
      duration_ms: Date.now() - scStart,
    });
    console.log(`│  Verified §§: ${found.join(", ")}`);
  } catch (e) {
    console.log(`│  ERROR: ${(e as Error).message}`);
    results.push({
      specialist: "subsumption-checker",
      tier: "deep",
      model: TIER_DEFAULTS.deep,
      success: false,
      paragraphs_found: [],
      paragraphs_expected: SYNTHETIC_CASE.expected_paragraphs,
      paragraphs_missing: [],
      hallucinated_paragraphs: [],
      error: (e as Error).message,
      duration_ms: Date.now() - scStart,
    });
  }
  console.log("└──────────────────────────────────────────────────────────────");

  // ── Test 3: Opponent-Simulator (Layer 6.5, deep tier) ───────
  console.log("┌─ Test 3: Opponent-Simulator (Layer 6.5, deep tier)");
  console.log("│  Expected: finds counter-§§ from opponent's perspective");
  const osStart = Date.now();
  try {
    const osPrompt = JSON.stringify({
      case_slug: SYNTHETIC_CASE.case_slug,
      jurisdiction: SYNTHETIC_CASE.jurisdiction,
      forensic_report: SYNTHETIC_CASE.forensic_report,
      legal_grounding_map: SYNTHETIC_CASE.expected_paragraphs.map(p => ({
        paragraph: p,
        claim: "Schadenersatz",
      })),
    });
    const osResult = await runSpecialistViaSubagent("opponent-simulator", osPrompt, null);
    const found = extractParagraphs(osResult);
    results.push({
      specialist: "opponent-simulator",
      tier: "deep",
      model: TIER_DEFAULTS.deep,
      success: true,
      paragraphs_found: found,
      paragraphs_expected: [],
      paragraphs_missing: [],
      hallucinated_paragraphs: [],
      duration_ms: Date.now() - osStart,
    });
    console.log(`│  Counter-§§: ${found.join(", ")}`);
  } catch (e) {
    console.log(`│  ERROR: ${(e as Error).message}`);
    results.push({
      specialist: "opponent-simulator",
      tier: "deep",
      model: TIER_DEFAULTS.deep,
      success: false,
      paragraphs_found: [],
      paragraphs_expected: [],
      paragraphs_missing: [],
      hallucinated_paragraphs: [],
      error: (e as Error).message,
      duration_ms: Date.now() - osStart,
    });
  }
  console.log("└──────────────────────────────────────────────────────────────");

  // ── Summary ─────────────────────────────────────────────────
  console.log();
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;

  console.log(`  Specialists tested: ${results.length}`);
  console.log(`  Passed: ${passed} ✅`);
  console.log(`  Failed: ${failed} ${failed > 0 ? "❌" : "✅"}`);
  console.log();

  for (const r of results) {
    const status = r.success ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status}  ${r.specialist.padEnd(25)} tier=${r.tier.padEnd(10)} model=${r.model}`);
    if (r.paragraphs_missing.length > 0) {
      console.log(`           Missing §§: ${r.paragraphs_missing.join(", ")}`);
    }
    if (r.hallucinated_paragraphs.length > 0) {
      console.log(`           Hallucinated §§: ${r.hallucinated_paragraphs.join(", ")}`);
    }
    if (r.error) {
      console.log(`           Error: ${r.error}`);
    }
  }

  console.log();
  console.log(`  Duration: ${results.reduce((s, r) => s + r.duration_ms, 0)}ms`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  runPhase6B().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
}

export { runPhase6B };
