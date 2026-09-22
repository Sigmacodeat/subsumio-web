/**
 * RZL-Buchhaltungsexport — "RZL FIBU Import Schnittstelle" (Handbuch
 * Datenimport, RZL Software GmbH, Stand August 2026, kostenlos abrufbar
 * unter rzlsoftware.at/fileadmin/user_upload/PDF_Schnittstelle/
 * RZL_FIBU_Import_Schnittstelle.pdf). Selbst gelesen (59 Seiten,
 * pdftotext), nicht nur aus einer Recherche-Zusammenfassung übernommen.
 *
 * Format: ANSI (Codepage 1252), 41 Felder, Trennzeichen Semikolon,
 * Zeilenende CR/LF, KEIN Trennzeichen nach dem letzten Feld. Jede Rechnung
 * wird als "Buchungszeile mit Gegenbuchung" (Buchungsart 1, Standard) in
 * ZWEI Zeilen übergeben — Debitoren-Zeile (Soll, Bruttobetrag) und
 * Gegenbuchungs-Zeile (Erlöskonto, Haben, Nettobetrag + Steuerbetrag). Das
 * ist wörtlich das im Handbuch (Kap. 6.3 "Musterbeispiel Ausgangsrechnung
 * Inland") vorgerechnete Beispiel:
 *
 *   20100;4120;100;15012025;;EUR;12000,00;0,00;0,00;;0,00;0,00;0;AR;100;1;20;2;0;1;...
 *   4120;20100;100;15012025;;EUR;0,00;10000,00;2000,00;;0,00;0,00;0;AR;100;1;20;2;0;1;...
 *
 * Nur die für eine inländische Ausgangsrechnung relevanten Felder werden
 * befüllt (1–20, 24); Fremdwährung, Kostenträger, Dienstleistungsverkehr,
 * OSS, DMS usw. bleiben leer (nicht zutreffend im Regelfall).
 */

import { FibuExportInputError, type FibuBookingInput, type FibuExportConfig } from "./types";

/** § Kap. 2.2.2: gültige USt-Schlüssel für Österreich, aus dem Handbuch. */
export const RZL_UST_SCHLUESSEL_FOR_RATE: Record<number, string> = {
  20: "20",
  13: "13",
  10: "10",
  5: "5",
};

const FIELD_COUNT = 41;

function ratgDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new FibuExportInputError(`Ungültiges Datum: ${iso}`);
  return `${m[3]}${m[2]}${m[1]}`; // TTMMJJJJ
}

