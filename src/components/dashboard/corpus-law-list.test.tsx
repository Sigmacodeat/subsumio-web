/**
 * Gesetzesliste im Bestand: Zeilen als echte Links auf die Detailseite,
 * Filter in der URL, „Weitere anzeigen" statt Scrollbox, Nachladen mit CSRF.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import type { LawCoverageResponse, LawCoverageRow } from "@/lib/law-coverage";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/ops/corpus",
}));

import { CorpusLawList } from "./corpus-law-list";

function law(i: number, over: Partial<LawCoverageRow> = {}): LawCoverageRow {
  return {
    key: String(10000000 + i),
    abbr: `G${i}`,
    title: `Gesetz Nummer ${i}`,
    wanted: 20,
    have: 20,
    missingCount: 0,
    missingDocs: [],
    missingTruncated: false,
    pages: 20,
    chunks: 40,
    embedded: 40,
    embedPct: 100,
    status: "complete",
    ...over,
  };
}

/** 120 Gesetze: 3 fehlen ganz, 7 unvollständig, Rest vollständig — dazu ABGB. */
function coverage(): LawCoverageResponse {
  const laws: LawCoverageRow[] = [
    law(1, { status: "missing", have: 0, missingCount: 20 }),
    law(2, { status: "missing", have: 0, missingCount: 20 }),
    law(3, { status: "missing", have: 0, missingCount: 20 }),
    ...Array.from({ length: 7 }, (_, i) =>
      law(10 + i, { status: "partial", have: 12, missingCount: 8 })
    ),
    law(999, {
      key: "10001622",
      abbr: "ABGB",
      title: "Allgemeines bürgerliches Gesetzbuch",
      wanted: 820,
      have: 812,
      missingCount: 8,
      status: "partial",
    }),
    ...Array.from({ length: 109 }, (_, i) => law(100 + i)),
  ];
  return {
    source: "law-at-normen",
    generated_at: "2026-09-23T08:00:00.000Z",
    index: {
      available: true,
      file: "ris-inforce.jsonl",
      measured_at: "2026-09-21T02:00:00.000Z",
      laws: 120,
      docs: 2400,
    },
    totals: {
      laws: laws.length,
      complete: 109,
      partial: 8,
      missing: 3,
      extra: 0,
      docsWanted: 3200,
      docsHave: 3100,
      docsMissing: 124,
      chunks: 0,
      embedded: 0,
    },
    laws,
    fetch: { queued: ["10000002"], running: "10000001", running_since: null, unavailable: false },
  };
}

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CorpusLawList />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const spyFetch = () => vi.spyOn(global, "fetch");
let fetchSpy: ReturnType<typeof spyFetch>;
beforeEach(() => {
  vi.restoreAllMocks();
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/refetch") && init?.method === "POST")
      return new Response(JSON.stringify({ data: { queued: true } }));
    if (url.includes("/api/admin/corpus-law-coverage"))
      return new Response(JSON.stringify({ data: coverage() }));
    return new Response("{}", { status: 404 });
  });
});

const rows = () => within(screen.getByTestId("law-list")).getAllByRole("listitem");
const lastReplace = () => String(nav.replace.mock.calls.at(-1)?.[0] ?? "");

