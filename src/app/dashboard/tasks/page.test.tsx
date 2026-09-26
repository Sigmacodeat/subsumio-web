import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const addToast = vi.fn();
const updatePage = vi.fn();
const casePage = {
  slug: "legal/cases/a",
  title: "Akte A",
  frontmatter: {
    type: "legal_case",
    tasks: [{ id: "t1", text: "Schriftsatz prüfen", done: false }],
  },
};
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      batchListPagesDetailed: vi.fn(async () => ({
        results: { legal_case: [casePage] },
        errors: [],
      })),
      getPage: vi.fn(async () => casePage),
      updatePage: (...a: unknown[]) => updatePage(...a),
    },
  },
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: { user: { id: "u1" } } }) }));
vi.mock("@/lib/queries/settings", () => ({ useTeam: () => ({ data: { members: [] } }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import TasksPage from "./page";

beforeEach(() => {
  addToast.mockClear();
  updatePage.mockReset();
});

describe("Aufgaben", () => {
  it("shows an error toast when ticking off a task fails", async () => {
    updatePage.mockRejectedValue(new Error("HTTP 500"));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TasksPage />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: "Als erledigt markieren" }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "Aufgabe konnte nicht gespeichert werden",
        })
      )
    );
  });
});