/** Betrag im RZL-Format: Komma statt Punkt, zwei Nachkommastellen, kein Tausendertrennzeichen. */
function rzlAmount(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Ein Buchungstext darf laut Handbuch kein Semikolon enthalten. */
function rzlText(s: string): string {
  return s.replace(/;/g, ",").slice(0, 40);
}

function buildRow(fields: (string | number)[]): string {
  if (fields.length !== FIELD_COUNT) {
    throw new Error(`RZL-Zeile hat ${fields.length} Felder, erwartet ${FIELD_COUNT}.`);
  }
  return fields.map((f) => String(f)).join(";");
}

/** Zwei Zeilen (Debitor + Gegenbuchung) für eine Ausgangsrechnung. */
export function rzlRowsForInvoice(entry: FibuBookingInput, config: FibuExportConfig): string[] {
  const schluessel = RZL_UST_SCHLUESSEL_FOR_RATE[entry.vatRatePercent];
  if (!schluessel) {
    throw new FibuExportInputError(
      `Kein USt-Schlüssel für ${entry.vatRatePercent} % hinterlegt (nur 20/13/10/5 % sind im Handbuch als Inlands-Normalfälle belegt — für Export/ig. Lieferung/0 % bitte mit dem Steuerberater abstimmen).`
    );
  }
  const isNegative = entry.invoiceType === "storno" || entry.invoiceType === "gutschrift";
  const sign = isNegative ? -1 : 1;
  const date = ratgDate(entry.date);
  const belegDatum = date;
  const belegkreis = "AR"; // Ausgangsrechnung — Konvention laut Handbuch, frei mit Steuerberater abstimmbar
  const belegnummer = entry.invoiceNumber.slice(0, 16);
  const text1 = rzlText(`Rechnung ${entry.invoiceNumber} ${entry.clientName}`.trim());

  const common = {
    opNummer: "", // keine OP-Verwaltung ohne Personenkonten-Stammdaten-Abgleich — leer lassen, damit RZL nicht fälschlich einen bestehenden OP zuordnet
    ustLand: 1, // Österreich
    ustSchluessel: schluessel,
    ustCode: 2, // MwSt. (Ausgangsseite)
    ustSondercode: "",
    buchungsart: 1, // Buchungszeile mit Gegenbuchung
  };

  // Zeile 1: Debitor, Soll = Bruttobetrag, Steuerbetrag hier 0 (die Steuer
  // steht laut Musterbeispiel auf der Gegenbuchungs-Zeile).
  const line1 = buildRow([
    config.debitorKonto, // 1 Kontonummer
    config.erloesKonto, // 2 Gegenkonto
    common.opNummer, // 3 OP-Nummer
    date, // 4 Beleg-Datum
    "", // 5 Valuta-Datum
    "EUR", // 6 Währung
    rzlAmount(entry.gross * sign), // 7 Sollbetrag
    "", // 8 Habenbetrag
    "0,00", // 9 Steuerbetrag
    "", // 10 Fremdwährung
    "", // 11 FW-Sollbetrag
    "", // 12 FW-Habenbetrag
    "", // 13 Kostenstelle
    belegkreis, // 14 Belegkreis
    belegnummer, // 15 Belegnummer
    common.ustLand, // 16 USt-Land
    common.ustSchluessel, // 17 USt-Schlüssel
    common.ustCode, // 18 USt-Code
    common.ustSondercode, // 19 USt-Sondercode
    common.buchungsart, // 20 Buchungsart
    "", // 21 Zahlungsfrist
    "", // 22 Skontofrist
    "", // 23 Skontoprozentsatz
    text1, // 24 Buchungstext
    "", // 25 Buchungstext 2. Zeile
    "", // 26 UID-Nummer
    "", // 27 Dienstleistungsnummer
    "", // 28 Dienstleistungsland
    "", // 29 Dienstleistungsexport
    "", // 30 DMS-Schlüssel
    "", // 31 Kostenträger
    "", // 32 Fremdbelegnummer
    "", // 33 Wert 1
    "", // 34 Wert 2
    "", // 35 Mahnsperre
    "", // 36 Zahlungsreferenz
    "", // 37 Belegpfad
    "", // 38 Reserviert
    "", // 39 OSS-Korrekturzeitraum
    "", // 40 OSS-Korrekturart
    "", // 41 DMS-GUID
  ]);

  // Zeile 2: Gegenbuchung auf das Erlöskonto, Haben = Nettobetrag, Steuerbetrag = USt.
  const line2 = buildRow([
    config.erloesKonto,
    config.debitorKonto,
    common.opNummer,
    belegDatum,
    "",
    "EUR",
    "",
    rzlAmount(entry.net * sign),
    rzlAmount(entry.vat * sign),
    "",
    "",
    "",
    "",
    belegkreis,
    belegnummer,
    common.ustLand,
    common.ustSchluessel,
    common.ustCode,
    common.ustSondercode,
    common.buchungsart,
    "",
    "",
    "",
    text1,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  return [line1, line2];
}

/** Baut die komplette RZL-Importdatei (ohne Header — RZL erwartet keine Spaltenüberschrift). */
export function generateRzlExport(entries: FibuBookingInput[], config: FibuExportConfig): string {
  if (entries.length === 0)
    throw new FibuExportInputError("Keine Rechnungen im gewählten Zeitraum.");
  const rows = entries.flatMap((e) => rzlRowsForInvoice(e, config));
  return rows.join("\r\n") + "\r\n";
}
