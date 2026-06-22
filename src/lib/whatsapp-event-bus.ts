/**
 * WhatsApp Notification Event Bus + Approval Return Channel
 * P1-SECR-001 + P1-SECR-005
 * ==================================================
 * Verbindet System-Events (Fristen, Dokumente, Konflikte, Approvals)
 * mit dem WhatsApp-Outbound-Gate und ermöglicht Approval-Responses
 * (approve/reject) via WhatsApp-Inbound-Messages.
 *
 * Architektur:
 *   1. NotificationEventBus — sammelt System-Events und dispatcht
 *      sie an registrierte Handler (WhatsApp, E-Mail, Dashboard).
 *   2. WhatsAppNotificationHandler — wandelt Events in WhatsApp-Messages
 *      um, nutzt sendProactiveMessage (Outbound-Gate, Consent, 24h-Window).
 *   3. ApprovalReturnChannel — parst WhatsApp-Inbound-Responses
 *      (Ja/Nein, Approve/Reject, Buttons) und wandelt sie in Approval-Entscheidungen um.
 *
 * Bestehende Module:
 *   - sendProactiveMessage (proactive-send.ts) — guarded send
 *   - evaluateOutbound (outbound-gate.ts) — consent/window/quiet-hours
 *   - AgentActionFrontmatter (approval.ts) — approval data model
 *   - executeApprovedAction (approval-execution.ts) — execution
 */

import type { OutboundScope } from "@/lib/whatsapp/outbound-gate";
import type { ActionType, ApprovalStatus } from "@/lib/approval";

// ── Event Bus Types ───────────────────────────────────────────────────

export type NotificationEventType =
  | "deadline_alert"
  | "deadline_overdue"
  | "new_document"
  | "approval_request"
  | "conflict_alert"
  | "client_message"
  | "case_update"
  | "daily_briefing"
  | "fristen_briefing";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type NotificationChannel = "whatsapp" | "email" | "dashboard" | "push";

export interface NotificationEvent {
  id: string;
  type: NotificationEventType;
  priority: NotificationPriority;
  title: string;
  body: string;
  /** Tenant scoping */
  brain_id: string;
  org_id: string;
  /** Matter scoping (optional) */
  case_slug?: string;
  /** Recipient user IDs */
  recipient_user_ids: string[];
  /** Recipient phone (for WhatsApp) */
  recipient_phone?: string;
  /** Action slug if this is an approval request */
  action_slug?: string;
  /** Action type if this is an approval request */
  action_type?: ActionType;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Created at */
  created_at: string;
  /** Whether this event has been dispatched */
  dispatched: boolean;
  /** Dispatch log */
  dispatch_results: DispatchResult[];
}

export interface DispatchResult {
  channel: NotificationChannel;
  success: boolean;
  message_id?: string;
  error?: string;
  dispatched_at: string;
}

export interface NotificationHandler {
  channel: NotificationChannel;
  handle(event: NotificationEvent): Promise<DispatchResult>;
}

// ── Event Bus ─────────────────────────────────────────────────────────

export class NotificationEventBus {
  private handlers: Map<NotificationChannel, NotificationHandler> = new Map();
  private events: Map<string, NotificationEvent> = new Map();
  private auditLog: EventBusAuditEntry[] = [];

  registerHandler(handler: NotificationHandler): void {
    this.handlers.set(handler.channel, handler);
  }

  unregisterHandler(channel: NotificationChannel): void {
    this.handlers.delete(channel);
  }

  getHandlers(): NotificationChannel[] {
    return [...this.handlers.keys()];
  }

  publish(event: NotificationEvent): void {
    this.events.set(event.id, event);
    this.auditLog.push({
      event_id: event.id,
      action: "published",
      timestamp: new Date().toISOString(),
      details: {
        type: event.type,
        priority: event.priority,
        recipients: event.recipient_user_ids.length,
      },
    });
  }

  async dispatch(eventId: string): Promise<NotificationEvent | null> {
    const event = this.events.get(eventId);
    if (!event) return null;
    if (event.dispatched) return event;

    const results: DispatchResult[] = [];
    for (const handler of this.handlers.values()) {
      try {
        const result = await handler.handle(event);
        results.push(result);
      } catch (err) {
        results.push({
          channel: handler.channel,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          dispatched_at: new Date().toISOString(),
        });
      }
    }

    event.dispatch_results = results;
    event.dispatched = true;

    this.auditLog.push({
      event_id: eventId,
      action: "dispatched",
      timestamp: new Date().toISOString(),
      details: { results: results.map((r) => ({ channel: r.channel, success: r.success })) },
    });

    return event;
  }

