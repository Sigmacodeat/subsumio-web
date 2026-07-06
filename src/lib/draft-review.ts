/**
 * Draft Review Flow — Structured AI review of legal drafts
 *
 * Submits a draft document to the AI for review and returns
 * structured issues with severity, suggestions, and legal basis.
 * Supports tracking review status (pending → in_review → approved/rejected/changes_requested).
 *
 * Review categories:
 * - legal_accuracy: Incorrect legal statements or citations
 * - completeness: Missing required clauses or content
 * - risk: Risky language or unfavorable terms
 * - style: Tone, formatting, or clarity issues
 * - compliance: DSGVO, AGB-Recht, or other regulatory concerns
 * - consistency: Internal contradictions or inconsistencies
 */

import { api } from "@/lib/api";

export type ReviewSeverity = "critical" | "warning" | "info" | "suggestion";
export type ReviewCategory =
  | "legal_accuracy"
  | "completeness"
  | "risk"
  | "style"
  | "compliance"
  | "consistency";

export type ReviewIssueStatus = "open" | "accepted" | "rejected" | "deferred";

export interface DraftReviewIssue {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  description: string;
  location?: string;
  suggestion?: string;
  legalBasis?: string;
  status: ReviewIssueStatus;
}

export interface DraftReviewResult {
  id: string;
  draftSlug?: string;
  draftTitle: string;
  draftType: string;
  reviewStatus: "pending" | "in_review" | "approved" | "rejected" | "changes_requested";
  issues: DraftReviewIssue[];
  summary: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  reviewedAt: string;
  reviewerModel?: string;
}

const REVIEW_PROMPT_TEMPLATE = `Du bist ein erfahrener Rechtsanwalt und reviewst den folgenden Entwurf.

ENTWURF TITEL: {title}
ENTWURF TYP: {type}

ENTWURF INHALT:
---
{content}
---

Erstelle eine strukturierte Review im folgenden JSON-Format (nur JSON, keine Markdown-Einleitung):

{{
  "summary": "Kurze Zusammenfassung der Review (2-3 Sätze)",
  "overallRisk": "low|medium|high|critical",
  "issues": [
    {{
      "category": "legal_accuracy|completeness|risk|style|compliance|consistency",
      "severity": "critical|warning|info|suggestion",
      "title": "Kurzer Titel des Problems",
      "description": "Detaillierte Beschreibung des Problems",
      "location": "Welcher Abschnitt/Klausel betroffen ist",
      "suggestion": "Konkreter Verbesserungsvorschlag",
      "legalBasis": "Rechtliche Grundlage (z.B. § 305 BGB)"
    }}
  ]
}}

Kriterien:
- legal_accuracy: Falsche Rechtsauskünfte, fehlerhafte Zitate
- completeness: Fehlende Standardklauseln, unvollständige Angaben
- risk: Riskante Formulierungen, einseitige Klauseln
- style: Tonfall, Klarheit, Formatierung
- compliance: DSGVO, AGB-Recht, Verbraucherschutz
- consistency: Widersprüche im Dokument

Schweregrade:
- critical: Muss vor Versand geändert werden
- warning: Sollte geändert werden
- info: Information, keine Änderung nötig
- suggestion: Stilverbesserung

Gib maximal 15 Issues zurück, sortiert nach Schwere.`;

function generateReviewId(): string {
  return `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateIssueId(): string {
  return `issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseReviewResponse(
  response: string,
  draftTitle: string,
  draftType: string,
  draftSlug?: string
): DraftReviewResult {
  // Extract JSON from response (may be wrapped in markdown code block)
  let jsonStr = response.trim();
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: {
    summary?: string;
    overallRisk?: string;
    issues?: Array<Omit<DraftReviewIssue, "id" | "status">>;
  };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: create a single issue with the raw response
    return {
      id: generateReviewId(),
      draftSlug,
      draftTitle,
      draftType,
      reviewStatus: "in_review",
      issues: [
        {
          id: generateIssueId(),
          category: "style",
          severity: "info",
          title: "Review abgeschlossen",
          description: response.slice(0, 500),
          status: "open",
        },
      ],
      summary:
        "Die Review konnte nicht strukturiert geparst werden. Raw-Antwort als Issue hinterlegt.",
      overallRisk: "medium",
      reviewedAt: new Date().toISOString(),
    };
  }

  const issues: DraftReviewIssue[] = (parsed.issues ?? []).slice(0, 15).map((issue) => ({
    ...issue,
    id: generateIssueId(),
    status: "open" as const,
  }));

  return {
    id: generateReviewId(),
    draftSlug,
    draftTitle,
    draftType,
    reviewStatus: "in_review",
    issues,
    summary: parsed.summary ?? "Review abgeschlossen.",
    overallRisk: (parsed.overallRisk as DraftReviewResult["overallRisk"]) ?? "medium",
    reviewedAt: new Date().toISOString(),
  };
}

