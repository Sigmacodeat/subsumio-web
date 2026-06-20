/**
 * Notification Data Model — P1-NOTIF-001
 * =======================================
 * Typisiertes, tenant-isoliertes Notification-Datenmodell.
 *
 * Bestehend aus:
 *   - NotificationRecord: Datenbank-Schema (subsumio_notifications)
 *   - NotificationType: Typisierte Event-Kategorien
 *   - NotificationPriority: Dringlichkeitsstufen
 *   - NotificationStore: CRUD-Operations für Notifications
 *   - API-Route-Härtung: createHandler mit RBAC, Rate-Limiting, Audit
 *
 * Kopplung:
 *   - whatsapp-event-bus.ts → NotificationEventBus publish → NotificationStore
 *   - comments.ts → persistNotification → NotificationStore
 *   - Dashboard Topbar → listNotifications → NotificationStore
 */

// ── Types ─────────────────────────────────────────────────────────────

export type NotificationType =
  | "mention"           // @-Erwähnung in Kommentar
  | "deadline_alert"    // Fristenwarnung
  | "deadline_overdue"  // Frist abgelaufen
  | "approval_request"  // Freigabe angefordert
  | "approval_decision" // Freigabe entschieden
  | "conflict_alert"    // Mandantenkonflikt
  | "new_document"      // Neues Dokument
  | "case_update"       // Akten-Update
  | "client_message"    // Mandantennachricht
  | "system"            // System-Benachrichtigung
  | "whatsapp_inbound"  // WhatsApp-Nachricht empfangen
  | "fristen_briefing"; // Tagesbriefing

export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationChannel = "in_app" | "whatsapp" | "email" | "push";

export interface NotificationRecord {
  id: string;
  user_id: string;
  brain_id: string;
  org_id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
  /** Akten-Referenz (optional) */
  case_slug?: string;
  /** Action-Referenz für Approvals (optional) */
  action_slug?: string;
  /** Channel über den die Notification zugestellt wurde */
  channels: NotificationChannel[];
  /** Ob die Notification archiviert wurde */
  archived: boolean;
}

export interface NotificationData {
  [key: string]: unknown;
  /** Kommentar-ID bei mention-Notifications */
  commentId?: string;
  /** Autor-Name bei mention-Notifications */
  authorName?: string;
  /** Page-Slug der verknüpften Seite */
  parentSlug?: string;
  /** Deadline-Datum bei Frist-Notifications */
  deadlineDate?: string;
  /** Verbleibende Tage bei Frist-Notifications */
  daysRemaining?: number;
  /** Action-Type bei Approval-Notifications */
  actionType?: string;
  /** Decision bei Approval-Notifications */
  decision?: "approved" | "rejected";
  /** Reject-Reason bei Approval-Notifications */
  rejectReason?: string;
  /** Dokument-Titel bei new_document */
  documentTitle?: string;
  /** Dokument-Typ bei new_document */
  documentType?: string;
  /** Konflikt-Beschreibung bei conflict_alert */
  conflictDescription?: string;
  /** WhatsApp-From-Number bei whatsapp_inbound */
  whatsappFrom?: string;
  /** WhatsApp-Message-Body bei whatsapp_inbound */
  whatsappMessage?: string;
}

// ── Notification Store ────────────────────────────────────────────────

export interface NotificationStore {
  create(notification: NotificationRecord): Promise<NotificationRecord>;
  getById(id: string): Promise<NotificationRecord | null>;
  list(opts: ListNotificationsOpts): Promise<NotificationRecord[]>;
  markRead(id: string): Promise<boolean>;
  markAllRead(userId: string, brainId: string): Promise<number>;
  archive(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  getUnreadCount(userId: string, brainId: string): Promise<number>;
  getStats(userId: string, brainId: string): Promise<NotificationStats>;
}

export interface ListNotificationsOpts {
  user_id: string;
  brain_id: string;
  unread_only?: boolean;
  archived?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  limit?: number;
  offset?: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  oldest_unread: string | null;
  newest: string | null;
}

// ── In-Memory Implementation ──────────────────────────────────────────

export class InMemoryNotificationStore implements NotificationStore {
  private notifications: Map<string, NotificationRecord> = new Map();

  async create(notification: NotificationRecord): Promise<NotificationRecord> {
    this.notifications.set(notification.id, { ...notification });
    return notification;
  }

  async getById(id: string): Promise<NotificationRecord | null> {
    return this.notifications.get(id) ?? null;
  }

