// Every API route that spends model tokens must bill credits — or be listed
// below with the reason it does not. Two leaks this guards against (found in
// docs/KOSTEN_CREDITS_ANALYSE_2026-09-19.md):
//   1. `credits:` on createHandler only CHECKS the balance; a custom handler
//      must also call recordCreditConsumption, or the action is free forever.
//   2. A new AI route without any credit handling.
// createEngineProxy deducts by itself when `credits` is set.

import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = path.join(process.cwd(), "src/app/api");

/** Calls that cost model tokens. */
const SPENDS_TOKENS = /engineComplete\(|\/api\/think`|\/api\/agents\/supervisor|createEngineProxy/;

/** Routes that call a model (or the engine proxy) without billing credits, and why. */
const NOT_BILLED: Record<string, string> = {
  concierge: "public sales chat, no account to bill; per-IP limit",
  "portal/chat": "client asks in the portal, not the firm; daily cap per matter",
  "dashboard/briefing": "one small utility-tier completion, cached per day in the browser",
  "cron/daily-briefing": "utility tier, 300 tokens, only WhatsApp senders",
  "cron/rundown": "daily agent run, restricted to firms that pay or are on trial",
  "cron/autonomous-engine": "runs tasks a firm queued itself",
  "cron/autopilot": "runs policies a firm configured itself",
  "legal/anonymize": "engine proxy; name detection on the utility tier",
  "legal/judgements-sync": "engine proxy without a model call",
  "legal/translate": "engine proxy without a model call",
  "legal/case-scanner": "engine proxy without a model call",
  "legal/conflict-check": "engine proxy without a model call",
  "legal/precedent-search": "engine proxy without a model call",
  "legal/portfolio-insights": "engine proxy without a model call",
  "legal/obligation-extract": "engine proxy without a model call",
  "analytics/adoption": "engine proxy without a model call",
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const routes = routeFiles(API_DIR).map((file) => ({
  name: path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/"),
  src: readFileSync(file, "utf8"),
}));

const declaresCredits = (src: string) => /^\s*credits:\s*"/m.test(src);
const deducts = (src: string) =>
  src.includes("recordCreditConsumption(") || src.includes("createEngineProxy");

describe("credit coverage", () => {
  test("a route that checks credits also deducts them", () => {
    const leaks = routes
      .filter((r) => declaresCredits(r.src) && !deducts(r.src))
      .map((r) => r.name);
    expect(leaks).toEqual([]);
  });

  test("every token-spending route bills credits or is listed with a reason", () => {
    const unbilled = routes
      .filter((r) => SPENDS_TOKENS.test(r.src))
      .filter((r) => !(declaresCredits(r.src) && deducts(r.src)))
      .map((r) => r.name)
      .filter((name) => !(name in NOT_BILLED));
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
