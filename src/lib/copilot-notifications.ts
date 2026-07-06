/**
 * Proactive Copilot Notifications
 *
 * Scans cases and generates contextual, AI-driven insights that proactively
 * alert the user to important developments — beyond simple deadline reminders.
 *
 * Notification types:
 * - stale_case: No updates in N days
 * - missing_time_entries: No time entries logged this week
 * - budget_warning: Budget utilization above 80%
 * - unread_documents: Documents with pending review
 * - conflict_pending: Conflict check not completed
 * - missing_parties: Case missing client or opponent
 * - legal_hold_active: Case under legal hold
 * - critical_deadline: Deadline within 3 days
 * - no_tasks: Active case with no open tasks
 */

import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { caseFrontmatter } from "@/lib/legal-types";
import { persistNotificationUpsert, type Notification } from "@/lib/comments";

export type CopilotNotificationType =
  | "stale_case"
  | "missing_time_entries"
  | "budget_warning"
  | "unread_documents"
  | "conflict_pending"
  | "missing_parties"
  | "legal_hold_active"
  | "critical_deadline"
  | "no_tasks";

export type NotificationSeverity = "info" | "warning" | "urgent";

export interface CopilotNotification {
  id: string;
  type: CopilotNotificationType;
  severity: NotificationSeverity;
  caseSlug: string;
  caseTitle: string;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  createdAt: string;
  dismissed: boolean;
}

interface CaseScanResult {
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
  legalHold: boolean;
  openDeadlines: number;
  criticalDeadlines: number;
  openTasks: number;
  documentCount: number;
  pendingReviewDocs: number;
  timeEntriesThisWeek: number;
  hasClient: boolean;
  hasOpponent: boolean;
  conflictStatus?: string;
  budgetUtilization?: number;
  budgetAlertLevel?: "none" | "warning" | "critical";
  daysSinceUpdate: number;
}

function daysSince(dateStr: string): number {
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  return Math.floor((now - target) / (1000 * 60 * 60 * 24));
}

