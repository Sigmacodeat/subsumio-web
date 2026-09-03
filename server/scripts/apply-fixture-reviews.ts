#!/usr/bin/env bun
/**
 * Apply Fixture Reviews — übernimmt jurist-freigegebene Korrekturen aus
 * eval_fixture_review-Pages kontrolliert in eine Eval-Fixture-JSONL.
 *
 * Sicherheitsprinzip: kein Agent schreibt die Fixture direkt. Nur ein
 * Mensch (Jurist) setzt eine Review-Page auf status=approved über die
 * /dashboard/admin/eval-review UI; dieses Skript übernimmt danach NUR
 * approved Reviews, druckt einen Diff, und schreibt erst mit --apply.
 * Default ist dry-run.
 *
 * Usage:
 *   bun run server/scripts/apply-fixture-reviews.ts --fixture server/test/fixtures/at-legal-retrieval.jsonl
 *   bun run server/scripts/apply-fixture-reviews.ts --fixture server/test/fixtures/at-legal-retrieval.jsonl --apply
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, relative } from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    fixture: { type: "string", default: "server/test/fixtures/at-legal-retrieval.jsonl" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Apply Fixture Reviews — übernimmt approved eval_fixture_review-Pages in eine Fixture-JSONL.

  --fixture <path>   Fixture-Datei (default: server/test/fixtures/at-legal-retrieval.jsonl)
  --apply             Schreibt tatsächlich (default: dry-run, nur Diff-Anzeige)
`);
  process.exit(0);
}

const ENGINE = process.env.ENGINE_URL || process.env.GBRAIN_ENGINE_URL || "http://localhost:3939";
const API_KEY = process.env.SUBSUMIO_API_KEY || process.env.GBRAIN_API_KEY || "";
const BRAIN = process.env.SUBSUMIO_BRAIN || process.env.GBRAIN_BRAIN_ID || "";

const FIXTURES_ROOT = resolve(process.cwd(), "server", "test", "fixtures");
const fixtureAbs = resolve(process.cwd(), values.fixture as string);
const fixtureRel = relative(FIXTURES_ROOT, fixtureAbs);
if (fixtureRel.startsWith("..") || fixtureRel.includes("..")) {
  console.error(`Refused: fixture path must live under ${FIXTURES_ROOT}`);
  process.exit(1);
}
const fixtureFileName = fixtureAbs.split("/").pop()!;

if (!existsSync(fixtureAbs)) {
  console.error(`Fixture not found: ${fixtureAbs}`);
  process.exit(1);
}

interface EvalFixtureReviewFrontmatter {
  type: "eval_fixture_review";
  fixture_file: string;
  question_id: string;
  current_expected_slug: string;
  proposed_slug: string;
  reasoning: string;
  status: "pending" | "approved" | "rejected" | "needs_discussion";
  reviewed_by?: string;
  reviewed_at?: string;
}

async function fetchApprovedReviews(): Promise<EvalFixtureReviewFrontmatter[]> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["x-subsumio-api-key"] = API_KEY;
  if (BRAIN) headers["x-subsumio-source"] = BRAIN;

  const res = await fetch(`${ENGINE}/api/pages?type=eval_fixture_review&limit=500`, { headers });
  if (!res.ok) {
    console.error(`Failed to fetch reviews: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const raw = await res.json();
  const pages: Array<{ frontmatter?: Record<string, unknown> }> = Array.isArray(raw)
    ? raw
    : (raw?.pages ?? []);

  return pages
    .map((p) => p.frontmatter as EvalFixtureReviewFrontmatter | undefined)
    .filter((fm): fm is EvalFixtureReviewFrontmatter => !!fm && fm.type === "eval_fixture_review")
    .filter((fm) => fm.fixture_file === fixtureFileName)
    .filter((fm) => fm.status === "approved");
}

function main() {
  fetchApprovedReviews().then((approved) => {
    if (approved.length === 0) {
      console.log(`No approved reviews found for ${fixtureFileName}. Nothing to do.`);
      return;
    }

    // Latest approved review per question_id wins.
    const byQuestion = new Map<string, EvalFixtureReviewFrontmatter>();
    for (const r of approved) {
      const existing = byQuestion.get(r.question_id);
      if (!existing || (r.reviewed_at ?? "") > (existing.reviewed_at ?? "")) {
        byQuestion.set(r.question_id, r);
      }
    }

    const raw = readFileSync(fixtureAbs, "utf-8");
    const lines = raw.split("\n");
    let changedCount = 0;
    const outLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(trimmed);
      } catch {
        return line;
      }
      const qid = row.question_id as string | undefined;
      if (!qid || !byQuestion.has(qid)) return line;

      const review = byQuestion.get(qid)!;
      if (row.expected_slug === review.proposed_slug) return line; // already applied

      console.log(`\n${qid}:`);
      console.log(`  - expected_slug: ${row.expected_slug}`);
      console.log(`  + expected_slug: ${review.proposed_slug}`);
      console.log(`  reviewed_by: ${review.reviewed_by ?? "—"} | reasoning: ${review.reasoning}`);

      changedCount++;
      row.expected_slug = review.proposed_slug;
      return JSON.stringify(row);
    });

    if (changedCount === 0) {
      console.log(`All ${byQuestion.size} approved review(s) already applied. Nothing to do.`);
      return;
    }

    console.log(
      `\n${changedCount} approved correction(s) ${values.apply ? "applied" : "would be applied"} to ${fixtureRel}.`
    );

    if (values.apply) {
      writeFileSync(fixtureAbs, outLines.join("\n"));
      console.log(`Written to ${fixtureAbs}. Review the git diff before committing.`);
    } else {
      console.log(`Dry-run only — re-run with --apply to write.`);
    }
  });
}

main();
