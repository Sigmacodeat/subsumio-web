import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MobileDeadlinesPage from "./page";
import { zonedDateString } from "@/lib/datetime";

const fristen = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { legal: { fristen: (...a: unknown[]) => fristen(...a) } },
}));

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MobileDeadlinesPage />
    </QueryClientProvider>
  );
}

function isoInDays(days: number): string {
  const today = Date.parse(`${zonedDateString(new Date())}T00:00:00Z`);
  return new Date(today + days * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(() => fristen.mockReset());

describe("mobile Fristen", () => {
  it("shows the open deadlines of the unified Fristen read model", async () => {
    fristen.mockResolvedValue({
      fristen: [
        {
          id: "f1",
          title: "Berufung einbringen",
          case_title: "Akte A",
          due_date: isoInDays(-1),
          status: "overdue",
          type: "notfrist",
          source: "legal_deadline",
        },
        {
          id: "f2",
          title: "Klagebeantwortung",
          due_date: isoInDays(3),
          status: "warning",
          type: "frist",
          source: "legal_deadline",
        },
        {
          id: "f3",
          title: "Erledigt",
          due_date: isoInDays(2),
          status: "done",
          type: "frist",
          source: "legal_deadline",
        },
      ],
      zusammenfassung: {},
    });
    renderPage();
    expect(await screen.findByText("Berufung einbringen")).toBeInTheDocument();
    expect(screen.getByText("Klagebeantwortung")).toBeInTheDocument();
    expect(screen.queryByText("Erledigt")).not.toBeInTheDocument();
    expect(screen.getByText("1 überfällig")).toBeInTheDocument();
  });

  it("shows an error with retry — not the empty state — when loading fails", async () => {
    fristen.mockRejectedValueOnce(new Error("HTTP 500"));
    renderPage();
    expect(await screen.findByText("Fristen konnten nicht geladen werden")).toBeInTheDocument();
    expect(screen.queryByText("Keine Fristen in diesem Zeitraum")).not.toBeInTheDocument();

    fristen.mockResolvedValue({ fristen: [], zusammenfassung: {} });
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() =>
      expect(screen.getByText("Keine Fristen in diesem Zeitraum")).toBeInTheDocument()
    );
  });

  it("flags an incomplete list when a deadline source failed", async () => {
    fristen.mockResolvedValue({ fristen: [], zusammenfassung: {}, partial: true });
    renderPage();
    expect(await screen.findByText(/die Liste ist unvollständig/)).toBeInTheDocument();
  });
});
