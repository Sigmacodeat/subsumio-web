import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addToast = vi.fn();
const csrfFetchMock = vi.fn();
const fetchMock = vi.fn();
const t = (k: string) => k;

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));

import McpSettingsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ tokens: [], endpoint: "https://engine/mcp" }), { status: 200 })
  );
});

describe("MCP-Zugänge", () => {
  it("shows the new key once after creating it (wrapped route response)", async () => {
    csrfFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { token: "gbrain_NEU_123", id: "t1" } }), {
        status: 200,
      })
    );
    render(<McpSettingsPage />);
    await userEvent.click((await screen.findAllByText("Neuer Schlüssel"))[0]);
    fireEvent.change(document.getElementById("mcp-name")!, { target: { value: "Claude Desktop" } });
    await userEvent.click(screen.getByRole("button", { name: "webhooks.save" }));
    expect(await screen.findByText("gbrain_NEU_123")).toBeInTheDocument();
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Zugang erstellt" })
    );
  });

  it("a load error shows an error with retry, not the empty state", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    render(<McpSettingsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/nicht geladen/));
    expect(screen.queryByText("Noch keine Zugangsschlüssel")).not.toBeInTheDocument();
  });
});
