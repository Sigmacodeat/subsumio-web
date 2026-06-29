import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ChatMessage } from "./chat-types";
import { ChatMessageBubble } from "./chat-message";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (key: string) => key, setLang: vi.fn() }),
}));

vi.mock("@/lib/markdown", () => ({
  renderMarkdown: (content: string) => `<p>${content}</p>`,
}));

vi.mock("@/components/legal/CitationLink", () => ({
  AIBadge: () => <span data-testid="ai-badge">AI</span>,
  GroundingStatus: ({ citations }: { citations?: unknown[] }) => (
    <span data-testid="grounding-status">{citations?.length ?? 0}</span>
  ),
}));

vi.mock("@/components/legal/CitationPanel", () => ({
  CitationBadgesInline: () => <span data-testid="citation-badges-inline">Citations</span>,
}));

vi.mock("@/components/chat/tool-call-bubble", () => ({
  ToolCallBubble: ({ toolCall }: { toolCall: { id: string; label: string; status: string } }) => (
    <div data-testid={`tool-call-${toolCall.id}`}>{toolCall.label}</div>
  ),
}));

function renderMessage(
  message: ChatMessage,
  props: Partial<React.ComponentProps<typeof ChatMessageBubble>> = {}
) {
  return render(
    <ChatMessageBubble
      message={message}
      features={{ markdownRendering: true, messageActions: true, tokenWidget: true }}
      {...props}
    />
  );
}

describe("ChatMessageBubble", () => {
  it("renders a user message with content", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "user",
      content: "Hallo",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message);
    expect(screen.getByText("Hallo")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveAttribute("aria-label", "chat.msg_user_aria");
  });

  it("renders an assistant message with markdown", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Hallo",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message);
    expect(screen.getByText("Hallo")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveAttribute("aria-label", "chat.msg_ai_aria");
  });

  it("renders an error message with alert icon", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "",
      error: "Netzwerkfehler",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message);
    expect(screen.getByText("Netzwerkfehler")).toBeInTheDocument();
  });

  it("shows attachments", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "user",
      content: "Anbei",
      createdAt: new Date().toISOString(),
      attachments: [{ name: "vertrag.pdf", slug: "file-1" }],
    };
    renderMessage(message);
    expect(screen.getByText("vertrag.pdf")).toBeInTheDocument();
  });

  it("shows citations and gaps for assistant messages", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Antwort",
      createdAt: new Date().toISOString(),
      citations: [{ slug: "c1", title: "Zitat 1" }],
      gaps: ["Fehlende Beweiskette"],
    };
    renderMessage(message);
    expect(screen.getByTestId("citation-badges-inline")).toBeInTheDocument();
    expect(screen.getByText("Zitat 1")).toBeInTheDocument();
    expect(screen.getByText(/Fehlende Beweiskette/i)).toBeInTheDocument();
  });

  it("shows tool calls", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Ich führe das aus…",
      createdAt: new Date().toISOString(),
      toolCalls: [
        { id: "tc-1", type: "navigate", label: "navigate", status: "pending", params: {} },
      ],
    };
    renderMessage(message);
    expect(screen.getByTestId("tool-call-tc-1")).toBeInTheDocument();
  });

  it("shows metadata when token widget is enabled", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Antwort",
      createdAt: new Date().toISOString(),
      tokensUsed: 1234,
      latencyMs: 2500,
      model: "gpt-4",
    };
    renderMessage(message);
    expect(screen.getByText(/1234|1[. ]234/)).toBeInTheDocument();
    expect(screen.getByText("2.5s")).toBeInTheDocument();
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
  });

  it("fires regenerate callback", () => {
    const onRegenerate = vi.fn();
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Antwort",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message, { onRegenerate });
    fireEvent.click(screen.getByRole("button", { name: /chat.regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledWith("m1");
  });

  it("fires edit callback for user messages", () => {
    const onEdit = vi.fn();
    const message: ChatMessage = {
      id: "m1",
      role: "user",
      content: "Frage",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message, { onEdit });
    fireEvent.click(screen.getByRole("button", { name: /chat.edit/i }));
    expect(onEdit).toHaveBeenCalledWith("m1");
  });

  it("fires reply and export callbacks", () => {
    const onReply = vi.fn();
    const onExport = vi.fn();
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Antwort",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message, { onReply, onExport });
    fireEvent.click(screen.getByRole("button", { name: /chat.reply_btn/i }));
    expect(onReply).toHaveBeenCalledWith("m1");
    fireEvent.click(screen.getByRole("button", { name: /chat.export_btn/i }));
    expect(onExport).toHaveBeenCalled();
  });

  it("copies message content to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Kopier mich",
      createdAt: new Date().toISOString(),
    };
    renderMessage(message);
    fireEvent.click(screen.getByRole("button", { name: /chat.copy/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(writeText).toHaveBeenCalledWith("Kopier mich");
  });

  it("renders streaming indicator", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Tipp",
      isStreaming: true,
      createdAt: new Date().toISOString(),
    };
    renderMessage(message);
    expect(screen.getByText("Tipp")).toBeInTheDocument();
  });
});
