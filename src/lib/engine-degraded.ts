/**
 * The engine answers with a stub like "(no LLM available — <provider error>)" when
 * retrieval worked but no language model could write the answer (no credits,
 * provider outage). That text is an operator diagnostic: it names providers and
 * billing URLs and must never reach a lawyer's screen.
 */
const DEGRADED_ANSWER_RE = /^\s*\(no LLM available\b/i;

export const ASSISTANT_UNAVAILABLE_MESSAGE =
  "Der Assistent kann gerade keine Antwort formulieren. Ihre Unterlagen wurden durchsucht; bitte versuchen Sie es in einigen Minuten erneut. Besteht das Problem weiter, wenden Sie sich an den Support.";

export function isDegradedAnswer(text: string | null | undefined): boolean {
  return typeof text === "string" && DEGRADED_ANSWER_RE.test(text);
}

/** Replaces an engine diagnostic stub with the lawyer-facing message. */
export function lawyerFacingAnswer(text: string): string {
  return isDegradedAnswer(text) ? ASSISTANT_UNAVAILABLE_MESSAGE : text;
}
