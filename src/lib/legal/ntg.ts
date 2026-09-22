import {
  NTG_BASIS_CAP_EURO,
  NTG_FLAT_BANDS,
  NTG_PROGRESSIVE_BANDS,
  NTG_SOURCE,
  NTG_ZEITGEBUEHR_HALBE_STUNDE_EURO,
} from "./ntg-tariff-data";

export class NtgInputError extends Error {}

export type NtgTarifart =
  | "zweiseitig_voll" // § 18 Abs 1 — freiwillige zweiseitige Rechtsgeschäfte
  | "zweiseitig_halb" // § 18 Abs 2 — gesetzlich vorgeschriebene Form
  | "darlehen" // § 19 — Darlehen, Belehnung
  | "einseitig"; // § 20 — einseitige Erklärungen, Vollmachten iSd § 22

export const NTG_TARIFART_LABEL: Record<NtgTarifart, string> = {
  zweiseitig_voll: "Volle Gebühr (§ 18 Abs 1)",
  zweiseitig_halb: "Halbe Gebühr (§ 18 Abs 2 — Formzwang)",
  darlehen: "Halbe Gebühr (§ 19 — Darlehen/Belehnung)",
  einseitig: "Halbe Gebühr (§ 20 — einseitige Erklärung)",
};

const NTG_FACTOR: Record<NtgTarifart, number> = {
  zweiseitig_voll: 1,
  zweiseitig_halb: 0.5,
  darlehen: 0.5,
  einseitig: 0.5,
};

export interface NtgResult {
  tarifart: NtgTarifart;
  /** Bemessungsgrundlage in EUR (gecappt auf 3.633.640 € gem. Anl. 1 Z 1). */
  grundlage: number;
  /** Gebühr vor gesetzlicher Halbierung, in Cent. */
  vollCents: number;
  /** Gebühr nach Halbierung, in Cent. */
  totalCents: number;
  basis: string;
  source: typeof NTG_SOURCE;
}

/**
 * Wertgebühr nach Anl. 1 Z 1 NTG: Flatfee-Bänder bis 150 €, danach
 * progressive „je angefangene weitere X €" Scheibenstaffel.
 * `grundlage` in EUR; wird auf NTG_BASIS_CAP_EURO gedeckelt.
 */
export function calculateNtg(opts: { tarifart: NtgTarifart; grundlage: number }): NtgResult {
  const { tarifart } = opts;
  let { grundlage } = opts;

  if (!Number.isFinite(grundlage) || grundlage <= 0) {
    throw new NtgInputError("Bemessungsgrundlage muss eine positive Zahl sein.");
  }
  const capped = grundlage > NTG_BASIS_CAP_EURO;
  if (capped) grundlage = NTG_BASIS_CAP_EURO;

  let cents: number;
  const flat = NTG_FLAT_BANDS.find((b) => grundlage <= b.upTo);
  if (flat) {
    cents = Math.round(flat.amount * 100);
  } else {
    // Basiswert am Ende des Flatfee-Teils (150 € → 18,20 €).
    cents = Math.round(NTG_FLAT_BANDS[NTG_FLAT_BANDS.length - 1].amount * 100);
    for (const band of NTG_PROGRESSIVE_BANDS) {
      if (grundlage <= band.from) break;
      const upper = band.to === null ? grundlage : Math.min(grundlage, band.to);
      const slices = Math.ceil((upper - band.from) / band.slice);
      cents += slices * Math.round(band.perSlice * 100);
      if (band.to === null || grundlage <= band.to) break;
    }
  }

  const vollCents = cents;
  const factor = NTG_FACTOR[tarifart];
  if (factor !== 1) cents = Math.round(cents * factor);

  return {
    tarifart,
    grundlage,
    vollCents,
    totalCents: cents,
    basis: `${NTG_TARIFART_LABEL[tarifart]} · Bemessungsgrundlage ${grundlage.toLocaleString(
      "de-AT"
    )} €${capped ? " (Anl.-1-Deckel)" : ""}`,
    source: NTG_SOURCE,
  };
}

/**
 * Zeitgebühr § 26 iVm § 6 NTG: je angefangene halbe Stunde.
 * `minutes` = auf die Tätigkeit verwendete Zeit in Minuten.
 */
export function calculateNtgZeitgebuehr(minutes: number): NtgResult {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new NtgInputError("Zeit muss eine positive Zahl (Minuten) sein.");
  }
  const units = Math.ceil(minutes / 30);
  const cents = units * Math.round(NTG_ZEITGEBUEHR_HALBE_STUNDE_EURO * 100);
  return {
    tarifart: "zweiseitig_voll",
    grundlage: minutes,
    vollCents: cents,
    totalCents: cents,
    basis: `§ 26 Zeitgebühr · ${units} angefangene halbe Stunde(n) à ${NTG_ZEITGEBUEHR_HALBE_STUNDE_EURO.toLocaleString(
      "de-AT",
      { minimumFractionDigits: 2 }
    )} €`,
    source: NTG_SOURCE,
  };
}