function isThisWeek(dateStr: string): boolean {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return new Date(dateStr) > weekAgo;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

async function scanCases(brainId?: string): Promise<CaseScanResult[]> {
  const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
  const now = new Date().toISOString();

  return (pages as BrainPage[]).map((page) => {
    const fm = caseFrontmatter(page);
    const deadlines = fm.deadlines ?? [];
    const openDeadlines = deadlines.filter((d) => String(d.status ?? "pending") !== "done");
    const criticalDeadlines = openDeadlines.filter((d) => {
      const date = d.due_date;
      if (!date) return false;
      return daysUntil(date) <= 3 && daysUntil(date) >= 0;
    });
    const openTasks = (fm.tasks ?? []).filter((task) => !task.done).length;
    const documents = fm.documents ?? [];
    const pendingReviewDocs = documents.filter((doc) => {
      const reviewStatus = String((doc as unknown as Record<string, unknown>).review_status ?? "");
      return reviewStatus === "needs_review" || reviewStatus === "pending";
    }).length;
    const timeEntries = fm.time_entries ?? [];
    const timeEntriesThisWeek = timeEntries.filter((entry) =>
      entry.date ? isThisWeek(entry.date) : false
    ).length;
    const hasClient = !!(fm.client_name || fm.client_slug);
    const hasOpponent = !!(fm.opponent_name || (fm.opponent_slugs && fm.opponent_slugs.length > 0));

    let budgetUtilization: number | undefined;
    let budgetAlertLevel: "none" | "warning" | "critical" | undefined;
    if (fm.estimated_value || fm.time_entries) {
      const totalMinutes = timeEntries.reduce((sum, e) => sum + (e.minutes || 0), 0);
      const totalHours = totalMinutes / 60;
      // Rough estimate: if we have time entries, compute utilization
      if (totalHours > 0) {
        budgetUtilization = Math.min(totalHours / 50, 1.5); // Assume 50h budget if not specified
        budgetAlertLevel =
          budgetUtilization >= 1 ? "critical" : budgetUtilization >= 0.8 ? "warning" : "none";
      }
    }

    return {
      slug: page.slug,
      title: page.title,
      status: fm.status || "open",
      updatedAt: page.updated_at || now,
      legalHold:
        fm.permissions?.legal_hold === true || (fm as Record<string, unknown>).legal_hold === true,
      openDeadlines: openDeadlines.length,
      criticalDeadlines: criticalDeadlines.length,
      openTasks,
      documentCount: documents.length,
      pendingReviewDocs,
      timeEntriesThisWeek,
      hasClient,
      hasOpponent,
      conflictStatus:
        typeof fm.conflict_status === "string" ? (fm.conflict_status as string) : undefined,
      budgetUtilization,
      budgetAlertLevel,
      daysSinceUpdate: daysSince(page.updated_at || now),
    };
  });
}

function generateNotificationsFromScan(
  scan: CaseScanResult[],
  isEn: boolean
): CopilotNotification[] {
  const notifications: CopilotNotification[] = [];
  const now = new Date().toISOString();
  const activeStatuses = ["open", "pending", "appealed"];

  for (const c of scan) {
    if (!activeStatuses.includes(c.status)) continue;

    // Critical deadline
    if (c.criticalDeadlines > 0) {
      notifications.push({
        id: `copilot_critical_${c.slug}`,
        type: "critical_deadline",
        severity: "urgent",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `${c.criticalDeadlines} critical deadline(s) in ${c.title}`
          : `${c.criticalDeadlines} kritische Frist(en) in ${c.title}`,
        body: isEn
          ? `Deadline within 3 days. Immediate action required.`
          : `Frist innerhalb von 3 Tagen. Sofortige Handlung erforderlich.`,
        actionHref: `/dashboard/cases/${c.slug.split("/").map(encodeURIComponent).join("/")}`,
        actionLabel: isEn ? "View case" : "Akte ansehen",
        createdAt: now,
        dismissed: false,
      });
    }

    // Stale case
    if (c.daysSinceUpdate > 14) {
      notifications.push({
        id: `copilot_stale_${c.slug}`,
        type: "stale_case",
        severity: "warning",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `No updates in ${c.daysSinceUpdate} days: ${c.title}`
          : `Seit ${c.daysSinceUpdate} Tagen keine Updates: ${c.title}`,
        body: isEn
          ? `This case hasn't been touched in over two weeks. Consider adding a status note or scheduling a follow-up.`
          : `Diese Akte wurde über zwei Wochen nicht bearbeitet. Erwägen Sie eine Statusnotiz oder einen Folgetermin.`,
        actionHref: `/dashboard/cases/${c.slug.split("/").map(encodeURIComponent).join("/")}`,
        actionLabel: isEn ? "View case" : "Akte ansehen",
        createdAt: now,
        dismissed: false,
      });
    }

    // Missing time entries
    if (c.timeEntriesThisWeek === 0 && c.daysSinceUpdate < 30) {
      notifications.push({
        id: `copilot_time_${c.slug}`,
        type: "missing_time_entries",
        severity: "info",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `No time entries this week: ${c.title}`
          : `Keine Zeiterfassung diese Woche: ${c.title}`,
        body: isEn
          ? `You haven't logged any time on this case this week. Don't forget to record billable hours.`
          : `Sie haben diese Woche keine Zeit auf dieser Akte erfasst. Vergessen Sie nicht, abrechenbare Stunden zu dokumentieren.`,
        actionHref: `/dashboard/cases/${c.slug.split("/").map(encodeURIComponent).join("/")}`,
        actionLabel: isEn ? "Log time" : "Zeit erfassen",
        createdAt: now,
        dismissed: false,
      });
    }

    // Budget warning
    if (c.budgetAlertLevel === "warning") {
      notifications.push({
        id: `copilot_budget_${c.slug}`,
        type: "budget_warning",
        severity: "warning",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `Budget at ${Math.round((c.budgetUtilization ?? 0) * 100)}%: ${c.title}`
          : `Budget bei ${Math.round((c.budgetUtilization ?? 0) * 100)}%: ${c.title}`,
        body: isEn
          ? `Budget utilization is above 80%. Review the fee agreement before taking on additional work.`
          : `Die Budgetauslastung liegt über 80%. Prüfen Sie die Honorarvereinbarung vor weiteren Arbeiten.`,
        actionHref: `/dashboard/fee-agreements`,
        actionLabel: isEn ? "View budgets" : "Budgets ansehen",
        createdAt: now,
        dismissed: false,
      });
    }

    // Unread documents
    if (c.pendingReviewDocs > 0) {
      notifications.push({
        id: `copilot_docs_${c.slug}`,
        type: "unread_documents",
        severity: "info",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `${c.pendingReviewDocs} document(s) need review: ${c.title}`
          : `${c.pendingReviewDocs} Dokument(e) prüfen: ${c.title}`,
        body: isEn
          ? `Documents are pending review. AI analysis may be available.`
          : `Dokumente warten auf Prüfung. Möglicherweise ist eine KI-Analyse verfügbar.`,
        actionHref: `/dashboard/cases/${c.slug.split("/").map(encodeURIComponent).join("/")}`,
        actionLabel: isEn ? "Review documents" : "Dokumente prüfen",
        createdAt: now,
        dismissed: false,
      });
    }

    // Conflict pending
    if (c.conflictStatus === "conflict_pending") {
      notifications.push({
        id: `copilot_conflict_${c.slug}`,
        type: "conflict_pending",
        severity: "warning",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `Conflict check pending: ${c.title}`
          : `Konfliktprüfung ausstehend: ${c.title}`,
        body: isEn
          ? `A conflict check has not been completed for this case. Run it before proceeding.`
          : `Für diese Akte wurde keine Konfliktprüfung abgeschlossen. Führen Sie diese durch, bevor Sie fortfahren.`,
        actionHref: `/dashboard/kollisionspruefung`,
        actionLabel: isEn ? "Run check" : "Prüfung starten",
        createdAt: now,
        dismissed: false,
      });
    }

    // Missing parties
    if (!c.hasClient || !c.hasOpponent) {
      notifications.push({
        id: `copilot_parties_${c.slug}`,
        type: "missing_parties",
        severity: "info",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn
          ? `Missing ${!c.hasClient ? "client" : "opponent"}: ${c.title}`
          : `${!c.hasClient ? "Mandant" : "Gegner"} fehlt: ${c.title}`,
        body: isEn
          ? `This case is missing ${!c.hasClient ? "client information" : "opponent information"}. Complete the party data for proper matter management.`
          : `Dieser Akte fehlen ${!c.hasClient ? "Mandantendaten" : "Gegnerdaten"}. Vervollständigen Sie die Parteien-Daten für eine ordnungsgemäße Aktenverwaltung.`,
        actionHref: `/dashboard/cases/${c.slug.split("/").map(encodeURIComponent).join("/")}`,
        actionLabel: isEn ? "Add party" : "Partei hinzufügen",
        createdAt: now,
        dismissed: false,
      });
    }

    // Legal hold
    if (c.legalHold) {
      notifications.push({
        id: `copilot_hold_${c.slug}`,
        type: "legal_hold_active",
        severity: "warning",
        caseSlug: c.slug,
        caseTitle: c.title,
        title: isEn ? `Legal Hold active: ${c.title}` : `Legal Hold aktiv: ${c.title}`,
        body: isEn
          ? `This case is under legal hold. Documents cannot be deleted, archived, or modified.`
          : `Diese Akte steht unter Legal Hold. Dokumente können nicht gelöscht, archiviert oder geändert werden.`,
        actionHref: `/dashboard/legal-hold`,
        actionLabel: isEn ? "Manage holds" : "Holds verwalten",
        createdAt: now,
        dismissed: false,
      });
    }
  }

  // Sort by severity (urgent first), then by case title
  const severityOrder: Record<NotificationSeverity, number> = { urgent: 0, warning: 1, info: 2 };
  notifications.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return a.caseTitle.localeCompare(b.caseTitle);
  });

  return notifications;
}