  async dispatchAll(): Promise<number> {
    let count = 0;
    for (const eventId of this.events.keys()) {
      const event = await this.dispatch(eventId);
      if (event) count++;
    }
    return count;
  }

  getEvent(eventId: string): NotificationEvent | undefined {
    return this.events.get(eventId);
  }

  getPendingEvents(): NotificationEvent[] {
    return [...this.events.values()].filter((e) => !e.dispatched);
  }

  getDispatchedEvents(): NotificationEvent[] {
    return [...this.events.values()].filter((e) => e.dispatched);
  }

  getAuditLog(): EventBusAuditEntry[] {
    return [...this.auditLog];
  }

  clearDispatched(): void {
    for (const [id, event] of this.events) {
      if (event.dispatched) this.events.delete(id);
    }
  }

  getStats(): EventBusStats {
    const events = [...this.events.values()];
    return {
      total_events: events.length,
      pending: events.filter((e) => !e.dispatched).length,
      dispatched: events.filter((e) => e.dispatched).length,
      by_type: this.countBy(events, (e) => e.type),
      by_priority: this.countBy(events, (e) => e.priority),
      registered_handlers: this.handlers.size,
    };
  }

  private countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = keyFn(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }
}

export interface EventBusAuditEntry {
  event_id: string;
  action: "published" | "dispatched" | "failed";
  timestamp: string;
  details: Record<string, unknown>;
}

export interface EventBusStats {
  total_events: number;
  pending: number;
  dispatched: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  registered_handlers: number;
}

// ── WhatsApp Notification Handler ─────────────────────────────────────

export interface WhatsAppHandlerConfig {
  /** Default scope for WhatsApp notifications */
  default_scope: OutboundScope;
  /** Whether to send urgent notifications outside quiet hours */
  bypass_quiet_hours_for_urgent: boolean;
  /** Template name for approval requests */
  approval_template_name: string;
  /** Template name for deadline alerts */
  deadline_template_name: string;
  /** Template name for daily briefing */
  briefing_template_name: string;
}

export const DEFAULT_WHATSAPP_HANDLER_CONFIG: WhatsAppHandlerConfig = {
  default_scope: "daily_briefing",
  bypass_quiet_hours_for_urgent: true,
  approval_template_name: "approval_request",
  deadline_template_name: "deadline_alert",
  briefing_template_name: "daily_briefing",
};

/**
 * Maps NotificationEventType to OutboundScope for the outbound gate.
 */
export function eventToScope(type: NotificationEventType): OutboundScope {
  switch (type) {
    case "deadline_alert":
    case "deadline_overdue":
      return "deadline_alert";
    case "approval_request":
      return "approval_request";
    case "conflict_alert":
      return "conflict_alert";
    case "new_document":
      return "new_document";
    case "client_message":
      return "client_reminder";
    case "daily_briefing":
    case "fristen_briefing":
      return "daily_briefing";
    default:
      return "daily_briefing";
  }
}

/**
 * Maps NotificationEventType to WhatsApp template name.
 */
export function eventToTemplate(
  type: NotificationEventType,
  config: WhatsAppHandlerConfig = DEFAULT_WHATSAPP_HANDLER_CONFIG
): string | undefined {
  switch (type) {
    case "approval_request":
      return config.approval_template_name;
    case "deadline_alert":
    case "deadline_overdue":
      return config.deadline_template_name;
    case "daily_briefing":
    case "fristen_briefing":
      return config.briefing_template_name;
    default:
      return undefined;
  }
}

/**
 * Builds the WhatsApp message body for a notification event.
 */
export function buildWhatsAppMessageBody(event: NotificationEvent): string {
  const priorityPrefix =
    event.priority === "urgent" ? "🚨 " : event.priority === "high" ? "⚠️ " : "";

  const lines: string[] = [`${priorityPrefix}${event.title}`, "", event.body];

  if (event.case_slug) {
    lines.push("", `Akte: ${event.case_slug}`);
  }

  if (event.type === "approval_request" && event.action_slug) {
    lines.push("", "Antworte mit:");
    lines.push("  ✅ Ja / Approve — zum Freigeben");
    lines.push("  ❌ Nein / Reject — zum Ablehnen");
    lines.push(`  Referenz: ${event.action_slug.slice(-8)}`);
  }

  return lines.join("\n");
}

