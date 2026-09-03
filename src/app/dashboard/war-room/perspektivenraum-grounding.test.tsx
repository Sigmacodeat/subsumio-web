import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GroundingMetadata } from "@/lib/citation-gate-client";
import type { PerspektivenRoleOutput, PerspektivenSession } from "@/lib/perspektivenraum-agent";

// Same mocking pattern as chat-grounding.test.tsx: stub CitationPanel so we
// can assert on exactly what data.* it receives, without pulling in the
// real citation UI. This pins the cross-cutting invariant from CLAUDE.md —
// "every AI output surface MUST use useGroundedAnswer + CitationPanel" —
// for the new Perspektivenraum feature the same way it's pinned for chat.
const groundAnswerMock = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/use-grounded-answer", () => ({
  useGroundedAnswer: () => ({
    grounding: mockGrounding.current,
    isGrounding: false,
    groundingError: null,
    groundAnswer: groundAnswerMock,
    reset: vi.fn(),
  }),
}));

const mockGrounding: { current: GroundingMetadata | null } = { current: null };

vi.mock("@/components/legal/CitationPanel", () => ({
  CitationPanel: ({
    data,
  }: {
    data: {
      grounding?: GroundingMetadata | null;
      attorneyReviewRequired?: boolean;
      isStreaming?: boolean;
    };
  }) => (
    <div data-testid="citation-panel">
      <span data-testid="attorney-review-override">{String(data.attorneyReviewRequired)}</span>
      {data.grounding && (
        <span data-testid="grounding-info">
          {data.grounding.citations_verified} verified, {data.grounding.citations_unverified}{" "}
          unverified
        </span>
      )}
    </div>
  ),
}));

const noopT = ((key: string) => key) as unknown as import("@/content/dashboard").TFunc;

import { RoleOutputCard, PerspektivenSessionCard } from "./page";

const richterOutput: PerspektivenRoleOutput = {
  role: "richter",
  headline: "Anspruch dem Grunde nach schlüssig.",
  analysis: "Gemäß § 433 BGB besteht ein Zahlungsanspruch, sofern die Lieferung nachgewiesen wird.",
  key_points: ["Lieferung streitig", "Beweislast beim Kläger"],
};

describe("Perspektivenraum grounding integration", () => {
  beforeEach(() => {
    groundAnswerMock.mockClear();
    mockGrounding.current = null;
  });

  it("grounds the role's combined text on mount", () => {
    render(<RoleOutputCard output={richterOutput} t={noopT} />);
    expect(groundAnswerMock).toHaveBeenCalledWith(expect.stringContaining("Gemäß § 433 BGB"));
    expect(groundAnswerMock).toHaveBeenCalledWith(expect.stringContaining("Lieferung streitig"));
  });

  it("renders CitationPanel and does not suppress the attorney-review badge", () => {
    mockGrounding.current = {
      citations_verified: 2,
      citations_unverified: 0,
      corpus_checked: true,
      grounded_citations: [],
      analyzed_at: new Date().toISOString(),
      has_unverified: false,
    };

    render(<RoleOutputCard output={richterOutput} t={noopT} />);

    expect(screen.getByTestId("citation-panel")).toBeInTheDocument();
    expect(screen.getByTestId("grounding-info")).toHaveTextContent("2 verified, 0 unverified");
    // attorneyReviewRequired is intentionally left undefined here so
    // CitationPanel's own default (true) applies — this asserts the card
    // never passes `false` and silently turns the review badge off.
    expect(screen.getByTestId("attorney-review-override")).toHaveTextContent("undefined");

    mockGrounding.current = null;
  });

  it("grounds every role in a session, including a conditional jury role", () => {
    const session: PerspektivenSession = {
      id: "perspektiven-1",
      case_slug: "legal/cases/2026-001",
      dials: { evidenceStrength: "neutral", opponentPosture: "hart", timePressure: "entspannt" },
      created_at: new Date().toISOString(),
      roles: [
        richterOutput,
        {
          role: "gegenanwalt",
          headline: "Lieferung nicht nachgewiesen.",
          analysis: "…",
          key_points: [],
        },
        { role: "mandant", headline: "Vergleich erwägen.", analysis: "…", key_points: [] },
        {
          role: "geschworene",
          headline: "Glaubwürdig, aber lückenhaft.",
          analysis: "…",
          key_points: [],
        },
      ],
    };

    render(<PerspektivenSessionCard session={session} t={noopT} />);

    expect(screen.getAllByTestId("citation-panel")).toHaveLength(4);
    expect(groundAnswerMock).toHaveBeenCalledTimes(4);
  });
});
