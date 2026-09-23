/**
 * UI tests for the corpus inventory (Bestand) and the ingest log (Protokoll)
 * on /ops/corpus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { CorpusBestand } from "./corpus-bestand";
import { CorpusProtokoll } from "./corpus-protokoll";
import type { CorpusOverview, IngestLogPage } from "@/lib/corpus-labels";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/ops/corpus",
}));

/** fetch-Mock je URL — jeder Aufruf bekommt eine frische Response. */
function routeFetch(routes: Record<string, () => Response>) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [prefix, make] of Object.entries(routes)) if (url.includes(prefix)) return make();
    return new Response("{}", { status: 404 });
  });
}
const json = (data: unknown) => () => new Response(JSON.stringify({ data }));

function withQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

const OVERVIEW: CorpusOverview = {
  sources: [
    {
      sourceId: "law-at-normen",
      label: "Bundesrecht",
      kind: "statute",
      pages: 149746,
      statutes: 10665,
      rechtssaetze: 0,
      entscheidungstexte: 0,
      repealed: 1274,
      chunks: 213964,
      embedded: 69325,
      lastUpdated: "2026-09-19T11:10:11.000Z",
      reconciliation: {
        measuredAt: "2026-09-19T12:00:00.000Z",
        method: "doc-ids",
        risTotal: 148157,
        dbTotal: 149746,
        missing: 0,
        extra: 1589,
        note: null,
      },
    },
    {
      sourceId: "law-at-judikatur",
      label: "OGH und Justiz",
      kind: "decision",
      pages: 55666,
      statutes: 0,
      rechtssaetze: 55666,
      entscheidungstexte: 1200,
      repealed: 0,
      chunks: 168702,
      embedded: 168702,
      lastUpdated: null,
      reconciliation: {
        measuredAt: "2026-09-19T12:00:00.000Z",
        method: "counts",
        risTotal: 138479,
        dbTotal: 55666,
        missing: 82813,
        extra: 0,
        note: null,
      },
    },
  ],
  totals: {
    statutes: 10665,
    norms: 149746,
    decisions: 55666,
    rechtssaetze: 55666,
    entscheidungstexte: 1200,
    pages: 205412,
    chunks: 382666,
    embedded: 238027,
  },
  ingestByDay: [{ day: "2026-09-19", added: 530, updated: 1200 }],
  generatedAt: "2026-09-19T12:17:00.000Z",
};

const LOG: IngestLogPage = {
  total: 1,
  limit: 50,
  offset: 0,
  entries: [
    {
      id: 1,
      occurredAt: "2026-09-19T10:00:00.000Z",
      sourceId: "law-at-normen",
      sourceLabel: "Bundesrecht",
      docId: "NOR40270195",
      slug: "legal/statutes/at/gnr-20012918/p-12",
      title: "2. Geschäftsverteilung der Volksanwaltschaft",
      action: "added",
      origin: "batch-import-from-disk",
      risUrl: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40270195/NOR40270195.xml",
    },
  ],
};

beforeEach(() => vi.restoreAllMocks());

/** Matches an element's own text ignoring whitespace kinds (de-AT groups digits with NBSP). */
const text = (expected: string) => (_: string, el: Element | null) =>
  !!el &&
  el.children.length === 0 &&
  (el.textContent ?? "").replace(/\s/g, "") === expected.replace(/\s/g, "");

describe("CorpusBestand", () => {
  it("shows totals, per-source rows and the reconciliation status", async () => {
    routeFetch({ "/api/admin/corpus-overview": json(OVERVIEW) });
    withQueryClient(<CorpusBestand />);
    // "Bundesrecht" steht auch im Quellen-Umschalter der Gesetzesliste —
    // erst auf die Zählung warten, dann prüfen.
    await waitFor(() => expect(screen.getByText(/stündlich neu/)).toBeDefined());
    expect(screen.getAllByText("Bundesrecht").length).toBeGreaterThan(1);
    expect(screen.getAllByText(text("10665")).length).toBeGreaterThan(0); // statutes
    expect(screen.getByText("vollständig")).toBeDefined(); // federal norms reconciled
    expect(screen.getByText(text("82813 fehlen"))).toBeDefined(); // OGH gap
    expect(screen.getByText(text("55666 / 1200"))).toBeDefined(); // Rechtssätze / texts
    expect(screen.getByText(/stündlich neu/)).toBeDefined();
  });

  it("says when no snapshot exists yet", async () => {
    const empty = { ...OVERVIEW, sources: [], generatedAt: null };
    routeFetch({ "/api/admin/corpus-overview": json(empty) });
    withQueryClient(<CorpusBestand />);
    await waitFor(() => expect(screen.getByText(/Noch keine Zählung vorhanden/)).toBeDefined());
  });

  it("offers a retry when the API fails", async () => {
    routeFetch({ "/api/admin/corpus-overview": () => new Response("x", { status: 500 }) });
    withQueryClient(<CorpusBestand />);
    await waitFor(() =>
      expect(screen.getByText("Bestand konnte nicht geladen werden.")).toBeDefined()
    );
  });
});

describe("CorpusProtokoll", () => {
  it("lists documents with action and an HTML link to the official RIS page", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: LOG })));
    withQueryClient(<CorpusProtokoll />);
    await waitFor(() =>
      expect(screen.getByText("2. Geschäftsverteilung der Volksanwaltschaft")).toBeDefined()
    );
    expect(screen.getByText("neu")).toBeDefined();
    const link = screen.getByRole("link", { name: /im RIS öffnen/ });
    expect(link.getAttribute("href")).toBe(
      "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40270195/NOR40270195.html"
    );
  });
});
