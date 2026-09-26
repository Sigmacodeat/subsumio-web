/**
 * What the portal assistant gets to read: the documents released to the
 * client, newest first, the ones matching the question ahead, within a
 * character budget — and never anything that could close the data block.
 */
import { isPortalVisibleDocument } from "@/lib/portal-view";
import type { DocumentEntry } from "@/lib/legal-types";

/** Released documents read per question (engine fetches). */
export const PORTAL_CHAT_MAX_DOCUMENTS = 25;
/** Characters of document text in the prompt, over all documents. */
export const PORTAL_CHAT_CONTEXT_BUDGET = 24_000;
/** Characters of a single document, so one long file cannot fill the budget. */
export const PORTAL_CHAT_PER_DOCUMENT = 8_000;

export interface PortalChatDocument {
  slug: string;
  title: string;
  content: string;
  type: string;
}

/**
 * Slugs of the released documents to read, newest first (by upload date).
 * External links and file paths are skipped — only brain pages are read.
 */
export function portalChatDocumentSlugs(
  documents: DocumentEntry[] | undefined,
  max = PORTAL_CHAT_MAX_DOCUMENTS
): string[] {
  const released = (documents ?? [])
    .filter(isPortalVisibleDocument)
    .map((doc, index) => ({ doc, index }))
    .sort((a, b) => {
      const ta = Date.parse(a.doc.uploadedAt ?? "") || 0;
      const tb = Date.parse(b.doc.uploadedAt ?? "") || 0;
      // Newest first; without dates the later list position is the newer one.
      return tb - ta || b.index - a.index;
    });
  const out: string[] = [];
  for (const { doc } of released) {
    const slug = doc.slug || doc.url;
    if (!slug || slug.startsWith("/") || /^https?:/i.test(slug)) continue;
    if (!out.includes(slug)) out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Neutralises the data-block markers: document text (including the client's
 * own uploads) must never be able to end `<daten>` and speak as instructions.
 */
export function maskDataMarkers(text: string): string {
  return text.replace(/<\s*\/?\s*daten\s*>/gi, (m) => m.replace(/</g, "‹").replace(/>/g, "›"));
}

function questionTerms(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9ß]+/)
        .filter((t) => t.length >= 4)
    ),
  ];
}

function relevance(doc: PortalChatDocument, terms: string[]): number {
  if (terms.length === 0) return 0;
  const hay = `${doc.title}\n${doc.content}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const title = doc.title.toLowerCase();
  return terms.reduce(
    (sum, term) => sum + (hay.includes(term) ? 1 : 0) + (title.includes(term) ? 2 : 0),
    0
  );
}

/**
 * The document block of the prompt. `documents` arrive newest first; the
 * question's matches move ahead (ties keep the newest first), then text is
 * added until the budget is used.
 */
export function buildPortalDocumentContext(
  documents: PortalChatDocument[],
  question: string,
  budget = PORTAL_CHAT_CONTEXT_BUDGET
): string {
  const terms = questionTerms(question);
  const ranked = documents
    .map((doc, index) => ({ doc, index, score: relevance(doc, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const parts: string[] = [];
  let left = budget;
  for (const { doc } of ranked) {
    if (left <= 200) break;
    const text = maskDataMarkers(doc.content).slice(0, Math.min(PORTAL_CHAT_PER_DOCUMENT, left));
    const header = `--- ${maskDataMarkers(doc.title)} (${doc.type}) ---`;
    parts.push(`${header}\n${text}`);
    left -= text.length;
  }
  return parts.join("\n\n");
}
