/**
 * Regel-Klassifizierer gegen elf typische österreichische Schriftstücke
 * (fiktive Parteien). Jede Fehlzuordnung hier landet in der Praxis im
 * falschen Posteingangsstapel.
 */
import { describe, expect, it } from "bun:test";
import {
  classifyLegalDocument,
  containsKeyword,
  legalDocTypeLabel,
  type LegalDocType,
} from "../src/core/legal/doc-classifier.ts";

const KLAGE = `An das
Bezirksgericht Innere Stadt Wien
Marxergasse 1a, 1030 Wien

Klagende Partei: Anna Beispiel, Musterstraße 1, 1010 Wien
vertreten durch: Dr. Max Anwalt, Rechtsanwalt in Wien
Beklagte Partei: Widget-Co GmbH, Industriestraße 5, 1100 Wien

wegen: EUR 8.450,00 s.A.

KLAGE

Vollmacht erteilt (§ 30 Abs 2 ZPO)

1. Sachverhalt
Die klagende Partei hat der beklagten Partei am 12.03.2026 Waren geliefert. Die Beklagte hat trotz Mahnung nicht bezahlt.
Beweis: Rechnung vom 12.03.2026, PV
2. Rechtliche Beurteilung
Der Anspruch gründet sich auf § 1062 ABGB.
Die klagende Partei stellt daher den Antrag, das Gericht möge die beklagte Partei schuldig erkennen, der klagenden Partei EUR 8.450,00 samt 4 % Zinsen seit 12.04.2026 binnen 14 Tagen bei Exekution zu bezahlen.
Anna Beispiel`;

const LADUNG = `Bezirksgericht Innere Stadt Wien
Marxergasse 1a, 1030 Wien
GZ 12 C 345/26k

LADUNG
zur vorbereitenden Tagsatzung

Klagende Partei: Anna Beispiel
Beklagte Partei: Widget-Co GmbH

Sie werden geladen, am 18.11.2026 um 09:30 Uhr im Verhandlungssaal 204 zur mündlichen Streitverhandlung zu erscheinen.
Bringen Sie diese Ladung und einen Lichtbildausweis mit.`;

const RECHNUNG = `Kanzlei Dr. Beispiel
Honorarnote Nr. 2026/117

Rechnung
Leistung: Vertretung in der Rechtssache Beispiel ./. Widget-Co GmbH
Honorar netto EUR 1.200,00
20 % Umsatzsteuer EUR 240,00
Betrag brutto EUR 1.440,00
Zahlbar binnen 14 Tagen auf das Konto AT00 0000 0000 0000 0000.`;

const ZAHLUNGSBEFEHL = `Bezirksgericht Innere Stadt Wien
GZ 12 C 400/26p

Zahlungsbefehl

Klagende Partei: Anna Beispiel
Beklagte Partei: Widget-Co GmbH

Die beklagte Partei ist schuldig, der klagenden Partei binnen 14 Tagen EUR 3.200,00 samt 4 % Zinsen und die mit EUR 412,50 bestimmten Kosten zu bezahlen.

Sie können gegen diesen Zahlungsbefehl binnen vier Wochen Einspruch erheben. Rechtsmittelbelehrung: Der Einspruch ist beim oben genannten Gericht einzubringen.`;

const URTEIL = `REPUBLIK ÖSTERREICH
Landesgericht für Zivilrechtssachen Wien
GZ 3 Cg 77/25x

IM NAMEN DER REPUBLIK

Das Landesgericht für Zivilrechtssachen Wien hat durch die Richterin Mag. Beispiel in der Rechtssache der klagenden Partei Anna Beispiel gegen die beklagte Partei Widget-Co GmbH wegen EUR 25.000,00 s.A. nach öffentlicher mündlicher Streitverhandlung zu Recht erkannt:

Urteil

Die beklagte Partei ist schuldig, der klagenden Partei binnen 14 Tagen EUR 25.000,00 zu bezahlen.

Entscheidungsgründe: ...
Rechtsmittelbelehrung: Gegen dieses Urteil kann binnen vier Wochen Berufung erhoben werden.`;

const BESCHLUSS = `Landesgericht für Zivilrechtssachen Wien
GZ 3 Cg 77/25x

B E S C H L U S S

Das Landesgericht für Zivilrechtssachen Wien hat durch die Richterin Mag. Beispiel in der Rechtssache der klagenden Partei Anna Beispiel gegen die beklagte Partei Widget-Co GmbH beschlossen:

Der Antrag der beklagten Partei auf Unterbrechung des Verfahrens wird abgewiesen.

Begründung: ...
Rechtsmittelbelehrung: Gegen diesen Beschluss ist der Rekurs binnen 14 Tagen zulässig. Kosten sind weitere Verfahrenskosten.`;

const BESCHEID = `Magistrat der Stadt Wien
Magistratsabteilung 35
Zahl: MA35-1234/2026

BESCHEID

Spruch
Der Antrag vom 02.05.2026 auf Erteilung eines Aufenthaltstitels wird gemäß § 11 NAG abgewiesen.

Begründung: ...

Rechtsmittelbelehrung
Gegen diesen Bescheid können Sie innerhalb von vier Wochen nach Zustellung Beschwerde an das Verwaltungsgericht Wien erheben. Die Beschwerde ist bei der Behörde einzubringen.`;

