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
 * Office add-in task panes (word-addin/src, outlook-addin/src) pass if they call
 * `/api/legal/ground` and carry the AI Act label texts of src/lib/ai-act.ts.
 *
 * Run: npx tsx scripts/check-grounding-invariant.ts   (part of `npm run verify`)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AI_BADGE_LABEL, AI_NOTICE } from "../src/lib/ai-act";

const ROOTS = ["src/app", "src/components", "word-addin/src", "outlook-addin/src"];
const SKIP_DIRS = new Set(["node_modules", "_archive", "api", "dist"]);
/** Office add-ins are plain DOM code: no React panel, their own grounding rule. */
const ADDIN_DIRS = ["word-addin", "outlook-addin"];

/** Client calls whose response is AI-generated legal text. */
const AI_CALL_PATTERNS: RegExp[] = [
  /\bapi\.query\.think\(/,
  /\bapi\.legal\.(translate|schriftsatz|deepAnalysis|tabularReview|caseStrategy|caseInvestigation|caseScan(?:Preview|Start|Status)?|opponentSimulation|extractObligations|contradictionsCheck|contractRedline|berufungsgruende|analyzeDocument)\(/,
  /\/draft-reply["'`]/,
  /["'`}]\/api\/legal\/(memo|summarize|risk-analysis|subsumption|contract-draft|contract-redline|schriftsatz|analyze|deep-analysis|case-strategy|litigation|chronology|perspektiven-room|opponent-simulation|process-strategy|berufungsgruende|contradiction-probe|commentaries|precedent-search|research|submission-review)["'`?/]/,
  /["'`}]\/api\/think["'`?]/,
  /["'`}]\/api\/review-table\/ask["'`?]/,
  /["'`}]\/api\/portal\/chat["'`?]/,
  /["'`}]\/api\/work-products\/memo\/generate["'`?]/,
  /["'`}]\/api\/email\/draft-reply["'`?]/,
  // Copilot side panels (explanation/plan/memory/draft-review render model output).
  /["'`}]\/api\/copilot\/(explain|plan|memory|draft-review)["'`?]/,
  // Marketing concierge streams AI replies on the public site.
  /["'`}]\/api\/concierge["'`?]/,
  // The daily briefing is fetched through a shared lib helper — the URL never
  // appears in the component, so the call-site pattern catches the consumer.
  /\bloadBriefing\(/,
  // Copilot tools return AI text (deadline extraction, client update, summary,
  // translation) that the chat renders in its tool result card.
  /\bexecuteConfirmedTool\(|["'`]\/api\/copilot\/tools["'`]/,
  // Pages the legal pipeline writes with an LLM (legal-pipeline.ts) and a
  // surface later reads back verbatim through the brain page API.
  /["'`]\/?(procedural-strategy|forensic-reports|settlement-analysis|cost-benefit|burden-of-proof|admissibility-checks|fact-gaps|enforcement-analysis|appeal-risk|insurance-coverage|counterclaim-risk|evidence-quality|mediation-adr|limitation-scan|cost-award|witness-expert|legal-drafts)\//,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.(test|stories|d)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

export function checkSource(
  content: string,
  kind: "web" | "addin" = "web"
): "ok" | "exempt" | "violation" | "no-ai" {
  if (!AI_CALL_PATTERNS.some((rx) => rx.test(content))) return "no-ai";
  if (/grounding-exempt:\s*\S/.test(content)) return "exempt";
  // An add-in task pane has no React: it must call the ground route itself and
  // show the AI Act label with the exact texts of src/lib/ai-act.ts.
  if (kind === "addin") {
    return content.includes("/api/legal/ground") &&
      content.includes(AI_BADGE_LABEL) &&
      content.includes(AI_NOTICE)
      ? "ok"
      : "violation";
  }
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

/** Scan every UI root (web app + Office add-ins) of the repository at `cwd`. */
export function scanRepository(cwd = process.cwd()): {
  files: number;
  aiSurfaces: string[];
  exempt: number;
  violations: string[];
} {
  const files = ROOTS.map((r) => join(cwd, r)).flatMap(walk);
  const violations: string[] = [];
  const aiSurfaces: string[] = [];
  let exempt = 0;
  for (const file of files) {
    const rel = relative(cwd, file);
    const kind = ADDIN_DIRS.some((d) => rel.startsWith(d + sep)) ? "addin" : "web";
    const verdict = checkSource(readFileSync(file, "utf8"), kind);
    if (verdict === "no-ai") continue;
    aiSurfaces.push(rel);
    if (verdict === "exempt") exempt++;
    if (verdict === "violation") violations.push(rel);
  }
  return { files: files.length, aiSurfaces, exempt, violations };
}

function main(): void {
  const { files, aiSurfaces, exempt, violations } = scanRepository();
  console.log(
    `[check-grounding-invariant] ${files} files, ${aiSurfaces.length} AI surfaces, ${exempt} exempt`
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
