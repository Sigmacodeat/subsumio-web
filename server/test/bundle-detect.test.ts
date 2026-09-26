import { describe, expect, it } from "bun:test";
import {
  describeSchriftstuecke,
  erkenneSchriftstuecke,
  PAGE_SEPARATOR,
} from "../src/core/legal/bundle-detect.ts";

const URTEIL_S1 = `REPUBLIK ÖSTERREICH
Landesgericht für Zivilrechtssachen Wien
GZ 3 Cg 77/25x

IM NAMEN DER REPUBLIK

Urteil

Die beklagte Partei ist schuldig, EUR 25.000,00 zu bezahlen.`;
const URTEIL_S2 = `3 Cg 77/25x
Entscheidungsgründe: Die Klägerin lieferte Waren ...
Rechtsmittelbelehrung: Berufung binnen vier Wochen.`;
const LADUNG = `Bezirksgericht Innere Stadt Wien
GZ 12 C 345/26k

LADUNG
zur Tagsatzung am 18.11.2026 um 09:30 Uhr, Saal 204. Sie werden geladen zu erscheinen.`;
const KOSTENNOTE = `Kostennote
Leistung: Klage, Tagsatzung
Betrag netto EUR 1.200,00, 20 % USt EUR 240,00, brutto EUR 1.440,00`;

const join = (...pages: string[]) => pages.join(`\n${PAGE_SEPARATOR}\n`);

describe("erkenneSchriftstuecke", () => {
  it("Urteil (2 pages) + Ladung + Kostennote → three Schriftstücke", () => {
    const parts = erkenneSchriftstuecke(join(URTEIL_S1, URTEIL_S2, LADUNG, KOSTENNOTE));
    expect(parts.map((p) => [p.typ, p.seite_von, p.seite_bis])).toEqual([
      ["court_judgment", 1, 2],
      ["ladung", 3, 3],
      ["invoice", 4, 4],
    ]);
    expect(parts[0]!.geschaeftszahl).toBe("3 Cg 77/25x");
    expect(parts[1]!.geschaeftszahl).toBe("12 C 345/26k");
    expect(describeSchriftstuecke(parts)).toBe(
      "S. 1–2 Urteil (3 Cg 77/25x); S. 3 Ladung (12 C 345/26k); S. 4 Rechnung"
    );
  });

  it("a multi-page single document is not split", () => {
    expect(erkenneSchriftstuecke(join(URTEIL_S1, URTEIL_S2, URTEIL_S2))).toEqual([]);
  });

  it("a change of Geschäftszahl alone starts a new Schriftstück", () => {
    const other = URTEIL_S2.replace("3 Cg 77/25x", "5 Cg 1/26a");
    expect(erkenneSchriftstuecke(join(URTEIL_S1, other))).toHaveLength(2);
  });

  it("page numbers come from the extractor's page markers", () => {
    const text = [`--- Page 1 ---\n${URTEIL_S1}`, `--- Page 3 ---\n${LADUNG}`].join(
      `\n${PAGE_SEPARATOR}\n`
    );
    expect(erkenneSchriftstuecke(text).map((p) => p.seite_von)).toEqual([1, 3]);
  });

  it("text without page markers is never split", () => {
    expect(erkenneSchriftstuecke(`${URTEIL_S1}\n\n${LADUNG}\n\n${KOSTENNOTE}`)).toEqual([]);
  });
});

describe("synthesizeDocumentMarkdown — Sammelscan hint", () => {
  it("marks a scanned bundle in the document frontmatter", async () => {
    const { synthesizeDocumentMarkdown } = await import("../src/core/extract-document.ts");
    const md = await synthesizeDocumentMarkdown("posteingang/scan.pdf", {
      text: join(URTEIL_S1, URTEIL_S2, LADUNG, KOSTENNOTE),
      frontmatter: {},
      warnings: [],
    } as never);
    expect(md).toContain("sammelscan_anzahl: 3");
    expect(md).toContain('sammelscan_hinweis: "S. 1–2 Urteil (3 Cg 77/25x); S. 3 Ladung');
  });
});
