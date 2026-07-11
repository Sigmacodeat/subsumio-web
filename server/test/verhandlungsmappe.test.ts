import { describe, it, expect } from "bun:test";
import {
  extractBeilagen,
  extractBody,
  generiereVerhandlungsmappe,
  type MappeEngine,
} from "../src/core/legal/verhandlungsmappe.ts";

// ── Fixture pages ───────────────────────────────────────────

const ON_INDEX = `---
title: "ON-Index"
type: on_index
---

| ON | Datum | Typ | Personen |
|---|---|---|---|
| ON 1 | 01.02.2026 | Anklage | Mustermann |
| ON 2 | 10.02.2026 | Beilage ./A | Mustermann |
| ON 3 | 12.02.2026 | Beilage ./1 | Widget Co |

## Facts

<!--- gbrain:facts:begin -->
| # | claim |
|---|-------|
| 1 | geheim |
<!--- gbrain:facts:end -->`;

const DEADLINES = `---
title: "Fristenkalender"
type: deadline_calendar
---

| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
|---|---|---|---|---|---|
| 09.07.2026 | rot | Berufungsfrist | § 464 ZPO | Rechtskraft | ON 12 |`;

function fakeEngine(pages: Record<string, string>): MappeEngine & {
  written: Array<{
    slug: string;
    page: { compiled_truth: string; frontmatter: Record<string, unknown> };
  }>;
} {
  const written: Array<{
    slug: string;
    page: { compiled_truth: string; frontmatter: Record<string, unknown> };
  }> = [];
  return {
    written,
    async executeRaw<T>(_sql: string, params?: unknown[]): Promise<T[]> {
      const slug = String(params?.[0] ?? "");
      const body = pages[slug];
      if (!body) return [];
      return [{ slug, title: slug, compiled_truth: body, frontmatter: {} }] as T[];
    },
    async putPage(slug, page) {
      written.push({ slug, page: page as never });
      return {};
    },
  };
}

describe("extractBody", () => {
  it("strips frontmatter and facts fences", () => {
    const body = extractBody(ON_INDEX);
    expect(body).not.toContain("type: on_index");
    expect(body).not.toContain("gbrain:facts");
    expect(body).not.toContain("geheim");
    expect(body).toContain("ON 1");
  });
});

describe("extractBeilagen", () => {
  it("finds Beilagen rows only", () => {
    const rows = extractBeilagen(extractBody(ON_INDEX));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("./A");
    expect(rows[1]).toContain("./1");
  });
});

describe("generiereVerhandlungsmappe", () => {
  it("composes sections from available pages and lists missing ones", async () => {
    const engine = fakeEngine({
      "on-indexes/akte-1": ON_INDEX,
      "deadline-calendars/akte-1": DEADLINES,
    });
    const result = await generiereVerhandlungsmappe(engine, {
      caseSlug: "akte-1",
      termin: "2026-09-15",
      heute: "2026-07-02",
    });

    expect(result.slug).toBe("verhandlungsmappen/akte-1");
    expect(result.quellen).toContain("on-indexes/akte-1");
    expect(result.quellen).toContain("deadline-calendars/akte-1");
    // Fehlende Sektionen werden ausgewiesen, nicht verschluckt
    expect(result.fehlend.length).toBeGreaterThan(0);
    expect(result.markdown).toContain("## Fehlende Grundlagen");

    // Chronologie + Beweismittel + Fristen-Snapshot enthalten
    expect(result.markdown).toContain("Chronologie des Akts");
    expect(result.markdown).toContain("Beweismittelverzeichnis");
    expect(result.markdown).toContain("./A");
    expect(result.markdown).toContain("Fristen-Snapshot");
    // Deterministische Fristen-Klassifikation (10.7. bei heute=2.7. → vorfrist)
    expect(result.markdown).toContain("| 09.07.2026 | Berufungsfrist | vorfrist |");
  });

  it("writes the page with attorney_review_required", async () => {
    const engine = fakeEngine({ "on-indexes/akte-1": ON_INDEX });
    await generiereVerhandlungsmappe(engine, { caseSlug: "akte-1", heute: "2026-07-02" });
    expect(engine.written).toHaveLength(1);
    expect(engine.written[0]!.slug).toBe("verhandlungsmappen/akte-1");
    expect(engine.written[0]!.page.frontmatter.attorney_review_required).toBe(true);
  });

  it("falls back to on-indices/ (rerun path slug)", async () => {
    const engine = fakeEngine({ "on-indices/akte-2": ON_INDEX });
    const result = await generiereVerhandlungsmappe(engine, {
      caseSlug: "akte-2",
      heute: "2026-07-02",
    });
    expect(result.quellen).toContain("on-indices/akte-2");
  });

  it("throws without caseSlug", async () => {
    const engine = fakeEngine({});
    await expect(
      generiereVerhandlungsmappe(engine, { caseSlug: "", heute: "2026-07-02" })
    ).rejects.toThrow();
  });

  it("Termin lands on the Deckblatt", async () => {
    const engine = fakeEngine({ "on-indexes/akte-1": ON_INDEX });
    const r = await generiereVerhandlungsmappe(engine, {
      caseSlug: "akte-1",
      termin: "2026-09-15",
      heute: "2026-07-02",
    });
    expect(r.markdown).toContain("**Verhandlungstermin:** 2026-09-15");
  });
});
