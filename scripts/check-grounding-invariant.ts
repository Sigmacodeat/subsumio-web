/**
 * CI guard for the grounding invariant (CLAUDE.md): every UI surface that
 * requests AI-generated legal text must show it with grounding verification
 * and the standard citation panel.
 *
 * A file that calls an AI-producing endpoint passes if it
 *   - renders `CitationPanel` fed with real grounding (`useGroundedAnswer`, the
 *     ground route, or the server citation gate's `_grounding`), or
 *   - renders `GroundedOutputPanel` (hook + panel in one), or
 *   - carries a `grounding-exempt: <reason>` comment (e.g. it only starts a
 *     background job and shows no AI text itself).
 *
 * Run: npx tsx scripts/check-grounding-invariant.ts   (part of `npm run verify`)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/app", "src/components"].map((r) => join(process.cwd(), r));
const SKIP_DIRS = new Set(["node_modules", "_archive", "api"]);

/** Client calls whose response is AI-generated legal text. */
const AI_CALL_PATTERNS: RegExp[] = [
  /\bapi\.query\.think\(/,
  /\bapi\.legal\.(translate|schriftsatz|deepAnalysis|tabularReview|caseStrategy|caseInvestigation|caseScan|opponentSimulation|extractObligations|contradictionsCheck|contractRedline|berufungsgruende|analyzeDocument)\(/,
  /["'`]\/api\/copilot\/draft-review["'`]/,
  /\/draft-reply["'`]/,
  /["'`]\/api\/legal\/(memo|summarize|risk-analysis|subsumption|contract-draft|schriftsatz|analyze|deep-analysis|case-strategy|litigation|chronology|perspektiven-room|opponent-simulation|process-strategy|berufungsgruende|contradiction-probe)["'`?]/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(entry) && !/\.(test|stories)\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

export function checkSource(content: string): "ok" | "exempt" | "violation" | "no-ai" {
  if (!AI_CALL_PATTERNS.some((rx) => rx.test(content))) return "no-ai";
  if (/grounding-exempt:\s*\S/.test(content)) return "exempt";
  if (content.includes("GroundedOutputPanel")) return "ok";
  // The panel must be fed real grounding: the hook, the ground route, or the
  // server-side citation gate's result (`_grounding` / `.grounding`).
  if (
    content.includes("CitationPanel") &&
    /useGroundedAnswer|api\.legal\.ground\(|_grounding|\.grounding\b/.test(content)
  )
    return "ok";
  return "violation";
}

function main(): void {
  const files = ROOTS.flatMap(walk);
  const violations: string[] = [];
  let aiSurfaces = 0;
  let exempt = 0;
  for (const file of files) {
    const verdict = checkSource(readFileSync(file, "utf8"));
    if (verdict === "no-ai") continue;
    aiSurfaces++;
    if (verdict === "exempt") exempt++;
    if (verdict === "violation") violations.push(relative(process.cwd(), file));
  }
  console.log(
    `[check-grounding-invariant] ${files.length} files, ${aiSurfaces} AI surfaces, ${exempt} exempt`
  );
  if (violations.length > 0) {
    console.error(
      `[check-grounding-invariant] ❌ ${violations.length} AI surface(s) without grounding + citation panel:\n` +
        violations.map((v) => `  ${v}`).join("\n") +
        "\n  Fix: render <GroundedOutputPanel text={…} /> under the AI output," +
        " or add a `grounding-exempt: <reason>` comment if the file shows no AI text."
    );
    process.exit(1);
  }
  console.log("[check-grounding-invariant] ✅ every AI surface is grounded");
}

if (process.argv[1]?.endsWith("check-grounding-invariant.ts")) main();