  async list(opts: ListNotificationsOpts): Promise<NotificationRecord[]> {
    let results = [...this.notifications.values()].filter(
      (n) => n.user_id === opts.user_id && n.brain_id === opts.brain_id,
    );

    if (opts.unread_only) {
      results = results.filter((n) => n.read_at === null);
    }
    if (opts.archived === true) {
      results = results.filter((n) => n.archived);
    } else if (opts.archived === false) {
      results = results.filter((n) => !n.archived);
    }
    if (opts.type) {
      results = results.filter((n) => n.type === opts.type);
    }
    if (opts.priority) {
      results = results.filter((n) => n.priority === opts.priority);
    }

    results.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  async markRead(id: string): Promise<boolean> {
    const notif = this.notifications.get(id);
    if (!notif) return false;
    notif.read_at = new Date().toISOString();
    return true;
  }

  async markAllRead(userId: string, brainId: string): Promise<number> {
    let count = 0;
    for (const notif of this.notifications.values()) {
      if (notif.user_id === userId && notif.brain_id === brainId && notif.read_at === null) {
        notif.read_at = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  async archive(id: string): Promise<boolean> {
    const notif = this.notifications.get(id);
    if (!notif) return false;
    notif.archived = true;
    return true;
  }

  async delete(id: string): Promise<boolean> {
    return this.notifications.delete(id);
  }

  async getUnreadCount(userId: string, brainId: string): Promise<number> {
    return [...this.notifications.values()].filter(
      (n) => n.user_id === userId && n.brain_id === brainId && n.read_at === null && !n.archived,
    ).length;
  }

  async getStats(userId: string, brainId: string): Promise<NotificationStats> {
    const userNotifs = [...this.notifications.values()].filter(
      (n) => n.user_id === userId && n.brain_id === brainId,
    );

    const unread = userNotifs.filter((n) => n.read_at === null && !n.archived);
    const read = userNotifs.filter((n) => n.read_at !== null);
    const archived = userNotifs.filter((n) => n.archived);

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const n of userNotifs) {
      byType[n.type] = (byType[n.type] ?? 0) + 1;
      byPriority[n.priority] = (byPriority[n.priority] ?? 0) + 1;
    }

    const unreadSorted = unread.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const allSorted = userNotifs.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return {
      total: userNotifs.length,
      unread: unread.length,
      read: read.length,
      archived: archived.length,
      by_type: byType,
      by_priority: byPriority,
      oldest_unread: unreadSorted[0]?.created_at ?? null,
      newest: allSorted[0]?.created_at ?? null,
    };
  }
}

// ── Factory ───────────────────────────────────────────────────────────

export function createNotificationRecord(params: {
  user_id: string;
  brain_id: string;
  org_id: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  body: string;
  data?: NotificationData;
  case_slug?: string;
  action_slug?: string;
  channels?: NotificationChannel[];
}): NotificationRecord {
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: params.user_id,
    brain_id: params.brain_id,
    org_id: params.org_id,
    type: params.type,
    priority: params.priority ?? "normal",
    title: params.title,
    body: params.body,
    data: params.data ?? {},
    read_at: null,
    created_at: new Date().toISOString(),
    case_slug: params.case_slug,
    action_slug: params.action_slug,
    channels: params.channels ?? ["in_app"],
    archived: false,
  };
}

// ── Type Labels ───────────────────────────────────────────────────────

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  mention: "Erwähnung",
  deadline_alert: "Fristenwarnung",
  deadline_overdue: "Frist abgelaufen",
  approval_request: "Freigabe angefordert",
  approval_decision: "Freigabe entschieden",
  conflict_alert: "Mandantenkonflikt",
  new_document: "Neues Dokument",
  case_update: "Akten-Update",
  client_message: "Mandantennachricht",
  system: "System",
  whatsapp_inbound: "WhatsApp-Nachricht",
  fristen_briefing: "Tagesbriefing",
};

export const NOTIFICATION_PRIORITY_LABELS: Record<NotificationPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};

export const NOTIFICATION_PRIORITY_ORDER: Record<NotificationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ── Validation ────────────────────────────────────────────────────────

export interface NotificationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateNotificationRecord(record: NotificationRecord): NotificationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!record.id) errors.push("ID is required");
  if (!record.user_id) errors.push("user_id is required");
  if (!record.brain_id) errors.push("brain_id is required");
  if (!record.org_id) errors.push("org_id is required");
  if (!record.type) errors.push("type is required");
  if (!record.title) errors.push("title is required");
  if (!record.created_at) errors.push("created_at is required");

  if (record.priority === "urgent" && record.type !== "deadline_overdue" && record.type !== "conflict_alert") {
    warnings.push("Urgent priority is typically reserved for overdue deadlines and conflict alerts");
  }

  if (record.channels.length === 0) {
    warnings.push("No channels specified — notification may not be delivered");
  }

  if (record.type === "approval_request" && !record.action_slug) {
    errors.push("Approval request notifications must have an action_slug");
  }

  if (record.type === "deadline_alert" && !record.data.deadlineDate) {
    warnings.push("Deadline alert without deadlineDate in data");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Sorting & Filtering Helpers ───────────────────────────────────────

export function sortByPriorityAndDate(notifications: NotificationRecord[]): NotificationRecord[] {
  return [...notifications].sort((a, b) => {
    const priorityDiff = NOTIFICATION_PRIORITY_ORDER[a.priority] - NOTIFICATION_PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function filterByType(
  notifications: NotificationRecord[],
  types: NotificationType[],
): NotificationRecord[] {
  return notifications.filter((n) => types.includes(n.type));
}

export function filterUnread(notifications: NotificationRecord[]): NotificationRecord[] {
  return notifications.filter((n) => n.read_at === null && !n.archived);
}

// ── DDL for PostgreSQL ────────────────────────────────────────────────

export const NOTIFICATION_DDL = `
CREATE TABLE IF NOT EXISTS subsumio_notifications_v2 (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  brain_id text NOT NULL,
  org_id text NOT NULL,
  type text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  case_slug text,
  action_slug text,
  channels text[] NOT NULL DEFAULT '{in_app}',
  read_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_v2_user_brain
  ON subsumio_notifications_v2 (user_id, brain_id, read_at, archived);

CREATE INDEX IF NOT EXISTS idx_notif_v2_type
  ON subsumio_notifications_v2 (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_v2_priority
  ON subsumio_notifications_v2 (priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_v2_case
  ON subsumio_notifications_v2 (case_slug) WHERE case_slug IS NOT NULL;
`;
