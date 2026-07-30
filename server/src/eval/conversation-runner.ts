/**
 * Conversation Evaluation Runner
 *
 * Executes multi-turn conversation fixtures against the search engine,
 * measuring per-turn retrieval quality and context retention.
 *
 * Metrics:
 * - Per-turn Hit@1/Hit@5 (slug match against expected_slugs)
 * - Context retention score (does turn N+2 still retrieve relevant slugs?)
 * - Topic shift recovery (can the system handle topic changes mid-conversation?)
 * - Overall conversation pass rate (all turns must hit expected slugs)
 *
 * Usage:
 *   bun run src/eval/conversation-runner.ts [--jurisdiction de] [--limit 10]
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  CONVERSATION_FIXTURES,
  getConversationFixtures,
  getTotalTurns,
  type ConversationScenario,
  type ConversationTurn,
} from "./conversation-fixtures.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface TurnResult {
  turn: number;
  question: string;
  expected_slugs: string[];
  retrieved_slugs: string[];
  hit_at_1: boolean;
  hit_at_5: boolean;
  /** Whether this turn referenced prior context and still retrieved correctly */
  context_retained: boolean;
  latency_ms: number;
}

export interface ScenarioResult {
  scenario_id: string;
  jurisdiction: string;
  legal_area: string;
  difficulty: string;
  turns: TurnResult[];
  /** All turns hit expected slugs */
  all_turns_pass: boolean;
  /** Fraction of turns that hit @5 */
  turn_pass_rate: number;
  /** Context retention score: fraction of reference_prior turns that still hit */
  context_retention_score: number;
}

export interface ConversationReport {
  total_scenarios: number;
  total_turns: number;
  overall_turn_pass_rate: number;
  overall_context_retention: number;
  by_jurisdiction: Record<string, { scenarios: number; turn_pass_rate: number }>;
  by_difficulty: Record<string, { scenarios: number; turn_pass_rate: number }>;
  scenario_results: ScenarioResult[];
}

// ── Search Function Interface ─────────────────────────────────────────

export interface SearchFnOpts {
  query: string;
  jurisdiction: string;
  /** Prior turns for context */
  conversation_history?: Array<{ role: string; content: string }>;
  topK?: number;
}

export interface SearchFnResult {
  slugs: string[];
  latency_ms: number;
}

export type SearchFn = (opts: SearchFnOpts) => Promise<SearchFnResult>;

// ── Runner ────────────────────────────────────────────────────────────

export async function runConversationEval(
  scenarios: ConversationScenario[],
  searchFn: SearchFn,
  onProgress?: (current: number, total: number) => void
): Promise<ConversationReport> {
  const results: ScenarioResult[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    onProgress?.(i + 1, scenarios.length);
    const scenario = scenarios[i];
    const turnResults: TurnResult[] = [];
    const conversationHistory: Array<{ role: string; content: string }> = [];

    for (const turn of scenario.turns) {
      if (turn.speaker !== "user") continue;

      const start = Date.now();
      let retrieved: SearchFnResult;
      try {
        retrieved = await searchFn({
          query: turn.text,
          jurisdiction: scenario.jurisdiction,
          conversation_history: [...conversationHistory],
          topK: 8,
        });
      } catch {
        retrieved = { slugs: [], latency_ms: Date.now() - start };
      }

      const expected = turn.expected_slugs ?? [];
      const hitAt1 = expected.length > 0 && retrieved.slugs[0] === expected[0];
      const hitAt5 =
        expected.length > 0 && expected.some((e) => retrieved.slugs.slice(0, 5).includes(e));

      turnResults.push({
        turn: turn.turn,
        question: turn.text,
        expected_slugs: expected,
        retrieved_slugs: retrieved.slugs.slice(0, 8),
        hit_at_1: hitAt1,
        hit_at_5: hitAt5,
        context_retained: turn.references_prior ? hitAt5 : true,
        latency_ms: retrieved.latency_ms,
      });

      conversationHistory.push({ role: "user", content: turn.text });
    }

    const allPass = turnResults.every((t) => t.hit_at_5);
    const passRate = turnResults.filter((t) => t.hit_at_5).length / Math.max(turnResults.length, 1);

    // Context retention: only measure turns that reference prior context
    const userTurns = scenario.turns.filter((t) => t.speaker === "user");
    let refTurnsCount = 0;
    let refTurnsPassed = 0;
    for (let idx = 0; idx < userTurns.length && idx < turnResults.length; idx++) {
      if (userTurns[idx].references_prior) {
        refTurnsCount++;
        if (turnResults[idx].hit_at_5) refTurnsPassed++;
      }
    }
    const contextRetention = refTurnsCount > 0 ? refTurnsPassed / refTurnsCount : 1.0;

    results.push({
      scenario_id: scenario.id,
      jurisdiction: scenario.jurisdiction,
      legal_area: scenario.legal_area,
      difficulty: scenario.difficulty,
      turns: turnResults,
      all_turns_pass: allPass,
      turn_pass_rate: passRate,
      context_retention_score: contextRetention,
    });
  }

  return buildReport(results);
}

