import type { EvalCase } from "./fixtures.ts";

export interface CaseResult {
  id: string;
  passed: boolean;
  contaminated: boolean;
  missing: string[];
  forbidden: string[];
}

export function scoreCase(c: EvalCase, answer: string): CaseResult {
  const missing = c.mustMatch.filter((r) => !r.test(answer)).map(String);
  const forbidden = c.mustNotMatch.filter((r) => r.test(answer)).map(String);
  const contaminated = (c.contamination ?? []).some((r) => r.test(answer));
  return {
    id: c.id,
    passed: missing.length === 0 && forbidden.length === 0 && !contaminated,
    contaminated,
    missing,
    forbidden,
  };
}

export interface GateVerdict {
  passRate: number;
  contaminated: number;
  ok: boolean;
}

/** Gate: at least `minPassRate` of the cases pass AND no jurisdiction contamination. */
export function gateVerdict(results: CaseResult[], minPassRate = 0.8): GateVerdict {
  const passRate =
    results.length === 0 ? 0 : results.filter((r) => r.passed).length / results.length;
  const contaminated = results.filter((r) => r.contaminated).length;
  return { passRate, contaminated, ok: passRate >= minPassRate && contaminated === 0 };
}
