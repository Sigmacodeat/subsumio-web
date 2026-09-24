import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PapierkorbPage from "./page";

const addToast = vi.fn();
const confirm = vi.fn();
const mockFetch = vi.fn();
const mockCsrfFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/dashboard/papierkorb",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirm }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => mockCsrfFetch(...a) }));
global.fetch = mockFetch as unknown as typeof fetch;

const items = {
  data: {
    items: [
      {
        slug: "legal/cases/old",
        title: "Muster gegen Beispiel",
        type: "legal_case",
        kind: "case",
        deleted_at: "2026-01-01T10:00:00.000Z",
        deleted_by: "anwalt@example.com",
        reason: "archived",
        legal_hold: true,
      },
      {
        slug: "legal/cases/old/doc-1",
        title: "Schriftsatz",
        type: "document",
        kind: "item",
        deleted_at: "2026-02-01T10:00:00.000Z",
        reason: "case_archived",
        case_slug: "legal/cases/old",
      },
    ],
  },
};

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** Route-aware csrfFetch mock: settings reads get 404, restores get the given body. */
function mockCsrfByUrl(restoreBody: unknown, restoreStatus = 200) {
  mockCsrfFetch.mockImplementation((url: unknown) => {
    if (String(url).includes("/api/trash")) {
      return Promise.resolve(
        restoreStatus === 200
          ? okJson(restoreBody)
          : new Response(JSON.stringify(restoreBody), { status: restoreStatus })
      );
    }
    // Kanzlei settings page read — not configured in tests.
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
}

describe("Papierkorb page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirm.mockResolvedValue(true);
  });

  it("lists deleted items with type, reason and legal-hold badges", async () => {
    mockFetch.mockResolvedValueOnce(okJson(items));
    render(<PapierkorbPage />);

    expect(await screen.findByText("Muster gegen Beispiel")).toBeInTheDocument();
    expect(screen.getByText("Schriftsatz")).toBeInTheDocument();
    expect(screen.getByText("Akte")).toBeInTheDocument();
    expect(screen.getByText("Dokument")).toBeInTheDocument();
    expect(screen.getByText("Akte archiviert")).toBeInTheDocument();
    expect(screen.getByText("Mit Akte archiviert")).toBeInTheDocument();
    expect(screen.getAllByText("Aufbewahrungssperre").length).toBeGreaterThan(0);
  });

  it("shows the empty state when nothing is deleted", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ data: { items: [] } }));
    render(<PapierkorbPage />);
    expect(await screen.findByText("Papierkorb ist leer")).toBeInTheDocument();
  });

  it("shows a retryable error state when loading fails", async () => {
    mockFetch.mockResolvedValueOnce(new Response("x", { status: 503 }));
    render(<PapierkorbPage />);
    expect(await screen.findByText("Papierkorb nicht erreichbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("restores an item optimistically and removes it from the list", async () => {
    mockFetch.mockResolvedValueOnce(okJson(items));
    mockCsrfByUrl({ data: { slug: "x", cascaded: 0 } });
    render(<PapierkorbPage />);

    const buttons = await screen.findAllByRole("button", { name: /Wiederherstellen/ });
    // Second button belongs to the tombstoned document (no confirm needed).
    await userEvent.click(buttons[1]);

    await waitFor(() => expect(screen.queryByText("Schriftsatz")).not.toBeInTheDocument());
    expect(mockCsrfFetch).toHaveBeenCalledWith(
      "/api/trash",
      expect.objectContaining({ method: "POST" })
    );
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("asks for confirmation before restoring an archived case", async () => {
    mockFetch.mockResolvedValueOnce(okJson(items));
    mockCsrfByUrl({ data: { cascaded: 3 } });
    render(<PapierkorbPage />);

    const buttons = await screen.findAllByRole("button", { name: /Wiederherstellen/ });
    await userEvent.click(buttons[0]);

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Akte wiederherstellen" })
    );
    await waitFor(() =>
      expect(screen.queryByText("Muster gegen Beispiel")).not.toBeInTheDocument()
    );
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        description: expect.stringContaining("3 Dokumente"),
      })
    );
  });

  it("links each item to its audit log entries", async () => {
    mockFetch.mockResolvedValueOnce(okJson(items));
    render(<PapierkorbPage />);
    await screen.findByText("Schriftsatz");
    const link = screen.getByRole("link", {
      name: 'Protokoll zu „Schriftsatz" anzeigen',
    });
    expect(link).toHaveAttribute(
      "href",
      `/dashboard/audit?q=${encodeURIComponent("legal/cases/old/doc-1")}`
    );
  });

  it("restores a multi-selection with a single confirmation", async () => {
    mockFetch.mockResolvedValueOnce(okJson(items));
    mockCsrfByUrl({ data: { cascaded: 0 } });
    render(<PapierkorbPage />);
    await screen.findByText("Schriftsatz");

    await userEvent.click(screen.getByRole("checkbox", { name: "Alle Elemente auswählen" }));
    expect(screen.getByText("2 ausgewählt")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Auswahl wiederherstellen/ }));
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Auswahl wiederherstellen" })
    );
    await waitFor(() => {
      expect(screen.queryByText("Schriftsatz")).not.toBeInTheDocument();
      expect(screen.queryByText("Muster gegen Beispiel")).not.toBeInTheDocument();
    });
    expect(
      mockCsrfFetch.mock.calls.filter(([url]) => String(url).includes("/api/trash"))
    ).toHaveLength(2);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "2 Elemente wiederhergestellt" })
    );
  });

  it("rolls the item back when restore fails", async () => {
    mockFetch.mockResolvedValueOnce(okJson(items));
    mockCsrfByUrl({ error: "parent_archived" }, 409);
    render(<PapierkorbPage />);

    const buttons = await screen.findAllByRole("button", { name: /Wiederherstellen/ });
    await userEvent.click(buttons[1]);

    await waitFor(() => expect(screen.getByText("Schriftsatz")).toBeInTheDocument());
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", title: "Akte zuerst wiederherstellen" })
    );
  });
});
