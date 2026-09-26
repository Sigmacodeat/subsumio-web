/**
 * ris-jud-index-crawl.ts + fetch-jud-from-index.ts — pure parts, against a
 * mocked RIS OGD search. No network, no lock, no disk.
 */
import { describe, expect, test } from "bun:test";
import {
  buildIndexLine,
  crawlCourt,
  crawlWindow,
  dayBefore,
  hitsOf,
  listWindow,
  splitWindow,
  summarize,
  type CrawlDeps,
  type IndexLine,
  type WindowPart,
} from "../scripts/ris-jud-index-crawl.ts";
import { docFromLine, missingFromIndex, parseIndex } from "../scripts/fetch-jud-from-index.ts";
import { buildMarkdown, type ExistingDocs } from "../scripts/judikatur-file.ts";
import { classifyNoText } from "../scripts/fetch-all-at-judikatur.ts";

// ── Mock RIS ───────────────────────────────────────────────────────────

interface MockDoc {
  id: string;
  date: string | null;
  typ?: string;
  az?: string;
}

function risRef(d: MockDoc): Record<string, unknown> {
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: d.id, Organ: "OGH" },
        Allgemein: {
          DokumentUrl: `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${d.id}`,
        },
        Judikatur: {
          Dokumenttyp: d.typ ?? "Text",
          ...(d.date ? { Entscheidungsdatum: d.date } : {}),
          Geschaeftszahl: { item: d.az ?? `1Ob${d.id.slice(-4)}/20a` },
          Normen: { item: ["ABGB §1295"] },
          Schlagworte: "Schadenersatz; Haftung",
          Justiz: {
            Gericht: "OGH",
            Rechtsgebiete: { item: "Zivilrecht" },
            Entscheidungsart: "Ordentliche Erledigung",
          },
        },
      },
      Dokumentliste: {
        ContentReference: {
          Urls: {
            ContentUrl: [
              {
                DataType: "Html",
                Url: `https://www.ris.bka.gv.at/Dokumente/Justiz/${d.id}/${d.id}.html`,
              },
            ],
          },
        },
      },
    },
  };
}

interface MockOpts {
  /** Pages beyond this return no documents (RIS truncating deep pagination). */
  maxPage?: number;
  /** Throw for these (from|page) combos, every time. */
  failing?: Set<string>;
  /** Report this Hits value instead of the true one for the window `from|to`. */
  lieHits?: Map<string, number>;
}

function mockRis(docs: MockDoc[], opts: MockOpts = {}) {
  const calls: string[] = [];
  let pauses = 0;
  const deps: CrawlDeps = {
    pause: async () => {
      pauses++;
    },
    fetchJson: async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const from = u.searchParams.get("EntscheidungsdatumVon");
      const to = u.searchParams.get("EntscheidungsdatumBis");
      const page = Number(u.searchParams.get("Seitennummer"));
      if (opts.failing?.has(`${from}|${page}`)) throw new Error("HTTP 503");
      const match = docs.filter((d) => {
        if (!from && !to) return true;
        if (!d.date) return false;
        if (from && d.date < from) return false;
        if (to && d.date > to) return false;
        return true;
      });
      const hits = opts.lieHits?.get(`${from}|${to}`) ?? match.length;
      const slice =
        opts.maxPage !== undefined && page > opts.maxPage
          ? []
          : match.slice((page - 1) * 100, page * 100);
      return {
        OgdSearchResult: {
          OgdDocumentResults: {
            Hits: { "@pageNumber": String(page), "@pageSize": "100", "#text": String(hits) },
            OgdDocumentReference: slice.map(risRef),
          },
        },
      };
    },
  };
  return { deps, calls, pauses: () => pauses };
}

