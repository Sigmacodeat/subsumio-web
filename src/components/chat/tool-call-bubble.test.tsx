import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ToolCall } from "./chat-types";
import { ToolCallBubble } from "./tool-call-bubble";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (key: string) => key, setLang: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: { copilot: { executeConfirmedTool: vi.fn() } } }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/legal/GroundedOutputPanel", () => ({
  GroundedOutputPanel: ({ text }: { text: string }) => (
    <div data-testid="grounded-panel">{text.length}</div>
  ),
}));

describe("ToolCallBubble — AI tool output", () => {
  it("shows the full AI text (no 300-char cut) with the grounding panel", () => {
    const longText = `Frist 1: 12.10.2026 Berufung (§ 464 ZPO).\n${"x".repeat(900)}\nFrist 9: 30.11.2026 Replik`;
    const toolCall: ToolCall = {
      id: "t1",
      type: "deadline_extract",
      label: "chat.tool.deadline_extract",
      params: { document_slug: "docs/a" },
      status: "completed",
      result: {
        success: true,
        display: { kind: "summary", title: "Fristen extrahiert aus: A", aiText: longText },
      },
    };
    render(<ToolCallBubble toolCall={toolCall} />);
    expect(screen.getByText(/Frist 9: 30\.11\.2026 Replik/)).toBeInTheDocument();
    expect(screen.getByTestId("grounded-panel")).toHaveTextContent(String(longText.length));
  });
});

describe("ToolCallBubble — confirmation card", () => {
  it("shows every parameter value in full, not truncated to one line", () => {
    const body = "Sehr geehrte Damen und Herren, " + "Inhalt ".repeat(300);
    const toolCall: ToolCall = {
      id: "t2",
      type: "create_deadline" as ToolCall["type"],
      label: "chat.tool.create_deadline",
      params: { title: "Klagebeantwortung", description: body },
      status: "pending",
      requiresConfirmation: true,
    };
    render(<ToolCallBubble toolCall={toolCall} />);
    const value = screen.getByText(body.trim(), { normalizer: (s) => s.trim() });
    expect(value.className).not.toMatch(/\btruncate\b/);
    expect(value.className).toMatch(/whitespace-pre-wrap/);
  });
});
