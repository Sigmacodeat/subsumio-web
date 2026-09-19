/**
 * The think route streams the model's FIRST draft token by token. The
 * citation guardrail and cross-verify run afterwards and may regenerate the
 * answer. Without this, the lawyer kept reading the flagged draft while the
 * citations/confidence in the final event described the regenerated text.
 *
 * `finalAnswerEvent` returns the fields for the final SSE event: when the
 * verified answer differs from what was streamed, the client must replace
 * the displayed text with `final_answer`.
 */

const STILL_FLAGGED_NOTE =
  "⚠️ Hinweis: Einzelne Zitate konnten auch nach erneuter Prüfung nicht im " +
  "Quellmaterial belegt werden. Bitte die markierten Fundstellen anwaltlich prüfen.\n\n";

export interface FinalAnswerFields {
  final_answer?: string;
  answer_revised?: true;
  revision_reason?: "citation_guardrail" | "cross_verify" | "retrieval_failed" | "revised";
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const RETRIEVAL_FAILED_NOTE =
  "⚠️ Hinweis: Die Suche in Akten und Rechtsquellen war bei dieser Anfrage nicht " +
  "erreichbar. Die folgende Antwort ist daher NICHT durch Quellen belegt — bitte " +
  "später erneut fragen oder anwaltlich prüfen.\n\n";

export function finalAnswerEvent(
  streamed: string,
  verified: string,
  warnings: readonly string[]
): FinalAnswerFields {
  const stillFlagged = warnings.some((w) => w.startsWith("GUARDRAIL_REGENERATION_STILL_FLAGGED"));
  const retrievalFailed = warnings.some((w) => w.startsWith("RETRIEVAL_FAILED"));
  const target =
    (retrievalFailed ? RETRIEVAL_FAILED_NOTE : "") +
    (stillFlagged ? STILL_FLAGGED_NOTE : "") +
    verified;
  if (!verified || normalise(target) === normalise(streamed)) return {};
  // Cross-verify runs after the guardrail, so its regeneration is the last word.
  const reason = warnings.includes("CROSS_VERIFY_REGENERATION_DONE")
    ? "cross_verify"
    : warnings.some((w) => w.startsWith("GUARDRAIL_REGENERATION"))
      ? "citation_guardrail"
      : retrievalFailed
        ? "retrieval_failed"
        : "revised";
  return { final_answer: target, answer_revised: true, revision_reason: reason };
}
