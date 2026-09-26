import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationPanel, repealedLabel } from "./CitationPanel";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (k: string) => k, setLang: vi.fn() }),
}));

vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: undefined }),
}));

const grounding = {
  citations_verified: 1,
  citations_unverified: 1,
  corpus_checked: true,
  analyzed_at: "2026-09-18T10:00:00Z",
  has_unverified: true,
  grounded_citations: [
    { code: "ABGB", paragraph: "§ 1295", verified: true },
    {
      code: "MRG",
      paragraph: "§ 99",
      verified: false,
      in_force: false,
      repealed_since: "2024-01-01",
      source_text: "Alter Wortlaut …",
      unverifiable_reason: "Nicht mehr in Kraft (seit 01.01.2024) — geltende Fassung prüfen",
    },
  ],
};

describe("CitationPanel — norms no longer in force", () => {
  it("raises an alert naming the repealed norm, even when collapsed", () => {
    render(<CitationPanel data={{ grounding }} compact />);
    const alert = screen.getByTestId("citation-repealed-alert");
    expect(alert).toHaveTextContent("Eine zitierte Norm ist nicht mehr in Kraft");
    expect(alert).toHaveTextContent("§ 99 MRG");
    expect(alert).not.toHaveTextContent("§ 1295 ABGB");
  });

  it("marks the citation with its repeal date instead of 'nicht gefunden'", () => {
    render(<CitationPanel data={{ grounding }} />);
    expect(screen.getByTestId("citation-repealed")).toHaveTextContent(
      "Nicht mehr in Kraft (seit 01.01.2024)"
    );
    expect(screen.queryByText(/Nicht in den Rechtsquellen gefunden/)).not.toBeInTheDocument();
  });

  it("no repeal alert when every norm is in force", () => {
    render(
      <CitationPanel
        data={{
          grounding: { ...grounding, grounded_citations: [grounding.grounded_citations[0]] },
        }}
      />
    );
    expect(screen.queryByTestId("citation-repealed-alert")).not.toBeInTheDocument();
  });

  it("label without a known date", () => {
    expect(repealedLabel(undefined)).toBe("Nicht mehr in Kraft — geltende Fassung prüfen.");
  });
});