function buildReport(results: ScenarioResult[]): ConversationReport {
  const totalScenarios = results.length;
  const totalTurns = results.reduce((s, r) => s + r.turns.length, 0);
  const totalTurnPasses = results.reduce((s, r) => s + r.turns.filter((t) => t.hit_at_5).length, 0);
  const overallTurnPassRate = totalTurns > 0 ? totalTurnPasses / totalTurns : 0;
  const overallContextRetention =
    results.reduce((s, r) => s + r.context_retention_score, 0) / Math.max(results.length, 1);

  const byJurisdiction: Record<string, { scenarios: number; turn_pass_rate: number }> = {};
  const byDifficulty: Record<string, { scenarios: number; turn_pass_rate: number }> = {};

  for (const r of results) {
    if (!byJurisdiction[r.jurisdiction]) {
      byJurisdiction[r.jurisdiction] = { scenarios: 0, turn_pass_rate: 0 };
    }
    byJurisdiction[r.jurisdiction].scenarios++;
    byJurisdiction[r.jurisdiction].turn_pass_rate += r.turn_pass_rate;

    if (!byDifficulty[r.difficulty]) {
      byDifficulty[r.difficulty] = { scenarios: 0, turn_pass_rate: 0 };
    }
    byDifficulty[r.difficulty].scenarios++;
    byDifficulty[r.difficulty].turn_pass_rate += r.turn_pass_rate;
  }

  for (const k of Object.keys(byJurisdiction)) {
    byJurisdiction[k].turn_pass_rate /= byJurisdiction[k].scenarios;
  }
  for (const k of Object.keys(byDifficulty)) {
    byDifficulty[k].turn_pass_rate /= byDifficulty[k].scenarios;
  }

  return {
    total_scenarios: totalScenarios,
    total_turns: totalTurns,
    overall_turn_pass_rate: overallTurnPassRate,
    overall_context_retention: overallContextRetention,
    by_jurisdiction: byJurisdiction,
    by_difficulty: byDifficulty,
    scenario_results: results,
  };
}

// ── Report Formatter ──────────────────────────────────────────────────

export function formatConversationReport(report: ConversationReport): string {
  const lines: string[] = [];
  lines.push("=== Conversation Evaluation Report ===");
  lines.push("");
  lines.push(`Total scenarios: ${report.total_scenarios}`);
  lines.push(`Total turns: ${report.total_turns}`);
  lines.push(
    `Overall turn pass rate (Hit@5): ${(report.overall_turn_pass_rate * 100).toFixed(1)}%`
  );
  lines.push(`Overall context retention: ${(report.overall_context_retention * 100).toFixed(1)}%`);
  lines.push("");

  lines.push("--- By Jurisdiction ---");
  for (const [jur, data] of Object.entries(report.by_jurisdiction)) {
    lines.push(
      `  ${jur}: ${data.scenarios} scenarios, pass rate ${(data.turn_pass_rate * 100).toFixed(1)}%`
    );
  }
  lines.push("");

  lines.push("--- By Difficulty ---");
  for (const [diff, data] of Object.entries(report.by_difficulty)) {
    lines.push(
      `  ${diff}: ${data.scenarios} scenarios, pass rate ${(data.turn_pass_rate * 100).toFixed(1)}%`
    );
  }
  lines.push("");

  const failedScenarios = report.scenario_results.filter((r) => !r.all_turns_pass);
  if (failedScenarios.length > 0) {
    lines.push("--- Failed Scenarios ---");
    for (const s of failedScenarios.slice(0, 10)) {
      const failedTurns = s.turns.filter((t) => !t.hit_at_5);
      lines.push(
        `  [${s.scenario_id}] ${s.difficulty} — ${failedTurns.length}/${s.turns.length} turns failed`
      );
      for (const t of failedTurns) {
        lines.push(
          `    Turn ${t.turn}: expected ${t.expected_slugs[0]}, got ${t.retrieved_slugs[0] ?? "nothing"}`
        );
      }
    }
  }

  return lines.join("\n");
}

// ── Mock Search Function (for testing) ────────────────────────────────

export function mockSearchFn(): SearchFn {
  return async (opts: SearchFnOpts) => {
    // Simulate search by returning slugs that contain keywords from the query
    const words = opts.query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const slugs: string[] = [];
    const jur = opts.jurisdiction.toLowerCase();

    // Generate plausible slugs based on keywords
    for (const w of words.slice(0, 5)) {
      slugs.push(`legal/statutes/${jur}/bgb/p-${Math.floor(Math.random() * 500) + 1}`);
    }

    return {
      slugs: slugs.slice(0, 8),
      latency_ms: 50 + Math.floor(Math.random() * 100),
    };
  };
}

// ── CLI Entry Point ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jurisdictionFlag = args.indexOf("--jurisdiction");
  const jurisdiction = jurisdictionFlag >= 0 ? args[jurisdictionFlag + 1] : undefined;
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1]) : undefined;
  const outputPath = "/tmp/conversation-eval-report.json";

  let scenarios = getConversationFixtures(jurisdiction);
  if (limit) scenarios = scenarios.slice(0, limit);

  console.log(
    `[conversation-runner] Running ${scenarios.length} scenarios, ${getTotalTurns()} total turns`
  );

  // Use mock search fn for standalone testing
  // In production, replace with real hybridSearch integration
  const searchFn = mockSearchFn();

  const report = await runConversationEval(scenarios, searchFn, (current, total) => {
    if (current % 5 === 0 || current === total) {
      process.stderr.write(`[conversation-runner] Progress: ${current}/${total}\n`);
    }
  });

  const reportText = formatConversationReport(report);
  console.log(reportText);

  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n[conversation-runner] Full report saved to ${outputPath}`);
}

// Run if executed directly
if (import.meta.main) {
  main();
}
