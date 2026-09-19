import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FreigabenPage from "./page";
import { buildApprovalSummary } from "@/lib/approval-summary";
import type { ReviewInboxItem } from "@/lib/review-inbox-items";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...a: unknown[]) => get(...a) } }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FreigabenPage />
    </QueryClientProvider>
  );
}

describe("Freigaben page", () => {
  it("lists open categories, urgent first, with a link to the list that shows them", async () => {
    get.mockResolvedValue({
      data: buildApprovalSummary({
        inbox: [
          {
            type: "suggested_deadline",
            priority: "high",
            title: "Berufungsfrist",
            description: "2026-10-01",
            caseTitle: "Muster gegen Beispiel",
          } as ReviewInboxItem,
        ],
        agentActions: [{ slug: "a", title: "Brief versenden", frontmatter: { status: "pending" } }],
        analyses: [],
        timeSuggestions: [],
        userEmail: "me@example.com",
      }),
    });
    renderPage();
    const first = await screen.findByRole("heading", { name: "KI-Fristen" });
    expect(first).toBeInTheDocument();
    expect(screen.getByText("1 dringend")).toBeInTheDocument();
    expect(screen.getByText(/Berufungsfrist/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Aktionen von Copilot und Agenten" })
    ).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("KI-Fristen");
    const links = screen.getAllByRole("link", { name: /Prüfen/ });
    expect(links[0]).toHaveAttribute("href", "/dashboard/communications?view=review");
    expect(screen.getByText(/Nichts offen bei:/)).toBeInTheDocument();
  });

  it("shows an empty state when nothing is open", async () => {
    get.mockResolvedValue({
      data: buildApprovalSummary({
        inbox: [],
        agentActions: [],
        analyses: [],
        timeSuggestions: [],
        userEmail: "me@example.com",
      }),
    });
    renderPage();
    expect(await screen.findByText("Nichts offen")).toBeInTheDocument();
  });

  it("shows an error instead of a false zero when the summary fails", async () => {
    get.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("nicht geladen");
  });
});
