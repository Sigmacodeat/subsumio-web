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
