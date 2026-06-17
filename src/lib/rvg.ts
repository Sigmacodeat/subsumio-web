/**
 * RVG-Gebührenberechnung nach § 13 RVG (Rechtsanwaltsvergütungsgesetz).
 * Vereinfachte Tabelle mit linearen Interpolationen.
 */

// §13 RVG Gebühren nach Streitwert (1.0 Gebühr in €)
const RVG_TABLE: Array<{ value: number; fee: number }> = [
  { value: 500, fee: 49 },
  { value: 1000, fee: 82 },
  { value: 1500, fee: 106 },
  { value: 2000, fee: 115 },
  { value: 3000, fee: 147 },
  { value: 4000, fee: 172 },
  { value: 5000, fee: 188 },
  { value: 6000, fee: 215 },
  { value: 7000, fee: 239 },
  { value: 8000, fee: 261 },
  { value: 9000, fee: 275 },
  { value: 10000, fee: 289 },
  { value: 13000, fee: 340 },
  { value: 15000, fee: 374 },
  { value: 20000, fee: 449 },
  { value: 25000, fee: 517 },
  { value: 30000, fee: 579 },
  { value: 35000, fee: 636 },
  { value: 40000, fee: 689 },
  { value: 45000, fee: 739 },
  { value: 50000, fee: 785 },
  { value: 65000, fee: 946 },
  { value: 80000, fee: 1088 },
  { value: 100000, fee: 1273 },
  { value: 150000, fee: 1605 },
  { value: 200000, fee: 1896 },
  { value: 250000, fee: 2158 },
  { value: 300000, fee: 2397 },
  { value: 400000, fee: 2832 },
  { value: 500000, fee: 3225 },
];

function interpolate(streitwert: number): number {
  if (streitwert <= 0) return 0;
  if (streitwert >= RVG_TABLE[RVG_TABLE.length - 1].value) {
    return RVG_TABLE[RVG_TABLE.length - 1].fee;
  }
  for (let i = 0; i < RVG_TABLE.length - 1; i++) {
    const low = RVG_TABLE[i];
    const high = RVG_TABLE[i + 1];
    if (streitwert >= low.value && streitwert <= high.value) {
      const ratio = (streitwert - low.value) / (high.value - low.value);
      return Math.round(low.fee + ratio * (high.fee - low.fee));
    }
  }
  return RVG_TABLE[0].fee;
}

export interface RvgResult {
  streitwert: number;
  basisGebuehr: number;
  verfahrensgebuehr: number; // 1.3
  terminsgebuehr: number; // 1.2
  einigungsgebuehr: number; // 1.5
  auslagenpauschale: number; // § 4 Abs. 1: 20 €
  summeNetto: number;
  mwst: number;
  summeBrutto: number;
}

export function calculateRvg(streitwert: number): RvgResult {
  const basis = interpolate(streitwert);
  const verfahrensgebuehr = Math.round(basis * 1.3);
  const terminsgebuehr = Math.round(basis * 1.2);
  const einigungsgebuehr = Math.round(basis * 1.5);
  const auslagenpauschale = 20;
  const summeNetto = verfahrensgebuehr + auslagenpauschale;
  const mwst = Math.round(summeNetto * 0.19 * 100) / 100;
  const summeBrutto = Math.round((summeNetto + mwst) * 100) / 100;

  return {
    streitwert,
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
