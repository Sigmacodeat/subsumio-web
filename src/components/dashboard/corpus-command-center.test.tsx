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
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function row(over: Record<string, unknown> = {}) {
  return {
    corpus: "at-normen",
    sourceId: "law-at-normen",
    label: "Bundesrecht (Normen)",
    inScope: true,
    historical: false,
    risSoll: 110,
    risSollKind: "index",
    diskDocs: 100,
    dbDocs: 90,
    dbPages: 95,
    missingOpen: 10,
    missingUnreachable: 0,
    importOpen: 10,
    dbExtra: 0,
    notInSoll: 0,
    dbChunks: 200,
    embeddedChunks: 190,
    coveragePct: 95,
    status: "fetch_open",
    fullyComplete: false,
    canUpdate: true,
    pipelineKey: "normen-at",
    ...over,
  };
}

const ARCHIVE_ROW = row({
  corpus: "at",
  sourceId: "law-at",
  label: "Bundesrecht — historische Fassungen",
  historical: true,
  risSoll: null,
  risSollKind: null,
  missingOpen: 0,
  importOpen: 0,
  status: "historical",
  canUpdate: false,
  pipelineKey: null,
});

const MOCK_DATA = {
  dbAvailable: true,
  sync: {
    rows: [
      row(),
      row({
        corpus: "at-judikatur",
        sourceId: "law-at-judikatur",
        label: "OGH-Judikatur",
        risSoll: 500,
        risSollKind: "hits",
        diskDocs: 500,
        dbDocs: 500,
        missingOpen: 0,
        importOpen: 0,
        status: "complete",
        fullyComplete: true,
        canUpdate: false,
        pipelineKey: "jud-ogh",
      }),
    ],
    totals: {
      risSoll: 610,
      diskDocs: 600,
      dbDocs: 590,
      missingOpen: 10,
      missingUnreachable: 0,
      importOpen: 10,
      dbExtra: 0,
      notInSoll: 0,
      dbChunks: 1200,
      embedded: 1190,
      coveragePct: 99,
    },
    measuredAt: "2026-09-25T10:00:00.000Z",
  },
  workQueue: { items: [], total: 0, defective: 0, needsReview: 0, verified: 0 },
  pipeline: { paused: false, states: [] },
  trust: { rows: [] },
  risDelta: { rows: [], totals: { totalHits: 0, totalNew: 0, totalChanged: 0 } },
};

function withSync(over: Record<string, unknown>) {
  return { ...MOCK_DATA, sync: { ...MOCK_DATA.sync, ...over } };
}

function serve(data: unknown) {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data }) });
}

// ── Mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock useToast um Toast-Provider-Abhängigkeit zu vermeiden
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

// Mock next/navigation: useSearchParams + useRouter für URL-State Filter
const mockSearchParams = new URLSearchParams();
const mockRouterReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockRouterReplace }),
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
    mockSearchParams.delete("filter");
    serve(MOCK_DATA);
  });

  it("zeigt die Kette RIS-Soll → Server → Datenbank", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => expect(screen.getByText("at-normen")).toBeInTheDocument());
    expect(screen.getByText("RIS-Soll")).toBeInTheDocument();
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getByText("Datenbank")).toBeInTheDocument();
  });

  it("benennt pro Zeile, wo es hängt: Abruf und Import getrennt", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => expect(screen.getByText("at-normen")).toBeInTheDocument());
    expect(screen.getByText("10 fehlen im Abruf")).toBeInTheDocument();
    expect(screen.getByText("10 warten auf Import")).toBeInTheDocument();
    expect(screen.getByText("Abruf offen")).toBeInTheDocument();
  });

  it("Einbettung ist Nebeninformation, kein Status", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => expect(screen.getByText("at-normen")).toBeInTheDocument());
    expect(screen.getByText(/Einbettung 95,0 %/)).toBeInTheDocument();
  });

  it("zeigt „Nachholen“ nur für Quellen mit offenem Abruf", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => expect(screen.getByText("at-normen")).toBeInTheDocument());
    const buttons = screen.getAllByRole("button", { name: /Nachholen/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).not.toBeDisabled();
  });

  it("zeigt „✓ nichts offen“ für eine vollständige Quelle unter „Alle“", async () => {
    mockSearchParams.set("filter", "all");
    try {
      withQueryClient(<CorpusCommandCenter />);
      await waitFor(() => expect(screen.getByText("at-judikatur")).toBeInTheDocument());
      expect(screen.getByText("✓ nichts offen")).toBeInTheDocument();
      expect(screen.getByText("Vollständig")).toBeInTheDocument();
    } finally {
      mockSearchParams.delete("filter");
    }
  });

  it("zeigt keine Zahlen, solange keine Messung nach Dokumentnummer existiert", async () => {
    serve(withSync({ measuredAt: null }));
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() =>
      expect(screen.getByText(/Noch keine Messung nach Dokumentnummer/i)).toBeInTheDocument()
    );
    expect(screen.queryByText("at-normen")).not.toBeInTheDocument();
  });

  it("blendet das Archiv im Standardfilter aus und zeigt es unter „Alle“", async () => {
    serve(withSync({ rows: [...MOCK_DATA.sync.rows, ARCHIVE_ROW] }));
    const first = withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => expect(screen.getByText("at-normen")).toBeInTheDocument());
    expect(screen.queryByText(/historische Fassungen/i)).not.toBeInTheDocument();
    first.unmount();

    mockSearchParams.set("filter", "all");
    try {
      withQueryClient(<CorpusCommandCenter />);
      await waitFor(() => expect(screen.getByText(/historische Fassungen/i)).toBeInTheDocument());
      expect(screen.getByText(/^Archiv$/)).toBeInTheDocument();
    } finally {
      mockSearchParams.delete("filter");
    }
  });
});

describe("CorpusCommandCenter: Filter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSearchParams.delete("filter");
    serve(MOCK_DATA);
  });

  it("filtert standardmäßig auf offene Quellen", async () => {
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() => expect(screen.getByText("at-normen")).toBeInTheDocument());
    expect(screen.queryByText("at-judikatur")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Korpora filtern/i })).toBeInTheDocument();
  });

  it("zeigt den Leerzustand, wenn nichts offen ist", async () => {
    serve(withSync({ rows: [MOCK_DATA.sync.rows[1]] }));
    withQueryClient(<CorpusCommandCenter />);
    await waitFor(() =>
      expect(screen.getByText(/Nichts offen — alle Korpora sind vollständig/i)).toBeInTheDocument()
    );
  });
});