function docsIn(year: number, n: number, prefix = "JJT"): MockDoc[] {
  return Array.from({ length: n }, (_, i) => {
    const day = (i % 28) + 1;
    const month = (Math.floor(i / 28) % 12) + 1;
    return {
      id: `${prefix}_${year}_${String(i).padStart(5, "0")}`,
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
  });
}

// ── Pure helpers ───────────────────────────────────────────────────────

describe("splitWindow", () => {
  test("year → 12 months covering every day", () => {
    const m = splitWindow({ from: "2024-01-01", to: "2024-12-31" })!;
    expect(m).toHaveLength(12);
    expect(m[1]).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(m[11]).toEqual({ from: "2024-12-01", to: "2024-12-31" });
  });
  test("month → days, day → null", () => {
    const d = splitWindow({ from: "2023-02-01", to: "2023-02-28" })!;
    expect(d).toHaveLength(28);
    expect(d[27]).toEqual({ from: "2023-02-28", to: "2023-02-28" });
    expect(splitWindow({ from: "2023-02-28", to: "2023-02-28" })).toBeNull();
  });
  test("multi-year → years, clipped to the window", () => {
    const y = splitWindow({ from: "2027-01-01", to: "2029-12-31" })!;
    expect(y.map((w) => w.from)).toEqual(["2027-01-01", "2028-01-01", "2029-01-01"]);
  });
  test("dayBefore crosses year and leap day", () => {
    expect(dayBefore("2024-01-01")).toBe("2023-12-31");
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
  });
});

describe("hitsOf / buildIndexLine", () => {
  test("Hits as object, string and missing", () => {
    expect(hitsOf({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "42" } } } })).toBe(
      42
    );
    expect(hitsOf({ OgdSearchResult: { OgdDocumentResults: { Hits: "7" } } })).toBe(7);
    expect(hitsOf({ OgdSearchResult: {} })).toBeNull();
  });

  test("line carries id, kurztitel, datum, typ and buildMarkdown's metadata", () => {
    const line = buildIndexLine(
      risRef({
        id: "JJR_20200512_OGH0002_0010OB00001_20A0000_001",
        date: "2020-05-12",
        typ: "Rechtssatz",
        az: "1Ob1/20a",
      })
    )!;
    expect(line.id).toBe("JJR_20200512_OGH0002_0010OB00001_20A0000_001");
    expect(line.kurztitel).toBe("1Ob1/20a");
    expect(line.datum).toBe("2020-05-12");
    expect(line.typ).toBe("rechtssatz");
    expect(line.meta).toMatchObject({
      court: "OGH",
      date: "2020-05-12T00:00:00.000Z",
      az: "1Ob1/20a",
      legalArea: "Zivilrecht",
      keywords: ["Schadenersatz", "Haftung"],
      normen: ["ABGB §1295"],
      decisionType: "Ordentliche Erledigung",
    });
    expect(line.meta.htmlUrl).toContain(`${line.id}.html`);
    // Round-trips into the same frontmatter the full scan writes.
    const md = buildMarkdown(docFromLine(line, "Volltext"), "ogh");
    expect(md).toContain("case_number: 1Ob1/20a");
    expect(md).toContain("normen: ABGB §1295");
    expect(md).toContain(`source_url: ${line.meta.url}`);
    expect(JSON.parse(JSON.stringify(line))).toEqual(line);
  });

  test("hit without date keeps an empty datum", () => {
    expect(buildIndexLine(risRef({ id: "X1", date: null }))!.datum).toBe("");
  });
});

// ── Window self-check ──────────────────────────────────────────────────

