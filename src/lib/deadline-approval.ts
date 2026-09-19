/**
 * Freigabe von Fristen, die nur im Fristen-Register stehen (z. B. KI-Fristenkalender aus
 * der Dokumentverarbeitung: Quelle „fristenbuch“, ohne eigene Seite). Bei der Freigabe
 * entsteht eine eigene `legal_deadline`-Seite; das Register gibt ihr Vorrang, sie ersetzt
 * damit die Zeile.
 */

/** Kleinbuchstaben, Umlaute ausgeschrieben, alles andere zu Bindestrichen. */
export function slugPart(value: string, maxLength = 48): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/**
 * `legal/deadlines/<akte-tail>-<datum>-<titel-slug>` — deterministisch, damit eine
 * doppelte Freigabe keine zweite Seite anlegt.
 */
export function buildApprovedDeadlineSlug(input: {
  caseSlug?: string;
  date: string;
  title: string;
}): string {
  const caseTail = slugPart(input.caseSlug?.split("/").filter(Boolean).pop() ?? "") || "ohne-akte";
  const date =
    /^\d{4}-\d{2}-\d{2}/.exec(input.date)?.[0] ?? (slugPart(input.date, 10) || "ohne-datum");
  const title = slugPart(input.title) || "frist";
  return `legal/deadlines/${caseTail}-${date}-${title}`;
}

export interface ApprovedDeadlineInput {
  caseSlug?: string;
  title: string;
  date: string;
  law?: string;
  vorfristDate?: string;
  reviewedBy: string;
  now?: Date;
}

/** Seite für `api.brain.createPage`, die eine freigegebene Register-Frist festschreibt. */
export function buildApprovedDeadlinePage(input: ApprovedDeadlineInput) {
  const reviewedAt = (input.now ?? new Date()).toISOString();
  return {
    slug: buildApprovedDeadlineSlug(input),
    title: input.title,
    type: "legal_deadline",
    content: input.title,
    frontmatter: {
      type: "legal_deadline",
      case_slug: input.caseSlug || undefined,
      title: input.title,
      due_date: input.date,
      law: input.law || undefined,
      vorfrist_date: input.vorfristDate || undefined,
      status: "pending",
      source: "ai_deadline_calendar",
      review_status: "approved",
      reviewed_by: input.reviewedBy,
      reviewed_at: reviewedAt,
    },
  };
}
