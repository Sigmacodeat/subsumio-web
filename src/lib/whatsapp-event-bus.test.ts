import { describe, it, expect } from "vitest";
import {
  NotificationEventBus,
  DEFAULT_WHATSAPP_HANDLER_CONFIG,
  eventToScope,
  eventToTemplate,
  buildWhatsAppMessageBody,
  parseApprovalResponse,
  matchApprovalByReference,
  responseToApprovalDecision,
  createNotificationEvent,
  createDeadlineAlertEvent,
  createApprovalRequestEvent,
  createConflictAlertEvent,
  createNewDocumentEvent,
  validateNotificationEvent,
  type NotificationEvent,
  type NotificationEventType,
  type NotificationHandler,
  type DispatchResult,
} from "@/lib/whatsapp-event-bus";

// ── Mock Handler ──────────────────────────────────────────────────────

function createMockHandler(channel: "whatsapp" | "email" | "dashboard" | "push" = "whatsapp"): NotificationHandler {
  return {
    channel,
    async handle(event: NotificationEvent): Promise<DispatchResult> {
      if (!event.recipient_phone && channel === "whatsapp") {
        return {
          channel,
          success: false,
          error: "no_recipient_phone",
          dispatched_at: new Date().toISOString(),
        };
      }
      return {
        channel,
        success: true,
        message_id: `mock-${event.id}`,
        dispatched_at: new Date().toISOString(),
      };
    },
  };
}

// ── Event Bus Tests ───────────────────────────────────────────────────

describe("Notification Event Bus", () => {
  it("registers and unregisters handlers", () => {
    const bus = new NotificationEventBus();
    const handler = createMockHandler("whatsapp");
    bus.registerHandler(handler);
    expect(bus.getHandlers()).toContain("whatsapp");
    bus.unregisterHandler("whatsapp");
    expect(bus.getHandlers()).not.toContain("whatsapp");
  });

  it("publishes events", () => {
    const bus = new NotificationEventBus();
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Test body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    });
    bus.publish(event);
    expect(bus.getEvent(event.id)).toBeDefined();
    expect(bus.getPendingEvents()).toHaveLength(1);
  });

  it("dispatches events to registered handlers", async () => {
    const bus = new NotificationEventBus();
    bus.registerHandler(createMockHandler("whatsapp"));
    bus.registerHandler(createMockHandler("dashboard"));

    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Test body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
      recipient_phone: "+491701234567",
    });
    bus.publish(event);

    const result = await bus.dispatch(event.id);
    expect(result).not.toBeNull();
    expect(result!.dispatched).toBe(true);
    expect(result!.dispatch_results).toHaveLength(2);
    expect(result!.dispatch_results.every((r) => r.success)).toBe(true);
  });

  it("does not re-dispatch already dispatched events", async () => {
    const bus = new NotificationEventBus();
    bus.registerHandler(createMockHandler());
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Test body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
      recipient_phone: "+491701234567",
    });
    bus.publish(event);
    await bus.dispatch(event.id);
    const result = await bus.dispatch(event.id);
    expect(result!.dispatch_results).toHaveLength(1);
  });

  it("returns null for unknown event id", async () => {
    const bus = new NotificationEventBus();
    expect(await bus.dispatch("nonexistent")).toBeNull();
  });

  it("dispatches all pending events", async () => {
    const bus = new NotificationEventBus();
    bus.registerHandler(createMockHandler());

    for (let i = 0; i < 3; i++) {
      bus.publish(createNotificationEvent({
        type: "deadline_alert",
        title: `Test ${i}`,
        body: "Body",
        brain_id: "brain-1",
        org_id: "org-1",
        recipient_user_ids: ["user-1"],
        recipient_phone: "+491701234567",
      }));
    }

    const count = await bus.dispatchAll();
    expect(count).toBe(3);
    expect(bus.getPendingEvents()).toHaveLength(0);
    expect(bus.getDispatchedEvents()).toHaveLength(3);
  });

  it("tracks audit log", () => {
    const bus = new NotificationEventBus();
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    });
    bus.publish(event);
    const log = bus.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].action).toBe("published");
  });

  it("returns stats", () => {
    const bus = new NotificationEventBus();
    bus.registerHandler(createMockHandler());
    bus.publish(createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    }));
    const stats = bus.getStats();
    expect(stats.total_events).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.dispatched).toBe(0);
    expect(stats.registered_handlers).toBe(1);
  });

  it("clears dispatched events", async () => {
    const bus = new NotificationEventBus();
    bus.registerHandler(createMockHandler());
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
      recipient_phone: "+491701234567",
    });
    bus.publish(event);
    await bus.dispatch(event.id);
    bus.clearDispatched();
    expect(bus.getDispatchedEvents()).toHaveLength(0);
  });
});

