/**
 * Client messages for the WhatsApp inbox.
 *
 * Firm members' commands are logged as `chat_inbox`; client messages are
 * logged as `conversation_event` (inbound, role client/external/intake). The
 * inbox shows both, so a lawyer sees and can answer what a client wrote.
 */

import type { BrainPage } from "@/lib/types";

const CLIENT_ROLES = new Set(["client", "external", "intake"]);

export interface InboxClientMessage {
  slug: string;
  senderHash: string;
  senderName?: string;
  content: string;
  timestamp: string;
  messageType: string;
  status?: string;
  intent?: string;
  caseSlug?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function clientConversationMessages(pages: BrainPage[]): InboxClientMessage[] {
  const out: InboxClientMessage[] = [];
  for (const page of pages) {
    const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
    if (fm.channel !== "whatsapp" || fm.direction !== "inbound") continue;
    if (!CLIENT_ROLES.has(str(fm.role))) continue;
    const senderHash = str(fm.phone_hash);
    if (!senderHash) continue;
    out.push({
      slug: page.slug,
      senderHash,
      senderName: str(fm.actor_name) || undefined,
      content:
        str(fm.normalized_text) || page.content || `[${str(fm.message_type) || "Nachricht"}]`,
      timestamp: str(fm.created_at) || page.created_at || "",
      messageType: str(fm.message_type) || "text",
      status: str(fm.status) || undefined,
      intent: str(fm.intent) || undefined,
      caseSlug: str(fm.case_slug) || undefined,
    });
  }
  return out;
}
