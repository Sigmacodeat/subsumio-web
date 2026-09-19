/**
 * Citation-support eval: does the "trägt die Quelle die Aussage?" check
 * (src/lib/support-check.ts) judge real Austrian/EU norms correctly?
 *
 * Runs the production code path — corpus grounding, then checkSupport with the
 * engine's utility tier — over the hand-labelled gold set (gold.json) and
 * prints a receipt with the pre-registered metrics (README.md).
 *
 * Must run where the law corpus and the engine are reachable, i.e. inside the
 * web container: bundle with `bun build … --target=bun`, copy in, `bun run`.
 */

import { createHash } from "node:crypto";
import gold from "./gold.json";
import { groundAnswerCitations } from "@/lib/citation-gate";
import { checkSupport, type SupportCheckMeta } from "@/lib/support-check";
import { engineHeadersForBrain } from "@/lib/engine";

type Verdict = "supported" | "partial" | "unsupported";
type Predicted = Verdict | "unchecked" | "not_grounded";

interface GoldCase {
  id: string;
  citation: { code: string; paragraph: string };
  expected: Verdict;
  acceptable?: Verdict[];
  answer: string;
}

const LABELS: Verdict[] = ["supported", "partial", "unsupported"];

async function runCase(c: GoldCase, headers: Record<string, string>) {
  const grounding = await groundAnswerCitations(c.answer, { fallbackJurisdiction: "at" });
  const gc = grounding.grounded_citations.find(
    (g) => g.code === c.citation.code && g.paragraph.startsWith(c.citation.paragraph)
  );
  if (!gc?.verified) {
    return { predicted: "not_grounded" as Predicted, reason: gc?.unverifiable_reason ?? "not extracted" };
  }
  const meta: SupportCheckMeta = {};
  const [r] = await checkSupport(headers, c.answer, [gc], meta);
  return { predicted: (r?.support ?? "unchecked") as Predicted, reason: r?.support_reason, meta };
}

async function main() {
  const cases = (gold as { cases: GoldCase[] }).cases;
  const headers = engineHeadersForBrain(process.env.EVAL_BRAIN_ID || "host");
  const rows = [];
  for (const c of cases) {
    const t0 = Date.now();
    const out = await runCase(c, headers);
    rows.push({ ...c, ...out, ms: Date.now() - t0 });
    const ok = out.predicted === c.expected ? "✓" : c.acceptable?.includes(out.predicted as Verdict) ? "~" : "✗";
    console.error(`${ok} ${c.id.padEnd(22)} gold=${c.expected.padEnd(11)} got=${out.predicted}`);
  }

  const n = rows.length;
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const confusion: Record<string, Record<string, number>> = {};
  for (const g of LABELS) {
    confusion[g] = {};
    for (const p of [...LABELS, "unchecked", "not_grounded"]) {
      confusion[g][p] = count((r) => r.expected === g && r.predicted === p);
    }
  }
  const goldU = count((r) => r.expected === "unsupported");
  const goldS = count((r) => r.expected === "supported");
  const predU = count((r) => r.predicted === "unsupported");
  const tpU = confusion.unsupported.unsupported;
  const metrics = {
    exact_accuracy: count((r) => r.predicted === r.expected) / n,
    lenient_accuracy:
      count((r) => r.predicted === r.expected || !!r.acceptable?.includes(r.predicted as Verdict)) / n,
    misgrounding_recall: goldU ? tpU / goldU : null,
    misgrounding_precision: predU ? tpU / predU : null,
    dangerous_miss_rate: goldU ? confusion.unsupported.supported / goldU : null,
    false_alarm_rate: goldS ? confusion.supported.unsupported / goldS : null,
    pipeline_failure_rate: count((r) => r.predicted === "unchecked" || r.predicted === "not_grounded") / n,
  };
  const models = [...new Set(rows.map((r) => r.meta?.model).filter(Boolean))];
  const receipt = {
    eval: "citation-support",
    ts: new Date().toISOString(),
    gold_version: (gold as { version: number }).version,
    gold_hash: createHash("sha256").update(JSON.stringify(gold)).digest("hex").slice(0, 16),
    code_sha: process.env.EVAL_CODE_SHA ?? null,
    models,
    n,
    metrics,
    confusion,
    cases: rows.map((r) => ({
      id: r.id,
      expected: r.expected,
      acceptable: r.acceptable,
      predicted: r.predicted,
      reason: r.reason,
      ms: r.ms,
    })),
  };
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
