import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutboundRegisterPage from "./page";

const addToast = vi.fn();
const fetchMock = vi.fn();
const csrfFetchMock = vi.fn();

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));
const t = (k: string) => k;
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  CASE_PICKER_MAX: 10_000,
  api: {
    brain: {
      listAllPages: vi.fn(async () => []),
      listAllPagesDetailed: vi.fn(async () => ({ pages: [], capped: false })),
    },
  },
}));

function list(items: unknown[]) {
  return Promise.resolve(new Response(JSON.stringify({ data: { items } }), { status: 200 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() => list([]));
});

describe("Postausgangsbuch page", () => {
  it("loads the register from the register route", async () => {
    fetchMock.mockImplementation(() =>
      list([
        {
          id: "out-1",
          date: "2026-09-20T09:00:00Z",
          channel: "post",
          recipient_name: "BG Innere Stadt",
          recipient_address: "Wien",
          subject: "Klage",
          delivery_status: "sent",
          sent_by: "Sekretariat",
        },
      ])
    );
    render(<OutboundRegisterPage />);
    expect(await screen.findByText("BG Innere Stadt")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/outbound-register", expect.anything());
  });

  it("a load error shows an error with retry, not the empty state", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("x", { status: 502 })));
    render(<OutboundRegisterPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geladen/);
    expect(screen.queryByText("Keine Einträge")).not.toBeInTheDocument();
  });

  it("creates an entry through csrfFetch without a free-text sender", async () => {
    csrfFetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render(<OutboundRegisterPage />);
    await userEvent.click((await screen.findAllByText("Neuer Eintrag"))[0]);
    await userEvent.type(screen.getByLabelText(/Empfänger/), "BG Innere Stadt");
    await userEvent.type(screen.getByLabelText(/Betreff/), "Klage");
    expect(screen.queryByLabelText(/Versendet von/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() =>
      expect(csrfFetchMock).toHaveBeenCalledWith(
        "/api/outbound-register",
        expect.objectContaining({ method: "POST" })
      )
    );
    const body = JSON.parse(String(csrfFetchMock.mock.calls[0][1].body));
    expect(body.sent_by).toBeUndefined();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });
});
