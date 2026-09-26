import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LegalHoldPage from "./page";

const listAllPages = vi.fn();

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ lang: "de", t: (k: string) => k }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { brain: { listAllPages: (...a: unknown[]) => listAllPages(...a) } },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LegalHoldPage />
    </QueryClientProvider>
  );
}

describe("Aufbewahrungssperren-Übersicht", () => {
  beforeEach(() => {
    listAllPages.mockReset();
  });

  it("shows a hold on the oldest of 150 matters and asks for the whole list", async () => {
    const cases = Array.from({ length: 150 }, (_, i) => ({
      slug: `legal/cases/a${i}`,
      title: `Akte ${i}`,
      frontmatter: i === 149 ? { status: "open", legal_hold: true } : { status: "open" },
    }));
    listAllPages.mockResolvedValue(cases);
    renderPage();
    expect(await screen.findByText("Akte 149")).toBeInTheDocument();
    expect(listAllPages).toHaveBeenCalledWith(
      expect.objectContaining({ type: "legal_case", max: expect.any(Number) })
    );
    expect((listAllPages.mock.calls[0]![0] as { max: number }).max).toBeGreaterThanOrEqual(10_000);
  });

  it("a failed load shows an error with retry, not 'no matter is on hold'", async () => {
    listAllPages.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText("Akten konnten nicht geladen werden")).toBeInTheDocument();
    expect(screen.queryByText("Keine Akte ist gesperrt")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
