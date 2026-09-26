/**
 * Notes captured on the phone (quick note, "send to Subsumio"). With a
 * matter chosen they are matter notes — type `legal_note` with `case_slug`,
 * exactly what the matter's notes tab lists; without one they stay plain
 * notes in the brain.
 */
export interface MobileNoteInput {
  text: string;
  /** Slug of the chosen matter, or "" for none. */
  caseSlug: string;
  title: string;
  slug: string;
  source: "mobile_quick_note" | "mobile_share";
  tags?: string[];
  author?: string;
  at?: Date;
}

export function buildMobileNotePage(input: MobileNoteInput) {
  const caseSlug = input.caseSlug.trim();
  const createdAt = (input.at ?? new Date()).toISOString();
  const type = caseSlug ? "legal_note" : "note";
  return {
    slug: input.slug,
    title: input.title,
    content: input.text,
    type,
    frontmatter: {
      type,
      created_at: createdAt,
      ...(caseSlug ? { case_slug: caseSlug, pinned: false } : {}),
      ...(input.author ? { author: input.author } : {}),
      ...(input.tags && input.tags.length ? { tags: input.tags } : {}),
      source: input.source,
    },
  };
}
