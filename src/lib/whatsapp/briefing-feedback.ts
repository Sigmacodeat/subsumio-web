/**
 * Briefing feedback capture (P1-SECR-006).
 *
 * Records user feedback on proactive briefings ("was this useful?")
 * into the audit log so computeSecretaryMetrics can pick it up.
 *
 * The capture is intentionally simple: a thumbs up/down plus optional
 * free-text comment, tied to the briefing audit entry by timestamp.
 */

import { logAudit } from "@/lib/audit";

export interface BriefingFeedbackInput {
  brain_id: string;
  org_id: string;
  user_id: string;
  /** Was the briefing useful? */
  useful: boolean;
  /** Optional comment. */
  comment?: string;
  /** Optional reference to the briefing message. */
  briefing_ref?: string;
  /** Timestamp of the briefing that is being rated. */
  briefing_at?: string;
}

export interface BriefingFeedbackResult {
  recorded: boolean;
  feedback_id: string;
}

/**
 * Record a briefing feedback event in the audit log.
 * The event is picked up by computeSecretaryMetrics via `whatsapp.briefing_feedback`.
 */
export async function recordBriefingFeedback(
  input: BriefingFeedbackInput
): Promise<BriefingFeedbackResult> {
  const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await logAudit("whatsapp.briefing_feedback", "secretary", {
    entityId: feedbackId,
    details: {
      useful: input.useful,
      comment: input.comment ?? null,
      briefing_ref: input.briefing_ref ?? null,
      briefing_at: input.briefing_at ?? null,
      brain_id: input.brain_id,
      org_id: input.org_id,
      user_id: input.user_id,
    },
  });

  return { recorded: true, feedback_id: feedbackId };
}

/**
 * Parse a WhatsApp reply to determine if it's feedback.
 * Recognized patterns: "👍", "👎", "ja", "nein", "nützlich", "nutzlos",
 * "hilfreich", "nicht hilfreich", "useful", "not useful"
 */
export function parseFeedbackFromReply(text: string): {
  isFeedback: boolean;
  useful: boolean | null;
} {
  const lower = text.trim().toLowerCase();

  // Negative patterns are checked first because some contain a negated
  // positive token (e.g. "nicht hilfreich" contains "hilfreich", and
  // "nein, nicht nützlich" contains "nützlich").
  const negativePatterns = [
    "👎",
    "nein",
    "nutzlos",
    "nicht hilfreich",
    "nicht nützlich",
    "nicht nutzlich",
    "not useful",
    "unhelpful",
    "bad",
  ];
  const positivePatterns = [
    "👍",
    "ja",
    "nützlich",
    "nutzlich",
    "hilfreich",
    "useful",
    "good",
    "danke",
  ];

  for (const p of negativePatterns) {
    if (lower.includes(p)) {
      return { isFeedback: true, useful: false };
    }
  }

  for (const p of positivePatterns) {
    if (lower.includes(p)) {
      return { isFeedback: true, useful: true };
    }
  }

  return { isFeedback: false, useful: null };
}