// ── Event-to-Scope Mapping ────────────────────────────────────────────

describe("Event-to-Scope Mapping", () => {
  it("maps deadline_alert to deadline_alert scope", () => {
    expect(eventToScope("deadline_alert")).toBe("deadline_alert");
  });

  it("maps approval_request to approval_request scope", () => {
    expect(eventToScope("approval_request")).toBe("approval_request");
  });

  it("maps conflict_alert to conflict_alert scope", () => {
    expect(eventToScope("conflict_alert")).toBe("conflict_alert");
  });

  it("maps daily_briefing to daily_briefing scope", () => {
    expect(eventToScope("daily_briefing")).toBe("daily_briefing");
  });

  it("maps new_document to new_document scope", () => {
    expect(eventToScope("new_document")).toBe("new_document");
  });
});

// ── Event-to-Template Mapping ─────────────────────────────────────────

describe("Event-to-Template Mapping", () => {
  it("maps approval_request to approval template", () => {
    expect(eventToTemplate("approval_request")).toBe("approval_request");
  });

  it("maps deadline_alert to deadline template", () => {
    expect(eventToTemplate("deadline_alert")).toBe("deadline_alert");
  });

  it("maps daily_briefing to briefing template", () => {
    expect(eventToTemplate("daily_briefing")).toBe("daily_briefing");
  });

  it("returns undefined for events without template", () => {
    expect(eventToTemplate("new_document")).toBeUndefined();
  });
});

// ── WhatsApp Message Body ─────────────────────────────────────────────

describe("WhatsApp Message Body Builder", () => {
  it("builds basic message body", () => {
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Frist: Klageerwiderung",
      body: "Fristdatum: 2026-07-01",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    });
    const body = buildWhatsAppMessageBody(event);
    expect(body).toContain("Frist: Klageerwiderung");
    expect(body).toContain("Fristdatum: 2026-07-01");
  });

  it("includes case slug when present", () => {
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      case_slug: "legal/cases/123",
      recipient_user_ids: ["user-1"],
    });
    const body = buildWhatsAppMessageBody(event);
    expect(body).toContain("legal/cases/123");
  });

  it("includes approval instructions for approval requests", () => {
    const event = createNotificationEvent({
      type: "approval_request",
      title: "Freigabe: Schriftsatz",
      body: "Schriftsatz finalisieren",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
      action_slug: "agent-action/abc12345",
    });
    const body = buildWhatsAppMessageBody(event);
    expect(body).toContain("Ja");
    expect(body).toContain("Nein");
    expect(body).toContain("abc12345");
  });

  it("adds urgent prefix for urgent priority", () => {
    const event = createNotificationEvent({
      type: "conflict_alert",
      priority: "urgent",
      title: "Konflikt",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    });
    const body = buildWhatsAppMessageBody(event);
    expect(body.startsWith("🚨")).toBe(true);
  });

  it("adds high priority prefix", () => {
    const event = createNotificationEvent({
      type: "deadline_alert",
      priority: "high",
      title: "Frist",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    });
    const body = buildWhatsAppMessageBody(event);
    expect(body.startsWith("⚠️")).toBe(true);
  });
});

// ── Approval Response Parsing ─────────────────────────────────────────

