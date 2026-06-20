/**
 * DATEV-Export-Logik — extrahiert aus der Dashboard-Seite für Testbarkeit.
 *
 * Erzeugt eine CSV-Datei im DATEV-Format für den Import in DATEV Unternehmen
 * Online. Berücksichtigt Kontenrahmen (SKR03/SKR04/SKR49), Steuerkennzeichen
 * und Kostenstellen je Rechtsgebiet.
 *
 * EHRLICHKEITSREGEL: Der Export liefert die technischen Bausteine — vor dem
 * echten DATEV-Import muss der Steuerberater Kontenrahmen, Steuerschlüssel
 * und Importformat verifizieren.
 */

export interface ExportEntry {
  id: string;
  date: string;
  caseNumber: string;
  description: string;
  hours?: number;
  rate: number;
  amount: number;
  client: string;
  legalArea: string;
  invoiceNumber?: string;
  kind: "time" | "expense";
}

/** Rechtsgebiet → DATEV Kostenstelle. */
export const AREA_CODES: Record<string, string> = {
  Vertragsrecht: "1300",
  Prozessrecht: "1200",
  Arbeitsrecht: "1400",
  Datenschutz: "1500",
  Steuerrecht: "1700",
  Allgemein: "1100",
};

/** DATEV Kontenrahmen — Konto / Gegenkonto für Honorar und Auslagen. */
export const KONTENRAHMEN: Record<
  string,
  { honorarKonto: string; auslagenKonto: string; ustKonto: string }
> = {
  SKR03: { honorarKonto: "8400", auslagenKonto: "4900", ustKonto: "1776" },
  SKR04: { honorarKonto: "4400", auslagenKonto: "6300", ustKonto: "3806" },
  SKR49: { honorarKonto: "4400", auslagenKonto: "4900", ustKonto: "2776" },
};

/** CSV-Zelle escapen — Anführungszeichen, Semikolon, Zeilenumbrüche. */
export function csvCell(value: string | number | undefined): string {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Steuerkennzeichen für DATEV je nach USt-Satz.
 *  19 % DE = 19, 20 % AT = 20, 0 % = 0 (Ausland/Reverse-Charge). */
export function steuerKennzeichen(vatRate: number): string {
  if (vatRate >= 0.19 && vatRate < 0.20) return "19";
  if (vatRate >= 0.20) return "20";
  return "0";
}

/** DATEV CSV-Header — kanonische Spaltenreihenfolge. */
export const DATEV_CSV_HEADER =
  "USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Berater;Mandant-Nr";

/**
 * Baut die DATEV-CSV aus ExportEntries + Kanzlei-Settings.
 * Filtert nach Zeitraum (periodFrom ≤ date ≤ periodTo).
 */
export function generateDatevCsv(
  entries: ExportEntry[],
  settings: {
    datevKontenrahmen?: string;
    datevBeraterNr?: string;
    datevMandantenNr?: string;
    ustId?: string;
  } | null,
  periodFrom: string,
  periodTo: string,
): string {
  const kontenrahmen = settings?.datevKontenrahmen || "SKR03";
  const konten = KONTENRAHMEN[kontenrahmen] || KONTENRAHMEN.SKR03;
  const beraterNr = settings?.datevBeraterNr || "";
  const mandantenNr = settings?.datevMandantenNr || "";
  const ustId = settings?.ustId || "";

  const lines = [
    DATEV_CSV_HEADER,
    ...entries
      .filter((e) => e.date >= periodFrom && e.date <= periodTo)
      .map((e) => {
        const amount = e.amount.toFixed(2).replace(".", ",");
        const hours = (e.hours ?? 0).toFixed(2).replace(".", ",");
        const date = e.date.split("-").reverse().join(".");
        const kostenstelle = AREA_CODES[e.legalArea] || "1100";
        const beleg = e.invoiceNumber || e.caseNumber;
        const konto = e.kind === "time" ? konten.honorarKonto : konten.auslagenKonto;
        const steuer = steuerKennzeichen(0.19);
        return [
          ustId,
          date,
          beleg,
          e.description,
          konto,
          konten.ustKonto,
          amount,
          steuer,
          kostenstelle,
          e.client,
          hours,
          e.kind === "time" ? "Honorar" : "Auslage",
          beraterNr,
          mandantenNr,
        ]
          .map(csvCell)
          .join(";");
      }),
  ];
  return lines.join("\n");
}
