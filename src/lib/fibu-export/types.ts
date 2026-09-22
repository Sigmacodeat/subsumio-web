/**
 * Buchhaltungsexport für die beiden dominanten österreichischen
 * Steuerberater-Systeme: BMD NTCS und RZL. Bisher gab es in der aktiven
 * (AT-only) Produktversion GAR KEINEN Buchhaltungsexport — die einzige
 * DATEV-nahe Logik (src/lib/datev-export.ts) hängt nur noch an der
 * archivierten DE-Seite (src/app/_archive/de/dashboard/datev-export) und
 * ist zudem kein echtes DATEV-Format, sondern eine selbst erfundene
 * CSV-Struktur mit einem "EHRLICHKEITSREGEL"-Hinweis, dass sie vor dem
 * echten Import verifiziert werden muss.
 */

export interface FibuBookingInput {
  invoiceNumber: string;
  /** ISO-Datum (YYYY-MM-DD), Rechnungsdatum. */
  date: string;
  clientName: string;
  /** Netto, Steuer und Brutto in Euro; positiv für Standardrechnungen. */
  net: number;
  vat: number;
  vatRatePercent: number;
  gross: number;
  invoiceType?: "standard" | "storno" | "gutschrift";
}

export interface FibuExportConfig {
  /**
   * Debitorenkonto (Kunde) und Erlöskonto — beides kanzleispezifisch, mit
   * dem Steuerberater bzw. dem hinterlegten Kontenplan abzustimmen. Es gibt
   * keinen universellen Standardwert; die im Handbuch gezeigten Beispiele
   * (z. B. RZL: 20100/4120) sind nur Beispielkonten.
   */
  debitorKonto: number;
  erloesKonto: number;
}

export class FibuExportInputError extends Error {}
