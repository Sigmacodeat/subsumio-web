export interface SseConnection {
  brainId: string;
  /** The signed-in user of this stream (for events meant for one person). */
  userId?: string;
  /**
   * Firm role of the stream's user. Only firm staff receive firm-wide events;
   * client accounts (and anything unknown) get none — fail-closed.
   */
  role: string | null | undefined;
  /**
   * Whether the stream's user may see a page (matter scope, ethical wall,
   * grants). Events that reference pages are delivered only when every
   * referenced page is visible; without a checker none are delivered.
   */
  canSeePage?: (slug: string) => Promise<boolean>;
  send: (event: string, data: unknown) => void;
  /** Ends the stream (the HTTP response); set by the SSE route. */
  close?: () => void;
}

const sseConnections = new Set<SseConnection>();

export function addSseConnection(conn: SseConnection): void {
  sseConnections.add(conn);
}

export function removeSseConnection(conn: SseConnection): void {
  sseConnections.delete(conn);
}

/**
 * Ends every open stream of one person in this process — called when they
 * are removed from the firm, deactivated or get another role, so no event
 * reaches them after the change. Streams on other instances end at their
 * next periodic check (see the SSE route). Returns how many were closed.
 */
export function closeSseConnectionsForUser(userId: string): number {
  let closed = 0;
  for (const conn of [...sseConnections]) {
    if (conn.userId !== userId) continue;
    sseConnections.delete(conn);
    try {
      conn.close?.();
    } catch {
      // already closed
    }
    closed++;
  }
  return closed;
}

const FIRM_STAFF_ROLES = new Set(["admin", "lawyer", "assistant"]);

/** Payload keys that carry a single page slug (matter, document, contact, …). */
const PAGE_REF_KEYS = new Set([
  "slug",
  "caseSlug",
  "case_slug",
  "documentSlug",
  "document_slug",
  "contactSlug",
  "contact_slug",
  "contract_slug",
  "receiptSlug",
  "intakeSlug",
  "convertedCaseSlug",
  "documentRequestSlug",
  "parent_slug",
]);
/** Payload keys that carry a list of page slugs (strings or `{ slug }`). */
const PAGE_LIST_KEYS = new Set(["caseSlugs", "allCaseSlugs", "case_slugs"]);
/** Nested objects that are searched for references too. */
const NESTED_KEYS = new Set(["data", "frontmatter", "payload"]);
const CASE_PATH = /^\/dashboard\/cases\/(.+?)\/?$/;

/**
 * Every page slug an event payload refers to. Unknown shapes contribute
 * nothing, so senders must use the conventional keys above for matter data.
 */
