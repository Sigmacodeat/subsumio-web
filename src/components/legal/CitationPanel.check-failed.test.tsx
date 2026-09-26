import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationPanel } from "./CitationPanel";
import { failedGroundingMetadata } from "@/lib/citation-gate-client";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (k: string) => k, setLang: vi.fn() }),
}));
vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: undefined }) }));

describe("CitationPanel — failed citation check", () => {
  it("says the check failed and shows 'not checked', instead of staying silent", () => {
    render(<CitationPanel data={{ grounding: failedGroundingMetadata() }} compact />);
    expect(screen.getByTestId("citation-check-failed")).toHaveTextContent(
      "Zitatprüfung fehlgeschlagen"
    );
    expect(screen.getByText("Rechtsquellen nicht geprüft")).toBeInTheDocument();
  });

  it("the failure metadata never counts anything as verified", () => {
    const meta = failedGroundingMetadata();
    expect(meta.corpus_checked).toBe(false);
    expect(meta.citations_verified).toBe(0);
    expect(meta.check_failed).toBe(true);
  });
});
