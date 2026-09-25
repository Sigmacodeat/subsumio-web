// @vitest-environment jsdom
// UIS-3-14: a failed load shows an error with retry, never the empty state.
// UI-8: timestamps use de-AT via formatDateTime.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const listPages = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listPages: (...a: unknown[]) => listPages(...a),
      listAllPages: vi.fn(async () => []),
    },
    legal: { ground: vi.fn(async () => null) },
  },
}));
// Stable toast: the page reloads whenever `addToast` changes identity.
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import RedTeamPage from "./page";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RedTeamPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  listPages.mockReset();
});

describe("red-team page", () => {
  it("shows a load error with retry instead of the empty state", async () => {
    listPages.mockRejectedValueOnce(new Error("engine down")).mockResolvedValueOnce([]);
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(listPages).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
