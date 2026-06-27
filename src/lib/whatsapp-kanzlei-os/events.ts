import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import type { WhatsAppIdentity, WhatsAppIncomingMessage } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import type { IntentRisk, KanzleiOsActorRole } from "@/lib/whatsapp-kanzlei-os/risk";

export type ConversationEventStatus =
  | "received"
  | "routed"
  | "action_pending"
  | "pending_approval"
  | "executed"
  | "failed"
  | "ignored";

export interface ConversationEventInput {
  message: WhatsAppIncomingMessage;
  sender: WhatsAppIdentity;
  normalizedText: string;
  risk: IntentRisk;
  status?: ConversationEventStatus;
  caseSlug?: string;
  intakeSlug?: string;
  details?: Record<string, unknown>;
}

export interface ConversationEventRecord {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
}

function safeSlugPart(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96) || "event"
  );
}

export function buildConversationEvent(
  input: ConversationEventInput,
  at: Date = new Date()
): ConversationEventRecord {
  const slug = `legal/conversations/whatsapp/${safeSlugPart(input.message.id)}`;
  const role = (input.sender.role ?? "unknown") as KanzleiOsActorRole;
  const frontmatter: Record<string, unknown> = {
    type: "conversation_event",
    channel: "whatsapp",
    provider_message_id: input.message.id,
    direction: "inbound",
    role,
    actor_id: input.sender.userId,
    actor_name: input.sender.name,
    phone_hash: phoneHash(input.message.from),
    tenant_brain_id: input.sender.brainId,
    org_id: input.sender.orgId,
    case_slug: input.caseSlug,
    intake_slug: input.intakeSlug,
    message_type: input.message.type,
    normalized_text: input.normalizedText,
    language: "de",
    intent: input.risk.intent,
    risk_level: input.risk.riskLevel,
    requires_approval: input.risk.requiresApproval,
    client_facing: input.risk.clientFacing,
    status: input.status ?? "received",
    created_at: at.toISOString(),
    details: input.details,
  };

  return {
    slug,
    title: `WhatsApp ${input.risk.intent}: ${input.message.id}`,
    frontmatter,
  };
}

export async function writeConversationEvent(
  brainId: string,
  event: ConversationEventRecord,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({
      slug: event.slug,
      title: event.title,
      type: "conversation_event",
      content: String(event.frontmatter.normalized_text ?? ""),
      frontmatter: event.frontmatter,
      merge: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `conversation_event_write_failed:${res.status}`);
  }
}
