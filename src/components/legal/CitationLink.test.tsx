import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CitationLink,
  GroundingBadge,
  parseCitations,
  AIBadge,
  GroundingStatus,
  AttorneyReviewWarning,
} from "@/components/legal/CitationLink";
import type { GroundedCitation } from "@/lib/types";

// Mock next/link to render as plain <a>
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("CitationLink", () => {
  it("renders citation text with book icon", () => {
    render(<CitationLink citation="§ 433 BGB" />);
    expect(screen.getByText("§ 433 BGB")).toBeTruthy();
  });

  it("renders link to norms page with normalized citation", () => {
    render(<CitationLink citation="§ 433 BGB" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("legal%2Fnorms%2Fbgb%2F433");
  });

  it("shows verified icon when grounding is verified", () => {
    const grounding: GroundedCitation = {
      code: "BGB",
      paragraph: "§ 433",
      context: "",
      verified: true,
      source_text: "Vertragstypische Pflichten...",
    };
    render(<CitationLink citation="§ 433 BGB" grounding={grounding} />);
    const link = screen.getByRole("link");
    expect(link.querySelector(".text-emerald-500")).toBeTruthy();
  });

  it("shows unverified icon when grounding is not verified", () => {
    const grounding: GroundedCitation = {
      code: "BGB",
      paragraph: "§ 999",
      context: "",
      verified: false,
    };
    render(<CitationLink citation="§ 999 BGB" grounding={grounding} />);
    const link = screen.getByRole("link");
    expect(link.querySelector(".text-amber-500")).toBeTruthy();
  });

  it("does not show icon when no grounding provided", () => {
    render(<CitationLink citation="§ 433 BGB" />);
    const link = screen.getByRole("link");
    expect(link.querySelector(".text-emerald-500")).toBeNull();
    expect(link.querySelector(".text-amber-500")).toBeNull();
  });

  it("normalizes ECLI citations correctly", () => {
    render(<CitationLink citation="ECLI:AT:OGH:2024:00123" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("ecli-at-ogh-2024-00123");
  });
});

describe("GroundingBadge", () => {
  it("shows 'Corpus nicht geprüft' when corpusChecked is false", () => {
    render(<GroundingBadge verified={0} unverified={0} corpusChecked={false} />);
    expect(screen.getByText("Corpus nicht geprüft")).toBeTruthy();
  });

  it("shows verified count badge when verified > 0", () => {
    render(<GroundingBadge verified={3} unverified={0} corpusChecked={true} />);
    expect(screen.getByText("3 verifiziert")).toBeTruthy();
  });

  it("shows unverified count badge when unverified > 0", () => {
    render(<GroundingBadge verified={0} unverified={2} corpusChecked={true} />);
    expect(screen.getByText("2 nicht verifiziert")).toBeTruthy();
  });

  it("shows both badges when both > 0", () => {
    render(<GroundingBadge verified={3} unverified={2} corpusChecked={true} />);
    expect(screen.getByText("3 verifiziert")).toBeTruthy();
    expect(screen.getByText("2 nicht verifiziert")).toBeTruthy();
  });

  it("renders nothing when both counts are 0 and corpus was checked", () => {
    const { container } = render(
      <GroundingBadge verified={0} unverified={0} corpusChecked={true} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("parseCitations", () => {
  it("extracts statute citations from text", () => {
    const segments = parseCitations("Der § 433 BGB regelt den Kaufvertrag.");
    const citations = segments.filter((s) => s.isCitation);
    expect(citations).toHaveLength(1);
    expect(citations[0].text).toBe("§ 433 BGB");
  });

  it("extracts ECLI citations from text", () => {
    const segments = parseCitations("Siehe ECLI:AT:OGH:2024:00123 für Details.");
    const citations = segments.filter((s) => s.isCitation);
    expect(citations).toHaveLength(1);
    expect(citations[0].text).toBe("ECLI:AT:OGH:2024:00123");
  });

  it("returns non-citation segments for plain text", () => {
    const segments = parseCitations("Dies ist normaler Text ohne Zitate.");
    expect(segments).toHaveLength(1);
    expect(segments[0].isCitation).toBe(false);
  });

  it("handles multiple citations in one text", () => {
    const segments = parseCitations("§ 433 BGB und § 922 ABGB sind relevant.");
    const citations = segments.filter((s) => s.isCitation);
    expect(citations).toHaveLength(2);
  });

  it("handles empty text", () => {
    const segments = parseCitations("");
    expect(segments).toHaveLength(0);
  });
});

// ── AIBadge Tests ─────────────────────────────────────────────────────

describe("AIBadge", () => {
  it("renders AI badge label text", () => {
    render(<AIBadge showTooltip={false} />);
    expect(screen.getByText(/KI-generiert/)).toBeTruthy();
  });

  it("has amber styling for AI Act warning", () => {
    const { container } = render(<AIBadge showTooltip={false} />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("amber-500");
  });

  it("has accessible aria-label with full AI notice", () => {
    render(<AIBadge showTooltip={false} />);
    const badge = screen.getByLabelText(/KI-generierter Entwurf/);
    expect(badge).toBeTruthy();
  });

  it("renders size variants", () => {
    const { container: smContainer } = render(<AIBadge size="sm" showTooltip={false} />);
    const smBadge = smContainer.querySelector("span");
    expect(smBadge?.className).toContain("text-xs");

    const { container: mdContainer } = render(<AIBadge size="md" showTooltip={false} />);
    const mdBadge = mdContainer.querySelector("span");
    expect(mdBadge?.className).toContain("text-xs");
  });
});

// ── GroundingStatus Tests ─────────────────────────────────────────────

describe("GroundingStatus", () => {
  it("shows 'Ungestützt' when no citations", () => {
    render(<GroundingStatus />);
    expect(screen.getByText("Ungestützt")).toBeTruthy();
  });

  it("shows 'Gut gestützt' when citations exist and no gaps", () => {
    render(<GroundingStatus citations={[{ slug: "doc1" }]} />);
    expect(screen.getByText("Gut gestützt")).toBeTruthy();
    expect(screen.getByText(/· 1/)).toBeTruthy();
  });

  it("shows 'Teilweise gestützt' when citations exist but gaps too", () => {
    render(<GroundingStatus citations={[{ slug: "doc1" }]} gaps={["missing info"]} />);
    expect(screen.getByText("Teilweise gestützt")).toBeTruthy();
  });

  it("has red styling when ungestützt", () => {
    const { container } = render(<GroundingStatus />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("red-400");
  });

  it("has emerald styling when well grounded", () => {
    const { container } = render(<GroundingStatus citations={[{ slug: "d1" }, { slug: "d2" }]} />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("emerald-400");
  });

  it("has accessible aria-label", () => {
    render(<GroundingStatus citations={[{ slug: "d1" }]} />);
    const badge = screen.getByLabelText(/Quellendeckung/);
    expect(badge).toBeTruthy();
  });
});

// ── AttorneyReviewWarning Tests ───────────────────────────────────────

describe("AttorneyReviewWarning", () => {
  it("renders nothing when all citations verified", () => {
    const { container } = render(<AttorneyReviewWarning verified={3} unverified={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders warning when unverified citations exist", () => {
    render(<AttorneyReviewWarning verified={2} unverified={1} />);
    expect(screen.getByText(/1 Zitat nicht im Corpus verifiziert/)).toBeTruthy();
  });

  it("uses plural for multiple unverified citations", () => {
    render(<AttorneyReviewWarning verified={0} unverified={3} />);
    expect(screen.getByText(/3 Zitate nicht im Corpus verifiziert/)).toBeTruthy();
  });

  it("renders warning when no corpus check was done", () => {
    render(<AttorneyReviewWarning verified={0} unverified={0} />);
    expect(screen.getByText(/Keine Corpus-Prüfung durchgeführt/)).toBeTruthy();
  });

  it("has role='alert' for accessibility", () => {
    render(<AttorneyReviewWarning verified={0} unverified={1} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
  });

  it("includes hallucination disclaimer", () => {
    render(<AttorneyReviewWarning verified={0} unverified={1} />);
    expect(screen.getByText(/halluzinieren/)).toBeTruthy();
  });
});
