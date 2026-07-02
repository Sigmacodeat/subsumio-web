import { describe, it, expect } from "bun:test";
import {
  buildRisUrl,
  extrahiereNormen,
  parseRisResponse,
  runJudikaturWatch,
  type FetchLike,
  type WatchEngine,
} from "../src/core/legal/judikatur-watch.ts";

// ── Fixtures ────────────────────────────────────────────────

const GROUNDING = `---
title: "Grounding"
---

Der Anspruch stützt sich auf § 1295 ABGB und § 1489 ABGB.
Verfahrensrechtlich: § 106 Abs 3 StPO. Daneben Art 82 DSGVO.
Nochmals § 1295 ABGB (Duplikat). Kein Treffer: § 42 Phantasie.`;

function risEnvelope(ids: string[]): unknown {
  return {
    OgdSearchResult: {
      OgdDocumentResults: {
        Hits: ids.length,
        OgdDocumentReference: ids.map((id) => ({
          Data: {
            Metadaten: {
              Allgemein: { Aenderungsdatum: "2026-06-20" },
              Technisch: { ID: id },
              Judikatur: {
                Geschaeftszahl: { item: `4 Ob ${id}/26x` },
                Justiz: { Gericht: "OGH" },
              },
            },
          },
        })),
      },
    },
  };
}

interface Written {
  slug: string;
  page: { type: string; compiled_truth: string; frontmatter: Record<string, unknown> };
}

function fakeEngine(opts: {
  groundings: Array<{ slug: string; compiled_truth: string }>;
  seen?: Record<string, string[]>;
}): WatchEngine & { written: Written[] } {
  const written: Written[] = [];
  return {
    written,
    async executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (sql.includes("legal-grounding")) {
        return opts.groundings.map((g) => ({ ...g })) as T[];
      }
      // seen-list lookup
      const slug = String(params?.[0] ?? "");
      const seen = opts.seen?.[slug];
      if (seen) return [{ slug, frontmatter: { seen } }] as T[];
      return [];
    },
    async putPage(slug, page) {
      written.push({ slug, page: page as never });
      return {};
    },
  };
}

// ── Norm extraction ─────────────────────────────────────────

describe("extrahiereNormen", () => {
  it("extracts §§ with Gesetz, dedupes, sorts", () => {
    const normen = extrahiereNormen(GROUNDING);
    expect(normen).toContain("§ 1295 ABGB");
    expect(normen).toContain("§ 1489 ABGB");
    expect(normen).toContain("§ 106 Abs 3 StPO");
    expect(normen).toContain("Art 82 DSGVO");
    expect(normen.filter((n) => n === "§ 1295 ABGB")).toHaveLength(1);
    expect(normen.join(" ")).not.toContain("Phantasie");
  });

  it("empty body → no norms", () => {
    expect(extrahiereNormen("")).toHaveLength(0);
  });
});

describe("buildRisUrl", () => {
  it("targets RIS-OGD Justiz with phrase query", () => {
    const url = buildRisUrl("§ 1295 ABGB", "2026-06-01");
    expect(url).toContain("data.bka.gv.at/ris/api/v2.6/judikatur");
    expect(url).toContain("Applikation=Justiz");
    // URLSearchParams encodes spaces as '+'
    expect(url).toContain("Suchworte=%22%C2%A7+1295+ABGB%22");
    expect(url).toContain("EntscheidungsdatumVon=2026-06-01");
  });
});

describe("parseRisResponse", () => {
  it("parses the OgdSearchResult envelope", () => {
    const treffer = parseRisResponse(risEnvelope(["JJT_1", "JJT_2"]));
    expect(treffer).toHaveLength(2);
    expect(treffer[0]!.dokumentnummer).toBe("JJT_1");
    expect(treffer[0]!.gericht).toBe("OGH");
    expect(treffer[0]!.geschaeftszahl).toContain("4 Ob");
    expect(treffer[0]!.url).toContain("JJT_1");
  });

  it("tolerates garbage", () => {
    expect(parseRisResponse(null)).toHaveLength(0);
    expect(parseRisResponse({})).toHaveLength(0);
    expect(parseRisResponse({ OgdSearchResult: {} })).toHaveLength(0);
  });
});

// ── Watch run ───────────────────────────────────────────────

describe("runJudikaturWatch", () => {
  const fetchWithHits =
    (ids: string[]): FetchLike =>
    async () => ({
      ok: true,
      status: 200,
      json: async () => risEnvelope(ids),
    });

  it("writes alert + seen pages for new decisions", async () => {
    const engine = fakeEngine({
      groundings: [{ slug: "legal-grounding/akte-1", compiled_truth: GROUNDING }],
    });
    const result = await runJudikaturWatch(engine, {
      fetchImpl: fetchWithHits(["JJT_NEU"]),
      heute: "2026-07-02",
      sinceIso: "2026-06-01",
    });
    expect(result.akten).toBe(1);
    expect(result.neueEntscheidungen).toBeGreaterThan(0);
    expect(result.alertSlugs).toContain("judikatur-alerts/akte-1-2026-07-02");
    const alert = engine.written.find((w) => w.slug.startsWith("judikatur-alerts/"))!;
    expect(alert.page.compiled_truth).toContain("OGH");
    expect(alert.page.compiled_truth).toContain("rerun_layers");
    const seen = engine.written.find((w) => w.slug.startsWith("judikatur-watch/seen-"))!;
    expect(seen.page.frontmatter.seen).toContain("JJT_NEU");
  });

  it("already-seen decisions never alert twice", async () => {
    const engine = fakeEngine({
      groundings: [{ slug: "legal-grounding/akte-1", compiled_truth: GROUNDING }],
      seen: { "judikatur-watch/seen-akte-1": ["JJT_ALT"] },
    });
    const result = await runJudikaturWatch(engine, {
      fetchImpl: fetchWithHits(["JJT_ALT"]),
      heute: "2026-07-02",
      sinceIso: "2026-06-01",
    });
    expect(result.neueEntscheidungen).toBe(0);
    expect(result.alertSlugs).toHaveLength(0);
    expect(engine.written).toHaveLength(0);
  });

  it("RIS errors are collected, not thrown", async () => {
    const engine = fakeEngine({
      groundings: [{ slug: "legal-grounding/akte-1", compiled_truth: GROUNDING }],
    });
    const failing: FetchLike = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const result = await runJudikaturWatch(engine, {
      fetchImpl: failing,
      heute: "2026-07-02",
    });
    expect(result.fehler.length).toBeGreaterThan(0);
    expect(result.neueEntscheidungen).toBe(0);
  });

  it("Akten ohne Grounding-Map werden übersprungen", async () => {
    const engine = fakeEngine({
      groundings: [{ slug: "legal-grounding/leere-akte", compiled_truth: "nichts einschlägiges" }],
    });
    const result = await runJudikaturWatch(engine, {
      fetchImpl: fetchWithHits(["X"]),
      heute: "2026-07-02",
    });
    expect(result.akten).toBe(0);
  });

  it("supports the rerun slug variant legal-grounding-maps/", async () => {
    const engine = fakeEngine({
      groundings: [{ slug: "legal-grounding-maps/akte-2", compiled_truth: GROUNDING }],
    });
    const result = await runJudikaturWatch(engine, {
      fetchImpl: fetchWithHits(["JJT_9"]),
      heute: "2026-07-02",
    });
    expect(result.alertSlugs).toContain("judikatur-alerts/akte-2-2026-07-02");
  });
});
