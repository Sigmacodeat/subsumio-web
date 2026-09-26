import { z } from "zod";

/**
 * Body of POST /api/legal/ground. Long drafts (Schriftsätze, memos) are
 * checked too — the work is bounded by the citations (at most
 * MAX_CHECKED_CITATIONS lookups), not by the length of the text. A text
 * that was rejected here used to go through with no check at all.
 */
export const GROUND_TEXT_MAX_CHARS = 400_000;

export const groundRequestSchema = z.object({
  text: z.string().min(10).max(GROUND_TEXT_MAX_CHARS),
  /** Jurisdiction of the answer; inferred from the text when omitted. */
  jurisdiction: z.enum(["at", "de", "ch"]).optional(),
});