export async function reviewDraft(opts: {
  content: string;
  title: string;
  type: string;
  draftSlug?: string;
}): Promise<DraftReviewResult> {
  const prompt = REVIEW_PROMPT_TEMPLATE.replace("{title}", opts.title)
    .replace("{type}", opts.type)
    .replace("{content}", opts.content.slice(0, 12000));

  const result = await api.query.think(prompt, {
    mode: "tokenmax",
    queryMode: "deep_matter",
  });

  return parseReviewResponse(result.answer, opts.title, opts.type, opts.draftSlug);
}

export async function persistReviewResult(
  review: DraftReviewResult,
  brainId: string
): Promise<void> {
  if (!review.draftSlug) return;

  const slug = `copilot/draft-review/${review.id}`;
  await api.brain.createPage({
    slug,
    title: `Review: ${review.draftTitle}`,
    type: "copilot_draft_review",
    content: review.summary,
    frontmatter: {
      type: "copilot_draft_review",
      review_id: review.id,
      draft_slug: review.draftSlug,
      draft_title: review.draftTitle,
      draft_type: review.draftType,
      review_status: review.reviewStatus,
      overall_risk: review.overallRisk,
      issues: review.issues,
      reviewed_at: review.reviewedAt,
      reviewer_model: review.reviewerModel,
      brain_id: brainId,
    },
  });
}

export async function loadReview(reviewId: string): Promise<DraftReviewResult | null> {
  const slug = `copilot/draft-review/${reviewId}`;
  const page = await api.brain.getPage(slug);
  if (!page) return null;

  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    id: String(fm.review_id ?? reviewId),
    draftSlug: fm.draft_slug as string | undefined,
    draftTitle: String(fm.draft_title ?? page.title ?? ""),
    draftType: String(fm.draft_type ?? ""),
    reviewStatus: (fm.review_status as DraftReviewResult["reviewStatus"]) ?? "in_review",
    issues: (fm.issues as DraftReviewIssue[]) ?? [],
    summary: page.content ?? "",
    overallRisk: (fm.overall_risk as DraftReviewResult["overallRisk"]) ?? "medium",
    reviewedAt: String(fm.reviewed_at ?? new Date().toISOString()),
    reviewerModel: fm.reviewer_model as string | undefined,
  };
}

export async function updateIssueStatus(
  reviewId: string,
  issueId: string,
  status: ReviewIssueStatus
): Promise<void> {
  const review = await loadReview(reviewId);
  if (!review) throw new Error("Review not found");

  const updatedIssues = review.issues.map((i) => (i.id === issueId ? { ...i, status } : i));

  // Determine new review status based on issue statuses
  const allResolved = updatedIssues.every((i) => i.status !== "open");
  const hasRejected = updatedIssues.some((i) => i.status === "rejected");
  const hasAccepted = updatedIssues.some((i) => i.status === "accepted");

  let newReviewStatus = review.reviewStatus;
  if (allResolved) {
    newReviewStatus = hasRejected ? "changes_requested" : "approved";
  } else if (hasAccepted || hasRejected) {
    newReviewStatus = "in_review";
  }

  const slug = `copilot/draft-review/${reviewId}`;
  await api.brain.updatePage({
    slug,
    type: "copilot_draft_review",
    content: review.summary,
    frontmatter: {
      type: "copilot_draft_review",
      review_id: reviewId,
      draft_slug: review.draftSlug,
      draft_title: review.draftTitle,
      draft_type: review.draftType,
      review_status: newReviewStatus,
      overall_risk: review.overallRisk,
      issues: updatedIssues,
      reviewed_at: review.reviewedAt,
      reviewer_model: review.reviewerModel,
    },
  });
}

export async function listReviews(opts?: {
  draftSlug?: string;
  status?: DraftReviewResult["reviewStatus"];
}): Promise<DraftReviewResult[]> {
  const pages = await api.brain.listPages({ type: "copilot_draft_review", limit: 50 });
  let reviews = (
    pages as unknown as Array<{
      slug: string;
      frontmatter: Record<string, unknown>;
      content: string;
    }>
  ).map((p) => {
    const fm = p.frontmatter;
    return {
      id: String(fm.review_id ?? p.slug.split("/").pop() ?? ""),
      draftSlug: fm.draft_slug as string | undefined,
      draftTitle: String(fm.draft_title ?? ""),
      draftType: String(fm.draft_type ?? ""),
      reviewStatus: (fm.review_status as DraftReviewResult["reviewStatus"]) ?? "in_review",
      issues: (fm.issues as DraftReviewIssue[]) ?? [],
      summary: p.content ?? "",
      overallRisk: (fm.overall_risk as DraftReviewResult["overallRisk"]) ?? "medium",
      reviewedAt: String(fm.reviewed_at ?? new Date().toISOString()),
      reviewerModel: fm.reviewer_model as string | undefined,
    } as DraftReviewResult;
  });

  if (opts?.draftSlug) {
    reviews = reviews.filter((r) => r.draftSlug === opts.draftSlug);
  }
  if (opts?.status) {
    reviews = reviews.filter((r) => r.reviewStatus === opts.status);
  }

  reviews.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
  return reviews;
}
