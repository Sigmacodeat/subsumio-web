import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const csrfFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...args: unknown[]) => csrfFetch(...args) }));

import { SupportSessionBanner } from "./support-session-banner";

function renderBanner(overrides: Partial<Parameters<typeof SupportSessionBanner>[0]["session"]> = {}) {
  const qc = new QueryClient();
  const session = {
    orgName: "Kanzlei Test & Partner",
    reason: "Ticket #99 — Fristen-Export schlägt fehl",
    startedAt: "2026-01-01T10:00:00.000Z",
    expiresAt: "2026-01-01T11:00:00.000Z",
    ...overrides,
  };
  return render(
    <QueryClientProvider client={qc}>
      <SupportSessionBanner session={session} />
    </QueryClientProvider>
  );
}

describe("SupportSessionBanner", () => {
  it("shows the firm name, reason and an expiry time — cannot be dismissed without acting", () => {
    renderBanner();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Support-Zugriff aktiv")).toBeInTheDocument();
    expect(screen.getByText("Kanzlei Test & Partner")).toBeInTheDocument();
    expect(screen.getByText(/Fristen-Export schlägt fehl/)).toBeInTheDocument();
    expect(screen.getByText(/Endet spätestens um/)).toBeInTheDocument();
    // No close/X button — only the explicit end action removes the banner.
    expect(screen.queryByLabelText(/schließen|dismiss/i)).toBeNull();
  });

  it("ends the session via the CSRF-protected end endpoint when clicked", async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });

    renderBanner();
    fireEvent.click(screen.getByText("Sitzung beenden"));

    await waitFor(() =>
      expect(csrfFetch).toHaveBeenCalledWith(
        "/api/admin/support-session/end",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(window.location.href).toBe("/dashboard"));

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });
});
