import type { Meta, StoryObj } from "@storybook/react";
import { ChatMessageBubble } from "./chat-message";
import { fn } from "@storybook/test";
import type { ChatMessage } from "./chat-types";

const baseMessage: ChatMessage = {
  id: "msg-1",
  role: "assistant",
  content:
    "Hier ist die angeforderte Zusammenfassung. Die Frist setzt sich zusammen aus der Zustellungsfrist nach § 274 ZPO und der Klagefrist gemäß § 261 ZPO.",
  createdAt: new Date().toISOString(),
  tokensUsed: 128,
  latencyMs: 1200,
  model: "gpt-4",
};

const meta: Meta<typeof ChatMessageBubble> = {
  title: "Chat/ChatMessageBubble",
  component: ChatMessageBubble,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    message: baseMessage,
    features: { markdownRendering: true, messageActions: true, tokenWidget: true },
    onRegenerate: fn(),
    onEdit: fn(),
    onReply: fn(),
    onExport: fn(),
    onToolConfirm: fn(),
    onToolCancel: fn(),
    onToolRetry: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Assistant: Story = {};

export const User: Story = {
  args: {
    message: {
      id: "msg-2",
      role: "user",
      content: "Wie berechnet sich die Klagefrist?",
      createdAt: new Date().toISOString(),
    },
  },
};

export const WithCitations: Story = {
  args: {
    message: {
      ...baseMessage,
      citations: [
        { slug: "zpo-261", title: "§ 261 ZPO", page_number: 12 },
        { slug: "zpo-274", title: "§ 274 ZPO" },
      ],
    },
  },
};

export const WithGaps: Story = {
  args: {
    message: {
      ...baseMessage,
      gaps: ["Beweiskette zur Zustellung unvollständig", "Aktenzeichen fehlt"],
    },
  },
};

export const WithAttachments: Story = {
  args: {
    message: {
      id: "msg-3",
      role: "user",
      content: "Bitte prüfen Sie den angehängten Vertrag.",
      createdAt: new Date().toISOString(),
      attachments: [{ name: "vertrag.pdf", slug: "doc-1" }],
    },
  },
};

export const WithToolCall: Story = {
  args: {
    message: {
      ...baseMessage,
      content: "Ich öffne die Fristen-Seite für Sie.",
      toolCalls: [
        {
          id: "tc-1",
          type: "navigate",
          label: " navigate",
          status: "executing",
          params: { path: "/dashboard/deadlines" },
        },
      ],
    },
  },
};

export const Streaming: Story = {
  args: {
    message: {
      ...baseMessage,
      content: "Ich denke",
      isStreaming: true,
    },
  },
};

export const ErrorState: Story = {
  args: {
    message: {
      ...baseMessage,
      content: "",
      error: "Die KI-Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
    },
  },
};
