import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addToast = vi.fn();
const t = (k: string) => k;
const sendReply = vi.fn();
const createPage = vi.fn();
const listAllPages = vi.fn();

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    brain: {
      listAllPages: (...a: unknown[]) => listAllPages(...a),
      createPage: (...a: unknown[]) => createPage(...a),
    },
    whatsapp: { sendReply: (...a: unknown[]) => sendReply(...a) },
  },
}));

import { WhatsAppInbox } from "./whatsapp-inbox";

beforeEach(() => {
  vi.clearAllMocks();
  listAllPages.mockImplementation(async ({ type }: { type: string }) =>
    type === "chat_inbox"
      ? [
          {
            slug: "in/1",
            title: "x",
            content: "Guten Tag",
            created_at: "2026-09-24T09:00:00Z",
            frontmatter: { from_phone_hash: "abcd1234", from_name: "Maria" },
          },
        ]
      : []
  );
});

describe("WhatsAppInbox reply", () => {
  it("a sent reply is never reported as failed when only the protocol entry fails", async () => {
    sendReply.mockResolvedValue({ messageId: "wamid.1" });
    createPage.mockRejectedValue(new Error("engine down"));
    render(<WhatsAppInbox />);
    await userEvent.click(await screen.findByText("Maria"));
    fireEvent.change(screen.getByPlaceholderText("whatsapp.reply_placeholder"), {
      target: { value: "Danke, wir melden uns." },
    });
    await userEvent.click(screen.getByRole("button", { name: /send|senden/i }));
    await waitFor(() => expect(sendReply).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "warning", title: "WhatsApp-Nachricht versendet" })
      )
    );
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });
});
