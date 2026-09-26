/**
 * Personal calendar mirrors (`calendar_event` pages pulled from one lawyer's
 * own Outlook, stamped with `owner_user_id`) belong to that lawyer. The
 * generic page reads hand them only to their owner; everyone else sees the
 * firm's own appointments.
 */

function pageOwner(page: unknown): string | null {
  if (!page || typeof page !== "object") return null;
  const p = page as { type?: unknown; frontmatter?: Record<string, unknown> | null };
  const fm = p.frontmatter ?? {};
  const type = typeof p.type === "string" && p.type ? p.type : fm.type;
  if (type !== "calendar_event") return null;
  return typeof fm.owner_user_id === "string" && fm.owner_user_id ? fm.owner_user_id : null;
}

/** True when `page` is someone else's personal calendar mirror. */
export function isForeignPersonalEvent(page: unknown, userId: string | undefined): boolean {
  const owner = pageOwner(page);
  return owner !== null && owner !== userId;
}

/** Drops other users' personal calendar mirrors from a page list (non-arrays pass through). */
export function hideForeignPersonalEvents<T>(value: T, userId: string | undefined): T {
  if (!Array.isArray(value)) return value;
  return value.filter((p) => !isForeignPersonalEvent(p, userId)) as unknown as T;
}

/** Graph `sensitivity` values whose details must not be copied into the firm brain. */
export function isPrivateSensitivity(sensitivity: unknown): boolean {
  return sensitivity === "private" || sensitivity === "confidential";
}

/** Slug prefix of personal Outlook mirrors (graph-user-sync.ts). */
const PERSONAL_MIRROR_PREFIX = "calendar/outlook/";

function isCalendarHitCandidate(hit: unknown): boolean {
  if (!hit || typeof hit !== "object") return false;
  const h = hit as { type?: unknown; slug?: unknown };
  return (
    h.type === "calendar_event" ||
    (typeof h.slug === "string" && h.slug.startsWith(PERSONAL_MIRROR_PREFIX))
  );
}

/**
 * Search hits carry only slug/type, not the owner. Every calendar hit is
 * therefore checked against its page: someone else's personal mirror is
 * dropped, and so is a hit whose page cannot be read (fail-closed). Other
 * hits pass untouched and in order. Used by every search surface (search
 * API, command palette, Copilot) so private appointments of colleagues never
 * show up there.
 */
export async function hideForeignPersonalEventHits<T>(
  hits: T[],
  userId: string | undefined,
  loadPage: (slug: string) => Promise<unknown | null>
): Promise<T[]> {
  if (!Array.isArray(hits)) return hits;
  const slugs = new Set<string>();
  for (const h of hits) {
    if (isCalendarHitCandidate(h)) slugs.add(String((h as { slug?: unknown }).slug ?? ""));
  }
  if (slugs.size === 0) return hits;
  const allowed = new Set<string>();
  await Promise.all(
    [...slugs].map(async (slug) => {
      if (!slug) return;
      try {
        const page = await loadPage(slug);
        if (page && !isForeignPersonalEvent(page, userId)) allowed.add(slug);
      } catch {
        // unreadable → treated as not visible
      }
    })
  );
  return hits.filter(
    (h) => !isCalendarHitCandidate(h) || allowed.has(String((h as { slug?: unknown }).slug ?? ""))
  );
}
