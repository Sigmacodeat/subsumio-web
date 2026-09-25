import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

const apiDelete = vi.fn(async () => ({}));
const apiPost = vi.fn(async () => ({ data: { url: "https://x/cal.ics", token: "t" } }));
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(async () => ({ data: { active: true, createdAt: "2026-09-01T00:00:00Z" } })),
    post: (...a: unknown[]) => apiPost(...(a as [])),
    delete: (...a: unknown[]) => apiDelete(...(a as [])),
    legal: { fristen: vi.fn(async () => ({ fristen: [], zusammenfassung: {} })) },
    brain: { batchListPagesDetailed: vi.fn(async () => ({ results: {}, errors: [] })) },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));

import CalendarExportPage from "./page";

function renderPage() {
  return render(
    <ConfirmProvider>
      <CalendarExportPage />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  apiDelete.mockClear();
  apiPost.mockClear();
});

describe("Kalender-Export: Abo-Adresse und Zugang", () => {
  it("asks before revoking the subscription link and does nothing on cancel", async () => {
    renderPage();
    const revoke = await screen.findAllByRole("button", { name: "Widerrufen" });
    fireEvent.click(revoke[0]);
    expect(await screen.findByText("Abo-Adresse widerrufen?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByText("Abo-Adresse widerrufen?")).toBeNull());
    expect(apiDelete).not.toHaveBeenCalled();

    fireEvent.click(revoke[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Widerrufen", hidden: false }));
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/api/settings/calendar-feed"));
  });

  it("asks before replacing an active link with a new one", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Neue Adresse erzeugen/ }));
    expect(await screen.findByText("Neue Adresse erzeugen?")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
