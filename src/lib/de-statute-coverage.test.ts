// @vitest-environment node

import { describe, test, expect } from "vitest";
import { auditDeStatutes, pageSlugToGiiSlug, parseGiiToc } from "./de-statute-coverage";

const TOC_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<items>
<item>
<title>Bürgerliches Gesetzbuch</title>
<link>http://www.gesetze-im-internet.de/bgb/xml.zip</link>
</item>
<item>
<title>Gesetz über die Ausprägung einer 1-DM-Goldmünze und die Errichtung der Stiftung &quot;Geld und Währung&quot;</title>
<link>http://www.gesetze-im-internet.de/1-dm-goldm_nzg/xml.zip</link>
</item>
<item>
<title>Zivilprozessordnung</title>
<link>https://www.gesetze-im-internet.de/zpo/xml.zip</link>
</item>
</items>`;

describe("parseGiiToc", () => {
  test("extrahiert Slug + Titel pro Eintrag", () => {
    const laws = parseGiiToc(TOC_SAMPLE);
    expect(laws).toHaveLength(3);
    expect(laws.map((l) => l.slug)).toEqual(["bgb", "1-dm-goldm_nzg", "zpo"]);
    expect(laws[0].title).toBe("Bürgerliches Gesetzbuch");
  });

  test("dekodiert XML-Entities im Titel", () => {
    const laws = parseGiiToc(TOC_SAMPLE);
    expect(laws[1].title).toContain('"Geld und Währung"');
  });

  test("leeres/kaputtes XML → leere Liste statt Fehler", () => {
    expect(parseGiiToc("")).toEqual([]);
    expect(parseGiiToc("<items>kein item</items>")).toEqual([]);
  });
});

describe("pageSlugToGiiSlug", () => {
  test("source_url schlägt Page-Slug", () => {
    expect(
      pageSlugToGiiSlug({
        slug: "de/bgb",
        frontmatter: { source_url: "https://www.gesetze-im-internet.de/bgb/xml.zip" },
      })
    ).toBe("bgb");
  });

  test("Fallback: letztes Slug-Segment", () => {
    expect(pageSlugToGiiSlug({ slug: "law-de/ao_1977" })).toBe("ao_1977");
    expect(pageSlugToGiiSlug({ slug: "bgb", frontmatter: null })).toBe("bgb");
  });
});

describe("auditDeStatutes", () => {
  const upstream = parseGiiToc(TOC_SAMPLE);

  test("volle Abdeckung → 100 %, keine Fehlenden", () => {
    const r = auditDeStatutes(upstream, new Set(["bgb", "1-dm-goldm_nzg", "zpo"]));
    expect(r.upstream_total).toBe(3);
    expect(r.in_corpus).toBe(3);
    expect(r.coverage_pct).toBe(100);
    expect(r.missing).toEqual([]);
  });

  test("fehlende Gesetze werden gelistet (Titel, de-Sortierung)", () => {
    const r = auditDeStatutes(upstream, new Set(["bgb"]));
    expect(r.in_corpus).toBe(1);
    expect(r.coverage_pct).toBeCloseTo(33.3, 1);
    expect(r.missing.map((m) => m.slug)).toContain("zpo");
    expect(r.missing.map((m) => m.slug)).toContain("1-dm-goldm_nzg");
  });

  test("leere Upstream-Liste → 100 % statt Division durch 0", () => {
    const r = auditDeStatutes([], new Set());
    expect(r.coverage_pct).toBe(100);
    expect(r.upstream_total).toBe(0);
  });

  test("missing-Cap kürzt und markiert die Liste", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      slug: `law-${i}`,
      title: `Gesetz ${i}`,
    }));
    const r = auditDeStatutes(many, new Set(), [], 3);
    expect(r.missing).toHaveLength(3);
    expect(r.missing_truncated).toBe(true);
  });

  test("Ziel-Set: fehlende Pflicht-Gesetze separat gemeldet", () => {
    const r = auditDeStatutes(upstream, new Set(["bgb"]), ["bgb", "zpo"]);
    expect(r.target.total).toBe(2);
    expect(r.target.in_corpus).toBe(1);
    expect(r.target.missing.map((m) => m.slug)).toEqual(["zpo"]);
    // Titel kommt aus dem amtlichen TOC, nicht aus dem Slug
    expect(r.target.missing[0].title).toBe("Zivilprozessordnung");
  });

  test("Ziel-Set: unbekannter Slug (nicht im TOC) fällt auf Slug als Titel zurück", () => {
    const r = auditDeStatutes(upstream, new Set(), ["bgb", "nicht-im-toc"]);
    expect(r.target.missing).toHaveLength(2);
    expect(r.target.missing.find((m) => m.slug === "nicht-im-toc")?.title).toBe("nicht-im-toc");
  });
});
