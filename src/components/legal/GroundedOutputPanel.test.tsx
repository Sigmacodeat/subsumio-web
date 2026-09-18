import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GroundedOutputPanel } from "./GroundedOutputPanel";

const groundMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { legal: { ground: (...a: unknown[]) => groundMock(...a) } },
}));
vi.mock("@/components/legal/CitationPanel", () => ({
  CitationPanel: ({ data }: { data: { grounding: { citations_verified: number } | null } }) => (
    <div data-testid="panel">
      {data.grounding ? `${data.grounding.citations_verified} verified` : "pending"}
    </div>
  ),
}));

beforeEach(() => {
  groundMock.mockReset();
  groundMock.mockResolvedValue({
    citations_verified: 1,
    citations_unverified: 0,
    corpus_checked: true,
    grounded_citations: [],
    analyzed_at: "",
    has_unverified: false,
  });
});

describe("GroundedOutputPanel", () => {
  it("grounds the AI text once and shows the result in the citation panel", async () => {
    const { rerender } = render(
      <GroundedOutputPanel text="Nach § 1295 ABGB haftet der Schädiger." />
    );
    await waitFor(() => expect(screen.getByTestId("panel")).toHaveTextContent("1 verified"));
    rerender(<GroundedOutputPanel text="Nach § 1295 ABGB haftet der Schädiger." />);
    expect(groundMock).toHaveBeenCalledTimes(1);
  });

  it("waits for the final text while streaming", () => {
    render(<GroundedOutputPanel text="Nach § 1295 ABGB haf" isStreaming />);
    expect(groundMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("panel")).toHaveTextContent("pending");
  });

  it("renders nothing for empty output", () => {
    const { container } = render(<GroundedOutputPanel text="   " />);
    expect(container).toBeEmptyDOMElement();
    expect(groundMock).not.toHaveBeenCalled();
  });
});
