export interface WhatsAppSenderBinding {
  phone: string;
  brainId: string;
  userId?: string;
  name?: string;
  role?: "admin" | "lawyer" | "assistant";
}

export interface WhatsAppTextMessage {
  id: string;
  from: string;
  timestamp?: string;
  text: string;
  type: "text";
}

export interface WhatsAppMediaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: "image" | "audio" | "voice" | "video" | "document" | "sticker";
  mediaId: string;
  mimeType?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
}

// ── Reaction, Location & Contact Messages ────────────────────────────────

export interface WhatsAppReactionMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: "reaction";
  messageId: string; // the message being reacted to
  emoji: string;
}

export interface WhatsAppLocationMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: "location";
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppContactMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: "contact";
  contacts: Array<{
    formattedName: string;
    firstName?: string;
    lastName?: string;
    phones: string[];
    emails?: string[];
  }>;
}

// ── Message Status ─────────────────────────────────────────────────────────

export interface WhatsAppMessageStatus {
  id: string; // message ID
  recipientId: string; // recipient phone hash
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  errors?: Array<{ code: string; title: string; message: string }>;
}

export type WhatsAppIncomingMessage = WhatsAppTextMessage | WhatsAppMediaMessage | WhatsAppButtonReplyMessage | WhatsAppListReplyMessage | WhatsAppReactionMessage | WhatsAppLocationMessage | WhatsAppContactMessage;

// ── Button & List Reply (interactive message responses) ──────────────────

export interface WhatsAppButtonReplyMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: "button_reply";
  buttonId: string;
  buttonText: string;
}

export interface WhatsAppListReplyMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: "list_reply";
  listRowId: string;
  listTitle: string;
  listDescription?: string;
}

// ── Outbound Template Messages ────────────────────────────────────────────

export interface WhatsAppTemplateParameter {
  type: "text" | "currency" | "date_time" | "image" | "document" | "video";
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { id?: string; link?: string };
  document?: { id?: string; link?: string; filename?: string };
  video?: { id?: string; link?: string };
}

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "url" | "quick_reply";
  index?: string;
  parameters: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplateMessage {
  name: string;
  language: { code: string };
  components?: WhatsAppTemplateComponent[];
}

// ── Outbound Interactive Messages (Buttons & Lists) ───────────────────────

export interface WhatsAppButton {
  type: "reply";
  reply: { id: string; title: string };
}

export interface WhatsAppInteractiveButtonMessage {
  type: "button";
  body: { text: string };
  action: { buttons: WhatsAppButton[] };
  header?: { type: "text"; text: string };
  footer?: { text: string };
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title?: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppInteractiveListMessage {
  type: "list";
  body: { text: string };
  action: { button: string; sections: WhatsAppListSection[] };
  header?: { type: "text"; text: string };
  footer?: { text: string };
}

export type WhatsAppInteractiveMessage = WhatsAppInteractiveButtonMessage | WhatsAppInteractiveListMessage;

// ── Outbound Media Send ───────────────────────────────────────────────────

export interface WhatsAppMediaSendOptions {
  type: "image" | "document" | "audio" | "video" | "sticker";
  mediaId?: string; // Graph API media ID (uploaded previously)
  link?: string; // public URL for media
  caption?: string;
  filename?: string; // for documents
}

// ── Outbound Message Union ────────────────────────────────────────────────

export type WhatsAppOutboundMessage =
  | { type: "text"; text: string }
  | { type: "template"; template: WhatsAppTemplateMessage }
  | { type: "interactive"; interactive: WhatsAppInteractiveMessage }
  | { type: "media"; media: WhatsAppMediaSendOptions };

export interface WhatsAppWebhookChange {
  value?: {
    messaging_product?: string;
    metadata?: {
      phone_number_id?: string;
      display_phone_number?: string;
    };
    messages?: Array<{
      id?: string;
      from?: string;
      timestamp?: string;
      type?: string;
      text?: { body?: string };
      image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
      audio?: { id?: string; mime_type?: string; sha256?: string; voice?: boolean };
      video?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
      document?: { id?: string; mime_type?: string; sha256?: string; filename?: string; caption?: string };
      sticker?: { id?: string; mime_type?: string; sha256?: string; animated?: boolean };
      interactive?: {
        type?: string;
        button_reply?: { id?: string; title?: string };
        list_reply?: { id?: string; title?: string; description?: string };
      };
      reaction?: {
        message_id?: string;
        emoji?: string;
      };
      location?: {
        latitude?: number;
        longitude?: number;
        name?: string;
        address?: string;
      };
      contacts?: Array<{
        name?: { formatted_name?: string; first_name?: string; last_name?: string };
        phones?: Array<{ phone?: string; type?: string; wa_id?: string }>;
        emails?: Array<{ email?: string; type?: string }>;
      }>;
    }>;
    statuses?: Array<{
      id?: string;
      recipient_id?: string;
      status?: "sent" | "delivered" | "read" | "failed";
      timestamp?: string;
      errors?: Array<{ code?: string; title?: string; message?: string; error_data?: { detail?: string } }>;
    }>;
  };
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: WhatsAppWebhookChange[];
  }>;
}

