import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const csrfFetch = vi.fn();
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/lib/api", () => ({ api: { auth: { logout: vi.fn() } } }));

import { LegalAcceptanceGate, type LegalState } from "./legal-acceptance-gate";

const VERSIONS = { terms: "t1", privacy: "p1", dpa: "d1" };

function renderGate(legal: LegalState | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LegalAcceptanceGate legal={legal} />
    </QueryClientProvider>
  );
}

describe("LegalAcceptanceGate", () => {
  beforeEach(() => csrfFetch.mockReset());

  it("renders nothing when no confirmation is required", () => {
    renderGate({ required: false, bindsFirm: true, versions: VERSIONS });
    expect(screen.queryByTestId("legal-acceptance-gate")).toBeNull();
    renderGate(null);
    expect(screen.queryByTestId("legal-acceptance-gate")).toBeNull();
  });

  it("admin: links to AGB, Datenschutz and AVV; needs both boxes before posting", async () => {
    csrfFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    renderGate({ required: true, bindsFirm: true, versions: VERSIONS });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: "AGB" }).getAttribute("href")).toContain("/terms");
    expect(
      screen.getByRole("link", { name: "Datenschutzerklärung" }).getAttribute("href")
    ).toContain("/privacy");
    expect(
      screen.getByRole("link", { name: /Auftragsverarbeitungsvertrag/ }).getAttribute("href")
    ).toContain("/dpa");

    const button = screen.getByRole("button", { name: /Bestätigen/ });
    const [termsBox, dpaBox] = screen.getAllByRole("checkbox");
    await userEvent.click(termsBox);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(dpaBox);
    await userEvent.click(button);

    await waitFor(() => expect(csrfFetch).toHaveBeenCalledTimes(1));
    const [url, init] = csrfFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/legal-acceptance");
    expect(JSON.parse(String(init.body))).toEqual({
      acceptTerms: true,
      acceptDpa: true,
      versions: VERSIONS,
    });
  });

  it("team member: only the AGB/Datenschutz box, no AVV", async () => {
    csrfFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    renderGate({ required: true, bindsFirm: false, versions: VERSIONS });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Bestätigen/ }));
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    expect(JSON.parse(String((csrfFetch.mock.calls[0][1] as RequestInit).body))).toEqual({
      acceptTerms: true,
      versions: VERSIONS,
    });
  });
});
