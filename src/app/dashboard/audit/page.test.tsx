import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (key: string) => key, lang: "de" }) }));
vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));

const fetchMock = vi.fn();

import AuditPage from "./page";

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuditPage />
    </QueryClientProvider>
  );
}

describe("Audit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ entries: [], total: 0 }), { status: 200 })
    );
  });

  it("shows the empty state when the log is genuinely empty", async () => {
    renderPage();
    expect(await screen.findByText("audit.empty_title")).toBeInTheDocument();
  });

  it("shows an error with retry — not 'no entries' — when the log fails to load", async () => {
    // QA-8: a failed audit read must never look like an empty protocol.
    fetchMock.mockResolvedValue(new Response("db down", { status: 503 }));
    renderPage();
    expect(
      await screen.findByText("Das Protokoll konnte nicht geladen werden")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeInTheDocument();
    expect(screen.queryByText("audit.empty_title")).not.toBeInTheDocument();
  });

  it("renders entries when the load succeeds", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [
            {
              id: "e1",
              action: "case.create",
              entity_type: "case",
              entity_id: "legal/cases/a",
              user_email: "anwalt@kanzlei.example",
              created_at: "2026-09-20T09:00:00Z",
            },
          ],
          total: 1,
        }),
        { status: 200 }
      )
    );
    renderPage();
    await waitFor(() => expect(screen.queryByText("audit.empty_title")).not.toBeInTheDocument());
  });
});
