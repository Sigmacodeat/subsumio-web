import {
  GGG_SOURCE,
  GGG_TP1_BANDS,
  GGG_TP1_KFZ_RECHTSSCHUTZ_EURO,
  GGG_TP1_OVER_BAND,
  GGG_TP2_BANDS,
  GGG_TP2_OVER_BAND,
} from "./ggg-tariff-data";

export class GggInputError extends Error {}

export type GggTarifpost = "TP1" | "TP2";

export type GggErmaessigung =
  | "keine"
  | "haelfte" // TP 1 Anm. 2 (prätorischer Vergleich, EJ außerhalb Zivilprozess) bzw. TP 2 Anm. 1a
  | "viertel" // TP 1 Anm. 3: Klage vor Zustellung zurückgezogen/zurückgewiesen
  | "halbe_rueckzug"; // TP 1 Anm. 4: Rückzug nach Zustellung bis Ende 1. Tagsatzung

export const GGG_ERMAESSIGUNG_LABEL: Record<GggErmaessigung, string> = {
  keine: "Volle Pauschalgebühr",
  haelfte: "Halbe Gebühr (TP 1 Anm. 2 / TP 2 Anm. 1a)",
  viertel: "Viertel (TP 1 Anm. 3 — Klage vor Zustellung zurückgezogen)",
  halbe_rueckzug: "Halbe Gebühr (TP 1 Anm. 4 — Rückzug bis 1. Tagsatzung)",
};

export interface GggResult {
  tarifpost: GggTarifpost;
  /** Bemessungsgrundlage: Streitwert (TP 1) bzw. Berufungsinteresse (TP 2), in EUR. */
  wert: number;
  /** Gebühr vor Ermäßigung, in Cent. */
  basisCents: number;
  /** Gebühr nach Ermäßigung, in Cent. */
  totalCents: number;
  ermaessigung: GggErmaessigung;
  basis: string;
  source: typeof GGG_SOURCE;
}

function bandFeeCents(
  bands: ReadonlyArray<{ upTo: number; amount: number }>,
  overBand: { percent: number; plus: number },
  wert: number
): { cents: number; bandLabel: string } {
  for (const band of bands) {
    if (wert <= band.upTo) {
      return {
        cents: Math.round(band.amount * 100),
        bandLabel: `bis ${band.upTo.toLocaleString("de-AT")} €`,
      };
    }
  }
  const cents = Math.round(wert * overBand.percent) + Math.round(overBand.plus * 100);
  return {
    cents,
    bandLabel: `über 350.000 €: ${overBand.percent} % + ${overBand.plus.toLocaleString("de-AT")} €`,
  };
}

/**
 * GGG Pauschalgebühr (TP 1 / TP 2). `wert` in EUR.
 * Wird nie ohne anwaltliche Prüfung in Rechnung gestellt — Ergebnis ist eine
 * Schätzung; die Justiz legt die Gebühr im Einzelfall fest.
 */
export function calculateGgg(opts: {
  tarifpost: GggTarifpost;
  wert: number;
  ermaessigung?: GggErmaessigung;
  kfzRechtsschutz?: boolean;
}): GggResult {
  const { tarifpost, wert } = opts;
  const ermaessigung = opts.ermaessigung ?? "keine";

  if (!Number.isFinite(wert) || wert <= 0) {
    throw new GggInputError("Streitwert muss eine positive Zahl sein.");
  }
  if (ermaessigung === "viertel" && tarifpost !== "TP1") {
    throw new GggInputError("Viertel-Ermäßigung (Anm. 3) gibt es nur in TP 1.");
  }
  if (ermaessigung === "halbe_rueckzug" && tarifpost !== "TP1") {
    throw new GggInputError("Anm. 4-Ermäßigung gibt es nur in TP 1.");
  }

  let cents: number;
  let bandLabel: string;
  if (tarifpost === "TP1" && opts.kfzRechtsschutz) {
    cents = Math.round(GGG_TP1_KFZ_RECHTSSCHUTZ_EURO * 100);
    bandLabel = "Kfz-Rechtsschutzziel (§ 615 ZPO) — Fixgebühr 70 €";
  } else {
    const r =
      tarifpost === "TP1"
        ? bandFeeCents(GGG_TP1_BANDS, GGG_TP1_OVER_BAND, wert)
        : bandFeeCents(GGG_TP2_BANDS, GGG_TP2_OVER_BAND, wert);
    cents = r.cents;
    bandLabel = r.bandLabel;
  }

  const basisCents = cents;
  if (ermaessigung === "haelfte" || ermaessigung === "halbe_rueckzug") {
    cents = Math.round(cents / 2);
  } else if (ermaessigung === "viertel") {
    cents = Math.round(cents / 4);
  }

  return {
    tarifpost,
    wert,
    basisCents,
    totalCents: cents,
    ermaessigung,
    basis: `${tarifpost} GGG · Bemessungsgrundlage ${wert.toLocaleString("de-AT")} € (${bandLabel})${
      ermaessigung !== "keine" ? ` · ${GGG_ERMAESSIGUNG_LABEL[ermaessigung]}` : ""
    }`,
    source: GGG_SOURCE,
  };
}
