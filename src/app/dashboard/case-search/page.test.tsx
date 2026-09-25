import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import CaseSearchPage from "./page";

const listAllPages = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { brain: { listAllPages: (...a: unknown[]) => listAllPages(...a) } },
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ lang: "de", t: (k: string) => k }) }));
vi.mock("@/components/dashboard/page-header", () => ({ PageHeader: () => null }));

describe("Aktensuche", () => {
  it("a failed load shows an error with retry, not 'Keine Akten gefunden'", async () => {
    listAllPages.mockRejectedValue(new Error("down"));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CaseSearchPage />
      </QueryClientProvider>
    );
    expect(await screen.findByText("Akten konnten nicht geladen werden")).toBeInTheDocument();
    expect(screen.queryByText("Keine Akten gefunden")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