describe("CorpusLawList", () => {
  it("links every row to the law detail page and shows have/wanted in words", async () => {
    renderList();
    const abgb = await screen.findByRole("link", { name: "ABGB" });
    expect(abgb.getAttribute("href")).toBe("/ops/corpus/gesetz/bundesrecht/10001622");
    expect(screen.getAllByText("812 von 820 §§").length).toBeGreaterThan(0);
    // Status-Badges im Klartext
    expect(within(rows()[0]).getByText("fehlt")).toBeDefined();
  });

  it("summarises complete / incomplete / missing / downloading at a glance", async () => {
    renderList();
    await screen.findByRole("link", { name: "ABGB" });
    const tile = (label: string) =>
      screen.getAllByRole("button").find((b) => b.textContent?.startsWith(label))!;
    expect(tile("Vollständig").textContent).toContain("109");
    expect(tile("Unvollständig").textContent).toContain("8");
    expect(tile("Fehlen ganz").textContent).toContain("3");
    // 1 läuft + 1 vorgemerkt
    expect(tile("Wird geladen").textContent).toContain("2");
    expect(tile("Wird geladen").textContent).toContain("jetzt: G1");
    expect(screen.getByText(/11 Gesetze brauchen Aufmerksamkeit/)).toBeDefined();
  });

  it("writes filters into the URL (status chip, tile, source)", async () => {
    renderList();
    await screen.findByRole("link", { name: "ABGB" });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Status-Filter" })).getByRole("button", {
        name: "Unvollständig",
      })
    );
    expect(lastReplace()).toBe("/ops/corpus?status=unvollstaendig");
    fireEvent.click(screen.getByRole("button", { name: "Landesrecht" }));
    expect(lastReplace()).toBe("/ops/corpus?quelle=landesrecht");
  });

  it("filters from the URL and keeps the list parameters for the way back", async () => {
    nav.params = new URLSearchParams("status=fehlt&tab=bestand");
    renderList();
    await screen.findByRole("link", { name: "G1" });
    expect(rows()).toHaveLength(3);
    const href = screen.getByRole("link", { name: "G2" }).getAttribute("href")!;
    expect(href).toBe("/ops/corpus/gesetz/bundesrecht/10000002?zurueck=status%3Dfehlt");
    // Lade-Stand je Zeile
    expect(within(rows()[0]).getByText("wird geladen")).toBeDefined();
    expect(within(rows()[1]).getByText("vorgemerkt")).toBeDefined();
  });

  it("searches by abbreviation from the URL", async () => {
    nav.params = new URLSearchParams("suche=abgb");
    renderList();
    await screen.findByRole("link", { name: "ABGB" });
    expect(rows()).toHaveLength(1);
  });

  it("shows 50 laws and grows via “Weitere anzeigen” (count in the URL)", async () => {
    renderList();
    await screen.findByRole("link", { name: "ABGB" });
    expect(rows()).toHaveLength(50);
    expect(screen.getByText(/50 von 120 Gesetzen angezeigt/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Weitere 50 anzeigen" }));
    expect(lastReplace()).toBe("/ops/corpus?anzahl=100");
  });

  it("is not a fixed-height scroll box — the page scrolls, the header sticks", async () => {
    renderList();
    await screen.findByRole("link", { name: "ABGB" });
    const list = screen.getByTestId("law-list");
    for (let el: HTMLElement | null = list; el; el = el.parentElement) {
      expect(el.className).not.toMatch(/max-h-|overflow-y-auto|overflow-auto|overscroll-contain/);
    }
    expect(screen.getByTestId("law-list-header").className).toContain("sticky");
  });

  it("offers the empty state with one action when nothing matches", async () => {
    nav.params = new URLSearchParams("suche=gibtsnicht");
    renderList();
    expect(await screen.findByText("Kein Gesetz passt zu diesem Filter")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(lastReplace()).toBe("/ops/corpus");
  });

  it("queues a refetch with the CSRF token (Nachladen)", async () => {
    document.cookie = "sb_csrf=tok123";
    nav.params = new URLSearchParams("suche=abgb");
    renderList();
    await screen.findByRole("link", { name: "ABGB" });
    fireEvent.click(screen.getByRole("button", { name: /ABGB: 8 fehlende §§ vom RIS nachladen/ }));
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("/refetch"))).toBe(true)
    );
    const [, init] = fetchSpy.mock.calls.find(([u]) => String(u).includes("/refetch"))!;
    expect((init as RequestInit).method).toBe("POST");
    expect(new Headers((init as RequestInit).headers).get("x-csrf-token")).toBe("tok123");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      source: "law-at-normen",
      gnr: "10001622",
    });
  });

  it("explains a failed load and offers a retry", async () => {
    fetchSpy.mockImplementation(async () => new Response("x", { status: 500 }));
    renderList();
    expect(await screen.findByText(/Gesetzes-Abgleich konnte nicht geladen werden/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Neu laden" })).toBeDefined();
  });
});
