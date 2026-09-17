// Honorar nach dem Rechtsanwaltstarifgesetz (RATG) — Tarifposten 1, 2 und 3.
//
// Amounts come from src/lib/legal/ratg-tariff-data.ts, generated from the RIS
// text (scripts/ratg/generate-tariff.mjs) and checked against the tables of
// BGBl. II Nr. 131/2023 in ratg.test.ts. Everything is computed in cents.
//
// Covered: Entlohnung nach TP 1, 2, 3 A, 3 B, 3 C für Schriftsätze und
// Verhandlungen (erste Stunde voll, jede weitere begonnene Stunde zur Hälfte),
// Einheitssatz (§ 23 Abs. 3, einfach bis vierfach), ERV-Zuschlag (§ 23a),
// Streitgenossenzuschlag (§ 15). Not covered: TP 4 ff., Zuschläge nach den
// Anmerkungen zu TP 3 (z. B. einstweilige Verfügung mit Klage), § 473a ZPO,
// Verbandsklagen, Reisekosten, Barauslagen. The result is a proposal the
// lawyer checks; it is never filed or sent automatically.

import {
  RATG_TARIFF,
  RATG_TARIFF_SOURCE,
  type RatgTariffBlock,
} from "@/lib/legal/ratg-tariff-data";

export type RatgTariffItem = keyof typeof RATG_TARIFF;
export type RatgServiceKind = "schriftsatz" | "verhandlung";

export const RATG_ITEM_LABEL: Record<RatgTariffItem, string> = {
  TP1: "TP 1",
  TP2: "TP 2",
  TP3A: "TP 3A",
  TP3B: "TP 3B",
  TP3C: "TP 3C",
};

/** § 23 Abs. 3: 60 % bis einschließlich 10 170 Euro, darüber 50 %. */
export const EINHEITSSATZ_THRESHOLD = 10_170;

/** § 23a idF BGBl. II Nr. 131/2023. */
export const ERV_SURCHARGE = { einleitend: 5.0, weiterer: 2.6 } as const;

export class RatgInputError extends Error {}

const toCents = (euro: number) => Math.round(euro * 100);
const toEuro = (cents: number) => Math.round(cents) / 100;

function block(item: RatgTariffItem): RatgTariffBlock {
  const b = RATG_TARIFF[item];
  if (!b) throw new RatgInputError(`Unbekannte Tarifpost: ${item}`);
  return b;
}

/** Entlohnung für einen Schriftsatz bzw. die erste Verhandlungsstunde. */
export function ratgBaseFee(item: RatgTariffItem, bemessungsgrundlage: number): number {
  if (!Number.isFinite(bemessungsgrundlage) || bemessungsgrundlage <= 0) {
    throw new RatgInputError("Die Bemessungsgrundlage muss größer als 0 sein.");
  }
  const t = block(item);
  const bg = bemessungsgrundlage;
  const band = t.bands.find((b) => bg <= b.upTo);
  if (band) return band.amount;

  let cents = toCents(t.bands[t.bands.length - 1].amount);
  // für je angefangene weitere 1 450 Euro bis 34 820 Euro …
  const steps = Math.ceil((Math.min(bg, t.stepTo) - t.stepFrom) / t.stepEvery);
  cents += steps * toCents(t.stepAmount);
  // … und über 34 820 Euro bis 36 340 Euro noch einmal.
  if (bg > t.stepTo) cents += toCents(t.stepAmount);
  const [first, second] = t.permille;
  if (bg > first.over) cents += (Math.min(bg, second.over) - first.over) * first.rate * 100;
  if (bg > second.over) cents += (bg - second.over) * second.rate * 100;
  return toEuro(Math.min(Math.round(cents), toCents(t.cap)));
}

export interface RatgServiceInput {
  item: RatgTariffItem;
  kind: RatgServiceKind;
  bemessungsgrundlage: number;
  /** Dauer der Verhandlung in Stunden; jede begonnene Stunde zählt. */
  hours?: number;
  /** 0 = Nebenleistungen einzeln verrechnet (§ 23 Abs. 2); 1–4 = einfacher bis vierfacher Einheitssatz. */
  einheitssatzFactor?: 0 | 1 | 2 | 3 | 4;
  /** § 23a: im ERV eingebracht, als verfahrenseinleitender oder weiterer Schriftsatz. */
  erv?: "einleitend" | "weiterer" | null;
  /** § 15: Anzahl der vertretenen und der gegenüberstehenden Personen. */
  personen?: { vertreten: number; gegenueber: number };
  /** Bezeichnung der Leistung, z. B. "Klage" oder "Tagsatzung vom 12.10.2026". */
  label?: string;
}

