import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CitationPanel,
  CitationBadgesInline,
  type CitationPanelData,
} from "@/components/legal/CitationPanel";
import type { GroundedCitation } from "@/lib/types";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("CitationPanel", () => {
  const baseData: CitationPanelData = {
    citations: [{ slug: "bgb/433", title: "§ 433 BGB" }],
    gaps: [],
    grounding: {
      citations_verified: 1,
      citations_unverified: 0,
      corpus_checked: true,
      grounded_citations: [
        {
          code: "BGB",
          paragraph: "§ 433",
          context: "Vertragstypische Pflichten",
          verified: true,
          source_text: "Vertragstypische Pflichten...",
        },
      ],
      analyzed_at: "2026-06-20T10:00:00.000Z",
    },
    isStreaming: false,
  };

  it("renders AI Act badge when not streaming", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText(/KI-generiert/)).toBeTruthy();
  });

  it("does not render AI Act badge when streaming", () => {
    render(<CitationPanel data={{ ...baseData, isStreaming: true }} />);
    expect(screen.queryByText(/KI-generiert/)).toBeNull();
  });

  it("renders groundedness badge", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText("Gut gestützt")).toBeTruthy();
  });

  it("renders attorney review warning by default", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText("Anwaltlich zu prüfen")).toBeTruthy();
  });

  it("hides attorney review warning when explicitly false", () => {
    render(<CitationPanel data={{ ...baseData, attorneyReviewRequired: false }} />);
    expect(screen.queryByText("Anwaltlich zu prüfen")).toBeNull();
  });

  it("renders corpus grounding verified count", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText("1 verifiziert")).toBeTruthy();
  });

  it("renders unverified count when present", () => {
    const data: CitationPanelData = {
      ...baseData,
      grounding: {
        citations_verified: 2,
        citations_unverified: 1,
        corpus_checked: true,
        grounded_citations: [
          { code: "BGB", paragraph: "§ 433", context: "", verified: true, source_text: "..." },
          { code: "BGB", paragraph: "§ 434", context: "", verified: true, source_text: "..." },
          { code: "BGB", paragraph: "§ 999", context: "", verified: false },
        ],
        analyzed_at: "2026-06-20T10:00:00.000Z",
      },
    };
    render(<CitationPanel data={data} />);
    expect(screen.getByText("1 nicht verifiziert")).toBeTruthy();
  });

  it("shows 'Corpus nicht geprüft' when corpus not checked", () => {
    const data: CitationPanelData = {
      ...baseData,
      grounding: {
        citations_verified: 0,
        citations_unverified: 0,
        corpus_checked: false,
        grounded_citations: [],
        analyzed_at: "2026-06-20T10:00:00.000Z",
      },
    };
    render(<CitationPanel data={data} />);
    expect(screen.getByText("Corpus nicht geprüft")).toBeTruthy();
  });

  it("renders brain citations in expanded view", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText("Brain-Quellen (1)")).toBeTruthy();
    // § 433 BGB appears in both Brain-Quellen and Corpus-Grounding
    expect(screen.getAllByText(/§ 433 BGB/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders gaps in expanded view", () => {
    const data: CitationPanelData = {
      ...baseData,
      gaps: ["Fehlende Rechtsprechung zum Thema"],
    };
    render(<CitationPanel data={data} />);
    expect(screen.getByText(/Lücken im Brain/)).toBeTruthy();
    expect(screen.getByText("Fehlende Rechtsprechung zum Thema")).toBeTruthy();
  });

  it("renders grounded citations with verified icon", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText("Corpus-Grounding (1)")).toBeTruthy();
    // The verified citation text should appear (may appear multiple times)
    expect(screen.getAllByText(/§ 433 BGB/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders unverified citation warning", () => {
    const data: CitationPanelData = {
      ...baseData,
      grounding: {
        citations_verified: 0,
        citations_unverified: 1,
        corpus_checked: true,
        grounded_citations: [
          { code: "BGB", paragraph: "§ 999", context: "", verified: false },
        ],
        analyzed_at: "2026-06-20T10:00:00.000Z",
      },
    };
    render(<CitationPanel data={data} />);
    expect(screen.getByText(/Nicht im Corpus gefunden/)).toBeTruthy();
  });

  it("collapses and expands on toggle click", () => {
    render(<CitationPanel data={baseData} compact={true} />);
    // In compact mode, starts collapsed
    const toggle = screen.getByRole("button", { name: /Details einblenden/ });
    expect(toggle).toBeTruthy();

    // Click to expand
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Details ausblenden/ })).toBeTruthy();
  });

  it("renders jurisdiction badge when provided", () => {
    render(<CitationPanel data={{ ...baseData, jurisdiction: "de" }} />);
    expect(screen.getByText("DE")).toBeTruthy();
  });

  it("renders nothing when streaming and no data", () => {
    const { container } = render(
      <CitationPanel data={{ isStreaming: true }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders grounding timestamp in expanded view", () => {
    render(<CitationPanel data={baseData} />);
    expect(screen.getByText(/Corpus geprüft am/)).toBeTruthy();
  });

  it("shows low groundedness when no citations", () => {
    const data: CitationPanelData = {
      citations: [],
      gaps: [],
      isStreaming: false,
    };
    render(<CitationPanel data={data} />);
    expect(screen.getByText("Ungestützt")).toBeTruthy();
  });

  it("shows partial groundedness when citations exist but gaps too", () => {
    const data: CitationPanelData = {
      citations: [{ slug: "bgb/433", title: "§ 433 BGB" }],
      gaps: ["Missing context"],
      isStreaming: false,
    };
    render(<CitationPanel data={data} />);
    expect(screen.getByText("Teilweise gestützt")).toBeTruthy();
  });
});

describe("CitationBadgesInline", () => {
  it("renders AI Act and groundedness badges inline", () => {
    const data: CitationPanelData = {
      citations: [{ slug: "bgb/433", title: "§ 433 BGB" }],
      isStreaming: false,
    };
    render(<CitationBadgesInline data={data} />);
    expect(screen.getByText(/KI-generiert/)).toBeTruthy();
    expect(screen.getByText("Gut gestützt")).toBeTruthy();
  });

  it("hides badges when streaming", () => {
    const data: CitationPanelData = {
      isStreaming: true,
    };
    const { container } = render(<CitationBadgesInline data={data} />);
    // Only the container div, no badges
    expect(container.firstChild).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("renders grounding badge when corpus checked", () => {
    const data: CitationPanelData = {
      citations: [{ slug: "bgb/433", title: "§ 433 BGB" }],
      grounding: {
        citations_verified: 2,
        citations_unverified: 0,
        corpus_checked: true,
        grounded_citations: [],
        analyzed_at: "2026-06-20T10:00:00.000Z",
      },
      isStreaming: false,
    };
    render(<CitationBadgesInline data={data} />);
    expect(screen.getByText("2 verifiziert")).toBeTruthy();
  });
});
