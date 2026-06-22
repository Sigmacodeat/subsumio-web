import type { AgentActionFrontmatter, ActionType } from "@/lib/approval";
import { buildDocumentRequest } from "@/lib/document-requests";
import type { BrainPage } from "@/lib/types";
import type { OutboundScope } from "@/lib/whatsapp/outbound-gate";
import type { ProactiveSendResult } from "@/lib/whatsapp/proactive-send";
import type { WhatsAppTemplateMessage } from "@/lib/whatsapp/types";

export type ExecutionStatus = "not_started" | "running" | "executed" | "failed" | "skipped";

export interface ApprovalExecutionPage {
  slug: string;
  title?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

export interface ApprovalExecutionDeps {
  brainId?: string;
  getPage(slug: string): Promise<BrainPage | ApprovalExecutionPage>;
  createPage(page: {
    slug: string;
    title: string;
    type?: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  }): Promise<{ slug: string }>;
  updatePage(page: {
    slug: string;
    title?: string;
    type?: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  }): Promise<{ slug: string; success?: boolean }>;
  sendProactiveWhatsApp?(params: {
    to: string;
    brainId: string;
    scope: OutboundScope;
    freeform?: string;
    template?: WhatsAppTemplateMessage;
    urgent?: boolean;
    now?: Date;
  }): Promise<ProactiveSendResult>;
  sendWhatsAppText?(to: string, message: string): Promise<unknown>;
  now?: () => Date;
}

export interface ApprovalExecutionInput {
  actionSlug: string;
  executedBy: string;
  force?: boolean;
}

export interface ApprovalExecutionResult {
  actionSlug: string;
  actionType: ActionType;
  status: ExecutionStatus;
  effects: Array<{ kind: string; slug?: string; message?: string }>;
}

function fmOf(page: ApprovalExecutionPage): Partial<AgentActionFrontmatter> {
  return (page.frontmatter ?? {}) as Partial<AgentActionFrontmatter>;
}

function payloadOf(fm: Partial<AgentActionFrontmatter>): Record<string, unknown> {
  return fm.payload && typeof fm.payload === "object" && !Array.isArray(fm.payload)
    ? fm.payload
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter((v): v is string => Boolean(v));
}

function asOutboundScope(value: unknown, fallback: OutboundScope): OutboundScope {
  switch (value) {
    case "daily_briefing":
    case "deadline_alert":
    case "approval_request":
    case "conflict_alert":
    case "new_document":
    case "client_reminder":
      return value;
    default:
      return fallback;
  }
}

function asWhatsAppTemplate(value: unknown): WhatsAppTemplateMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const template = value as Record<string, unknown>;
  const name = asString(template.name);
  const language = template.language;
  if (!name || !language || typeof language !== "object" || Array.isArray(language)) {
    return undefined;
  }
  const code = asString((language as Record<string, unknown>).code);
  if (!code) return undefined;
  return {
    name,
    language: { code },
    components: Array.isArray(template.components)
      ? (template.components as WhatsAppTemplateMessage["components"])
      : undefined,
  };
}

function safeSlugPart(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "approval-effect"
  );
}

function resultFrontmatter(
  result: ApprovalExecutionResult,
  executedBy: string,
  at: Date
): Record<string, unknown> {
  return {
    execution_status: result.status,
    execution_result: {
      effects: result.effects,
    },
    executed_at: at.toISOString(),
    executed_by: executedBy,
    execution_error: undefined,
  };
}

function failedFrontmatter(error: unknown, executedBy: string, at: Date): Record<string, unknown> {
  return {
    execution_status: "failed",
    execution_error: error instanceof Error ? error.message : String(error),
    executed_at: at.toISOString(),
    executed_by: executedBy,
  };
}

