import { describe, test, expect } from "bun:test";
import { splitStatute, splitStatuteInline } from "../src/core/legal/split-statute.ts";

const FIXTURE = `---
title: "EStG — Einkommensteuergesetz"
type: "law"
jurisdiction: "de"
abbreviation: "EStG"
version_date: "2026-06-02"
---

## Inhaltsübersicht

§ 1 Steuerpflicht§ 1a ...table of contents noise...

## § 1 — Steuerpflicht

(1) Natürliche Personen, die im Inland einen Wohnsitz haben, sind unbeschränkt
einkommensteuerpflichtig.

## § 1a

(1) Für Staatsangehörige eines Mitgliedstaates der Europäischen Union gilt …

## § 7c — (weggefallen)

## §§ 29 und 30 — (weggefallen)
`;

describe("splitStatute", () => {
  const { meta, sections } = splitStatute(FIXTURE);

  test("parses frontmatter", () => {
    expect(meta.abbreviation).toBe("EStG");
    expect(meta.jurisdiction).toBe("de");
    expect(meta.title).toBe("EStG — Einkommensteuergesetz");
  });

  test("drops frontmatter + Inhaltsübersicht, keeps only § sections", () => {
    expect(sections.length).toBe(4);
    expect(sections.every((s) => !s.body.includes("table of contents noise"))).toBe(true);
  });

  test("extracts ref, slug-safe id and title", () => {
    expect(sections[0]).toMatchObject({ ref: "1", id: "p-1", title: "Steuerpflicht" });
    expect(sections[1]).toMatchObject({ ref: "1a", id: "p-1a", title: "" });
  });

  test("captures the § body without the heading line", () => {
    expect(sections[0].body).toContain("unbeschränkt");
    expect(sections[0].body.startsWith("##")).toBe(false);
  });

  test("handles ranges (§§ 29 und 30) into a single slug id", () => {
    const range = sections.find((s) => s.ref.includes("29"));
    expect(range).toBeDefined();
    expect(range!.id).toBe("p-29-30");
  });

  test("keeps repealed (weggefallen) sections as legitimate answers", () => {
    const repealed = sections.find((s) => s.ref === "7c");
    expect(repealed).toBeDefined();
    expect(repealed!.title).toContain("weggefallen");
  });

  test("ids are unique even on accidental collisions", () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("§ sections carry the § marker", () => {
    expect(sections.every((s) => s.marker === "§")).toBe(true);
  });
});

const ART_FIXTURE = `---
title: "OR — Obligationenrecht"
type: "law"
jurisdiction: "ch"
abbreviation: "OR"
---

# Obligationenrecht (OR) — Schweiz

## Art. 1 Vertragsfreiheit

Zum Abschlusse eines Vertrages ist die übereinstimmende gegenseitige
Willensäusserung der Parteien erforderlich.

## Art. 8 Form des Vertrags

(text …)

## Art 19

(Grundgesetz-style: "Art" without a dot, no title.)
`;

describe("splitStatute — Article-based statutes (CH OR/ZGB, Grundgesetz)", () => {
  const { meta, sections } = splitStatute(ART_FIXTURE);

  test("parses Art. headings (with and without dot)", () => {
    expect(sections.length).toBe(3);
    expect(sections[0]).toMatchObject({
      marker: "Art.",
      ref: "1",
      id: "art-1",
      title: "Vertragsfreiheit",
    });
    expect(sections[1]).toMatchObject({ marker: "Art.", ref: "8", id: "art-8" });
    expect(sections[2]).toMatchObject({ marker: "Art.", ref: "19", id: "art-19" });
  });

  test("ignores the document H1 and frontmatter", () => {
    expect(meta.abbreviation).toBe("OR");
    expect(sections[0].body).not.toContain("Obligationenrecht (OR) — Schweiz");
    expect(sections[0].body).toContain("Willensäusserung");
  });
});

// ---------------------------------------------------------------------------
// CH odat.ch format: bare `Art. NTitle` lines (no ## prefix, no space
// between number and title). This is the actual format of law-corpus/ch/*.md
// files from odat.ch, as opposed to the `## Art. N Title` format used in
// the ART_FIXTURE above.
// ---------------------------------------------------------------------------

const CH_ODAT_FIXTURE = `---
title: "OR — Obligationenrecht (Schweiz)"
type: "law"
jurisdiction: "ch"
abbreviation: "OR"
---

## Bundesgesetz betreffend die Ergänzung des Schweizerischen Zivilgesetzbuches

Art. 1Im Allgemeinen
1

Zum Abschlusse eines Vertrages ist die übereinstimmende gegenseitige Willensäusserung der Parteien erforderlich.

2

Sie kann eine ausdrückliche oder stillschweigende sein.

Art. 2Betreffend Nebenpunkte
1

Haben sich die Parteien über alle wesentlichen Punkte geeinigt, so wird vermutet, dass der Vorbehalt von Nebenpunkten die Verbindlichkeit des Vertrages nicht hindern solle.

Art. 6aZusendung unbestellter Sachen
1

Die Zusendung einer unbestellten Sache ist kein Antrag.
`;

describe("splitStatute — CH odat.ch bare Art. format (no ## prefix)", () => {
  const { meta, sections } = splitStatute(CH_ODAT_FIXTURE);

  test("parses bare Art. headings without ## prefix", () => {
    expect(sections.length).toBe(3);
    expect(sections[0]).toMatchObject({
      marker: "Art.",
      ref: "1",
      id: "art-1",
      title: "Im Allgemeinen",
    });
    expect(sections[1]).toMatchObject({
      marker: "Art.",
      ref: "2",
      id: "art-2",
      title: "Betreffend Nebenpunkte",
    });
  });

  test("handles letter-suffix articles (Art. 6a)", () => {
    const art6a = sections.find((s) => s.ref === "6a");
    expect(art6a).toBeDefined();
    expect(art6a!.id).toBe("art-6a");
    expect(art6a!.title).toBe("Zusendung unbestellter Sachen");
  });

  test("captures article body correctly", () => {
    expect(sections[0].body).toContain("Willensäusserung");
    expect(sections[0].body).not.toContain("Art. 2");
  });

  test("ignores structural ## headings (not article headings)", () => {
    expect(sections[0].body).not.toContain("Bundesgesetz betreffend");
  });
});

// ---------------------------------------------------------------------------
// Inline-§ recovery for unstructured dumps (Austrian RIS PDF text).
// These dumps carry no `## §` headings — the § markers are inline in the
// running text, interleaved with cross-references that must NOT open sections.
// ---------------------------------------------------------------------------

const AT_DUMP = `---
title: "ABGB — Allgemeines bürgerliches Gesetzbuch"
type: "law"
jurisdiction: "at"
abbreviation: "ABGB"
---

Bundesrecht konsolidiert. Langtitel … § 1. Der Inbegriff der Gesetze ist das
bürgerliche Recht. § 2. Sobald ein Gesetz kundgemacht worden ist. § 2a. Eine
Sonderbestimmung. § 3. Die Wirksamkeit eines Gesetzes; siehe dazu § 323a. über
Übergangsrecht. § 4. Die Gesetze gelten. § 5. Gesetze wirken nicht zurück.
`;

describe("splitStatute — inline-§ recovery (AT PDF dumps, no headings)", () => {
  // The dump has fewer than the 10-marker trust floor, so exercise the pure
  // function directly with a body that clears the threshold.
  const body = Array.from(
    { length: 14 },
    (_, i) => `§ ${i + 1}. Inhalt von Paragraph ${i + 1}.`
  ).join(" gemäß § 1 und § 2 ");

  test("recovers one section per inline § marker", () => {
    const secs = splitStatuteInline(body);
    expect(secs.length).toBe(14);
    expect(secs[0]).toMatchObject({ marker: "§", ref: "1", id: "p-1" });
    expect(secs[13]).toMatchObject({ ref: "14", id: "p-14" });
  });

  test("backward cross-references do not open spurious sections", () => {
    const secs = splitStatuteInline(body);
    // The "gemäß § 1 und § 2" cross-refs sit inside each section's body.
    expect(secs.length).toBe(14);
    expect(secs[5].body).toContain("gemäß § 1");
  });

  test("a lone far-forward cross-reference (§ 323a) is absorbed, not split out", () => {
    const at = `§ 1. eins. § 2. zwei. § 2a. zwei-a. § 3. drei; vgl § 323a. weiter. § 4. vier. § 5. fünf. § 6. sechs. § 7. sieben. § 8. acht. § 9. neun. § 10. zehn.`;
    const secs = splitStatuteInline(at);
    const refs = secs.map((s) => s.ref);
    expect(refs).not.toContain("323a");
    expect(refs).toContain("3");
    expect(refs).toContain("4");
    // §3's body swallows the §323a cross-reference.
    const p3 = secs.find((s) => s.ref === "3");
    expect(p3?.body).toContain("323a");
  });

  test("a genuine large gap (… §5 → §60 → §61 …) is preserved via continuation", () => {
    // Real codes start at §1; after a block of repealed §§ the next live § can
    // sit a large gap forward. The continuation run (§60, §61, §62 …) proves
    // it's a real boundary, not a cross-reference.
    const head = `§ 1. eins. § 2. zwei. § 3. drei. § 4. vier. § 5. fünf. `;
    const afterGap = Array.from({ length: 7 }, (_, i) => `§ ${60 + i}. p${60 + i}.`).join(" ");
    const secs = splitStatuteInline(head + afterGap);
    const refs = secs.map((s) => s.ref);
    expect(refs).toContain("5");
    expect(refs).toContain("60");
    expect(refs).toContain("61");
  });

  test("full integration: splitStatute falls back to inline mode for a heading-less AT dump", () => {
    const longDump = AT_DUMP.replace(
      "§ 5. Gesetze wirken nicht zurück.",
      Array.from({ length: 12 }, (_, i) => `§ ${i + 5}. Paragraph ${i + 5}.`).join(" ")
    );
    const { meta, sections } = splitStatute(longDump);
    expect(meta.abbreviation).toBe("ABGB");
    expect(sections.length).toBeGreaterThanOrEqual(10);
    expect(sections[0].marker).toBe("§");
  });

  test("prose that merely cites a few §§ is NOT split (below trust floor)", () => {
    const prose = "Der Kläger beruft sich auf § 823 und § 280 BGB sowie § 1 ABGB.";
    expect(splitStatuteInline(prose).length).toBe(0);
  });

  test("last section spills its trailing appendix into a separate -anhang page", () => {
    // The final § marker has no following marker, so it would absorb a large
    // appendix (Anlagen/Übergangsrecht) and balloon past the embeddable size.
    const head = Array.from({ length: 12 }, (_, i) => `§ ${i + 1}. kurzer Inhalt ${i + 1}.`).join(
      " "
    );
    // Appendix with word boundaries so the cut lands cleanly, not mid-word.
    const hugeAppendix = " Anlage zum Gesetz. " + "wort ".repeat(12000);
    const secs = splitStatuteInline(head + ` § 13. Schlussparagraph.` + hugeAppendix);
    const last = secs[secs.length - 1];
    const lawSection = secs[secs.length - 2];
    // The § itself stays embeddable; the bulk moves to a dedicated -anhang page.
    expect(lawSection.ref).toBe("13");
    expect(lawSection.body).toContain("§ 13");
    expect(lawSection.body.length).toBeLessThanOrEqual(24000);
    expect(last.ref).toBe("13-anhang");
    expect(last.body.length).toBeGreaterThan(20000);
  });
});