// ── Approval Return Channel ───────────────────────────────────────────

export type ApprovalResponse = "approve" | "reject" | "unknown";

export interface ParsedApprovalResponse {
  response: ApprovalResponse;
  action_slug?: string;
  reject_reason?: string;
  raw_message: string;
  parsed_at: string;
}

/**
 * Parses an inbound WhatsApp message for an approval response.
 *
 * Supported formats:
 *   - "Ja" / "yes" / "approve" / "✅" → approve
 *   - "Nein" / "no" / "reject" / "❌" → reject
 *   - "Ja <ref>" / "approve <ref>" → approve with reference
 *   - "Nein <reason>" / "reject <reason>" → reject with reason
 */
export function parseApprovalResponse(message: string): ParsedApprovalResponse {
  const trimmed = message.trim().toLowerCase();
  const parsedAt = new Date().toISOString();

  // Extract reference (last 8 chars of action slug)
  const refMatch = trimmed.match(/([a-f0-9]{8})$/);
  const actionSlug = refMatch ? refMatch[1] : undefined;

  // Check for approve keywords
  const approvePatterns = ["ja", "yes", "approve", "ok", "✅", "freigeben", "zugestimmt"];
  const rejectPatterns = ["nein", "no", "reject", "❌", "ablehnen", "abgelehnt"];

  const words = trimmed.split(/\s+/);
  const firstWord = words[0] ?? "";

  if (approvePatterns.some((p) => firstWord === p || firstWord.startsWith(p))) {
    return {
      response: "approve",
      action_slug: actionSlug,
      raw_message: message,
      parsed_at: parsedAt,
    };
  }

  if (rejectPatterns.some((p) => firstWord === p || firstWord.startsWith(p))) {
    // Everything after the first word is the reject reason
    const reason = words.slice(1).join(" ").trim() || undefined;
    return {
      response: "reject",
      action_slug: actionSlug,
      reject_reason: reason || undefined,
      raw_message: message,
      parsed_at: parsedAt,
    };
  }

  // Check for emoji-only messages
  if (trimmed.includes("✅")) {
    return {
      response: "approve",
      action_slug: actionSlug,
      raw_message: message,
      parsed_at: parsedAt,
    };
  }
  if (trimmed.includes("❌")) {
    return {
      response: "reject",
      action_slug: actionSlug,
      raw_message: message,
      parsed_at: parsedAt,
    };
  }

  return {
    response: "unknown",
    raw_message: message,
    parsed_at: parsedAt,
  };
}

/**
 * Matches a parsed response to a pending approval by action slug reference.
 */
export function matchApprovalByReference(
  parsed: ParsedApprovalResponse,
  pendingApprovals: Array<{ action_slug: string; action_type: ActionType }>
): { action_slug: string; action_type: ActionType } | null {
  if (!parsed.action_slug) return null;
  const ref = parsed.action_slug.toLowerCase();
  for (const approval of pendingApprovals) {
    if (approval.action_slug.toLowerCase().endsWith(ref)) {
      return approval;
    }
  }
  return null;
}

/**
 * Converts a parsed approval response to an approval decision.
 */
export function responseToApprovalDecision(
  parsed: ParsedApprovalResponse
): { status: ApprovalStatus; reject_reason?: string } | null {
  switch (parsed.response) {
    case "approve":
      return { status: "approved" };
    case "reject":
      return { status: "rejected", reject_reason: parsed.reject_reason };
    default:
      return null;
  }
}

// ── Notification Event Factory ─────────────────────────────────────────

export function createNotificationEvent(params: {
  type: NotificationEventType;
  priority?: NotificationPriority;
  title: string;
  body: string;
  brain_id: string;
  org_id: string;
  case_slug?: string;
  recipient_user_ids: string[];
  recipient_phone?: string;
  action_slug?: string;
  action_type?: ActionType;
  metadata?: Record<string, unknown>;
}): NotificationEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: params.type,
    priority: params.priority ?? "normal",
    title: params.title,
    body: params.body,
    brain_id: params.brain_id,
    org_id: params.org_id,
    case_slug: params.case_slug,
    recipient_user_ids: params.recipient_user_ids,
    recipient_phone: params.recipient_phone,
    action_slug: params.action_slug,
    action_type: params.action_type,
    metadata: params.metadata,
    created_at: new Date().toISOString(),
    dispatched: false,
    dispatch_results: [],
  };
}

// ── Event Templates ───────────────────────────────────────────────────

