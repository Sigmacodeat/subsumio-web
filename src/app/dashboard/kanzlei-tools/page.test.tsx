import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KanzleiTools } from "@/components/legal/kanzlei-tools";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (key: string) => key, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  api: { brain: { createPage: vi.fn().mockResolvedValue({ slug: "test" }) } },
}));
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { user: { jurisdiction: "AT" } } }),
}));

describe("KanzleiTools", () => {
  it("exposes Austrian operational tools without retired German calculators", () => {
    render(<KanzleiTools />);
    expect(screen.queryByText("GKG-Rechner")).not.toBeInTheDocument();
    expect(screen.queryByText("Gerichtsverzeichnis")).not.toBeInTheDocument();
    expect(screen.getByText("Fax-Prüfung")).toBeInTheDocument();
    expect(screen.getByText("Rubrum-Generator")).toBeInTheDocument();
    expect(screen.getByText("Vollmachten")).toBeInTheDocument();
    // DATEV-Direktanbindung is an archived DE integration — filtered for all
    // tenants (DE_ONLY_HREFS), so it must NOT be reachable here.
    expect(screen.queryByText("DATEV-Direktanbindung")).not.toBeInTheDocument();
    expect(screen.getByText("RSV / drebis").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/legal-insurance"
    );
  });
});
