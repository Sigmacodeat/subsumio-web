/**
 * Ratings of Copilot answers: a lawyer marks an answer helpful or not, with an
 * optional reason. Kept with the question, an excerpt of the answer, its
 * sources and matter, so answer quality can be measured and bad answers
 * replayed against the eval suite. One rating per person and answer (a new
 * click replaces it). Web-app Postgres (subsumio_answer_feedback), in memory
 * without a database.
 */
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

export type AnswerRating = "up" | "down";
export type DownReason = "wrong" | "missing_source" | "incomplete" | "other";

export interface AnswerFeedback {
  brainId: string;
  userId: string;
  messageId: string;
  rating: AnswerRating;
  reason?: DownReason;
  comment?: string;
  question: string;
  answerExcerpt: string;
  citations: string[];
  caseSlug?: string;
  model?: string;
  createdAt: string;
}

export interface FeedbackSummary {
  up: number;
  down: number;
  reasons: Record<DownReason, number>;
  recentDown: Array<
    Pick<
      AnswerFeedback,
      "question" | "answerExcerpt" | "reason" | "comment" | "caseSlug" | "createdAt"
    >
  >;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_answer_feedback (
     brain_id text NOT NULL,
     user_id text NOT NULL,
     message_id text NOT NULL,
     rating text NOT NULL CHECK (rating IN ('up', 'down')),
     reason text,
     comment text,
     question text NOT NULL,
     answer_excerpt text NOT NULL,
     citations jsonb NOT NULL DEFAULT '[]',
     case_slug text,
     model text,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (brain_id, user_id, message_id)
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_answer_feedback_brain ON subsumio_answer_feedback (brain_id, created_at DESC)`,
]);

const memory = new Map<string, AnswerFeedback>();

export async function saveAnswerFeedback(f: AnswerFeedback): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    memory.set(`${f.brainId}|${f.userId}|${f.messageId}`, f);
    return;
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_answer_feedback
       (brain_id, user_id, message_id, rating, reason, comment, question, answer_excerpt, citations, case_slug, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
     ON CONFLICT (brain_id, user_id, message_id) DO UPDATE
       SET rating = $4, reason = $5, comment = $6, created_at = now()`,
    [
      f.brainId,
      f.userId,
      f.messageId,
      f.rating,
      f.reason ?? null,
      f.comment ?? null,
      f.question,
      f.answerExcerpt,
      // node-postgres sends JS arrays as Postgres arrays; jsonb needs the JSON text.
      JSON.stringify(f.citations),
      f.caseSlug ?? null,
      f.model ?? null,
    ]
  );
}

export async function feedbackSummary(brainId: string, days = 30): Promise<FeedbackSummary> {
  const since = Date.now() - days * 86_400_000;
  let rows: AnswerFeedback[];
  const pool = getSharedPgPool();
  if (!pool) {
    rows = [...memory.values()].filter(
      (f) => f.brainId === brainId && Date.parse(f.createdAt) >= since
    );
  } else {
    await ensureSchema();
    const res = await pool.query(
      `SELECT * FROM subsumio_answer_feedback
        WHERE brain_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1000`,
      [brainId, new Date(since).toISOString()]
    );
    rows = res.rows.map((r: Record<string, unknown>) => ({
      brainId: String(r.brain_id),
      userId: String(r.user_id),
      messageId: String(r.message_id),
      rating: r.rating as AnswerRating,
      reason: (r.reason as DownReason | null) ?? undefined,
      comment: (r.comment as string | null) ?? undefined,
      question: String(r.question),
      answerExcerpt: String(r.answer_excerpt),
      citations: Array.isArray(r.citations) ? (r.citations as string[]) : [],
      caseSlug: (r.case_slug as string | null) ?? undefined,
      model: (r.model as string | null) ?? undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }
  const reasons: Record<DownReason, number> = {
    wrong: 0,
    missing_source: 0,
    incomplete: 0,
    other: 0,
  };
  let up = 0;
  let down = 0;
  for (const f of rows) {
    if (f.rating === "up") up++;
    else {
      down++;
      reasons[f.reason ?? "other"]++;
    }
  }
  const recentDown = rows
    .filter((f) => f.rating === "down")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map(({ question, answerExcerpt, reason, comment, caseSlug, createdAt }) => ({
      question,
      answerExcerpt,
      reason,
      comment,
      caseSlug,
      createdAt,
    }));
  return { up, down, reasons, recentDown };
}
