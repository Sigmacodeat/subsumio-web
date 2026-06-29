// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  extractIncomingMessages,
  extractTextMessages,
  extractMessageStatuses,
  normalizePhone,
  type WhatsAppWebhookPayload,
  type WhatsAppTextMessage,
} from "./types";

const makeTextPayload = (text: string): WhatsAppWebhookPayload => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-1",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "123", display_phone_number: "+43 1 2345678" },
            messages: [
              {
                id: "msg-1",
                from: "+43 699 1234567",
                timestamp: "1700000000",
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
});

describe("extractIncomingMessages", () => {
  test("extracts text message", () => {
    const messages = extractIncomingMessages(makeTextPayload("Hallo"));
    expect(messages).toHaveLength(1);
    const msg = messages[0] as WhatsAppTextMessage;
    expect(msg.type).toBe("text");
    expect(msg.text).toBe("Hallo");
    expect(msg.from).toBe("+436991234567");
  });

  test("extracts button reply", () => {
    const payload: WhatsAppWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "msg-2",
                    from: "+43 699 1234567",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "btn-1", title: "Ja" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = extractIncomingMessages(payload);
    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg.type).toBe("button_reply");
    if (msg.type === "button_reply") {
      expect(msg.buttonId).toBe("btn-1");
      expect(msg.buttonText).toBe("Ja");
    }
  });

  test("extracts reaction", () => {
    const payload: WhatsAppWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "msg-3",
                    from: "+43 699 1234567",
                    type: "reaction",
                    reaction: { message_id: "msg-1", emoji: "👍" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = extractIncomingMessages(payload);
    const msg = messages[0];
    expect(msg.type).toBe("reaction");
    if (msg.type === "reaction") {
      expect(msg.emoji).toBe("👍");
    }
  });

  test("ignores media messages without id", () => {
    const payload: WhatsAppWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "msg-4",
                    from: "+43 699 1234567",
                    type: "image",
                    image: { mime_type: "image/png" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const messages = extractIncomingMessages(payload);
    expect(messages).toHaveLength(0);
  });
});

describe("extractTextMessages", () => {
  test("filters only text messages", () => {
    const payload = makeTextPayload("Hallo");
    const textMessages = extractTextMessages(payload);
    expect(textMessages).toHaveLength(1);
    expect(textMessages[0].text).toBe("Hallo");
  });
});

describe("extractMessageStatuses", () => {
  test("extracts delivered status", () => {
    const payload: WhatsAppWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "msg-1",
                    recipient_id: "+43 699 1234567",
                    status: "delivered",
                    timestamp: "1700000000",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const statuses = extractMessageStatuses(payload);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe("delivered");
    expect(statuses[0].recipientId).toBe("+43 699 1234567");
  });

  test("skips statuses without id", () => {
    const payload: WhatsAppWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              value: {
                statuses: [{ status: "sent", timestamp: "1700000000" }],
              },
            },
          ],
        },
      ],
    };
    expect(extractMessageStatuses(payload)).toHaveLength(0);
  });
});

describe("normalizePhone", () => {
  test("adds leading plus", () => {
    expect(normalizePhone("+43 699 1234567")).toBe("+436991234567");
  });

  test("adds plus if missing", () => {
    expect(normalizePhone("436991234567")).toBe("+436991234567");
  });

  test("removes spaces and dashes", () => {
    expect(normalizePhone("+43-699-123-4567")).toBe("+436991234567");
  });
});
