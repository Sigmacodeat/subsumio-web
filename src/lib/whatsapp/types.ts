export interface WhatsAppSenderBinding {
  phone: string;
  brainId: string;
  userId?: string;
  name?: string;
  role?: "admin" | "lawyer" | "assistant" | "client" | "external" | "intake";
  /** Email of the linked user account — set at runtime for staff senders, never stored. */
  email?: string;
}

/**
 * DB-backed identity for a WhatsApp sender (Paket 33, P0-SECR-002).
 *
 * Superset of {@link WhatsAppSenderBinding} — every legacy field stays so existing
 * webhook handlers keep working. Adds the security fields the env-based binding
 * never had: stable id, explicit tenant (`orgId`), verification state, lifecycle
 * `status`, and the permission-aware `matterScope`. The raw phone is never the key —
 * lookups go through the SHA-256 `phoneHash`.
 */
export interface WhatsAppIdentity extends WhatsAppSenderBinding {
  id: string;
  /** Tenant key. Defaults to brainId when org and brain are 1:1. */
  orgId: string;
  /** SHA-256 of the normalized phone — the lookup key. Raw phone is not persisted. */
  phoneHash: string;
  /** Matters this sender may reach. `"all"` = role-scoped, no per-matter restriction. */
  matterScope: string[] | "all";
  /** Lifecycle. Only `active` identities resolve. */
  status: "active" | "suspended" | "revoked";
  /** ISO timestamp of identity verification (OTP / portal link), or null if unverified. */
  verifiedAt: string | null;
  /**
   * `userId` was explicitly chosen by an administrator as the person this
   * number belongs to. Older firm identities stored the administrator who
   * registered the number in `userId`; they stay unlinked (no firm commands)
   * until an administrator links the right account.
   */
  userLinked?: boolean;
  createdAt: string;
  updatedAt: string;
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

export type WhatsAppIncomingMessage =
  | WhatsAppTextMessage
  | WhatsAppMediaMessage
  | WhatsAppButtonReplyMessage
  | WhatsAppListReplyMessage
  | WhatsAppReactionMessage
  | WhatsAppLocationMessage
  | WhatsAppContactMessage;

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

export type WhatsAppInteractiveMessage =
  | WhatsAppInteractiveButtonMessage
  | WhatsAppInteractiveListMessage;

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
      document?: {
        id?: string;
        mime_type?: string;
        sha256?: string;
        filename?: string;
        caption?: string;
      };
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
      errors?: Array<{
        code?: string;
        title?: string;
        message?: string;
        error_data?: { detail?: string };
      }>;
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
  return extractIncomingMessages(payload).filter(
    (message): message is WhatsAppTextMessage => message.type === "text"
  );
}

export function extractIncomingMessages(
  payload: WhatsAppWebhookPayload
): WhatsAppIncomingMessage[] {
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
          const interactive = (msg as Record<string, unknown>).interactive as Record<
            string,
            unknown
          >;
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
          msg.type === "image"
            ? msg.image
            : msg.type === "audio"
              ? msg.audio
              : msg.type === "video"
                ? msg.video
                : msg.type === "document"
                  ? msg.document
                  : msg.type === "sticker"
                    ? msg.sticker
                    : undefined;
        if (!media?.id) continue;
        const mediaRecord = media as Record<string, unknown>;
        messages.push({
          ...base,
          type:
            msg.type === "audio" && msg.audio?.voice
              ? "voice"
              : (msg.type as WhatsAppMediaMessage["type"]),
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

/** Countries the firm can name as its default for national number formats. */
export type PhoneCountry = "AT" | "DE" | "CH";

export const PHONE_COUNTRY_CODES: Record<PhoneCountry, string> = {
  AT: "43",
  DE: "49",
  CH: "41",
};

/** The firm's default country from a jurisdiction value ("AT", "de", …); AT otherwise. */
export function phoneCountryFor(jurisdiction: string | null | undefined): PhoneCountry {
  const j = (jurisdiction ?? "").trim().toUpperCase();
  return j === "DE" || j === "CH" ? j : "AT";
}

/**
 * E.164 form (`+<country><number>`) of a phone number as people write it.
 *
 *  - `+43 664 123 45 67`, `+43 (0) 664 …` → `+43664…` (the national trunk
 *    "0" written in brackets after the country code is dropped)
 *  - `0043 664 …` (international prefix 00) → `+43664…`
 *  - `0664 123 45 67` (national, trunk prefix 0) → `+43664…` with the firm's
 *    default country (`defaultCountry`, AT unless the firm is DE/CH)
 *  - `436641234567` (digits only, as Meta delivers the sender) → `+436641234567`
 *
 * Meta always sends the international form without "+", so an inbound sender
 * and a number the firm typed in national form now hash to the same value.
 */
export function normalizePhone(phone: string, defaultCountry: PhoneCountry = "AT"): string {
  let s = phone.trim();
  // "+43 (0) 664 …" — the bracketed trunk zero is not dialled internationally.
  s = s.replace(/^(\+\d{1,3})\s*\(0\)/, "$1");
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\+/g, "")}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+${PHONE_COUNTRY_CODES[defaultCountry]}${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * The forms an older version of normalizePhone produced for this number when
 * it was entered nationally ("0664 …" → "+0664…") or with the 00 prefix
 * ("0043 664 …" → "+0043664…"). Identities stored back then carry a hash of
 * that form; the sender lookup tries these once and re-keys the identity.
 */
export function legacyPhoneForms(e164: string): string[] {
  const forms: string[] = [];
  for (const cc of Object.values(PHONE_COUNTRY_CODES)) {
    if (!e164.startsWith(`+${cc}`)) continue;
    const national = e164.slice(1 + cc.length);
    if (!national) continue;
    forms.push(`+0${national}`, `+00${cc}${national}`);
  }
  return forms;
}
