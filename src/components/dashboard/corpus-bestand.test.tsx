/**
 * UI tests for the corpus inventory (Bestand) and the ingest log (Protokoll)
 * on /ops/corpus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CorpusBestand } from "./corpus-bestand";
import { CorpusProtokoll } from "./corpus-protokoll";
import type { CorpusOverview, IngestLogPage } from "@/lib/corpus-labels";

function withQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
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
      quality: {
        checkedAt: "2026-09-21T18:54:00.000Z",
        plausible: 149746,
        implausible: 0,
        issues: {},
        rawFiles: 158000,
        normalizedFiles: 149746,
        unembeddedOk: 10726,
      },
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
      quality: {
        checkedAt: "2026-09-21T18:54:00.000Z",
        plausible: 54968,
        implausible: 698,
        issues: { "body:no_content_section": 345, "schema:legacy_frontmatter": 393 },
        rawFiles: 99666,
        normalizedFiles: 68803,
        unembeddedOk: 5612,
      },
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
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: OVERVIEW })));
    withQueryClient(<CorpusBestand />);
    await waitFor(() => expect(screen.getByText("Bundesrecht")).toBeDefined());
    expect(screen.getAllByText(text("10665")).length).toBeGreaterThan(0); // statutes
    expect(screen.getByText("vollständig")).toBeDefined(); // federal norms reconciled
    expect(screen.getByText(text("82813 fehlen"))).toBeDefined(); // OGH gap
    expect(screen.getByText(text("55666 / 1200"))).toBeDefined(); // Rechtssätze / texts
    expect(screen.getByText(/stündlich neu/)).toBeDefined();
  });

  it("shows the audit verdict per source: folder vs. database, and what is wrong in plain German", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: OVERVIEW })));
    withQueryClient(<CorpusBestand />);
    await waitFor(() => expect(screen.getByText("Bundesrecht")).toBeDefined());
    expect(screen.getByText("alle Seiten geprüft")).toBeDefined(); // federal norms: 0 implausible
    expect(screen.getByText(text("698 fehlerhaft"))).toBeDefined(); // OGH
    // The most frequent cause, not the raw code "schema:legacy_frontmatter".
    expect(screen.getByText("altes Metadaten-Format")).toBeDefined();
    expect(screen.getByText(text("Ordner 68803 · DB 55666"))).toBeDefined();
  });

  it("says so when a source was never audited, instead of implying it passed", async () => {
    const noAudit = {
      ...OVERVIEW,
      sources: OVERVIEW.sources.map((s) => ({ ...s, quality: null })),
    };
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: noAudit })));
    withQueryClient(<CorpusBestand />);
    await waitFor(() => expect(screen.getByText("Bundesrecht")).toBeDefined());
    expect(screen.getAllByText("noch nicht geprüft").length).toBe(2);
  });

  it("says when no snapshot exists yet", async () => {
    const empty = { ...OVERVIEW, sources: [], generatedAt: null };
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: empty })));
    withQueryClient(<CorpusBestand />);
    await waitFor(() => expect(screen.getByText(/Noch keine Zählung vorhanden/)).toBeDefined());
  });

  it("offers a retry when the API fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
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
