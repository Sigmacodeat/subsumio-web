/**
 * RVG-Gebührenberechnung nach § 13 RVG i.d.F. KostBRÄG 2025 (gültig ab 01.06.2025).
 * Verwendet die Stufenformel statt einer hartkodierten Tabelle.
 */

// §13 RVG Stufenformel (KostBRÄG 2025): Grundgebühr 51,50 € bis 500 €,
// danach feste Schritte je angefangenem Stufenbetrag.
const RVG_STUFEN: Array<{ bis: number; schritt: number; je: number }> = [
  { bis: 2_000, schritt: 41.5, je: 500 },
  { bis: 10_000, schritt: 59.5, je: 1_000 },
  { bis: 25_000, schritt: 55, je: 3_000 },
  { bis: 50_000, schritt: 86, je: 5_000 },
  { bis: 200_000, schritt: 99.5, je: 15_000 },
  { bis: 500_000, schritt: 140, je: 30_000 },
  { bis: Infinity, schritt: 175, je: 50_000 },
];

function rvgGebuehr(streitwert: number): number {
  if (!Number.isFinite(streitwert) || streitwert <= 0) return 0;
  let gebuehr = 51.5;
  let grenze = 500;
  for (const stufe of RVG_STUFEN) {
    while (grenze < streitwert && grenze < stufe.bis) {
      gebuehr += stufe.schritt;
      grenze += stufe.je;
    }
    if (grenze >= streitwert) break;
  }
  return gebuehr;
}

export interface RvgResult {
  streitwert: number;
  basisGebuehr: number;
  verfahrensgebuehr: number; // 1.3 (VV 3100)
  terminsgebuehr: number; // 1.2 (VV 3104)
  einigungsgebuehr: number; // 1.0 (VV 1003)
  auslagenpauschale: number; // VV 7002: 20 €
  summeNetto: number;
  mwst: number;
  summeBrutto: number;
}

export function calculateRvg(streitwert: number): RvgResult {
  const safeStreitwert = Number.isFinite(streitwert) && streitwert > 0 ? streitwert : 0;
  const basis = rvgGebuehr(safeStreitwert);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const verfahrensgebuehr = round2(basis * 1.3);
  const terminsgebuehr = round2(basis * 1.2);
  const einigungsgebuehr = round2(basis * 1.0);
  const auslagenpauschale = 20;
  const summeNetto = round2(verfahrensgebuehr + terminsgebuehr + einigungsgebuehr + auslagenpauschale);
  const mwst = round2(summeNetto * 0.19);
  const summeBrutto = round2(summeNetto + mwst);

  return {
    streitwert: safeStreitwert,
    basisGebuehr: basis,
    verfahrensgebuehr,
    terminsgebuehr,
    einigungsgebuehr,
    auslagenpauschale,
    summeNetto,
    mwst,
    summeBrutto,
  };
}
