import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LegalInsurancePage from "@/app/dashboard/legal-insurance/page";
import PeerBenchmarkPage from "@/app/dashboard/peer-benchmark/page";
import DatevDirectPage from "@/app/dashboard/datev-direct/page";
import WhiteLabelPage from "@/app/dashboard/white-label/page";
import BulkCasesPage from "@/app/dashboard/bulk-cases/page";

vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({
    lang: "de",
    t: (key: string) =>
      ({
        "workspace.rsv.title": "Rechtsschutzversicherung",
        "workspace.benchmark.title": "Peer-Benchmark",
        "workspace.datev.title": "DATEV Direct",
        "workspace.white.title": "White-Label PWA",
        "workspace.bulk.title": "Massenakten",
      })[key] ?? key,
  }),
}));

describe("product workspaces", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["Rechtsschutzversicherung", LegalInsurancePage],
    ["Peer-Benchmark", PeerBenchmarkPage],
    ["DATEV Direct", DatevDirectPage],
    ["White-Label PWA", WhiteLabelPage],
    ["Massenakten", BulkCasesPage],
  ])("renders the reachable %s workspace", (heading, Component) => {
    render(<Component />);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