async function sendMaybeWhatsApp(
  deps: ApprovalExecutionDeps,
  payload: Record<string, unknown>,
  effects: ApprovalExecutionResult["effects"],
  defaultScope: OutboundScope,
  at: Date
): Promise<void> {
  const channel = asString(payload.channel) ?? "whatsapp";
  const to = asString(payload.to) ?? asString(payload.recipient_phone);
  const message = asString(payload.message) ?? asString(payload.message_draft);
  if (channel !== "whatsapp") return;
  if (deps.sendProactiveWhatsApp) {
    if (!to || !message) throw new Error("whatsapp_payload_incomplete");
    const result = await deps.sendProactiveWhatsApp({
      to,
      brainId: deps.brainId ?? "default",
      scope: asOutboundScope(payload.whatsapp_scope ?? payload.scope, defaultScope),
      freeform: message,
      template: asWhatsAppTemplate(payload.template),
      urgent: payload.urgent === true,
      now: at,
    });
    if (!result.sent) {
      throw new Error(`whatsapp_blocked:${result.decision.reason ?? "blocked"}`);
    }
    effects.push({ kind: "whatsapp_sent", message: `Sent to ${to.slice(-4)}` });
    return;
  }
  if (!to || !message) return;
  if (!deps.sendWhatsAppText) {
    effects.push({
      kind: "whatsapp_ready",
      message: "WhatsApp payload validated; sender not attached.",
    });
    return;
  }
  await deps.sendWhatsAppText(to, message);
  effects.push({ kind: "whatsapp_sent", message: `Sent to ${to.slice(-4)}` });
}

async function executeCaseCreate(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  const payload = payloadOf(fm);
  const title =
    asString(payload.title) ?? asString(payload.case_title) ?? fm.summary ?? "Neue Akte";
  const clientName = asString(payload.client_name);
  const slug = asString(payload.case_slug) ?? `legal/cases/${safeSlugPart(title)}-${at.getTime()}`;
  await deps.createPage({
    slug,
    title,
    type: "legal_case",
    content: asString(payload.content) ?? fm.summary ?? title,
    frontmatter: {
      type: "legal_case",
      status: asString(payload.status) ?? "open",
      client_name: clientName,
      source_event_slug: fm.source_event_slug,
      created_via: "approval_execution",
      created_at: at.toISOString(),
      updated_at: at.toISOString(),
    },
  });
  return [{ kind: "case_created", slug }];
}

async function executeCaseClose(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  const slug = fm.target_slug ?? asString(payloadOf(fm).case_slug);
  if (!slug) throw new Error("case_close_requires_target_slug");
  await deps.updatePage({
    slug,
    frontmatter: {
      status: "closed",
      closed_at: at.toISOString(),
      updated_at: at.toISOString(),
    },
  });
  return [{ kind: "case_closed", slug }];
}

async function executeDeadlineCreate(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  const payload = payloadOf(fm);
  const title = asString(payload.title) ?? asString(payload.label) ?? fm.summary ?? "Frist";
  const dueDate = asString(payload.due_date) ?? asString(payload.date);
  if (!dueDate) throw new Error("deadline_create_requires_due_date");
  const caseSlug = asString(payload.case_slug) ?? fm.target_slug;
  const slug =
    asString(payload.deadline_slug) ?? `legal/deadlines/${safeSlugPart(title)}-${at.getTime()}`;
  await deps.createPage({
    slug,
    title,
    type: "legal_deadline",
    content: asString(payload.content) ?? fm.summary ?? title,
    frontmatter: {
      type: "legal_deadline",
      title,
      case_slug: caseSlug,
      due_date: dueDate,
      date: dueDate,
      review_status: "approved",
      source_event_slug: fm.source_event_slug,
      created_via: "approval_execution",
      created_at: at.toISOString(),
      updated_at: at.toISOString(),
    },
  });
  return [{ kind: "deadline_created", slug }];
}

async function executeDeadlineConfirm(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  const slug = fm.target_slug ?? asString(payloadOf(fm).deadline_slug);
  if (!slug) throw new Error("deadline_confirm_requires_target_slug");
  await deps.updatePage({
    slug,
    frontmatter: {
      review_status: "approved",
      approved_at: at.toISOString(),
      updated_at: at.toISOString(),
    },
  });
  return [{ kind: "deadline_confirmed", slug }];
}

async function executeDocumentRequestSend(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  const payload = payloadOf(fm);
  let slug = fm.target_slug ?? asString(payload.document_request_slug);
  const effects: ApprovalExecutionResult["effects"] = [];

  if (!slug) {
    const caseSlug = asString(payload.case_slug);
    if (!caseSlug) throw new Error("document_request_send_requires_case_slug_or_target_slug");
    const request = await buildDocumentRequest(
      {
        brainId: deps.brainId,
        caseSlug,
        items: asStringArray(payload.items).length ? asStringArray(payload.items) : ["Unterlagen"],
        channel: "whatsapp",
        status: "draft",
        sourceEventSlug: fm.source_event_slug,
        messageDraft: asString(payload.message) ?? asString(payload.message_draft),
        includePortalLink: payload.include_portal_link === true,
      },
      at
    );
    await deps.createPage({
      slug: request.slug,
      title: request.title,
      type: "document_request",
      content: request.content,
      frontmatter: { ...request.frontmatter },
    });
    slug = request.slug;
    effects.push({ kind: "document_request_created", slug });
  }

  await sendMaybeWhatsApp(deps, payload, effects, "client_reminder", at);
  await deps.updatePage({
    slug,
    frontmatter: {
      status: "sent",
      sent_at: at.toISOString(),
      updated_at: at.toISOString(),
    },
  });
  effects.push({ kind: "document_request_sent", slug });
  return effects;
}

