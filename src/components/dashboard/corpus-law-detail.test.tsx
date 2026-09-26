/**
 * Detailseite eines Gesetzes: Status, fehlende §§ mit RIS-Link, gespeicherte
 * §§ mit Datei-Betrachter, Rückweg zur gefilterten Liste, Leer-/Fehlerzustände.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import type { LawDetailResponse } from "@/lib/law-coverage";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/ops/corpus/gesetz/bundesrecht/10001622",
}));
// Der echte Betrachter lädt die Datei selbst — hier zählt nur, dass er mit
// dem richtigen Pfad geöffnet wird.
vi.mock("@/components/dashboard/corpus-steward/CorpusFileViewer", () => ({
  CorpusFileViewer: ({ path }: { path: string | null }) =>
    path ? <div data-testid="viewer">{path}</div> : null,
}));

import { CorpusLawDetail } from "./corpus-law-detail";

function detail(over: Partial<LawDetailResponse> = {}): LawDetailResponse {
  return {
    source: "law-at-normen",
    key: "10001622",
    abbr: "ABGB",
    title: "Allgemeines bürgerliches Gesetzbuch",
    status: "partial",
    wanted: 4,
    have: 2,
    missing: [
      { nor: "NOR40000003", apa: "§ 3" },
      { nor: "NOR40000010", apa: "§ 10" },
    ],
    unreachable: [],
    present: [
      {
        doc: "NOR40000001",
        label: "§ 1",
        title: "Begriff des bürgerlichen Rechtes",
        file: "at-normen/abgb/p-1.md",
        flag: "verified",
        chunks: 2,
        embedded: 2,
        updated_at: "2026-09-20T10:00:00.000Z",
      },
      {
        doc: "NOR40000002",
        label: "§ 2",
        title: "Kundmachung",
        file: null,
        flag: null,
        chunks: 1,
        embedded: 0,
        updated_at: null,
      },
    ],
    extra: [],
    chunks: 3,
    embedded: 2,
    embed_pct: 66.7,
    quality: { verified: 1, needs_review: 0, defective: 0, unchecked: 1 },
    index: { available: true, measured_at: "2026-09-21T02:00:00.000Z" },
    generated_at: "2026-09-23T08:00:00.000Z",
    fetch: { supported: true, queued: false, running: false, unavailable: false },
    ...over,
  };
}

function mockDetail(res: () => Response) {
  vi.spyOn(global, "fetch").mockImplementation(async () => res());
}

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CorpusLawDetail sourceParam="bundesrecht" lawKey="10001622" />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  nav.params = new URLSearchParams();
});

describe("CorpusLawDetail", () => {
  it("shows the law with status, counts, RIS link and last check", async () => {
    mockDetail(() => new Response(JSON.stringify({ data: detail() })));
    renderDetail();
    expect(await screen.findByRole("heading", { level: 1, name: "ABGB" })).toBeDefined();
    expect(screen.getByText("unvollständig")).toBeDefined();
    expect(screen.getByText("2 von 4 §§")).toBeDefined();
    expect(screen.getByRole("link", { name: /Im RIS öffnen/ }).getAttribute("href")).toBe(
      "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622"
    );
    expect(
      screen.getByText(/Zuletzt geprüft: amtliches Verzeichnis vom 21\.09\.2026/)
    ).toBeDefined();
  });

  it("lists every missing § with a link to its RIS document, in natural order", async () => {
    mockDetail(() => new Response(JSON.stringify({ data: detail() })));
    renderDetail();
    const list = await screen.findByRole("list", { name: "Fehlende §§" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("§ 3"),
      expect.stringContaining("§ 10"),
    ]);
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe(
      "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40000003/NOR40000003.html"
    );
  });

  it("opens the stored text of a present § in the existing file viewer", async () => {
    mockDetail(() => new Response(JSON.stringify({ data: detail() })));
    renderDetail();
    const list = await screen.findByRole("list", { name: "Gespeicherte §§" });
    expect(within(list).getByText("Verifiziert")).toBeDefined();
    expect(within(list).getByText("keine Textdatei")).toBeDefined();
    fireEvent.click(within(list).getByRole("button", { name: /Text ansehen/ }));
    expect(screen.getByTestId("viewer").textContent).toBe("at-normen/abgb/p-1.md");
  });

  it("returns to the filtered list at the same row (only known list parameters)", async () => {
    nav.params = new URLSearchParams({
      zurueck: "status=fehlt&suche=abgb&evil=https://x.example",
    });
    mockDetail(() => new Response(JSON.stringify({ data: detail() })));
    renderDetail();
    const back = await screen.findByRole("link", { name: /Zurück zur Gesetzesliste/ });
    expect(back.getAttribute("href")).toBe("/ops/corpus?status=fehlt&suche=abgb#gesetz-10001622");
  });

  it("offers “Gesetz nachladen” only when §§ are missing and nothing is queued", async () => {
    mockDetail(() => new Response(JSON.stringify({ data: detail() })));
    const { unmount } = renderDetail();
    expect(await screen.findByRole("button", { name: /Gesetz nachladen/ })).toBeDefined();
    unmount();

    vi.restoreAllMocks();
    mockDetail(
      () =>
        new Response(
          JSON.stringify({
            data: detail({
              fetch: { supported: true, queued: true, running: false, unavailable: false },
            }),
          })
        )
    );
    renderDetail();
    expect(await screen.findByText("zum Nachladen vorgemerkt")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Gesetz nachladen/ })).toBeNull();
  });

  it("shows an empty state when no § is stored yet", async () => {
    mockDetail(
      () =>
        new Response(JSON.stringify({ data: detail({ status: "missing", have: 0, present: [] }) }))
    );
    renderDetail();
    expect(await screen.findByText("Noch kein § gespeichert")).toBeDefined();
    expect(screen.getByText("fehlt")).toBeDefined();
  });

  it("says plainly when the law does not exist", async () => {
    mockDetail(() => new Response("{}", { status: 404 }));
    renderDetail();
    expect(await screen.findByText("Gesetz nicht gefunden")).toBeDefined();
  });

  it("explains a server error and offers a retry", async () => {
    mockDetail(() => new Response("x", { status: 500 }));
    renderDetail();
    expect(await screen.findByText(/Das Gesetz konnte nicht geladen werden/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Neu laden" })).toBeDefined();
  });
});
