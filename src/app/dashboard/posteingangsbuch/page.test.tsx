import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PosteingangsbuchPage from "./page";

const addToast = vi.fn();
const fetchMock = vi.fn();
const csrfFetchMock = vi.fn();

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));

function entry(id: string, subject: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    received_at: "2026-09-20T09:00:00Z",
    channel: "scan",
    subject,
    ...extra,
  };
}

function listResponse(data: Record<string, unknown>) {
  return Promise.resolve(
    new Response(JSON.stringify({ items: [], failed_stamps: [], pending_stamps: [], ...data }), {
      status: 200,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() => listResponse({}));
});

describe("Posteingangsbuch page", () => {
  it("renders entries from the register", async () => {
    fetchMock.mockImplementation(() =>
      listResponse({ items: [entry("e1", "Ladung BG Innere Stadt", { sender_name: "BG" })] })
    );
    render(<PosteingangsbuchPage />);
    expect(await screen.findByText("Ladung BG Innere Stadt")).toBeInTheDocument();
    expect(screen.getByText("BG")).toBeInTheDocument();
  });

  it("surfaces exhausted registration stamps with a retry affordance", async () => {
    fetchMock.mockImplementation(() =>
      listResponse({
        items: [entry("e1", "Eintrag")],
        failed_stamps: [
          {
            task_slug: "tasks/failed-1",
            subject: "Bescheid BH",
            channel: "upload",
            last_error: "engine timeout",
            attempts: 5,
          },
        ],
      })
    );
    render(<PosteingangsbuchPage />);
    expect(
      await screen.findByText("1 Eingang konnte nicht registriert werden")
    ).toBeInTheDocument();
    expect(screen.getByText(/Bescheid BH/)).toBeInTheDocument();

    // Retry requeues the stamp and removes it from the warning list.
    csrfFetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await userEvent.click(screen.getByRole("button", { name: /Erneut eintragen/ }));
    await waitFor(() =>
      expect(csrfFetchMock).toHaveBeenCalledWith(
        "/api/post-upload-tasks/retry",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(screen.queryByText(/Bescheid BH/)).not.toBeInTheDocument());
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("shows pending re-queued registrations as informational", async () => {
    fetchMock.mockImplementation(() =>
      listResponse({
        pending_stamps: [{ task_slug: "t/p", subject: "Wiederholung", attempts: 3 }],
      })
    );
    render(<PosteingangsbuchPage />);
    expect(await screen.findByText(/1 Registrierung wird gerade wiederholt/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing arrived", async () => {
    render(<PosteingangsbuchPage />);
    expect(await screen.findByText("Noch keine Einträge")).toBeInTheDocument();
  });

  it("creates a manual entry via POST and reloads", async () => {
    render(<PosteingangsbuchPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Eintragen/ }));
    await userEvent.type(
      screen.getByPlaceholderText("z. B. Ladung vom Bezirksgericht"),
      "Schreiben Finanzamt"
    );
    csrfFetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await userEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() =>
      expect(csrfFetchMock).toHaveBeenCalledWith(
        "/api/inbound-register",
        expect.objectContaining({ method: "POST" })
      )
    );
    const body = JSON.parse((csrfFetchMock.mock.calls[0]![1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.subject).toBe("Schreiben Finanzamt");
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("shows an error toast when loading fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("x", { status: 500 })));
    render(<PosteingangsbuchPage />);
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }))
    );
  });

  it("a load error shows an error with retry, not 'Noch keine Einträge'", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("x", { status: 502 })));
    render(<PosteingangsbuchPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geladen/);
    expect(screen.queryByText("Noch keine Einträge")).not.toBeInTheDocument();
  });
});
