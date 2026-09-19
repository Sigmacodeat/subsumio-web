import { csrfFetch } from "@/lib/csrf";

export interface DeadlineDecisionRequest {
  caseSlug: string;
  index: number;
  action: "approve" | "reject";
  /** Lawyer-confirmed date (YYYY-MM-DD); defaults server-side to the AI date. */
  dueDate?: string;
  title?: string;
}

/**
 * Client for POST /api/review-inbox/deadline-decision. Throws an Error whose
 * message is the server's German, user-facing text — callers show it in a
 * toast instead of reporting success.
 */
export async function decideDeadlineSuggestion(
  req: DeadlineDecisionRequest
): Promise<{ deadlineSlug: string | null }> {
  const res = await csrfFetch("/api/review-inbox/deadline-decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      case_slug: req.caseSlug,
      index: req.index,
      action: req.action,
      ...(req.dueDate ? { due_date: req.dueDate } : {}),
      ...(req.title ? { title: req.title } : {}),
    }),
  });
  const payload = (await res.json().catch(() => null)) as {
    data?: { deadline_slug?: string | null };
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(
      payload?.error ||
        (req.action === "approve"
          ? "Frist konnte nicht übernommen werden."
          : "Fristvorschlag konnte nicht verworfen werden.")
    );
  }
  return { deadlineSlug: payload?.data?.deadline_slug ?? null };
}
