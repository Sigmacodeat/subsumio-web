import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KanzleiTools } from "@/components/legal/kanzlei-tools";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (key: string) => key, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  api: { brain: { createPage: vi.fn().mockResolvedValue({ slug: "test" }) } },
}));

describe("KanzleiTools", () => {
  it("makes core calculators and formerly orphaned capabilities reachable", () => {
    render(<KanzleiTools />);
    expect(screen.getByText("GKG-Rechner")).toBeInTheDocument();
    expect(screen.getByText("Gerichtsverzeichnis")).toBeInTheDocument();
    expect(screen.getByText("Vollmachten")).toBeInTheDocument();
    expect(screen.getByText("DATEV-Direktanbindung")).toBeInTheDocument();
    expect(screen.getByText("RSV / drebis").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/legal-insurance"
    );
    expect(screen.getByText("Peer-Benchmark").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/peer-benchmark"
    );
    expect(screen.getByText("White-Label PWA").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/white-label"
    );
  });
});
