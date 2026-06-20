import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { ACTION_LABELS, agentActionFrontmatter, type ActionType } from "@/lib/approval";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";
import type { IntentRisk } from "./risk";

export interface WhatsAppApprovalInput {
  sender: WhatsAppIdentity;
  eventSlug: string;
  normalizedText: string;
  risk: IntentRisk;
  targetSlug?: string;
  caseSlug?: string;
  recipientPhone?: string;
  messageDraft?: string;
  documentItems?: string[];
}

export interface WhatsAppApprovalRecord {
  slug: string;
  actionType: ActionType;
}

export function actionTypeForWhatsAppIntent(intent: string): ActionType {
  switch (intent) {
    case "deadline":
      return "deadline_confirm";
    case "create_case":
      return "case_create";
    case "close_case":
      return "case_close";
    case "create_invoice":
      return "invoice_create";
    case "document_request":
      return "document_request_send";
    case "expense":
      return "booking_create";
    default:
      return "client_message_send";
  }
}

function safeSlugPart(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "approval";
}

function isClientRole(role: WhatsAppIdentity["role"] | undefined): boolean {
  return role === "client" || role === "external" || role === "intake";
}

function defaultClientFollowUp(input: WhatsAppApprovalInput): string {
  if (input.messageDraft?.trim()) return input.messageDraft.trim();
  return [
    "Danke, Ihre Anfrage wurde in der Kanzlei aufgenommen.",
    "Wir pruefen den Sachverhalt und melden uns mit den naechsten Schritten.",
  ].join("\n");
}

function buildExecutablePayload(input: WhatsAppApprovalInput, actionType: ActionType): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    channel: "whatsapp",
    intent: input.risk.intent,
    risk_level: input.risk.riskLevel,
    client_facing: input.risk.clientFacing,
    text: input.normalizedText,
  };

  if (input.caseSlug) payload.case_slug = input.caseSlug;
  if (input.targetSlug) payload.target_slug = input.targetSlug;

  if (actionType === "client_message_send") {
    payload.to = input.recipientPhone ?? (isClientRole(input.sender.role) ? input.sender.phone : undefined);
    payload.message = defaultClientFollowUp(input);
    payload.related_intake_slug = input.targetSlug;
  }

  if (actionType === "document_request_send") {
    payload.document_request_slug = input.targetSlug;
    payload.to = input.recipientPhone;
    payload.items = input.documentItems ?? [];
    payload.message = input.messageDraft;
  }

  if (actionType === "case_create") {
    payload.title = input.messageDraft ?? (input.normalizedText.slice(0, 120) || "Neue WhatsApp-Akte");
    payload.client_name = isClientRole(input.sender.role) ? input.sender.name : undefined;
    payload.source_intake_slug = input.targetSlug;
  }

  return payload;
}

export function buildWhatsAppApproval(input: WhatsAppApprovalInput, at: Date = new Date()): {
  slug: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  actionType: ActionType;
} {
  const actionType = actionTypeForWhatsAppIntent(input.risk.intent);
  const stamp = at.toISOString().slice(0, 10);
  const slug = `agent-action/whatsapp/${stamp}/${safeSlugPart(input.risk.intent)}-${at.getTime()}`;
  const label = ACTION_LABELS[actionType];
  const actor = input.sender.name || input.sender.userId || "WhatsApp";
  const summary = `${label}: ${input.normalizedText.slice(0, 220) || input.risk.intent}`;

  return {
    slug,
    title: `Freigabe: ${summary.slice(0, 80)}`,
    content: input.normalizedText,
    actionType,
    frontmatter: agentActionFrontmatter({
      action_type: actionType,
      proposed_by: actor,
      summary,
      target_slug: input.targetSlug,
      source_event_slug: input.eventSlug,
      payload: buildExecutablePayload(input, actionType),
      at,
    }),
  };
}

export async function writeWhatsAppApproval(
  brainId: string,
  approval: ReturnType<typeof buildWhatsAppApproval>,
  fetchImpl: typeof fetch = fetch
): Promise<WhatsAppApprovalRecord> {
  const res = await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({
      slug: approval.slug,
      title: approval.title,
      type: "agent_action",
      content: approval.content,
      frontmatter: approval.frontmatter,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `whatsapp_approval_write_failed:${res.status}`);
  }

  return { slug: approval.slug, actionType: approval.actionType };
}
