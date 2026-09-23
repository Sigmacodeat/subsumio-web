/**
 * Pure helpers for /api/cron/feedback-triage — extracted for testability.
 * Detractor filtering, per-case escalation detection and staff-recipient
 * filtering are pure functions over the page/ user shapes.
 */

import type { User } from "@/lib/auth/store";

export const DETRACTOR_MAX = 6;

export interface FeedbackPage {
  slug: string;
  frontmatter?: {
    case_slug?: string;
    nps_score?: number;
    comment?: string | null;
    submitted_at?: string;
  };
}

/** Detractors (score ≤ max) submitted at/after `sinceMs`. */
export function detractorsSince(
  pages: FeedbackPage[],
  sinceMs: number,
  max = DETRACTOR_MAX
): FeedbackPage[] {
  return pages.filter((p) => {
    const score = p.frontmatter?.nps_score;
    const ts = Date.parse(p.frontmatter?.submitted_at ?? "");
    return typeof score === "number" && score <= max && Number.isFinite(ts) && ts >= sinceMs;
  });
}

/**
 * Case slugs with ≥ `threshold` detractor feedbacks inside `windowMs`
 * ending at `nowMs` — repeated criticism escalates the digest.
 */
export function escalatedCaseSlugs(
  pages: FeedbackPage[],
  threshold: number,
  windowMs: number,
  nowMs = Date.now()
): Set<string> {
  const cutoff = nowMs - windowMs;
  const counts = new Map<string, number>();
  for (const p of pages) {
    const fm = p.frontmatter ?? {};
    const ts = Date.parse(fm.submitted_at ?? "");
    if (
      typeof fm.nps_score === "number" &&
      fm.nps_score <= DETRACTOR_MAX &&
      Number.isFinite(ts) &&
      ts >= cutoff &&
      fm.case_slug
    ) {
      counts.set(fm.case_slug, (counts.get(fm.case_slug) ?? 0) + 1);
    }
  }
  return new Set([...counts.entries()].filter(([, n]) => n >= threshold).map(([c]) => c));
}

/** Client-facing roles never receive client criticism digests. */
export function staffRecipients(users: User[]): User[] {
  return users.filter((u) => u.role === "admin" || u.role === "lawyer");
}
