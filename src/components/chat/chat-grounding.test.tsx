import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "./chat-types";
import { ChatMessageBubble } from "./chat-message";
import type { GroundingMetadata } from "@/lib/citation-gate-client";

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
  CitationPanel: ({
    data,
  }: {
    data: { grounding?: GroundingMetadata | null; citations?: unknown[] };
  }) => (
    <div data-testid="citation-panel">
      {data.grounding && (
        <span data-testid="grounding-info">
          {data.grounding.citations_verified} verified, {data.grounding.citations_unverified}{" "}
          unverified
        </span>
      )}
    </div>
  ),
  CitationBadgesInline: () => <span data-testid="citation-badges-inline">Citations</span>,
}));

vi.mock("@/components/chat/tool-call-bubble", () => ({
  ToolCallBubble: ({ toolCall }: { toolCall: { id: string; label: string; status: string } }) => (
    <div data-testid={`tool-call-${toolCall.id}`}>{toolCall.label}</div>
  ),
}));

function renderMessage(message: ChatMessage) {
  return render(
    <ChatMessageBubble
      message={message}
      features={{ markdownRendering: true, messageActions: true, tokenWidget: true }}
    />
  );
}

describe("Chat grounding integration", () => {
  it("renders CitationPanel with grounding metadata when present", () => {
    const grounding: GroundingMetadata = {
      citations_verified: 3,
      citations_unverified: 1,
      corpus_checked: true,
      grounded_citations: [],
      analyzed_at: new Date().toISOString(),
      has_unverified: true,
      warning: "1 Zitat konnte nicht verifiziert werden",
    };

    const message: ChatMessage = {
      id: "m1",
      role: "assistant",
      content: "Gemäß § 433 BGB ...",
      createdAt: new Date().toISOString(),
      citations: [{ slug: "bgb-433", title: "§ 433 BGB" }],
      grounding,
    };

    renderMessage(message);

    expect(screen.getByTestId("citation-panel")).toBeInTheDocument();
    expect(screen.getByTestId("grounding-info")).toHaveTextContent("3 verified, 1 unverified");
  });

  it("renders CitationPanel without grounding info when grounding is absent", () => {
    const message: ChatMessage = {
      id: "m2",
      role: "assistant",
      content: "Antwort ohne Grounding",
      createdAt: new Date().toISOString(),
      citations: [{ slug: "c1", title: "Zitat 1" }],
    };

    renderMessage(message);

    expect(screen.getByTestId("citation-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("grounding-info")).not.toBeInTheDocument();
  });

  it("renders CitationPanel with ungestützt warning when no citations and no grounding", () => {
    const message: ChatMessage = {
      id: "m3",
      role: "assistant",
      content: "Kurze Bestätigung",
      createdAt: new Date().toISOString(),
    };

    renderMessage(message);

    expect(screen.getByTestId("citation-panel")).toBeInTheDocument();
  });
});
