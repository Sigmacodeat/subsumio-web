import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (k: string) => k, setLang: vi.fn() }),
}));
vi.mock("@/lib/use-grounded-answer", () => ({
  useGroundedAnswer: () => ({
    grounding: null,
    isGrounding: false,
    groundAnswer: vi.fn(async () => {}),
    reset: vi.fn(),
  }),
}));
vi.mock("@/components/legal/document-picker", () => ({ DocumentPicker: () => null }));
vi.mock("@/components/legal/save-to-matter-button", () => ({ SaveToMatterButton: () => null }));
vi.mock("@/components/legal/CitationPanel", () => ({ CitationPanel: () => null }));
vi.mock("@/components/dashboard/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));

import DeepAnalysisPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Deep analysis — reopen by address", () => {
  it("?run=… loads that analysis again", async () => {
    window.history.replaceState(null, "", "/?run=r1");
    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      Response.json({ data: { run_slug: "deep-analysis/runs/r1", status: "failed", error: "x" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<DeepAnalysisPage />);
    await waitFor(() =>
      expect(screen.getByText(/Die Analyse ist fehlgeschlagen/)).toBeInTheDocument()
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/legal/deep-analysis/run/r1");
  });

  it("an unknown run stops polling with a message", async () => {
    window.history.replaceState(null, "", "/?run=gone");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    );
    render(<DeepAnalysisPage />);
    await waitFor(() => expect(screen.getByText(/nicht gefunden/)).toBeInTheDocument());
  });
});
