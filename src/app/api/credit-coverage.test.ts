// Every API route that spends model tokens must bill credits — or be listed
// below with the reason it does not. Leaks this guards against (found in
// docs/KOSTEN_CREDITS_ANALYSE_2026-09-19.md and the go-live audit 2026-09-23):
//   1. `credits:` on createHandler only CHECKS the balance; a custom handler
//      must also call recordCreditConsumption, or the action is free forever.
//   2. A new AI route without any credit handling.
//   3. A route that reaches the model indirectly — engineThink/engineComplete
//      called inside a src/lib helper (reviewDraft, checkSupport, …). The
//      helpers are found by scanning src/lib, transitively, so a new helper
//      is covered without anyone remembering to list it.
// createEngineProxy deducts by itself when `credits` is set.

import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = path.join(process.cwd(), "src/app/api");
const LIB_DIR = path.join(process.cwd(), "src/lib");

/** Calls that cost model tokens when they appear directly in a file. */
const DIRECT_MODEL_CALL =
  /engineComplete\(|engineThink\(|\/api\/think[`"'?]|\/api\/llm\/complete|\/api\/agents\/supervisor|createEngineProxy/;

/** Routes that call a model (or the engine proxy) without billing credits, and why. */
const NOT_BILLED: Record<string, string> = {
  concierge: "public sales chat, no account to bill; per-IP limit",
  "portal/chat": "client asks in the portal, not the firm; daily cap per matter",
  "dashboard/briefing": "one small utility-tier completion, cached per day in the browser",
  "cron/daily-briefing": "utility tier, 300 tokens, only WhatsApp senders",
  "cron/rundown": "daily agent run, restricted to firms that pay or are on trial",
  "cron/autonomous-engine": "runs tasks a firm queued itself",
  "cron/autopilot": "runs policies a firm configured itself",
  "cron/agent-tasks": "runs tasks a firm queued itself (assigneeType=agent)",
  "legal/anonymize": "engine proxy; name detection on the utility tier",
  "legal/judgements-sync": "engine proxy without a model call",
  "legal/translate": "engine proxy without a model call",
  "legal/case-scanner": "engine proxy without a model call",
  "legal/conflict-check": "engine proxy without a model call",
  "legal/precedent-search": "engine proxy without a model call",
  "legal/portfolio-insights": "engine proxy without a model call",
  "legal/obligation-extract": "engine proxy without a model call",
  "analytics/adoption": "engine proxy without a model call",
  // Background mail sync: the deadline extractor only runs for a mail that
  // announces a Frist without a parseable date (suggestions for review).
  "cron/imap-sync": "background mail sync; deadline hint for undated Frist mails",
  "email/accounts": "connecting an account runs the first background mail sync",
  "email/accounts/[id]/sync": "manual trigger of the background mail sync",
  "email/oauth/[provider]/callback": "OAuth connect runs the first background mail sync",
  // Automatic follow-ups of ONE user question, already billed with that
  // question. No legal-AI vendor bills citation checks or memory separately
  // (research 2026-09-23: AI:ssociate, Noxtua, Harvey count the user action).
  // Both are rate-limited per user; the citation check must also never be
  // skipped for lack of balance.
  "legal/support": "automatic citation-support check after an answer (useGroundedAnswer)",
  "copilot/memory": "automatic memory extraction after a chat turn",
};

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full, keep);
    return keep(name) ? [full] : [];
  });
}

// ── src/lib: which exported functions reach a model? ────────────────────

interface LibFile {
  /** "@/lib/…" import specifier without extension. */
  spec: string;
  src: string;
  /** Top-level function name → its source text (declaration to closing brace). */
  fns: Map<string, string>;
}

/**
 * Top-level `[export] [async] function x(` / `[export] const x = [async] (…) =>`
 * bodies — internal ones too, so a model call in a private helper propagates
 * to the exported function that calls it.
 */
function topLevelFunctions(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = src.split("\n");
  const decl =
    /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)|^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|[A-Za-z0-9_$]+\s*=>|function)/;
  for (let i = 0; i < lines.length; i++) {
    const m = decl.exec(lines[i]);
    if (!m) continue;
    let end = i;
    while (
      end < lines.length - 1 &&
      !/^}/.test(lines[end]) &&
      !(end > i && /^(?:export\s|function\s|async\s|const\s)/.test(lines[end]))
    )
      end++;
    out.set(m[1] ?? m[2], lines.slice(i, end + 1).join("\n"));
  }
  return out;
}

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](@\/lib\/[^"']+)["']/g;

/** Names imported from @/lib modules, keyed by module spec. */
function libImports(src: string): Array<{ spec: string; names: string[] }> {
  const out: Array<{ spec: string; names: string[] }> = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const names = m[1]
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith("type "))
      .map((n) =>
        n
          .split(/\s+as\s+/)
          .pop()!
          .trim()
      );
    out.push({ spec: m[2].replace(/\/index$/, ""), names });
  }
  return out;
}

const libFiles: LibFile[] = files(
  LIB_DIR,
  (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) && !n.endsWith(".d.ts")
).map((file) => {
  const src = readFileSync(file, "utf8");
  const rel = path
    .relative(LIB_DIR, file)
    .split(path.sep)
    .join("/")
    .replace(/\.tsx?$/, "");
  return { spec: `@/lib/${rel}`.replace(/\/index$/, ""), src, fns: topLevelFunctions(src) };
});

/** The model-call primitives themselves are not "helpers" — routes are judged by calling them. */
const PRIMITIVES = new Set(["@/lib/engine-llm", "@/lib/engine-think", "@/lib/engine"]);

/**
 * "@/lib/x#fn" for every exported lib function that reaches a model — directly,
 * via a sibling function in the same file, or via another lib helper (fixpoint).
 */
function llmHelpers(): Set<string> {
  const found = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const lib of libFiles) {
      if (PRIMITIVES.has(lib.spec)) continue;
      const imported = libImports(lib.src).flatMap(({ spec, names }) =>
        names.filter((n) => found.has(`${spec}#${n}`))
      );
      const localLlm = [...lib.fns.keys()].filter((n) => found.has(`${lib.spec}#${n}`));
      for (const [name, body] of lib.fns) {
        const key = `${lib.spec}#${name}`;
        if (found.has(key)) continue;
        const calls = (n: string) => new RegExp(`\\b${n}\\(`).test(body);
        if (
          DIRECT_MODEL_CALL.test(body) ||
          imported.some(calls) ||
          localLlm.filter((n) => n !== name).some(calls)
        ) {
          found.add(key);
          changed = true;
        }
      }
    }
  }
  return found;
}