describe("listWindow / crawlWindow", () => {
  test("a clean year reconciles in ceil(hits/100) requests, each paced", async () => {
    const m = mockRis(docsIn(2020, 250));
    const r = await listWindow("Justiz", { from: "2020-01-01", to: "2020-12-31" }, m.deps);
    expect(r.record).toMatchObject({ hits: 250, listed: 250, ok: true });
    expect(m.calls).toHaveLength(3);
    expect(m.pauses()).toBe(3);
  });

  test("truncated pagination is detected and split until it reconciles", async () => {
    // RIS stops returning after page 2: a year of 450 cannot be listed whole,
    // but every month (≤ 100) can.
    const m = mockRis(docsIn(2019, 450), { maxPage: 2 });
    const r = await crawlWindow("Justiz", { from: "2019-01-01", to: "2019-12-31" }, m.deps);
    expect(r.lines).toHaveLength(450);
    expect(new Set(r.lines.map((l) => l.id)).size).toBe(450);
    expect(r.records).toHaveLength(12);
    expect(r.records.every((w) => w.ok)).toBe(true);
  });

  test("a page error is not a silent end of the year", async () => {
    const m = mockRis(docsIn(2018, 150), { failing: new Set(["2018-01-01|2"]) });
    const r = await crawlWindow("Justiz", { from: "2018-01-01", to: "2018-12-31" }, m.deps);
    // Year failed on page 2 → split to months; January (from 2018-01-01) is a
    // one-page window, so its page 2 is never asked.
    expect(r.lines).toHaveLength(150);
    expect(r.records.every((w) => w.ok)).toBe(true);
  });

  test("a day that never reconciles is recorded incomplete, its finds kept", async () => {
    const docs: MockDoc[] = [
      { id: "A1", date: "2017-03-05" },
      { id: "A2", date: "2017-03-05" },
    ];
    // RIS claims 3 hits for that day (and thus for everything containing it).
    const lie = new Map([
      ["2017-01-01|2017-12-31", 3],
      ["2017-03-01|2017-03-31", 3],
      ["2017-03-05|2017-03-05", 3],
    ]);
    const m = mockRis(docs, { lieHits: lie });
    const r = await crawlWindow("Justiz", { from: "2017-01-01", to: "2017-12-31" }, m.deps);
    const bad = r.records.filter((w) => !w.ok);
    expect(bad).toEqual([
      {
        from: "2017-03-05",
        to: "2017-03-05",
        hits: 3,
        listed: 2,
        ok: false,
        error: "gelistet 2 ≠ Hits 3",
      },
    ]);
    expect(r.lines.map((l) => l.id).sort()).toEqual(["A1", "A2"]);
  });
});

// ── Whole court ────────────────────────────────────────────────────────

describe("crawlCourt", () => {
  const docs: MockDoc[] = [
    ...docsIn(2026, 30),
    ...docsIn(2025, 120),
    // 2024 empty on purpose: a gap year must not end the walk.
    ...docsIn(2023, 5),
    ...docsIn(1987, 3), // older than any COURT_CONFIGS.defaultFrom
    { id: "FUT1", date: "2027-02-01" },
    { id: "UND1", date: null },
    { id: "UND2", date: null },
  ];

  test("walks back until nothing is older, lists future, reports undated", async () => {
    const m = mockRis(docs);
    const res = await crawlCourt("Justiz", m.deps, { currentYear: 2026 });
    const s = summarize(res.parts, res.risTotal);
    expect(res.risTotal).toBe(docs.length);
    expect(s.listed).toBe(docs.length - 2);
    expect(s.windowHitsSum).toBe(docs.length - 2);
    expect(s.undatedHits).toBe(2);
    expect(s.complete).toBe(true);
    expect(s.lines.some((l) => l.id === "FUT1")).toBe(true);
    expect(s.lines.filter((l) => l.datum.startsWith("1987"))).toHaveLength(3);
    // Stopped right after 1987: the last top-level window is 1987.
    expect(res.parts.at(-1)!.window.from).toBe("1987-01-01");
    expect(res.parts.at(-1)!.olderHits).toBe(0);
  });

  test("resume skips finished windows and asks RIS nothing for them", async () => {
    const first = mockRis(docs);
    const saved = new Map<string, WindowPart>();
    await crawlCourt("Justiz", first.deps, {
      currentYear: 2026,
      onPart: (p) => saved.set(`${p.window.from}_${p.window.to}`, p),
    });
    const second = mockRis(docs);
    const res = await crawlCourt("Justiz", second.deps, { currentYear: 2026, done: saved });
    // Only the end-of-run re-checks (future + current year) and the total.
    expect(second.calls).toHaveLength(3);
    expect(summarize(res.parts, res.risTotal).complete).toBe(true);
  });

  test("an unreconciled window makes the index incomplete", () => {
    const line = (id: string): IndexLine => buildIndexLine(risRef({ id, date: "2020-01-02" }))!;
    const parts: WindowPart[] = [
      {
        window: { from: "2020-01-01", to: "2020-12-31" },
        records: [{ from: "2020-01-02", to: "2020-01-02", hits: 3, listed: 2, ok: false }],
        lines: [line("A"), line("B")],
        olderHits: 0,
      },
    ];
    const s = summarize(parts, 3);
    expect(s.complete).toBe(false);
    expect(s.incompleteWindows).toBe(1);
    expect(s.notes.join(" ")).toContain("ohne Abgleich");
  });
});

