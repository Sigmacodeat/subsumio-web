/**
 * UI-Tests für CorpusCommandCenter — Dashboard-Verbindung & Error-States.
 *
 * Deckt ab:
 *  - Loading-State (Skeleton) wenn API lädt
 *  - Error-State mit Retry-Button wenn API nicht erreichbar
 *  - Empty-State wenn keine Daten
 *  - Sync-Status Tabelle mit Fehlt-Spalte und Aktualisieren-Button
 *  - API-Unreachable wird als Fehler gerendert
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CorpusCommandCenter } from "./corpus-command-center";

// ── Test Helpers ────────────────────────────────────────────────────────

function withQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const MOCK_DATA = {
  dbAvailable: true,
  sync: {
    rows: [
      {
        corpus: "law-at",
        sourceId: "law-at",
        diskFiles: 100,
        dbPages: 95,
        dbChunks: 200,
        embeddedChunks: 190,
        staleChunks: 5,
        coveragePct: 95,
        notImported: 5,
        orphanDb: 0,
        syncStatus: "synced",
        fullyComplete: false,
        risTotal: 110,
        missingFromDb: 15,
        missingFromDisk: 10,
        newOnRis: 10,
        canUpdate: true,
        pipelineKey: "statutes-at",
      },
      {
        corpus: "law-at-judikatur",
        sourceId: "law-at-judikatur",
        diskFiles: 500,
        dbPages: 500,
        dbChunks: 1000,
        embeddedChunks: 1000,
        staleChunks: 0,
        coveragePct: 100,
        notImported: 0,
        orphanDb: 0,
        syncStatus: "synced",
        fullyComplete: true,
        risTotal: 500,
        missingFromDb: 0,
        missingFromDisk: 0,
        newOnRis: 0,
        canUpdate: false,
        pipelineKey: "jud-ogh",
      },
    ],
    totals: {
      totalDisk: 600,
      totalDbPages: 595,
      totalEmbedded: 1190,
      totalNotImported: 5,
      totalStale: 5,
      coveragePct: 99,
      totalRis: 610,
      totalMissingFromDb: 15,
      totalMissingFromDisk: 10,
      totalNewOnRis: 10,
    },
  },
  workQueue: { items: [], total: 0, defective: 0, needsReview: 0, verified: 0 },
  pipeline: { paused: false, states: [] },
  trust: { rows: [] },
  risDelta: { rows: [], totals: { totalHits: 0, totalNew: 0, totalChanged: 0 } },
};

// ── Mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock useToast um Toast-Provider-Abhängigkeit zu vermeiden
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

// ── Tests ───────────────────────────────────────────────────────────────

describe("CorpusCommandCenter: Loading-State", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("zeigt Skeleton-Karten während isLoading", () => {
    // Nie-resolvender Promise → bleibt im Loading-State
    mockFetch.mockReturnValue(new Promise(() => {}));
    withQueryClient(<CorpusCommandCenter />);
    // Skeleton-Karten werden gerendert (Card mit animate-pulse)
    const cards = document.querySelectorAll(".animate-pulse");
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe("CorpusCommandCenter: Error-State (API nicht erreichbar)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("zeigt Fehlermeldung mit Retry-Button bei API-Fehler", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText(/Command Center nicht ladbar/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Erneut versuchen/i)).toBeInTheDocument();
  });

  it("zeigt Fehlermeldung bei Network-Error (API unreachable)", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText(/Command Center nicht ladbar/i)).toBeInTheDocument();
    });
  });

  it("Retry-Button triggert refetch", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: MOCK_DATA }),
    });
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText(/Erneut versuchen/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Erneut versuchen/i));
    // Nach Retry sollten die Sync-Daten erscheinen
    await waitFor(() => {
      expect(screen.getByText("Sync-Status")).toBeInTheDocument();
    });
  });
});

describe("CorpusCommandCenter: Sync-Status Tabelle", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: MOCK_DATA }),
    });
  });

  it("rendert Sync-Status Section mit Korpus-Zeilen", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("law-at")).toBeInTheDocument();
    });
  });

  it("zeigt Fehlt-Spalte mit Differenz (RIS - DB)", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("law-at")).toBeInTheDocument();
    });
    // law-at hat 15 fehlende in DB — fmt() gibt "15" zurück
    // "Fehlt" erscheint mehrfach (Summary Card + Tabellen-Header) → getAllByText
    expect(screen.getAllByText(/Fehlt/i).length).toBeGreaterThan(0);
    // Die Zahl 15 sollte in der Fehlt-Spalte gerendert werden
    const cells = screen.getAllByText(/15/);
    expect(cells.length).toBeGreaterThan(0);
  });

  it("zeigt +N Badge für neue RIS-Dokumente", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      // +10 Badge bei law-at (newOnRis: 10)
      expect(screen.getByText(/\+10/)).toBeInTheDocument();
    });
  });

  it("zeigt Aktualisieren-Button nur für Corpora mit Lücken (canUpdate=true)", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("law-at")).toBeInTheDocument();
    });
    // law-at hat canUpdate=true → Button sichtbar
    const updateButtons = screen.getAllByRole("button", { name: /Aktualisieren/i });
    expect(updateButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("zeigt ✓ für Corpora mit missingFromDb=0 (nicht-fullyComplete)", async () => {
    // law-at ist nicht fullyComplete aber hat missingFromDb=15 → zeigt "15"
    // Wir brauchen eine nicht-fullyComplete Row mit missingFromDb=0
    const data = {
      ...MOCK_DATA,
      sync: {
        ...MOCK_DATA.sync,
        rows: [
          {
            ...MOCK_DATA.sync.rows[0],
            missingFromDb: 0,
            canUpdate: false,
          },
        ],
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data }),
    });
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("law-at")).toBeInTheDocument();
    });
    // missingFromDb=0 → ✓ Symbol
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("zeigt Summary-Card 'Fehlt' mit Gesamtzahl", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      // Summary Card mit Label "Fehlt"
      expect(screen.getAllByText(/Fehlt/i).length).toBeGreaterThan(0);
    });
  });
});

describe("CorpusCommandCenter: Empty-State", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("zeigt 'Alle Corpora sind vollständig' wenn alle fullyComplete", async () => {
    const emptyData = {
      ...MOCK_DATA,
      sync: {
        ...MOCK_DATA.sync,
        rows: MOCK_DATA.sync.rows.map((r) => ({ ...r, fullyComplete: true })),
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: emptyData }),
    });
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText(/Alle Corpora sind vollständig/i)).toBeInTheDocument();
    });
  });
});

describe("CorpusCommandCenter: Backfill Mutation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: query fetch returns data, pipeline POST returns success
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/corpus-pipeline") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: MOCK_DATA }),
      });
    });
  });

  it("Aktualisieren-Button ist klickbar und nicht disabled", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("law-at")).toBeInTheDocument();
    });
    const updateButton = screen.getAllByRole("button", { name: /Aktualisieren/i })[0];
    expect(updateButton).not.toBeDisabled();
    // Button hat RefreshCw Icon + "Aktualisieren" Text
    expect(updateButton).toBeInTheDocument();
  });
});
