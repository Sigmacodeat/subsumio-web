/**
 * Firm-side review of client uploads for a document request. A portal upload
 * only marks an item as SUBMITTED; it counts as received once someone in the
 * firm has checked the file and confirmed it here. Pure — used by the
 * dashboard (client component) and tested on its own.
 */

export interface ReviewableRequestItem {
  key: string;
  label: string;
  required: boolean;
  received_document_slug?: string;
  submitted_document_slug?: string;
  submitted_at?: string;
}

export type ReviewableRequestStatus =
  | "draft"
  | "sent"
  | "partially_fulfilled"
  | "fulfilled"
  | "expired";

/** An item with a client upload that nobody in the firm has confirmed yet. */
export function isAwaitingReview(item: ReviewableRequestItem): boolean {
  return Boolean(item.submitted_document_slug) && !item.received_document_slug;
}

/** Request status from its items: fulfilled once every required item is received. */
export function statusFromItems(
  items: ReviewableRequestItem[],
  current: ReviewableRequestStatus
): ReviewableRequestStatus {
  if (current === "draft" || current === "expired") return current;
  const required = items.filter((item) => item.required);
  const anyReceived = items.some((item) => Boolean(item.received_document_slug));
  if (required.length > 0 && required.every((item) => Boolean(item.received_document_slug))) {
    return "fulfilled";
  }
  return anyReceived ? "partially_fulfilled" : current;
}

/**
 * Accept (confirm the submitted file as received) or reject (clear the
 * submission so the client can upload again) one item.
 */
export function reviewSubmittedItem(
  items: ReviewableRequestItem[],
  key: string,
  decision: "accept" | "reject",
  current: ReviewableRequestStatus
): { items: ReviewableRequestItem[]; status: ReviewableRequestStatus } | null {
  const index = items.findIndex((item) => item.key === key);
  if (index < 0 || !isAwaitingReview(items[index])) return null;
  const next = [...items];
  const item = next[index];
  next[index] =
    decision === "accept"
      ? { ...item, received_document_slug: item.submitted_document_slug }
      : { ...item, submitted_document_slug: undefined, submitted_at: undefined };
  return { items: next, status: statusFromItems(next, current) };
}
