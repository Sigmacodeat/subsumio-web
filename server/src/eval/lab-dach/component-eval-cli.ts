#!/usr/bin/env bun
/**
 * LAB-DACH v3 — Component Evaluation CLI
 *
 * Usage:
 *   # CI mode (mock, 6 fixtures, <60s)
 *   bun run server/src/eval/lab-dach/component-eval-cli.ts --ci
 *
 *   # Full mode (real engine + LLM, all fixtures)
 *   bun run server/src/eval/lab-dach/component-eval-cli.ts --full --engine http://localhost:8080
 *
 *   # With output file
 *   bun run server/src/eval/lab-dach/component-eval-cli.ts --full --output /tmp/component-eval.json
 *
 *   # Verbose (per-fixture output on stderr)
 *   bun run server/src/eval/lab-dach/component-eval-cli.ts --ci --verbose
 */

import { runComponentEval, formatReportTable } from "./component-eval.ts";
import { getFixtures } from "./component-eval-fixtures.ts";
import type { ComponentEvalOpts } from "./component-eval.ts";
import type { SearchMode } from "../../core/search/mode.ts";
import type { SearchResult } from "../../core/types.ts";
import type { QueryPlan } from "../../core/think/query-planner.ts";
import type { ChatOpts, ChatResult } from "./rubric-judge.ts";
import type { RawCitation, GroundedCitation } from "./component-eval.ts";

// ── CLI Arg Parsing ───────────────────────────────────────────────────

interface CliArgs {
  ci: boolean;
  full: boolean;
  engine: string | null;
  output: string | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    ci: false,
    full: false,
    engine: null,
    output: null,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--ci":
        args.ci = true;
        break;
      case "--full":
        args.full = true;
        break;
      case "--engine":
        args.engine = argv[++i] ?? null;
        break;
      case "--output":
        args.output = argv[++i] ?? null;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        console.log(`Usage: bun run component-eval-cli.ts [options]

Options:
  --ci          CI mode (mock, 6 fixtures, <60s)
  --full        Full mode (real engine + LLM, all fixtures)
  --engine URL  Engine endpoint (default: http://localhost:8080)
  --output PATH JSON output file path
  --verbose     Per-fixture output on stderr
  --help        Show this help
`);
        process.exit(0);
    }
  }

  if (!args.ci && !args.full) {
    args.ci = true;
  }

  return args;
}

// ── Real mode adapters ────────────────────────────────────────────────

async function makeSearchFn(engineUrl: string): Promise<
  (query: string, mode: SearchMode, jurisdiction?: string) => Promise<SearchResult[]>
> {
  return async (query: string, mode: SearchMode, jurisdiction?: string): Promise<SearchResult[]> => {
    const params = new URLSearchParams({
      q: query,
      mode,
      limit: "50",
    });
    if (jurisdiction) {
      params.set("jurisdiction", jurisdiction);
    }

    const resp = await fetch(`${engineUrl}/api/search?${params.toString()}`);
    if (!resp.ok) {
      throw new Error(`Search failed: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json() as { results: SearchResult[] };
    return data.results;
  };
}

async function makeChatFn(_engineUrl: string): Promise<(opts: ChatOpts) => Promise<ChatResult>> {
  const { chat } = await import("../../core/ai/gateway.ts");
  return async (opts: ChatOpts): Promise<ChatResult> => {
    const result = await chat({
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: opts.maxTokens,
    });
    return { text: result.text };
  };
}

async function makePlanQueryFn(): Promise<(question: string, jurisdiction?: string) => Promise<QueryPlan>> {
  const { planQuery } = await import("../../core/think/query-planner.ts");
  return async (question: string, jurisdiction?: string): Promise<QueryPlan> => {
    return planQuery({ question, jurisdiction });
  };
}

async function makeGroundCitationsFn(): Promise<(citations: RawCitation[]) => Promise<GroundedCitation[]>> {
  const { checkCitationGrounding, extractCitations } = await import("../../core/citation-guardrail.ts");
  return async (citations: RawCitation[]): Promise<GroundedCitation[]> => {
    const answerText = citations.map((c) => `§ ${c.paragraph} ${c.code}`).join(" ");
    const contextText = citations.map((c) => `§ ${c.paragraph} ${c.code}`).join(" ");
    const result = checkCitationGrounding({
      answer: answerText,
      context: contextText,
      topSlugs: [],
    });
    const answerCites = extractCitations(answerText);
    return answerCites.map((citeStr: string) => {
      const match = citeStr.match(/§\s*(\d+[a-z]?)\s*([A-Z][A-Za-z]{1,10})?/);
      const paragraph = match?.[1] ?? "";
      const code = match?.[2] ?? "";
      const isUngrounded = result.ungrounded_citations.includes(citeStr);
      return {
        code,
        paragraph,
        verified: !isUngrounded,
      };
    });
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const subset = args.ci ? "ci" : "full";
  const fixtures = getFixtures(subset);

  const opts: ComponentEvalOpts = {
    fixtures,
  };

  if (args.full) {
    const engineUrl = args.engine ?? "http://localhost:8080";

    try {
      opts.searchFn = await makeSearchFn(engineUrl);
      opts.chatFn = await makeChatFn(engineUrl);
      opts.planQueryFn = await makePlanQueryFn();
      opts.groundCitationsFn = await makeGroundCitationsFn();
    } catch (err) {
      console.error(`Failed to initialize real-mode adapters: ${(err as Error).message}`);
      console.error("Falling back to mock mode (no functions injected).");
    }
  }

  if (args.verbose) {
    console.error(`[component-eval] Running ${fixtures.length} fixtures (${subset} mode, real=${args.full})`);
  }

  const start = performance.now();
  const summary = await runComponentEval(opts);
  const elapsed = ((performance.now() - start) / 1000).toFixed(1);

  if (args.verbose) {
    console.error(`[component-eval] Completed in ${elapsed}s`);
  }

  // Print report to stdout
  const report = formatReportTable(summary);
  console.log(report);

  // Write JSON output if requested
  if (args.output) {
    const json = JSON.stringify(summary, null, 2);
    await Bun.write(args.output, json);
    console.error(`[component-eval] JSON written to ${args.output}`);
  }

  // Exit code: 0 if all pass, 1 if any failures
  if (summary.all_pass_count < summary.total_fixtures) {
    console.error(`\n[component-eval] ${summary.total_fixtures - summary.all_pass_count} fixture(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[component-eval] Fatal error: ${err.message}`);
  process.exit(2);
});
