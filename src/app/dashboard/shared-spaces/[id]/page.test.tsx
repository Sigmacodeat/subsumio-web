import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addToast = vi.fn();
const csrfFetchMock = vi.fn();
const fetchMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "dr_1" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmMock }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));

import DataRoomPage from "./page";

const room = {
  id: "dr_1",
  title: "Datenraum A",
  host_firm: "Kanzlei",
  role: "host",
  can_manage: true,
  documents: [],
  matter_documents: [],
  members: [{ id: "m1", email: "gegner@example.at", status: "active", invited_at: "2026-09-01" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: room }), { status: 200 }));
});

describe("Datenraum", () => {
  it("revoking access asks first; cancelling changes nothing", async () => {
    confirmMock.mockResolvedValue(false);
    render(<DataRoomPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Entziehen/ }));
    expect(confirmMock).toHaveBeenCalled();
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's error text when an action is refused", async () => {
    confirmMock.mockResolvedValue(true);
    csrfFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Keine Berechtigung", code: "forbidden" }), {
        status: 403,
      })
    );
    render(<DataRoomPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Entziehen/ }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", title: "Keine Berechtigung" })
      )
    );
  });

  it("a load error shows the server's text", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Kein Zugriff auf diesen Datenraum", code: "x" }), {
        status: 403,
      })
    );
    render(<DataRoomPage />);
    expect(await screen.findByText("Kein Zugriff auf diesen Datenraum")).toBeInTheDocument();
  });
});
