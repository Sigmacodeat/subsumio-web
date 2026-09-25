// @vitest-environment jsdom
// Case scanner on demand: nothing starts without a cost preview; the start
// carries the confirmed total; an insufficient balance offers no start.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const legal = vi.hoisted(() => ({
  caseScanPreview: vi.fn(),
  caseScanStart: vi.fn(),
  caseScanStatus: vi.fn(async () => ({ scan_id: "scan-1", runs: [] })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    legal,
    cases: {
      list: vi.fn(async () => [
        { slug: "cases/a", title: "Akte A" },
        { slug: "cases/b", title: "Akte B" },
      ]),
    },
  },
}));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import { D } from "@/content/dashboard";
import CaseScannerPage from "./page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<CaseScannerPage />, { wrapper });
}

function preview(sufficient: boolean) {
  return {
    cases: [
      { case_slug: "cases/a", title: "Akte A", reasons: [] },
      { case_slug: "cases/b", title: "Akte B", reasons: [] },
    ],
    skipped: [],
    truncated: false,
    count: 2,
    credits_per_case: 5,
    total_credits: 10,
    balance: sufficient ? 50 : 3,
    sufficient,
    max_cases: 50,
  };
}

beforeEach(() => {
  legal.caseScanPreview.mockReset();
  legal.caseScanStart.mockReset();
});

describe("case scanner page", () => {
  it("previews the cost and starts with the confirmed total", async () => {
    legal.caseScanPreview.mockResolvedValue(preview(true));
    legal.caseScanStart.mockResolvedValue({
      scan_id: "scan-1",
      launched: [
        { case_slug: "cases/a", job_id: 1 },
        { case_slug: "cases/b", job_id: 2 },
      ],
      failed: [],
      skipped: [],
      charged_credits: 10,
      refunded_credits: 0,
    });
    renderPage();
    fireEvent.click(screen.getByLabelText(D["scanner.scope_all_open"].de));
    fireEvent.click(screen.getByRole("button", { name: D["scanner.preview"].de }));
    expect(await screen.findByText("2 Akten × 5 Credits = 10 Credits")).toBeInTheDocument();
    expect(legal.caseScanStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Scan starten — 10 Credits" }));
    expect(await screen.findByText(D["scanner.started"].de)).toBeInTheDocument();
    expect(legal.caseScanStart).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "all_open", expected_credits: 10 })
    );
  });

  it("offers no start when the balance is short", async () => {
    legal.caseScanPreview.mockResolvedValue(preview(false));
    renderPage();
    fireEvent.click(screen.getByLabelText(D["scanner.scope_all_open"].de));
    fireEvent.click(screen.getByRole("button", { name: D["scanner.preview"].de }));
    expect(await screen.findByText(D["scanner.insufficient"].de)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scan starten/ })).not.toBeInTheDocument();
  });

  it("needs a chosen matter before a single-matter preview", () => {
    renderPage();
    expect(screen.getByRole("button", { name: D["scanner.preview"].de })).toBeDisabled();
  });
});