describe("Approval Response Parsing", () => {
  it("parses 'Ja' as approve", () => {
    const result = parseApprovalResponse("Ja");
    expect(result.response).toBe("approve");
  });

  it("parses 'yes' as approve", () => {
    const result = parseApprovalResponse("yes");
    expect(result.response).toBe("approve");
  });

  it("parses 'approve' as approve", () => {
    const result = parseApprovalResponse("approve");
    expect(result.response).toBe("approve");
  });

  it("parses '✅' as approve", () => {
    const result = parseApprovalResponse("✅");
    expect(result.response).toBe("approve");
  });

  it("parses 'Nein' as reject", () => {
    const result = parseApprovalResponse("Nein");
    expect(result.response).toBe("reject");
  });

  it("parses 'no' as reject", () => {
    const result = parseApprovalResponse("no");
    expect(result.response).toBe("reject");
  });

  it("parses 'reject' as reject", () => {
    const result = parseApprovalResponse("reject");
    expect(result.response).toBe("reject");
  });

  it("parses '❌' as reject", () => {
    const result = parseApprovalResponse("❌");
    expect(result.response).toBe("reject");
  });

  it("parses 'Nein zu riskant' as reject with reason", () => {
    const result = parseApprovalResponse("Nein zu riskant");
    expect(result.response).toBe("reject");
    expect(result.reject_reason).toBe("zu riskant");
  });

  it("parses 'Ja abc12345' as approve with reference", () => {
    const result = parseApprovalResponse("Ja abc12345");
    expect(result.response).toBe("approve");
    expect(result.action_slug).toBe("abc12345");
  });

  it("parses 'reject abc12345' as reject with reference", () => {
    const result = parseApprovalResponse("reject abc12345");
    expect(result.response).toBe("reject");
    expect(result.action_slug).toBe("abc12345");
  });

  it("returns unknown for unparseable message", () => {
    const result = parseApprovalResponse("Hallo wie geht es?");
    expect(result.response).toBe("unknown");
  });

  it("handles German keywords", () => {
    expect(parseApprovalResponse("freigeben").response).toBe("approve");
    expect(parseApprovalResponse("ablehnen").response).toBe("reject");
  });
});

// ── Approval Matching ─────────────────────────────────────────────────

describe("Approval Matching", () => {
  it("matches by reference suffix", () => {
    const parsed = parseApprovalResponse("Ja abc12345");
    const pending = [
      { action_slug: "agent-action/test-abc12345", action_type: "document_finalize" as const },
    ];
    const match = matchApprovalByReference(parsed, pending);
    expect(match).not.toBeNull();
    expect(match!.action_slug).toBe("agent-action/test-abc12345");
  });

  it("returns null when no match found", () => {
    const parsed = parseApprovalResponse("Ja xyz99999");
    const pending = [
      { action_slug: "agent-action/test-abc12345", action_type: "document_finalize" as const },
    ];
    expect(matchApprovalByReference(parsed, pending)).toBeNull();
  });

  it("returns null when parsed has no action_slug", () => {
    const parsed = parseApprovalResponse("Ja");
    const pending = [
      { action_slug: "agent-action/test-abc12345", action_type: "document_finalize" as const },
    ];
    expect(matchApprovalByReference(parsed, pending)).toBeNull();
  });
});

// ── Response to Decision ──────────────────────────────────────────────

describe("Response to Approval Decision", () => {
  it("converts approve to approved status", () => {
    const parsed = parseApprovalResponse("Ja");
    const decision = responseToApprovalDecision(parsed);
    expect(decision).not.toBeNull();
    expect(decision!.status).toBe("approved");
  });

  it("converts reject to rejected status with reason", () => {
    const parsed = parseApprovalResponse("Nein zu riskant");
    const decision = responseToApprovalDecision(parsed);
    expect(decision).not.toBeNull();
    expect(decision!.status).toBe("rejected");
    expect(decision!.reject_reason).toBe("zu riskant");
  });

  it("returns null for unknown response", () => {
    const parsed = parseApprovalResponse("Hallo");
    expect(responseToApprovalDecision(parsed)).toBeNull();
  });
});

// ── Event Factory Tests ───────────────────────────────────────────────