export function pageRefsOf(data: unknown, depth = 0): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data) || depth > 3) return [];
  const refs = new Set<string>();
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (PAGE_REF_KEYS.has(key) && typeof value === "string" && value) refs.add(value);
    else if (PAGE_LIST_KEYS.has(key) && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item) refs.add(item);
        else if (item && typeof item === "object") {
          const slug = (item as { slug?: unknown }).slug;
          if (typeof slug === "string" && slug) refs.add(slug);
        }
      }
    } else if (key === "page" && typeof value === "string") {
      // Presence: the dashboard path of a matter names the matter.
      const m = CASE_PATH.exec(value.split(/[?#]/)[0]);
      if (m && m[1] !== "new") refs.add(decodeURIComponent(m[1]));
    } else if (NESTED_KEYS.has(key)) {
      for (const r of pageRefsOf(value, depth + 1)) refs.add(r);
    }
  }
  return [...refs];
}

async function deliverIfVisible(
  conn: SseConnection,
  refs: string[],
  event: string,
  data: unknown
): Promise<void> {
  const check = conn.canSeePage;
  if (!check) return;
  try {
    const visible = await Promise.all(refs.map((slug) => check(slug)));
    if (visible.every((v) => v === true)) conn.send(event, data);
  } catch {
    // Access unknown → not delivered.
  }
}

/**
 * Firm-wide event. Delivered only to firm staff of this brain; events that
 * reference pages only to those who may see every referenced page.
 */
export function broadcastSseEvent(brainId: string, event: string, data: unknown): void {
  const refs = pageRefsOf(data);
  for (const conn of sseConnections) {
    if (conn.brainId !== brainId) continue;
    if (!conn.role || !FIRM_STAFF_ROLES.has(conn.role)) continue;
    if (refs.length === 0) conn.send(event, data);
    else void deliverIfVisible(conn, refs, event, data);
  }
}

/** Send an event only to one user's open streams in this brain. */
export function broadcastSseEventToUser(
  brainId: string,
  userId: string,
  event: string,
  data: unknown
): void {
  const refs = pageRefsOf(data);
  for (const conn of sseConnections) {
    if (conn.brainId !== brainId || conn.userId !== userId) continue;
    if (refs.length === 0) conn.send(event, data);
    else void deliverIfVisible(conn, refs, event, data);
  }
}

export function getSseConnectionCount(): number {
  return sseConnections.size;
}

// ── Autonomous Event Broadcast Helpers ─────────────────────────────────────

export function broadcastDeadlineAlert(
  brainId: string,
  data: {
    caseSlug: string;
    deadlineId: string;
    urgency: "urgent" | "warning" | "normal";
    dueDate: string;
    title?: string;
    /** Unreviewed AI suggestion — the dashboard labels it as such. */
    unreviewed?: boolean;
    label?: string;
  }
): void {
  broadcastSseEvent(brainId, "deadline.alert", data);
}

export function broadcastInboxTriage(
  brainId: string,
  data: {
    messageId: string;
    subject: string;
    urgency: "urgent" | "normal" | "low";
    suggestedAction: string;
  }
): void {
  broadcastSseEvent(brainId, "inbox.triage", data);
}

export function broadcastDocumentUploaded(
  brainId: string,
  data: {
    caseSlug: string;
    documentId: string;
    filename: string;
    fileType: string;
  }
): void {
  broadcastSseEvent(brainId, "document.uploaded", data);
}

export function broadcastPortalVisit(
  brainId: string,
  data: {
    caseSlug: string;
    documentSlug?: string;
    action?: "view" | "sign" | "upload";
    visitedAt: string;
  }
): void {
  broadcastSseEvent(brainId, "portal.visit", data);
}

export function broadcastAutonomousTaskQueued(
  brainId: string,
  data: {
    taskId: string;
    taskType: string;
    priority: "urgent" | "normal" | "low";
    caseSlug?: string;
  }
): void {
  broadcastSseEvent(brainId, "autonomous.task_queued", data);
}

export function broadcastAutonomousTaskCompleted(
  brainId: string,
  data: {
    taskId: string;
    status: "completed" | "failed" | "requires_approval";
    result?: Record<string, unknown>;
  }
): void {
  broadcastSseEvent(brainId, "autonomous.task_completed", data);
}

// ── User Activity & Time Tracking Broadcast Helpers ───────────────────────

export function broadcastUserActivity(
  brainId: string,
  data: {
    userId: string;
    activityType: string;
    caseSlug?: string;
    description: string;
  }
): void {
  broadcastSseEvent(brainId, `user.activity.${data.activityType}`, data);
}

export function broadcastTimeEntryCreated(
  brainId: string,
  data: {
    entryId: string;
    userId: string;
    description: string;
    minutes: number;
  }
): void {
  broadcastSseEvent(brainId, "time.entry.created", data);
}

export function broadcastTimeEntryUpdated(
  brainId: string,
  data: {
    entryId: string;
    userId: string;
  }
): void {
  broadcastSseEvent(brainId, "time.entry.updated", data);
}

export function broadcastTimeEntryDeleted(
  brainId: string,
  data: {
    entryId: string;
    userId: string;
  }
): void {
  broadcastSseEvent(brainId, "time.entry.deleted", data);
}

export function broadcastTimeActivityStarted(
  brainId: string,
  data: {
    userId: string;
    activityType: string;
    description: string;
  }
): void {
  broadcastSseEvent(brainId, "time.activity.started", data);
}

export function broadcastTimeActivityStopped(
  brainId: string,
  data: {
    userId: string;
    entryId?: string;
  }
): void {
  broadcastSseEvent(brainId, "time.activity.stopped", data);
}
