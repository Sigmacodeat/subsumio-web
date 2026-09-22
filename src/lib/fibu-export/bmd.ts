/**
 * BMD-Buchhaltungsexport — BMD NTCS hat KEINE öffentlich von BMD selbst
 * veröffentlichte, frei zugängliche Formatspezifikation (anders als RZL).
 * Diese Implementierung stützt sich auf die Schnittstellenbeschreibung
 * eines BMD-zertifizierten Partners, "FIBU04 BMD NTCS Schnittstelle 1.0-2"
 * (EDV Hausleitner GmbH, 14.05.2020, frei abrufbar unter edv-hausleitner.at/
 * fileadmin/FIBU04_BMD_NTCS_Schnittstelle_1.0-2_14.05.2020_Dokumentation.pdf),
 * selbst gelesen. Das Dokument beschreibt primär, wie EIN bestimmtes
 * Warenwirtschaftssystem an BMD FIBU04 exportiert — die dort als
 * "mindestens notwendig" gekennzeichneten Spaltennamen (Konto, Gkonto,
 * Buchsymbol, Belegnr, Buchdatum, Belegdatum, Buchcode, Steuercode,
 * Betrag, Prozent, Steuer, Text, ZZiel, Skontopz, Skontotage) sind aber
 * die BMD-FIBU04-eigenen Feldnamen (nicht WAWI-spezifisch) und damit die
 * verlässlichste öffentlich auffindbare Grundlage.
 *
 * WICHTIG — vor dem ersten echten Import verifizieren: BMD ordnet Spalten
 * über die CSV-Kopfzeile zu (kein festes Positionsschema wie bei RZL),
 * daher ist die SpaltenREIHENFOLGE unkritisch — aber der `steuercode` ist
 * eine pro BMD-Mandant im Kontenplan konfigurierte Nummer, KEIN
 * universeller Wert. Es gibt keine öffentlich dokumentierte, für alle
 * Kanzleien gültige Zuordnung "USt-Satz → Steuercode" — das im
 * Referenzdokument gezeigte Beispiel ("Kenner Warenlieferung=1 → 1") ist
 * nur für DEN Kunden gültig, für den es geschrieben wurde. Diese Funktion
 * verlangt die Zuordnung daher explizit als Parameter statt sie zu raten;
 * die Kanzlei muss sie einmalig mit ihrem Steuerberater/der BMD-Administration
 * klären (Kanzlei-Einstellungen → Buchhaltung).
 */

import { FibuExportInputError, type FibuBookingInput, type FibuExportConfig } from "./types";

export const BMD_FIBU04_HEADER = [
  "Konto",
  "Gkonto",
  "Buchsymbol",
  "Belegnr",
  "Buchdatum",
  "Belegdatum",
  "Buchcode",
  "Steuercode",
  "Betrag",
  "Prozent",
  "Steuer",
  "Text",
  "ZZiel",
  "Skontopz",
  "Skontotage",
] as const;

/**
 * Buchungssymbol nach dem Referenzdokument: AZ = Anzahlungsrechnung,
 * GU = Gutschrift, ST = Stornorechnung, sonst AR (Ausgangsrechnung).
 */
function buchsymbol(invoiceType: FibuBookingInput["invoiceType"]): string {
  if (invoiceType === "gutschrift") return "GU";
  if (invoiceType === "storno") return "ST";
  return "AR";
}

/**
 * BMD ersetzt laut Dokumentation Semikolons in Textfeldern durch Kommas
 * (kein CSV-Quoting) — "Werden aus der WAWI alphanumerische Datenfelder
 * exportiert, werden „;" im Text mit einem „,“ ersetzt."
 */
function bmdText(s: string): string {
  return s.replace(/;/g, ",");
}

function bmdDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new FibuExportInputError(`Ungültiges Datum: ${iso}`);
  return `${m[3]}.${m[2]}.${m[1]}`; // TT.MM.JJJJ, gängige BMD-Datumsdarstellung
}

function bmdAmount(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export function bmdRowForInvoice(
  entry: FibuBookingInput,
  config: FibuExportConfig,
  steuercodeForRate: Record<number, string>
): string {
  const steuercode = steuercodeForRate[entry.vatRatePercent];
  if (!steuercode) {
    throw new FibuExportInputError(
      `Kein BMD-Steuercode für ${entry.vatRatePercent} % konfiguriert. Diese Zuordnung ist pro BMD-Mandant individuell — bitte in den Kanzlei-Einstellungen unter Buchhaltung mit dem Steuerberater abstimmen und hinterlegen.`
    );
  }
  const isNegative = entry.invoiceType === "storno" || entry.invoiceType === "gutschrift";
  const sign = isNegative ? -1 : 1;

  const fields = {
    Konto: String(config.debitorKonto),
    Gkonto: String(config.erloesKonto),
    Buchsymbol: buchsymbol(entry.invoiceType),
    Belegnr: entry.invoiceNumber,
    Buchdatum: bmdDate(entry.date),
    Belegdatum: bmdDate(entry.date),
    Buchcode: "1", // Sollbuchung (führendes Konto = Debitor)
    Steuercode: steuercode,
    Betrag: bmdAmount(entry.gross * sign),
    Prozent: String(entry.vatRatePercent),
    Steuer: bmdAmount(entry.vat * sign),
    Text: bmdText(`Rechnung ${entry.invoiceNumber} ${entry.clientName}`.trim()),
    ZZiel: "",
    Skontopz: "",
    Skontotage: "",
  } satisfies Record<(typeof BMD_FIBU04_HEADER)[number], string>;

  return BMD_FIBU04_HEADER.map((h) => fields[h]).join(";");
}

/** Baut die komplette BMD-FIBU04-Importdatei inklusive Kopfzeile (BMD ordnet Spalten per Header zu). */
export function generateBmdExport(
  entries: FibuBookingInput[],
  config: FibuExportConfig,
  steuercodeForRate: Record<number, string>
): string {
  if (entries.length === 0)
    throw new FibuExportInputError("Keine Rechnungen im gewählten Zeitraum.");
  const rows = entries.map((e) => bmdRowForInvoice(e, config, steuercodeForRate));
  return [BMD_FIBU04_HEADER.join(";"), ...rows].join("\r\n") + "\r\n";
}
