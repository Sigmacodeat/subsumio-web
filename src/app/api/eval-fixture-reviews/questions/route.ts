import { readFileSync, existsSync, realpathSync } from "fs";
import { resolve, relative } from "path";
import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { fmToReview, filterByFixture, type EvalFixtureReview } from "@/lib/eval-fixture-review";

export const maxDuration = 15;

// ── Path confinement: read-only, whitelist server/test/fixtures/*.jsonl ─

const FIXTURES_ROOT = resolve(process.cwd(), "server", "test", "fixtures");
const FILENAME_RE = /^[a-z0-9_-]+\.jsonl$/i;

function safeFixturePath(fixtureFile: string): string | null {
  const base = fixtureFile.split("/").pop() ?? fixtureFile;
  if (!FILENAME_RE.test(base)) return null;

  const abs = resolve(FIXTURES_ROOT, base);
  const rel = relative(FIXTURES_ROOT, abs);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  if (!existsSync(abs)) return null;

  try {
    const real = realpathSync(abs);
    const realRel = relative(FIXTURES_ROOT, real);
    if (realRel.startsWith("..") || realRel.includes("..")) return null;
  } catch {
    return null;
  }

  return abs;
}

interface FixtureRow {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area?: string;
  question_type?: string;
  needs_legal_review?: boolean;
  review_note?: string;
}

function parseFixtureJsonl(absPath: string): FixtureRow[] {
  const raw = readFileSync(absPath, "utf-8");
  const rows: FixtureRow[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<FixtureRow>;
      if (parsed.question_id && parsed.question && parsed.expected_slug) {
        rows.push(parsed as FixtureRow);
      }
    } catch {
      // skip malformed line — surfaced via total count mismatch, not a hard failure
    }
  }
  return rows;
}

// ── GET: fixture questions joined with latest review status ────────────

const getSchema = z.object({
  fixture_file: z.string().min(1).max(120),
});

export const GET = createHandler(
  {
    action: "legal.eval_fixture_review",
    rateTier: "standard",
    query: getSchema,
  },
  async (ctx, _body, query, _req) => {
    const absPath = safeFixturePath(query.fixture_file);
    if (!absPath) {
      return apiError(
        "fixture_not_found",
        `Fixture-Datei '${query.fixture_file}' nicht gefunden.`,
        404
      );
    }

    let rows: FixtureRow[];
    try {
      rows = parseFixtureJsonl(absPath);
    } catch (err) {
      return apiError(
        "fixture_parse_failed",
        err instanceof Error ? err.message : "fixture_parse_failed",
        500
      );
    }

    let reviews: EvalFixtureReview[] = [];
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=eval_fixture_review&limit=500`, {
        headers: engineHeadersForBrain(ctx.brainId),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const raw = await res.json();
        const pages = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.pages)
            ? (raw as Record<string, unknown[]>).pages
            : [];
        reviews = filterByFixture(
          pages.map((p) => fmToReview(p)).filter((r): r is EvalFixtureReview => r !== null),
          query.fixture_file
        );
      }
    } catch {
      // Reviews sind Zusatzinfo — Engine-Ausfall soll die Fragenliste nicht blockieren
    }

    const reviewsByQuestionId = new Map<string, EvalFixtureReview[]>();
    for (const r of reviews) {
      const qid = r.frontmatter.question_id;
      const list = reviewsByQuestionId.get(qid) ?? [];
      list.push(r);
      reviewsByQuestionId.set(qid, list);
    }

    const joined = rows.map((row) => ({
      ...row,
      reviews: (reviewsByQuestionId.get(row.question_id) ?? []).sort((a, b) =>
        b.frontmatter.proposed_at.localeCompare(a.frontmatter.proposed_at)
      ),
    }));

    return apiSuccess({
      fixture_file: query.fixture_file,
      questions: joined,
      total: joined.length,
      flagged: joined.filter((q) => q.needs_legal_review).length,
    });
  }
);
