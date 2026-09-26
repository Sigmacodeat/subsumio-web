/**
 * The last step for every AI-generated WhatsApp answer (KI5-02).
 *
 * WhatsApp has no CitationPanel, so the checks the browser shows next to an
 * answer go into the message text instead:
 *   - the corpus grounding of the cited norms, decisions and literature
 *     (same groundAnswerCitations the browser citation gate runs),
 *   - a note when the engine's source search failed,
 *   - the KI label (Art. 50 KI-VO) with "anwaltlich zu prüfen".
 *
 * The body is cut before the notes are added, so a long answer can never
 * push the notes out of the message.
 */

import { groundAnswerCitations } from "@/lib/citation-gate";

/** WhatsApp text messages are capped well below the platform limit. */
export const WHATSAPP_ANSWER_MAX_CHARS = 3500;

export const WHATSAPP_AI_NOTICE =
  "🤖 KI-generierte Antwort (Art. 50 KI-VO) — bitte anwaltlich prüfen, keine Rechtsberatung.";

export const WHATSAPP_RETRIEVAL_FAILED_NOTE =
  "⚠️ Die Suche in Akten und Rechtsquellen war teilweise nicht erreichbar — diese Antwort ist nicht durch Quellen belegt.";

export const WHATSAPP_GROUNDING_UNAVAILABLE_NOTE =
  "⚠️ Die Zitate konnten nicht automatisch geprüft werden — bitte alle Fundstellen selbst prüfen.";

function unverifiedNote(count: number): string {
  return `⚠️ ${count} Zitat(e) nicht verifiziert — bitte in Subsumio im Browser prüfen.`;
}

export interface FinalizeOptions {
  /** Engine warning codes of this answer (from the think stream). */
  warnings?: readonly string[];
  /** Extra line placed before the KI label (e.g. the legal-research note). */
  extraNote?: string;
}

export async function finalizeWhatsAppAiAnswer(
  answer: string,
  opts: FinalizeOptions = {}
): Promise<string> {
  const notes: string[] = [];

  // The engine's final_answer already starts with its own note when the
  // search failed; add ours only when that text is not in the answer.
  const retrievalFailed = (opts.warnings ?? []).some((w) => w.startsWith("RETRIEVAL_FAILED"));
  if (retrievalFailed && !/nicht erreichbar/i.test(answer)) {
    notes.push(WHATSAPP_RETRIEVAL_FAILED_NOTE);
  }

  try {
    const grounding = await groundAnswerCitations(answer);
    if (grounding.has_unverified) notes.push(unverifiedNote(grounding.citations_unverified));
  } catch {
    // Fail-closed: a check that did not run must not look like a passed one.
    notes.push(WHATSAPP_GROUNDING_UNAVAILABLE_NOTE);
  }

  if (opts.extraNote) notes.push(opts.extraNote);
  notes.push(WHATSAPP_AI_NOTICE);

  const footer = `\n\n${notes.join("\n")}`;
  const room = Math.max(0, WHATSAPP_ANSWER_MAX_CHARS - footer.length);
  const body = answer.length > room ? `${answer.slice(0, Math.max(0, room - 1))}…` : answer;
  return `${body}${footer}`;
}
