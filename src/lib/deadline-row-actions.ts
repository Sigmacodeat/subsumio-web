/**
 * deadline-row-actions.ts — where a Fristen-row action (Erledigt, Freigeben,
 * Wieder öffnen, Zweitprüfung) must be written.
 *
 * The unified Fristen read model (/api/legal/fristen) mixes rows that are their
 * own page (`legal_deadline`) with rows that live INSIDE a matter page — an
 * entry of the matter's `deadlines[]` (source `legal_case`) or a timeline
 * entry (source `timeline`). For the embedded rows the row's slug is the
 * MATTER's slug: writing `{ status: "done" }` to it would close the Akte, not
 * the Frist. This module decides the target and patches only the one entry.
 */

import { embeddedDeadlineKey } from "@/lib/page-write-guards";

/** Identity of a deadline inside a matter's `deadlines[]` — the stored `id`,
 *  or title + due_date for legacy entries without an id. */
export interface EmbeddedDeadlineRef {
  id?: string;
  title?: string;
  due_date?: string;
}

export type DeadlineWriteTarget =
  | { kind: "page"; slug: string }
  | { kind: "embedded"; caseSlug: string; ref: EmbeddedDeadlineRef }
  | { kind: "none"; reason: "no_page" | "timeline" | "missing_ref" };

export interface DeadlineRowLike {
  slug?: string;
  source?: string;
  embedded?: EmbeddedDeadlineRef;
}

export function deadlineWriteTarget(row: DeadlineRowLike): DeadlineWriteTarget {
  if (!row.slug) return { kind: "none", reason: "no_page" };
  if (row.source === "legal_case") {
    return row.embedded
      ? { kind: "embedded", caseSlug: row.slug, ref: row.embedded }
      : { kind: "none", reason: "missing_ref" };
  }
  // Timeline entries are matter events, not deadlines — never write the
  // matter page from the Fristen view.
  if (row.source === "timeline") return { kind: "none", reason: "timeline" };
  // legal_deadline pages, a fristenbuch row merged with its approved page, and
  // appointment pages (whose `source` is a free-form label) are the page itself.
  return { kind: "page", slug: row.slug };
}

function refKey(ref: EmbeddedDeadlineRef): string {
  return ref.id
    ? `id:${ref.id}`
    : embeddedDeadlineKey({ title: ref.title ?? "", due_date: ref.due_date ?? "" });
}

/**
 * Returns the matter's `deadlines[]` with `patch` merged into the ONE entry
 * matching `ref` (the whole array is written back — the engine merges
 * frontmatter shallowly). `null` when no entry matches: the caller must
 * report an error instead of writing anything.
 */
export function patchEmbeddedDeadline(
  deadlines: unknown,
  ref: EmbeddedDeadlineRef,
  patch: Record<string, unknown>
): Array<Record<string, unknown>> | null {
  if (!Array.isArray(deadlines)) return null;
  const wanted = refKey(ref);
  const index = deadlines.findIndex(
    (d) =>
      !!d && typeof d === "object" && embeddedDeadlineKey(d as Record<string, unknown>) === wanted
  );
  if (index < 0) return null;
  const now = new Date().toISOString();
  return deadlines.map((d, i) =>
    i === index ? { ...(d as Record<string, unknown>), ...patch, updated_at: now } : d
  ) as Array<Record<string, unknown>>;
}
