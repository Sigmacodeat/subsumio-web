/**
 * Citation-Guardrail: korrekte österreichische Zitate dürfen nicht als
 * "nicht existierendes Gesetz" gelten (Regeneration mit falscher Anweisung),
 * erfundene Kürzel müssen weiter erkannt werden.
 *
 * Normen gegen RIS (ris.bka.gv.at) geprüft, Abruf 26.09.2026:
 *   § 46 AußStrG (Rekursfrist), § 7 ASGG (örtliche Zuständigkeit in
 *   Sozialrechtssachen), § 7 Abs 4 VwGVG (Beschwerdefrist
 *   vier Wochen), § 1 JN, § 41 ZPO (Kostenersatz).
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  checkCitationGrounding,
  extractCitations,
  extractLawAbbreviations,
  buildRegenerationPrompt,
  KNOWN_LAWS,
} from "../src/core/citation-guardrail.ts";
import { AT_LAW_ABBREVIATIONS } from "../src/core/legal/at-law-abbreviations.generated.ts";
import {
  CORPUS_META_PATH,
  deriveAtLawAbbreviations,
} from "../scripts/generate-at-law-abbreviations.ts";

interface Case {
  answer: string;
  context: string;
  slug: string;
}

const AT_CASES: Record<string, Case> = {
  "§ 46 AußStrG": {
    answer: "Die Rekursfrist beträgt nach § 46 AußStrG vierzehn Tage.",
    context: "§ 46 AußStrG. (1) Die Frist für den Rekurs beträgt vierzehn Tage.",
    slug: "legal/statutes/at/aussstrg/p-46",
  },
  "§ 7 ASGG": {
    answer: "Örtlich zuständig ist nach § 7 ASGG das Gericht am Wohnsitz des Versicherten.",
    context:
      "§ 7 ASGG. (1) Für die im § 65 Abs. 1 Z 1, 2, 4 bis 6 und 8 genannten Rechtsstreitigkeiten ist nur das Gericht örtlich zuständig, in dessen Sprengel der Wohnsitz oder gewöhnliche Aufenthalt des Versicherten liegt.",
    slug: "legal/statutes/at/asgg/p-7",
  },
  "§ 7 Abs 4 VwGVG": {
    answer: "Die Beschwerdefrist beträgt gemäß § 7 Abs 4 VwGVG vier Wochen.",
    context: "§ 7 VwGVG. (4) Die Frist zur Erhebung einer Beschwerde beträgt vier Wochen.",
    slug: "legal/statutes/at/vwgvg/p-7",
  },
  "§ 1 JN": {
    answer: "Die Gerichtsbarkeit in bürgerlichen Rechtssachen regelt § 1 JN.",
    context: "§ 1 JN. Die Gerichtsbarkeit in bürgerlichen Rechtssachen wird durch Bezirksgerichte ausgeübt.",
    slug: "legal/statutes/at/jn/p-1",
  },
  "§ 41 ZPO": {
    answer: "Die unterliegende Partei hat die Kosten nach § 41 ZPO zu ersetzen.",
    context: "§ 41 ZPO. (1) Die in dem Rechtsstreite vollständig unterliegende Partei hat ihrem Gegner die Kosten zu ersetzen.",
    slug: "legal/statutes/at/zpo/p-41",
  },
};

describe("Guardrail erkennt AT-Kürzel mit Umlaut/ß vollständig", () => {
  it("extrahiert AußStrG statt 'Au'", () => {
    expect(extractLawAbbreviations("nach § 46 AußStrG gilt")).toEqual(["AußStrG"]);
    expect(extractCitations("§ 46 AußStrG")).toEqual(["§ 46 AußStrG"]);
  });

  it("liest 'Abs' ohne Punkt und die Ziffer mit", () => {
    expect(extractLawAbbreviations("§ 7 Abs 4 VwGVG")).toEqual(["VwGVG"]);
    expect(extractLawAbbreviations("§ 6 Abs 1 Z 2 KSchG")).toEqual(["KSchG"]);
    expect(extractCitations("§ 7 Abs 4 VwGVG")).toEqual(["§ 7 Abs. 4 VwGVG"]);
  });

  it("kennt Bindestrich- und Umlaut-Kürzel", () => {
    expect(extractLawAbbreviations("Art 130 bzw. § 1 B-VG")).toContain("B-VG");
    expect(extractLawAbbreviations("§ 52d ÄrzteG")).toEqual(["ÄrzteG"]);
  });
});

describe("korrekte AT-Antworten bestehen den Guardrail", () => {
  for (const [label, c] of Object.entries(AT_CASES)) {
    it(`${label} → passed, kein non_existent_law`, () => {
      const r = checkCitationGrounding({ answer: c.answer, context: c.context, topSlugs: [c.slug] });
      expect(r.non_existent_laws).toEqual([]);
      expect(r.cross_law_contamination).toEqual([]);
      expect(r.passed).toBe(true);
    });
  }

  it("Slug-Form (aussstrg) genügt, auch wenn der Chunk das Kürzel nicht enthält", () => {
    const r = checkCitationGrounding({
      answer: "Rekurs binnen vierzehn Tagen (§ 46 AußStrG).",
      context: "§ 46. (1) Die Frist für den Rekurs beträgt vierzehn Tage.",
      topSlugs: ["legal/statutes/at/aussstrg/p-46"],
    });
    expect(r.non_existent_laws).toEqual([]);
    expect(r.cross_law_contamination).toEqual([]);
    expect(r.passed).toBe(true);
  });
});

describe("erfundene Kürzel werden weiter erkannt", () => {
  it("§ 12 XqzVG ohne Beleg → non_existent_law, nicht bestanden", () => {
    const r = checkCitationGrounding({
      answer: "Nach § 12 XqzVG ist die Klage binnen einer Woche einzubringen.",
      context: "§ 46 AußStrG. (1) Die Frist für den Rekurs beträgt vierzehn Tage.",
      topSlugs: ["legal/statutes/at/aussstrg/p-46"],
    });
    expect(r.non_existent_laws).toContain("XqzVG");
    expect(r.passed).toBe(false);
  });

  it("Neuerzeugungs-Anweisung behauptet nicht 'existiert nicht', sondern 'nicht verifiziert'", () => {
    const r = checkCitationGrounding({
      answer: "Nach § 12 XqzVG gilt eine Woche.",
      context: "§ 46 AußStrG. (1) Rekursfrist vierzehn Tage.",
      topSlugs: ["legal/statutes/at/aussstrg/p-46"],
    });
    const prompt = buildRegenerationPrompt("SYS", r, "");
    expect(prompt).toContain("XqzVG");
    expect(prompt).toContain("nicht verifiziert");
    expect(prompt).not.toContain("existieren nicht");
  });
});

describe("AT-Kürzelverzeichnis ist aus dem Korpus erzeugt", () => {
  it("enthält die AT-Verfahrensgesetze", () => {
    for (const law of ["AußStrG", "ASGG", "VwGVG", "VwGG", "VfGG", "JN", "RATG", "FAGG", "VKrG", "NO", "KHVG"]) {
      expect(KNOWN_LAWS.has(law), law).toBe(true);
    }
  });

  // corpus-meta.json liegt im Web-Teil des Repos; im reinen Engine-Checkout
  // fehlt er — dann gibt es nichts zu vergleichen.
  it.skipIf(!existsSync(CORPUS_META_PATH))("ist frisch (bun server/scripts/generate-at-law-abbreviations.ts)", () => {
    const meta = JSON.parse(readFileSync(CORPUS_META_PATH, "utf8"));
    expect([...AT_LAW_ABBREVIATIONS]).toEqual(deriveAtLawAbbreviations(meta));
  });
});
