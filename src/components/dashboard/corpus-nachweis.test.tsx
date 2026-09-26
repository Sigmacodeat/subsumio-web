// Nachweis nach Rechtsbereich (/ops/corpus, Reiter „Bestand").
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { CorpusNachweis } from "./corpus-nachweis";
import { parseProof, toSyncRow, type SyncInventorySource } from "@/lib/corpus-sync-inventory";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/ops/corpus",
}));

const counts = (over: Record<string, number>) => ({
  confirmed: 0,
  mismatch: 0,
  defective: 0,
  unchecked: 0,
  importOpen: 0,
  fetchOpen: 0,
  unreachable: 0,
  ...over,
});

function src(over: Partial<SyncInventorySource>): SyncInventorySource {
  return {
    corpus: "at-normen",
    sourceId: "law-at-normen",
    inScope: true,
    historical: false,
    risSoll: null,
    risSollKind: null,
    risSollAt: null,
    rawFiles: 0,
    normalizedFiles: 0,
    diskDocs: 0,
    dbPages: 0,
    dbDocs: 0,
    dbPagesWithoutDocId: 0,
    missingOnDisk: 0,
    missingByReason: { open: 0, no_text: 0, not_found: 0, failed: 0 },
    diskNotInDb: 0,
    dbNotOnDisk: 0,
    dbHistorical: 0,
    notInRisSoll: null,
    aboveSoll: 0,
    ...over,
  };
}

const ROWS = [
  toSyncRow(
    src({
      risSoll: 100,
      risSollKind: "index",
      notInRisSoll: 7,
      proof: parseProof({
        sollExact: true,
        contentCheckAt: "2026-09-26T06:00:00Z",
        counts: counts({ confirmed: 95, mismatch: 2, fetchOpen: 3 }),
        samples: { mismatch: [{ id: "NOR40000001", label: "ABGB § 1" }] },
      }),
    }),
    "Bundesrecht",
    undefined
  ),
  toSyncRow(
    src({
      corpus: "at-judikatur-vfgh",
      sourceId: "law-at-judikatur-vfgh",
      risSoll: 50,
      risSollKind: "hits",
      proof: parseProof({ sollExact: false, counts: counts({ confirmed: 50 }) }),
    }),
    "VfGH",
    undefined
  ),
  toSyncRow(
    src({ corpus: "de", sourceId: "law-de", inScope: false }),
    "Deutsches Bundesrecht",
    undefined
  ),
];

function renderIt(rows = ROWS, progress = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CorpusNachweis rows={rows} measuredAt="2026-09-26T07:00:00Z" progress={progress} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CorpusNachweis", () => {
  it("gliedert nach Rechtsbereich und zählt nur Belegtes als 1:1", () => {
    renderIt();
    expect(screen.getByRole("heading", { name: "Bundesrecht" })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Rechtsprechung der Höchstgerichte" })
    ).toBeDefined();
    // Kacheln: 145 bestätigt, 2 abweichend, 3 fehlen — getrennt.
    const tile = (name: RegExp) => screen.getByRole("button", { name });
    expect(within(tile(/^Nachweislich 1:1 ?\d/)).getByText("145")).toBeDefined();
    expect(within(tile(/Abweichend oder fehlerhaft/)).getByText("2")).toBeDefined();
    expect(within(tile(/^Fehlen ?\d/)).getByText("3")).toBeDefined();
    // Ausland steht nicht in den Bereichen, nur im zugeklappten Rest.
    expect(screen.getByText(/Nicht im automatischen Abgleich \(1 Quellen\)/)).toBeDefined();
  });

  it("Details: Summenprobe, Außerhalb-der-Töpfe und Einzelfälle mit RIS-Link", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /^Bundesrecht RIS-Soll/ }));
    expect(
      screen.getByText(/= RIS-Soll 100 — jedes gelistete Dokument genau einmal/)
    ).toBeDefined();
    expect(screen.getByText("außer Kraft auf dem Server")).toBeDefined();
    const link = screen.getByRole("link", { name: /NOR40000001/ });
    expect(link.getAttribute("href")).toContain("/Bundesnormen/NOR40000001/");
    expect(screen.getByText("ABGB § 1")).toBeDefined();
  });

  it("warnt laut, wenn die Summenprobe nicht aufgeht", () => {
    const broken = toSyncRow(
      src({
        risSoll: 101,
        risSollKind: "index",
        proof: parseProof({ sollExact: true, counts: counts({ confirmed: 100 }) }),
      }),
      "Bundesrecht",
      undefined
    );
    renderIt([broken]);
    expect(screen.getByRole("alert").textContent).toMatch(/Summenprobe verfehlt/);
  });

  it("zeigt ohne Nachweis-Messung keinen grünen Haken", () => {
    renderIt([toSyncRow(src({ risSoll: 10, risSollKind: "index" }), "Bundesrecht", undefined)]);
    expect(screen.getByText("Nachweis noch nicht gemessen")).toBeDefined();
    expect(screen.queryByText(/alles nachweislich 1:1/)).toBeNull();
  });

  it("zeigt Tempo und Restdauer und macht Stillstand sichtbar", () => {
    const pt = (day: string, confirmed: number, open: number) => ({
      day,
      confirmed,
      open,
      total: confirmed + open,
    });
    renderIt(ROWS, {
      "at-normen": [pt("2026-09-20", 95, 5), pt("2026-09-23", 95, 5), pt("2026-09-26", 95, 5)],
      "at-judikatur-vfgh": [pt("2026-09-25", 40, 10), pt("2026-09-26", 50, 5)],
    });
    expect(screen.getAllByText(/stockt — seit mindestens 3 Tagen/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+10 seit gestern/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Stockt" })).toBeDefined();
  });
});