export interface RatgLine {
  key: "entlohnung" | "einheitssatz" | "streitgenossen" | "erv";
  label: string;
  amount: number;
  basis: string;
}

export interface RatgResult {
  lines: RatgLine[];
  /** Summe ohne Umsatzsteuer. */
  net: number;
  source: string;
}

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** § 15 Abs. 1: zwei auf einer Seite 10 %, jede weitere Person 5 %, höchstens 50 %. */
export function streitgenossenPercent(vertreten: number, gegenueber: number): number {
  const extra = Math.max(0, vertreten - 1) + Math.max(0, gegenueber - 1);
  if (extra === 0) return 0;
  return Math.min(50, 10 + 5 * (extra - 1));
}

export function calculateRatgService(input: RatgServiceInput): RatgResult {
  const t = block(input.item);
  const base = ratgBaseFee(input.item, input.bemessungsgrundlage);
  const itemLabel = RATG_ITEM_LABEL[input.item];
  const what =
    input.label?.trim() || (input.kind === "schriftsatz" ? "Schriftsatz" : "Verhandlung");
  const bgText = `BG ${eur(input.bemessungsgrundlage)}`;
  const lines: RatgLine[] = [];

  let feeCents: number;
  let feeBasis: string;
  if (input.kind === "verhandlung") {
    if (input.item === "TP1" || t.hourCap === null) {
      throw new RatgInputError("Nach TP 1 werden keine Verhandlungen entlohnt.");
    }
    const hours = Math.max(1, Math.ceil(input.hours ?? 1));
    const further = Math.min(toCents(base / 2), toCents(t.hourCap));
    feeCents = toCents(base) + (hours - 1) * further;
    feeBasis =
      hours === 1
        ? `${itemLabel}, 1 Stunde, ${bgText}`
        : `${itemLabel}, erste Stunde ${eur(base)} + ${hours - 1} × ${eur(further / 100)}, ${bgText}`;
  } else {
    feeCents = toCents(base);
    feeBasis = `${itemLabel}, ${bgText}`;
  }
  lines.push({
    key: "entlohnung",
    label: `${what} (${itemLabel})`,
    amount: toEuro(feeCents),
    basis: feeBasis,
  });

  const factor = input.einheitssatzFactor ?? 1;
  let esCents = 0;
  if (factor > 0) {
    const rate = input.bemessungsgrundlage <= EINHEITSSATZ_THRESHOLD ? 0.6 : 0.5;
    esCents = Math.round(feeCents * rate) * factor;
    lines.push({
      key: "einheitssatz",
      label: factor === 1 ? "Einheitssatz" : `${factor}-facher Einheitssatz`,
      amount: toEuro(esCents),
      basis: `§ 23 RATG, ${rate * 100} %${factor > 1 ? ` × ${factor}` : ""} von ${eur(feeCents / 100)}`,
    });
  }

  if (input.personen) {
    const pct = streitgenossenPercent(input.personen.vertreten, input.personen.gegenueber);
    if (pct > 0) {
      const sgCents = Math.round(((feeCents + esCents) * pct) / 100);
      lines.push({
        key: "streitgenossen",
        label: `Streitgenossenzuschlag ${pct} %`,
        amount: toEuro(sgCents),
        basis: `§ 15 RATG, ${pct} % von ${eur((feeCents + esCents) / 100)}`,
      });
    }
  }

  if (input.erv) {
    const amount = ERV_SURCHARGE[input.erv];
    lines.push({
      key: "erv",
      label:
        input.erv === "einleitend" ? "ERV-Zuschlag (einleitender Schriftsatz)" : "ERV-Zuschlag",
      amount,
      basis: "§ 23a RATG idF BGBl. II Nr. 131/2023",
    });
  }

  const net = toEuro(lines.reduce((sum, l) => sum + toCents(l.amount), 0));
  return {
    lines,
    net,
    source: `${RATG_TARIFF_SOURCE.statute}, ${RATG_TARIFF_SOURCE.version}; Beträge ${RATG_TARIFF_SOURCE.valorisation}`,
  };
}