const KOLLEGENBRIEF = `Dr. Max Anwalt
Rechtsanwalt
An
Frau Mag. Erika Kollegin
Rechtsanwältin

Wien, am 20.09.2026
Unser Zeichen: 2026-014

Sehr geehrte Frau Kollegin,

in obiger Angelegenheit teile ich Ihnen namens meiner Mandantschaft mit, dass diese an einer vergleichsweisen Bereinigung interessiert ist. Anbei übermittle ich Ihnen einen Vorschlag zur Kenntnisnahme und ersuche um Ihre Stellungnahme binnen zwei Wochen.

Mit freundlichen Grüßen
Dr. Max Anwalt`;

const VOLLMACHT = `VOLLMACHT

Ich, Anna Beispiel, geb. 01.01.1980, Musterstraße 1, 1010 Wien, bevollmächtige hiermit
Herrn Dr. Max Anwalt, Rechtsanwalt in Wien,
mich in allen Angelegenheiten gegenüber der Widget-Co GmbH vor Gerichten und Behörden zu vertreten, Zustellungen anzunehmen, Vergleiche zu schließen und Geld und Geldeswert in Empfang zu nehmen.

Wien, am 01.09.2026
Anna Beispiel`;

const ZUSTELLNACHWEIS = `Rückschein RSb
Zustellnachweis

Absender: Bezirksgericht Innere Stadt Wien
GZ 12 C 345/26k
Empfänger: Dr. Max Anwalt, Rechtsanwalt

Das Dokument wurde übernommen am 14.10.2026.
Übernehmer: Kanzleiangestellte
Unterschrift des Übernehmers`;

const VERBESSERUNGSAUFTRAG = `Bezirksgericht Innere Stadt Wien
GZ 12 C 345/26k

Beschluss

Der klagenden Partei wird aufgetragen, die Klage vom 20.09.2026 binnen 14 Tagen zu verbessern, indem sie das Klagebegehren ziffernmäßig bestimmt und die Beweismittel anführt.
Wird der Schriftsatz nicht fristgerecht verbessert, gilt er als zurückgezogen (§ 85 Abs 2 ZPO).`;

const CASES: Array<[string, string, LegalDocType]> = [
  ["Klage", KLAGE, "pleading"],
  ["Ladung", LADUNG, "ladung"],
  ["Rechnung", RECHNUNG, "invoice"],
  ["Zahlungsbefehl", ZAHLUNGSBEFEHL, "zahlungsbefehl"],
  ["Urteil", URTEIL, "court_judgment"],
  ["Beschluss", BESCHLUSS, "court_order"],
  ["Bescheid", BESCHEID, "bescheid"],
  ["Kollegenbrief", KOLLEGENBRIEF, "correspondence"],
  ["Vollmacht", VOLLMACHT, "vollmacht"],
  ["Zustellnachweis", ZUSTELLNACHWEIS, "zustellnachweis"],
  ["Verbesserungsauftrag", VERBESSERUNGSAUFTRAG, "verbesserungsauftrag"],
];

describe("classifyLegalDocument — österreichische Schriftstücke", () => {
  for (const [name, text, expected] of CASES) {
    it(`${name} → ${expected}`, () => {
      expect(classifyLegalDocument(text).type).toBe(expected);
    });
  }

  it("Beschluss and Bescheid are never a Zahlungsbefehl (Rechtsmittelbelehrung is not decisive)", () => {
    expect(classifyLegalDocument(BESCHLUSS).type).not.toBe("zahlungsbefehl");
    expect(classifyLegalDocument(BESCHEID).type).not.toBe("zahlungsbefehl");
  });

  it("new types carry German labels", () => {
    expect(legalDocTypeLabel("bescheid")).toBe("Bescheid");
    expect(legalDocTypeLabel("vollmacht")).toBe("Vollmacht");
    expect(legalDocTypeLabel("zustellnachweis")).toBe("Zustellnachweis");
    expect(legalDocTypeLabel("verbesserungsauftrag")).toBe("Verbesserungsauftrag");
  });
});

describe("containsKeyword — word boundaries", () => {
  it('"haft" is not found in Mandantschaft or Haftung', () => {
    expect(containsKeyword("namens meiner mandantschaft", "haft")).toBe(false);
    expect(containsKeyword("die haftung des verkäufers", "haft")).toBe(false);
    expect(containsKeyword("über die haft wird entschieden", "haft")).toBe(true);
  });
  it("inflected forms and long compounds still match", () => {
    expect(containsKeyword("die zeugen wurden vernommen", "zeuge")).toBe(true);
    expect(containsKeyword("sachverständigengutachten", "gutachten")).toBe(true);
  });
});

describe("classifyLegalDocument — Urteil mentioning an earlier Verbesserungsauftrag", () => {
  it("stays an Urteil", () => {
    const text = URTEIL.replace(
      "Entscheidungsgründe: ...",
      "Entscheidungsgründe: Mit Verbesserungsauftrag vom 01.02.2026 wurde der Klägerin aufgetragen, das Begehren zu verbessern."
    );
    expect(classifyLegalDocument(text).type).toBe("court_judgment");
  });
});
