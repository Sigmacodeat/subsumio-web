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

export type WhatsAppIncomingMessage = WhatsAppTextMessage | WhatsAppMediaMessage;

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
        if (msg.type === "text" && msg.text?.body) {
          messages.push({ ...base, text: msg.text.body.trim(), type: "text" });
          continue;
        }

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

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}