async function executeMessageSend(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  const payload = payloadOf(fm);
  const effects: ApprovalExecutionResult["effects"] = [];
  await sendMaybeWhatsApp(deps, payload, effects, "client_reminder", at);
  if (!effects.length) {
    const message = asString(payload.message) ?? fm.summary ?? "Nachricht";
    const slug = `legal/messages/outbox/${safeSlugPart(message.slice(0, 48))}-${at.getTime()}`;
    await deps.createPage({
      slug,
      title: `Ausgang: ${message.slice(0, 60)}`,
      type: "message_draft",
      content: message,
      frontmatter: {
        type: "message_draft",
        status: "approved",
        channel: asString(payload.channel) ?? "manual",
        target_slug: fm.target_slug,
        created_via: "approval_execution",
        created_at: at.toISOString(),
        updated_at: at.toISOString(),
      },
    });
    effects.push({ kind: "message_approved", slug });
  }
  return effects;
}

async function executeSimpleTargetApproval(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date,
  kind: string
): Promise<ApprovalExecutionResult["effects"]> {
  const slug = fm.target_slug ?? asString(payloadOf(fm).target_slug);
  if (!slug) throw new Error(`${kind}_requires_target_slug`);
  await deps.updatePage({
    slug,
    frontmatter: {
      status: "approved",
      review_status: "approved",
      approved_at: at.toISOString(),
      updated_at: at.toISOString(),
    },
  });
  return [{ kind, slug }];
}

async function executeAction(
  deps: ApprovalExecutionDeps,
  fm: Partial<AgentActionFrontmatter>,
  at: Date
): Promise<ApprovalExecutionResult["effects"]> {
  switch (fm.action_type) {
    case "case_create":
      return executeCaseCreate(deps, fm, at);
    case "case_close":
      return executeCaseClose(deps, fm, at);
    case "deadline_create":
      return executeDeadlineCreate(deps, fm, at);
    case "deadline_confirm":
      return executeDeadlineConfirm(deps, fm, at);
    case "document_request_send":
      return executeDocumentRequestSend(deps, fm, at);
    case "client_message_send":
    case "message_send":
      return executeMessageSend(deps, fm, at);
    case "document_finalize":
      return executeSimpleTargetApproval(deps, fm, at, "document_finalized");
    case "invoice_create":
      return executeSimpleTargetApproval(deps, fm, at, "invoice_approved");
    case "booking_create":
      return executeSimpleTargetApproval(deps, fm, at, "booking_approved");
    default:
      throw new Error(`unsupported_action_type:${String(fm.action_type)}`);
  }
}

export async function executeApprovedAction(
  deps: ApprovalExecutionDeps,
  input: ApprovalExecutionInput
): Promise<ApprovalExecutionResult> {
  const at = deps.now?.() ?? new Date();
  const page = await deps.getPage(input.actionSlug);
  const fm = fmOf(page);

  if (fm.type !== "agent_action") throw new Error("not_an_agent_action");
  if (!fm.action_type) throw new Error("missing_action_type");
  if (fm.status !== "approved") throw new Error("action_not_approved");
  if (fm.execution_status === "executed" && !input.force) {
    return {
      actionSlug: input.actionSlug,
      actionType: fm.action_type,
      status: "skipped",
      effects: [{ kind: "already_executed", slug: input.actionSlug }],
    };
  }

  await deps.updatePage({
    slug: input.actionSlug,
    frontmatter: {
      execution_status: "running",
      execution_error: undefined,
    },
  });

  try {
    const effects = await executeAction(deps, fm, at);
    const result: ApprovalExecutionResult = {
      actionSlug: input.actionSlug,
      actionType: fm.action_type,
      status: "executed",
      effects,
    };
    await deps.updatePage({
      slug: input.actionSlug,
      frontmatter: resultFrontmatter(result, input.executedBy, at),
    });
    return result;
  } catch (error) {
    await deps.updatePage({
      slug: input.actionSlug,
      frontmatter: failedFrontmatter(error, input.executedBy, at),
    });
    throw error;
  }
}