describe("Notification Event Factory", () => {
  it("createNotificationEvent sets all fields", () => {
    const event = createNotificationEvent({
      type: "deadline_alert",
      priority: "high",
      title: "Test",
      body: "Body",
      brain_id: "brain-1",
      org_id: "org-1",
      recipient_user_ids: ["user-1"],
    });
    expect(event.id).toBeTruthy();
    expect(event.type).toBe("deadline_alert");
    expect(event.priority).toBe("high");
    expect(event.dispatched).toBe(false);
    expect(event.dispatch_results).toEqual([]);
  });

  it("createDeadlineAlertEvent sets urgency based on days remaining", () => {
    const overdue = createDeadlineAlertEvent({
      brain_id: "b1", org_id: "o1", case_slug: "c1",
      deadline_date: "2026-06-01", deadline_description: "Klage",
      days_remaining: 0, recipient_user_ids: ["u1"],
    });
    expect(overdue.priority).toBe("urgent");
    expect(overdue.type).toBe("deadline_overdue");

    const soon = createDeadlineAlertEvent({
      brain_id: "b1", org_id: "o1", case_slug: "c1",
      deadline_date: "2026-07-01", deadline_description: "Klage",
      days_remaining: 2, recipient_user_ids: ["u1"],
    });
    expect(soon.priority).toBe("high");
    expect(soon.type).toBe("deadline_alert");

    const future = createDeadlineAlertEvent({
      brain_id: "b1", org_id: "o1", case_slug: "c1",
      deadline_date: "2026-08-01", deadline_description: "Klage",
      days_remaining: 30, recipient_user_ids: ["u1"],
    });
    expect(future.priority).toBe("normal");
  });

  it("createApprovalRequestEvent sets action fields", () => {
    const event = createApprovalRequestEvent({
      brain_id: "b1", org_id: "o1",
      action_slug: "agent-action/123",
      action_type: "document_finalize",
      summary: "Schriftsatz freigeben",
      recipient_user_ids: ["u1"],
    });
    expect(event.type).toBe("approval_request");
    expect(event.action_slug).toBe("agent-action/123");
    expect(event.action_type).toBe("document_finalize");
    expect(event.priority).toBe("high");
  });

  it("createConflictAlertEvent has urgent priority", () => {
    const event = createConflictAlertEvent({
      brain_id: "b1", org_id: "o1", case_slug: "c1",
      conflict_description: "Gegner ist Mandant",
      recipient_user_ids: ["u1"],
    });
    expect(event.priority).toBe("urgent");
    expect(event.type).toBe("conflict_alert");
  });

  it("createNewDocumentEvent has normal priority", () => {
    const event = createNewDocumentEvent({
      brain_id: "b1", org_id: "o1", case_slug: "c1",
      document_title: "Klage.pdf",
      document_type: "klage",
      recipient_user_ids: ["u1"],
    });
    expect(event.priority).toBe("normal");
    expect(event.type).toBe("new_document");
  });
});

// ── Validation ────────────────────────────────────────────────────────

describe("Notification Validation", () => {
  it("validates a correct event", () => {
    const event = createNotificationEvent({
      type: "deadline_alert",
      title: "Test",
      body: "Body",
      brain_id: "b1",
      org_id: "o1",
      recipient_user_ids: ["u1"],
    });
    const result = validateNotificationEvent(event);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing recipients", () => {
    const event: NotificationEvent = {
      id: "test",
      type: "deadline_alert",
      priority: "normal",
      title: "Test",
      body: "Body",
      brain_id: "b1",
      org_id: "o1",
      recipient_user_ids: [],
      created_at: new Date().toISOString(),
      dispatched: false,
      dispatch_results: [],
    };
    const result = validateNotificationEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("recipient"))).toBe(true);
  });

  it("detects missing action_slug for approval requests", () => {
    const event: NotificationEvent = {
      id: "test",
      type: "approval_request",
      priority: "high",
      title: "Test",
      body: "Body",
      brain_id: "b1",
      org_id: "o1",
      recipient_user_ids: ["u1"],
      created_at: new Date().toISOString(),
      dispatched: false,
      dispatch_results: [],
    };
    const result = validateNotificationEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("action_slug"))).toBe(true);
  });

  it("warns about urgent priority for non-critical events", () => {
    const event = createNotificationEvent({
      type: "new_document",
      priority: "urgent",
      title: "Test",
      body: "Body",
      brain_id: "b1",
      org_id: "o1",
      recipient_user_ids: ["u1"],
    });
    const result = validateNotificationEvent(event);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