export function extractTextMessages(payload: WhatsAppWebhookPayload): WhatsAppTextMessage[] {
  return extractIncomingMessages(payload).filter((message): message is WhatsAppTextMessage => message.type === "text");
}

export function extractIncomingMessages(payload: WhatsAppWebhookPayload): WhatsAppIncomingMessage[] {
  const messages: WhatsAppIncomingMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (!msg.id || !msg.from || !msg.type) continue;
        const base = { id: msg.id, from: normalizePhone(msg.from), timestamp: msg.timestamp };

        // Text messages
        if (msg.type === "text" && msg.text?.body) {
          messages.push({ ...base, text: msg.text.body.trim(), type: "text" });
          continue;
        }

        // Interactive button reply
        if (msg.type === "interactive" && (msg as Record<string, unknown>).interactive) {
          const interactive = (msg as Record<string, unknown>).interactive as Record<string, unknown>;
          if (interactive.type === "button_reply") {
            const br = interactive.button_reply as Record<string, unknown> | undefined;
            messages.push({
              ...base,
              type: "button_reply",
              buttonId: String(br?.id ?? ""),
              buttonText: String(br?.title ?? ""),
            });
            continue;
          }
          if (interactive.type === "list_reply") {
            const lr = interactive.list_reply as Record<string, unknown> | undefined;
            messages.push({
              ...base,
              type: "list_reply",
              listRowId: String(lr?.id ?? ""),
              listTitle: String(lr?.title ?? ""),
              listDescription: lr?.description ? String(lr.description) : undefined,
            });
            continue;
          }
        }

        // Reaction messages
        if (msg.type === "reaction" && msg.reaction) {
          messages.push({
            ...base,
            type: "reaction",
            messageId: msg.reaction.message_id ?? "",
            emoji: msg.reaction.emoji ?? "",
          });
          continue;
        }

        // Location messages
        if (msg.type === "location" && msg.location) {
          messages.push({
            ...base,
            type: "location",
            latitude: msg.location.latitude ?? 0,
            longitude: msg.location.longitude ?? 0,
            name: msg.location.name,
            address: msg.location.address,
          });
          continue;
        }

        // Contact messages
        if (msg.type === "contacts" && msg.contacts) {
          const contacts = msg.contacts.map((c) => ({
            formattedName: c.name?.formatted_name ?? "",
            firstName: c.name?.first_name,
            lastName: c.name?.last_name,
            phones: (c.phones ?? []).map((p) => p.phone ?? p.wa_id ?? "").filter(Boolean),
            emails: (c.emails ?? []).map((e) => e.email ?? "").filter(Boolean),
          }));
          messages.push({ ...base, type: "contact", contacts });
          continue;
        }

        // Media messages
        const media =
          msg.type === "image" ? msg.image
          : msg.type === "audio" ? msg.audio
          : msg.type === "video" ? msg.video
          : msg.type === "document" ? msg.document
          : msg.type === "sticker" ? msg.sticker
          : undefined;
        if (!media?.id) continue;
        const mediaRecord = media as Record<string, unknown>;
        messages.push({
          ...base,
          type: msg.type === "audio" && msg.audio?.voice ? "voice" : msg.type as WhatsAppMediaMessage["type"],
          mediaId: media.id,
          mimeType: media.mime_type,
          sha256: media.sha256,
          filename: typeof mediaRecord.filename === "string" ? mediaRecord.filename : undefined,
          caption: typeof mediaRecord.caption === "string" ? mediaRecord.caption : undefined,
        });
      }
    }
  }
  return messages;
}

/** Extract outbound message status updates (sent/delivered/read/failed) from webhook payload. */
export function extractMessageStatuses(payload: WhatsAppWebhookPayload): WhatsAppMessageStatus[] {
  const statuses: WhatsAppMessageStatus[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        if (!s.id || !s.status) continue;
        statuses.push({
          id: s.id,
          recipientId: s.recipient_id ?? "",
          status: s.status,
          timestamp: s.timestamp ?? new Date().toISOString(),
          errors: s.errors?.map((e) => ({
            code: e.code ?? "",
            title: e.title ?? "",
            message: e.message ?? e.error_data?.detail ?? "",
          })),
        });
      }
    }
  }
  return statuses;
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}
