import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationPanel } from "./CitationPanel";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (k: string) => k, setLang: vi.fn() }),
}));

const grounding = {
  citations_verified: 2,
  citations_unverified: 0,
  corpus_checked: true,
  analyzed_at: "2026-09-18T10:00:00Z",
  has_unverified: false,
  support_checked: true,
  citations_misgrounded: 1,
  grounded_citations: [
    { code: "ABGB", paragraph: "§ 1295", verified: true, support: "supported" as const },
    {
      code: "ABGB",
      paragraph: "§ 879",
      verified: true,
      support: "unsupported" as const,
      support_reason: "§ 879 regelt Nichtigkeit, nicht Verjährung.",
    },
  ],
};

describe("CitationPanel — does the source carry the statement?", () => {
  it("raises an alert naming the misgrounded citation, even when collapsed", () => {
    render(<CitationPanel data={{ grounding }} compact />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Eine zitierte Quelle trägt die Aussage nicht");
    expect(alert).toHaveTextContent("§ 879 ABGB");
    expect(alert).not.toHaveTextContent("§ 1295 ABGB");
  });

  it("shows the verdict and its reason at each citation", () => {
    render(<CitationPanel data={{ grounding }} />);
    expect(screen.getByText("Trägt die Aussage")).toBeInTheDocument();
    expect(screen.getByText("Trägt die Aussage nicht")).toBeInTheDocument();
    expect(screen.getByText(/regelt Nichtigkeit, nicht Verjährung/)).toBeInTheDocument();
  });

  it("no alert when every source carries its statement", () => {
    render(
      <CitationPanel
        data={{
          grounding: {
            ...grounding,
            citations_misgrounded: 0,
            grounded_citations: [grounding.grounded_citations[0]],
          },
        }}
      />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