// ── fetch-jud-from-index diff ──────────────────────────────────────────

describe("missingFromIndex", () => {
  const mk = (id: string, az: string, date = "2021-04-01") =>
    buildIndexLine(risRef({ id, date, az }))!;
  const empty = (): ExistingDocs => ({
    dokNrs: new Set(),
    fileKeys: new Set(),
    undatedKeys: new Set(),
  });

  test("same identity rules as fullScanCourt, plus fresh raw files and known no-text", () => {
    const lines = [
      mk("JJT_ON_DISK", "1Ob1/21a"),
      mk("JJT_LEGACY_NAME", "2Ob2/21b"),
      mk("JJT_FRESH_RAW", "3Ob3/21c"),
      mk("JJT_NO_TEXT", "4Ob4/21d"),
      mk("JJT_FAILED", "5Ob5/21e"),
      mk("JJT_OLD_NO_TEXT", "6Ob6/21f"),
      mk("JJT_MISSING", "7Ob7/21g"),
      mk("JJT_MISSING", "7Ob7/21g"), // duplicate line counted once
    ];
    const existing = empty();
    existing.dokNrs.add("JJT_ON_DISK");
    existing.fileKeys.add("2021-04-01-2ob2-21b"); // pre-dokNr file name generation
    const since = "2026-09-26T00:00:00.000Z";
    const outcomes = new Map([
      [
        "at-judikatur|JJT_NO_TEXT",
        {
          corpus: "at-judikatur",
          id: "JJT_NO_TEXT",
          outcome: "no_text" as const,
          at: "2026-09-26T03:00:00.000Z",
        },
      ],
      [
        "at-judikatur|JJT_FAILED",
        {
          corpus: "at-judikatur",
          id: "JJT_FAILED",
          outcome: "failed" as const,
          at: "2026-09-26T03:00:00.000Z",
        },
      ],
      [
        "at-judikatur|JJT_OLD_NO_TEXT",
        {
          corpus: "at-judikatur",
          id: "JJT_OLD_NO_TEXT",
          outcome: "not_found" as const,
          at: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]);
    const r = missingFromIndex({
      lines,
      existing,
      freshRaw: new Set(["JJT_FRESH_RAW"]),
      outcomes,
      corpus: "at-judikatur",
      since,
    });
    expect(r.onDisk).toBe(2);
    expect(r.freshRaw).toBe(1);
    expect(r.knownNoText).toBe(1);
    expect(r.missing.map((l) => l.id)).toEqual(["JJT_FAILED", "JJT_OLD_NO_TEXT", "JJT_MISSING"]);
  });

  test("parseIndex reads what the crawler writes and skips junk", () => {
    const a = mk("JJT_A", "1Ob1/21a");
    const text = `${JSON.stringify(a)}\n{"broken\n\n{"kurztitel":"no id"}\n`;
    expect(parseIndex(text)).toEqual([a]);
  });

  test("classifyNoText maps attempts to outcome vocabulary", () => {
    expect(classifyNoText({ statuses: [404, 404], errors: 0, rejected: 0 })).toBe("not_found");
    expect(classifyNoText({ statuses: [200, 404], errors: 0, rejected: 1 })).toBe("no_text");
    expect(classifyNoText({ statuses: [503], errors: 1, rejected: 0 })).toBe("failed");
    expect(classifyNoText({ statuses: [], errors: 0, rejected: 0 })).toBe("failed");
  });
});
