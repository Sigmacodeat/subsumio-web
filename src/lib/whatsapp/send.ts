import { withRetry, externalFetchTimeout } from "@/lib/retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import type {
  WhatsAppTemplateMessage,
  WhatsAppInteractiveMessage,
  WhatsAppMediaSendOptions,
  WhatsAppOutboundMessage,
} from "./types";

const log = logger("whatsapp");

function graphVersion(): string {
  return env("WHATSAPP_GRAPH_VERSION") || "v20.0";
}

function getCredentials(): { token: string; phoneNumberId: string } | null {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    log.warn("outbound skipped: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing");
    return null;
  }
  return { token, phoneNumberId };
}

async function postToGraph(
  endpoint: string,
  body: Record<string, unknown>,
  token: string
): Promise<Response> {
  return withRetry(() =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: externalFetchTimeout(),
    })
  );
}

/** Send a plain text message. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const creds = getCredentials();
  if (!creds) return;

  const res = await postToGraph(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(creds.phoneNumberId)}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { preview_url: false, body: body.slice(0, 3900) },
    },
    creds.token
  );

  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp send failed: HTTP ${res.status}`);
  }
}

/** Send a pre-approved template message. */
export async function sendWhatsAppTemplate(
  to: string,
  template: WhatsAppTemplateMessage
): Promise<{ messageId: string }> {
  const creds = getCredentials();
  if (!creds) throw new Error("WhatsApp not configured");

  const res = await postToGraph(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(creds.phoneNumberId)}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "template",
      template,
    },
    creds.token
  );

  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp template send failed: HTTP ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
  return { messageId: data.messages?.[0]?.id ?? "" };
}

/** Send an interactive message (buttons or list). */
export async function sendWhatsAppInteractive(
  to: string,
  interactive: WhatsAppInteractiveMessage
): Promise<{ messageId: string }> {
  const creds = getCredentials();
  if (!creds) throw new Error("WhatsApp not configured");

  const res = await postToGraph(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(creds.phoneNumberId)}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "interactive",
      interactive,
    },
    creds.token
  );

  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp interactive send failed: HTTP ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
  return { messageId: data.messages?.[0]?.id ?? "" };
}

/** Send a media message (image, document, audio, video, sticker) by media ID or public URL. */
export async function sendWhatsAppMedia(
  to: string,
  media: WhatsAppMediaSendOptions
): Promise<{ messageId: string }> {
  const creds = getCredentials();
  if (!creds) throw new Error("WhatsApp not configured");

  if (!media.mediaId && !media.link) {
    throw new Error("Either mediaId or link must be provided");
  }

  const mediaPayload: Record<string, unknown> = {};
  if (media.mediaId) mediaPayload.id = media.mediaId;
  if (media.link) mediaPayload.link = media.link;
  if (
    media.caption &&
    (media.type === "image" || media.type === "video" || media.type === "document")
  ) {
    mediaPayload.caption = media.caption;
  }
  if (media.filename && media.type === "document") {
    mediaPayload.filename = media.filename;
  }

  const res = await postToGraph(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(creds.phoneNumberId)}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: media.type,
      [media.type]: mediaPayload,
    },
    creds.token
  );

  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp media send failed: HTTP ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
  return { messageId: data.messages?.[0]?.id ?? "" };
}

/** Upload media to WhatsApp Graph API and return the media ID for later use in sendWhatsAppMedia. */
export async function uploadWhatsAppMedia(
  bytes: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new Error("WhatsApp not configured");

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  formData.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);

  const res = await withRetry(() =>
    fetch(
      `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(creds.phoneNumberId)}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
        },
        body: formData,
        signal: externalFetchTimeout(30_000),
      }
    )
  );

  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `WhatsApp media upload failed: HTTP ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  if (!data.id) throw new Error("WhatsApp media upload returned no media ID");
  return data.id;
}

/** Generic dispatcher for any outbound WhatsApp message type. */
export async function sendWhatsAppMessage(
  to: string,
  message: WhatsAppOutboundMessage
): Promise<{ messageId: string }> {
  switch (message.type) {
    case "text":
      await sendWhatsAppText(to, message.text);
      return { messageId: "" };
    case "template":
      return sendWhatsAppTemplate(to, message.template);
    case "interactive":
      return sendWhatsAppInteractive(to, message.interactive);
    case "media":
      return sendWhatsAppMedia(to, message.media);
  }
}