const LLM_HELPERS = llmHelpers();

// ── routes ───────────────────────────────────────────────────────────────

const routes = files(API_DIR, (n) => n === "route.ts").map((file) => ({
  name: path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/"),
  src: readFileSync(file, "utf8"),
}));

/** The lib helpers a route calls that reach a model. */
function helpersCalled(src: string): string[] {
  return libImports(src).flatMap(({ spec, names }) =>
    names
      .filter((n) => LLM_HELPERS.has(`${spec}#${n}`))
      .filter((n) => new RegExp(`\\b${n}\\(`).test(src))
      .map((n) => `${spec}#${n}`)
  );
}

const spendsTokens = (src: string) => DIRECT_MODEL_CALL.test(src) || helpersCalled(src).length > 0;
const declaresCredits = (src: string) => /^\s*credits:\s*"/m.test(src);
/**
 * A balance check inside the handler: an optional model call
 * (src/lib/billing/optional-llm-credits.ts) or per-tool pricing
 * (copilot/tools: TOOL_CREDITS + checkCredits).
 */
const checksOptionalCredits = (src: string) =>
  src.includes("canAffordOptionalLlm(") || src.includes("checkCredits(");
const deducts = (src: string) =>
  src.includes("recordCreditConsumption(") || src.includes("createEngineProxy");
const bills = (src: string) => (declaresCredits(src) || checksOptionalCredits(src)) && deducts(src);

describe("credit coverage", () => {
  test("the helper scan finds the known indirect model calls", () => {
    for (const helper of [
      "@/lib/draft-review#reviewDraft",
      "@/lib/support-check#checkSupport",
      "@/lib/copilot-memory-llm#extractMemoriesWithLLM",
      "@/lib/llm-deadline-extract#hybridDeadlineDetection",
    ]) {
      expect(LLM_HELPERS.has(helper), helper).toBe(true);
    }
    // A pure helper next to a model call is not one.
    expect(LLM_HELPERS.has("@/lib/support-check#claimFor")).toBe(false);
  });

  test("a route that checks credits also deducts them", () => {
    const leaks = routes
      .filter((r) => (declaresCredits(r.src) || checksOptionalCredits(r.src)) && !deducts(r.src))
      .map((r) => r.name);
    expect(leaks).toEqual([]);
  });

  test("every token-spending route bills credits or is listed with a reason", () => {
    const unbilled = routes
      .filter((r) => spendsTokens(r.src))
      .filter((r) => !bills(r.src))
      .map((r) => {
        const via = helpersCalled(r.src);
        return via.length ? `${r.name} (via ${via.join(", ")})` : r.name;
      })
      .filter((name) => !(name.split(" ")[0] in NOT_BILLED));
    expect(unbilled).toEqual([]);
  });

  test("the allowlist has no stale entries", () => {
    const names = new Set(routes.map((r) => r.name));
    expect(Object.keys(NOT_BILLED).filter((n) => !names.has(n))).toEqual([]);
  });

  test("the daily rundown only runs for firms that pay or are on trial", () => {
    const rundown = routes.find((r) => r.name === "cron/rundown")!;
    expect(rundown.src).toContain("billableRecipientsByBrain()");
    expect(rundown.src).not.toContain("getRecipientsByBrain()");
  });
});