export function createDeadlineAlertEvent(params: {
  brain_id: string;
  org_id: string;
  case_slug: string;
  deadline_date: string;
  deadline_description: string;
  days_remaining: number;
  recipient_user_ids: string[];
  recipient_phone?: string;
}): NotificationEvent {
  const priority: NotificationPriority =
    params.days_remaining <= 0 ? "urgent" : params.days_remaining <= 3 ? "high" : "normal";

  return createNotificationEvent({
    type: params.days_remaining <= 0 ? "deadline_overdue" : "deadline_alert",
    priority,
    title:
      params.days_remaining <= 0
        ? `Frist abgelaufen: ${params.deadline_description}`
        : `Frist in ${params.days_remaining} Tag(en): ${params.deadline_description}`,
    body: `Fristdatum: ${params.deadline_date}\nAkte: ${params.case_slug}`,
    brain_id: params.brain_id,
    org_id: params.org_id,
    case_slug: params.case_slug,
    recipient_user_ids: params.recipient_user_ids,
    recipient_phone: params.recipient_phone,
    metadata: { deadline_date: params.deadline_date, days_remaining: params.days_remaining },
  });
}

export function createApprovalRequestEvent(params: {
  brain_id: string;
  org_id: string;
  case_slug?: string;
  action_slug: string;
  action_type: ActionType;
  summary: string;
  recipient_user_ids: string[];
  recipient_phone?: string;
}): NotificationEvent {
  return createNotificationEvent({
    type: "approval_request",
    priority: "high",
    title: `Freigabe erforderlich: ${params.action_type}`,
    body: params.summary,
    brain_id: params.brain_id,
    org_id: params.org_id,
    case_slug: params.case_slug,
    recipient_user_ids: params.recipient_user_ids,
    recipient_phone: params.recipient_phone,
    action_slug: params.action_slug,
    action_type: params.action_type,
    metadata: { action_slug: params.action_slug },
  });
}

export function createConflictAlertEvent(params: {
  brain_id: string;
  org_id: string;
  case_slug: string;
  conflict_description: string;
  recipient_user_ids: string[];
  recipient_phone?: string;
}): NotificationEvent {
  return createNotificationEvent({
    type: "conflict_alert",
    priority: "urgent",
    title: "Mandantenkonflikt erkannt",
    body: `Konflikt in Akte ${params.case_slug}: ${params.conflict_description}`,
    brain_id: params.brain_id,
    org_id: params.org_id,
    case_slug: params.case_slug,
    recipient_user_ids: params.recipient_user_ids,
    recipient_phone: params.recipient_phone,
  });
}

export function createNewDocumentEvent(params: {
  brain_id: string;
  org_id: string;
  case_slug: string;
  document_title: string;
  document_type: string;
  recipient_user_ids: string[];
  recipient_phone?: string;
}): NotificationEvent {
  return createNotificationEvent({
    type: "new_document",
    priority: "normal",
    title: `Neues Dokument: ${params.document_title}`,
    body: `Typ: ${params.document_type}\nAkte: ${params.case_slug}`,
    brain_id: params.brain_id,
    org_id: params.org_id,
    case_slug: params.case_slug,
    recipient_user_ids: params.recipient_user_ids,
    recipient_phone: params.recipient_phone,
  });
}

// ── Validation ────────────────────────────────────────────────────────

export interface NotificationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateNotificationEvent(event: NotificationEvent): NotificationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!event.id) errors.push("Event ID is required");
  if (!event.type) errors.push("Event type is required");
  if (!event.title) errors.push("Event title is required");
  if (!event.body) errors.push("Event body is required");
  if (!event.brain_id) errors.push("brain_id is required");
  if (!event.org_id) errors.push("org_id is required");
  if (event.recipient_user_ids.length === 0) errors.push("At least one recipient is required");

  if (event.type === "approval_request" && !event.action_slug) {
    errors.push("Approval request events must have an action_slug");
  }

  if (event.type === "approval_request" && !event.action_type) {
    errors.push("Approval request events must have an action_type");
  }

  if (
    event.priority === "urgent" &&
    event.type !== "deadline_overdue" &&
    event.type !== "conflict_alert"
  ) {
    warnings.push(
      "Urgent priority is typically reserved for overdue deadlines and conflict alerts"
    );
  }

  if (!event.recipient_phone && event.dispatch_results.some((r) => r.channel === "whatsapp")) {
    warnings.push("WhatsApp dispatch attempted without recipient_phone");
  }

  return { valid: errors.length === 0, errors, warnings };
}