export async function generateCopilotNotifications(
  brainId: string,
  userId: string,
  isEn: boolean
): Promise<CopilotNotification[]> {
  const scan = await scanCases(brainId);
  const notifications = generateNotificationsFromScan(scan, isEn);

  // Persist as in-app notifications
  for (const notif of notifications) {
    const inAppNotif: Notification = {
      id: notif.id,
      userId,
      brainId,
      type: `copilot_${notif.type}`,
      data: {
        title: notif.title,
        body: notif.body,
        caseSlug: notif.caseSlug,
        caseTitle: notif.caseTitle,
        severity: notif.severity,
        actionHref: notif.actionHref,
        actionLabel: notif.actionLabel,
      },
      readAt: null,
      createdAt: notif.createdAt,
    };
    await persistNotificationUpsert(inAppNotif);
  }

  return notifications;
}

export async function dismissCopilotNotification(
  notificationId: string,
  userId: string,
  brainId: string
): Promise<void> {
  // Mark as read in the notification system
  const { markNotificationRead } = await import("@/lib/comments");
  await markNotificationRead(notificationId, { userId, brainId });
}

export async function getCopilotNotifications(
  brainId: string,
  userId: string,
  isEn: boolean
): Promise<CopilotNotification[]> {
  // Try to get from in-app notification store first
  const { listNotifications } = await import("@/lib/comments");
  const stored = await listNotifications({ userId, brainId, limit: 50 });

  const copilotNotifs = stored
    .filter((n) => n.type.startsWith("copilot_"))
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      return {
        id: n.id,
        type: n.type.replace("copilot_", "") as CopilotNotificationType,
        severity: (data.severity as NotificationSeverity) ?? "info",
        caseSlug: String(data.caseSlug ?? ""),
        caseTitle: String(data.caseTitle ?? ""),
        title: String(data.title ?? ""),
        body: String(data.body ?? ""),
        actionHref: data.actionHref as string | undefined,
        actionLabel: data.actionLabel as string | undefined,
        createdAt: n.createdAt,
        dismissed: n.readAt !== null,
      } satisfies CopilotNotification;
    });

  // If no stored notifications, generate fresh ones
  if (copilotNotifs.length === 0) {
    return generateCopilotNotifications(brainId, userId, isEn);
  }

  return copilotNotifs;
}
