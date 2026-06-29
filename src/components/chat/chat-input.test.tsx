import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./chat-input";
import { api } from "@/lib/api";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (key: string) => key, setLang: vi.fn() }),
}));

vi.mock("@/components/dashboard/voice-to-prompt-button", () => ({
  VoiceToPromptButton: ({ onTranscript }: { onTranscript: (text: string) => void }) => (
    <button data-testid="voice-button" onClick={() => onTranscript("Spracheingabe")}>
      Voice
    </button>
  ),
}));

vi.mock("@/components/dashboard/motion", () => ({
  useDashboardMotion: () => ({
    popoverTransition: {},
    popoverInitial: {},
    popoverAnimate: {},
    popoverExit: {},
  }),
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/dashboard/model-selector", () => ({
  ModelSelector: ({
    selectedModelId,
    onSelect,
  }: {
    selectedModelId?: string;
    onSelect?: (id: string) => void;
  }) => (
    <button data-testid="model-selector" onClick={() => onSelect?.("gpt-4")}>
      {selectedModelId ?? "Model"}
    </button>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    upload: {
      file: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.mocked(api.upload.file).mockReset();
});

function renderChatInput(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const utils = render(
    <ChatInput
      onSend={onSend}
      onStop={onStop}
      isStreaming={false}
      disabled={false}
      placeholder="Nachricht eingeben…"
      features={{ fileUpload: true, modelSelector: true, modeSelector: true }}
      queryMode="balanced"
      onQueryModeChange={vi.fn()}
      {...props}
    />
  );
  return { onSend, onStop, ...utils, container: utils.container };
}

function getFileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("ChatInput", () => {
  it("renders textarea and send button", () => {
    renderChatInput();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chat.send/i })).toBeInTheDocument();
  });

  it("sends message when clicking send", async () => {
    const { onSend } = renderChatInput();
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hallo Copilot");
    fireEvent.click(screen.getByRole("button", { name: /chat.send/i }));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Hallo Copilot", undefined);
    });
    expect(textarea).toHaveValue("");
  });

  it("sends message on Enter without shift", async () => {
    const { onSend } = renderChatInput();
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hallo Copilot");
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Hallo Copilot", undefined);
    });
  });

  it("does not send empty messages", async () => {
    const { onSend } = renderChatInput();
    const sendButton = screen.getByRole("button", { name: /chat.send/i });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send while streaming", async () => {
    const { onSend } = renderChatInput({ isStreaming: true });
    expect(screen.queryByRole("button", { name: /chat.send/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chat.input.stop_generation/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /chat.input.stop_generation/i }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("stops generation on stop button click", async () => {
    const { onStop } = renderChatInput({ isStreaming: true });
    fireEvent.click(screen.getByRole("button", { name: /chat.input.stop_generation/i }));
    await waitFor(() => expect(onStop).toHaveBeenCalled());
  });

  it("stops generation on Escape key", async () => {
    const { onStop } = renderChatInput({ isStreaming: true });
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(onStop).toHaveBeenCalled());
  });

  it("shows character counter near limit and blocks over limit", () => {
    renderChatInput();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "a".repeat(45_001) } });
    expect(screen.getByText(/45\.001/i)).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: "a".repeat(50_001) } });
    expect(screen.getByText(/50\.001/i)).toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: /chat.send/i });
    expect(sendButton).toBeDisabled();
  });

  it("uploads files and sends them with the message", async () => {
    vi.mocked(api.upload.file).mockResolvedValue({
      slug: "file-1",
      title: "vertrag.pdf",
      url: "/uploads/file-1",
    });
    const { onSend, container } = renderChatInput();
    const file = new File(["pdf content"], "vertrag.pdf", { type: "application/pdf" });
    const input = getFileInput(container);
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(screen.getByText("vertrag.pdf")).toBeInTheDocument();
    });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Siehe Anlage" } });
    fireEvent.click(screen.getByRole("button", { name: /chat.send/i }));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Siehe Anlage", [
        { name: "vertrag.pdf", slug: "file-1" },
      ]);
    });
  });

  it("shows upload error when too many files are selected", async () => {
    const { onSend, container } = renderChatInput();
    const files = Array.from(
      { length: 11 },
      (_, i) => new File(["x"], `doc${i}.pdf`, { type: "application/pdf" })
    );
    const input = getFileInput(container);
    await userEvent.upload(input, files);
    await waitFor(() => {
      expect(screen.getByText(/chat.input.too_many_files/i)).toBeInTheDocument();
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows upload error when a file is too large", async () => {
    const { onSend, container } = renderChatInput();
    const oversized = new File([new ArrayBuffer(501 * 1024 * 1024)], "big.pdf", {
      type: "application/pdf",
    });
    const input = getFileInput(container);
    await userEvent.upload(input, oversized);
    await waitFor(() => {
      expect(screen.getByText(/chat.input.file_too_large/i)).toBeInTheDocument();
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("removes an attachment via click", async () => {
    vi.mocked(api.upload.file).mockResolvedValue({
      slug: "file-1",
      title: "vertrag.pdf",
      url: "/uploads/file-1",
    });
    const { container } = renderChatInput();
    const file = new File(["pdf content"], "vertrag.pdf", { type: "application/pdf" });
    const input = getFileInput(container);
    await userEvent.upload(input, file);
    await waitFor(() => {
      expect(screen.getByText("vertrag.pdf")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(/chat.input.remove_attachment/i));
    await waitFor(() => {
      expect(screen.queryByText("vertrag.pdf")).not.toBeInTheDocument();
    });
  });

  it("appends voice transcript to the textarea", async () => {
    renderChatInput();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hallo" } });
    fireEvent.click(screen.getByTestId("voice-button"));
    await waitFor(() => {
      expect(textarea).toHaveValue("Hallo Spracheingabe");
    });
  });

  it("switches query mode via dropdown", async () => {
    const onQueryModeChange = vi.fn();
    renderChatInput({ onQueryModeChange });
    fireEvent.click(screen.getByRole("button", { name: /chat.mode/i }));
    // Query mode options are rendered as buttons; pick the first non-current one
    const buttons = screen.getAllByRole("button");
    const options = buttons.filter(
      (b) =>
        b.textContent &&
        b.textContent !== "Akten + Recht" &&
        b !== screen.getByRole("button", { name: /chat.mode/i })
    );
    expect(options.length).toBeGreaterThan(0);
    fireEvent.click(options[0]);
    await waitFor(() => expect(onQueryModeChange).toHaveBeenCalled());
  });

  it("selects a model via ModelSelector", async () => {
    const onModelChange = vi.fn();
    renderChatInput({ onModelChange });
    fireEvent.click(screen.getByTestId("model-selector"));
    await waitFor(() => expect(onModelChange).toHaveBeenCalledWith("gpt-4"));
  });
});
