import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KanzleiTools } from "@/components/legal/kanzlei-tools";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (key: string) => key, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      createPage: vi.fn().mockResolvedValue({ slug: "test" }),
      listAllPages: vi.fn().mockResolvedValue([]),
    },
  },
}));
const me = vi.hoisted(() => ({ jurisdiction: "AT" }));
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { user: { jurisdiction: me.jurisdiction } } }),
}));

describe("KanzleiTools", () => {
  it("exposes Austrian operational tools without retired German calculators", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <KanzleiTools />
      </QueryClientProvider>
    );
    expect(screen.queryByText("GKG-Rechner")).not.toBeInTheDocument();
    // German Fachrechner (GKG/Streitwert) is not offered to Austrian firms —
    // its API is a retired DE surface; AT prices fees in the invoice dialog.
    expect(screen.queryByText("Fachrechner (DE)")).not.toBeInTheDocument();
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

  it("keeps the German Fachrechner for German firms", () => {
    me.jurisdiction = "DE";
    render(
      <QueryClientProvider client={new QueryClient()}>
        <KanzleiTools />
      </QueryClientProvider>
    );
    expect(screen.getByText("Fachrechner (DE)")).toBeInTheDocument();
    me.jurisdiction = "AT";
  });
});
