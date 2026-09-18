// Honorar nach dem Rechtsanwaltstarifgesetz (RATG) — Tarifposten 1 bis 9.
//
// Amounts come from src/lib/legal/ratg-tariff-data.ts, generated from the RIS
// text (scripts/ratg/generate-tariff.mjs) and checked against the tables of
// BGBl. II Nr. 131/2023 in ratg.test.ts. Everything is computed in cents.
//
// Covered: Entlohnung nach TP 1, 2, 3 A, 3 B, 3 C für Schriftsätze und
// Verhandlungen (erste Stunde voll, jede weitere begonnene Stunde zur Hälfte),
// Einheitssatz (§ 23 Abs. 3, einfach bis vierfach), ERV-Zuschlag (§ 23a),
// Streitgenossenzuschlag (§ 15); TP 4 (Privatanklage, Mediengesetz,
// Privatbeteiligte) with the Bemessungsgrundlage of § 10 Z 7–9; TP 5, 6, 8 as
// separately charged Nebenleistungen (§ 23 Abs 2 and 4); TP 7 (Geschäfte
// außerhalb der Kanzlei); TP 9 Wegentschädigung and Zeitversäumnis. Not
// covered: Zuschläge nach den Anmerkungen zu TP 3 (z. B. einstweilige
// Verfügung mit Klage), Wartezeiten und abberaumte Tagsatzungen, § 473a ZPO,
// Verbandsklagen. Barauslagen (Pauschalgebühr, Fahrkarten) come from the
// matter's expenses. The result is a proposal the lawyer checks; it is never
// filed or sent automatically.

import {
  RATG_TARIFF,
  RATG_TARIFF_SOURCE,
  RATG_TP4,
  RATG_TP5,
  RATG_TP6_CAP,
  RATG_TP7,
  RATG_TP8,
  RATG_TP9,
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
  key: "entlohnung" | "einheitssatz" | "streitgenossen" | "erv" | "information";
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

// ── Shared ───────────────────────────────────────────────────────────────

const SOURCE = () =>
  `${RATG_TARIFF_SOURCE.statute}, ${RATG_TARIFF_SOURCE.version}; Beträge ${RATG_TARIFF_SOURCE.valorisation}`;

function requirePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RatgInputError(`${what} muss größer als 0 sein.`);
  }
}

/** Number of begun units (half hours, hours), at least one. */
function begun(value: number | undefined, what: string): number {
  const v = value ?? 1;
  requirePositive(v, what);
  return Math.ceil(v - 1e-9);
}

function einheitssatzLine(
  feeCents: number,
  bemessungsgrundlage: number,
  factor: 0 | 1 | 2 | 3 | 4
): { line: RatgLine | null; cents: number } {
  if (factor === 0) return { line: null, cents: 0 };
  const rate = bemessungsgrundlage <= EINHEITSSATZ_THRESHOLD ? 0.6 : 0.5;
  const cents = Math.round(feeCents * rate) * factor;
  return {
    cents,
    line: {
      key: "einheitssatz",
      label: factor === 1 ? "Einheitssatz" : `${factor}-facher Einheitssatz`,
      amount: toEuro(cents),
      basis: `§ 23 RATG, ${rate * 100} %${factor > 1 ? ` × ${factor}` : ""} von ${eur(feeCents / 100)}`,
    },
  };
}

function result(lines: RatgLine[]): RatgResult {
  return {
    lines,
    net: toEuro(lines.reduce((sum, l) => sum + toCents(l.amount), 0)),
    source: SOURCE(),
  };
}

// ── TP 4: Privatanklage, Mediengesetz, Privatbeteiligte ─────────────────

export type RatgTp4Verfahren =
  | "privatanklage_bezirksgericht"
  | "privatanklage_sonstige"
  | "mediengesetz"
  | "privatbeteiligter_bezirksgericht"
  | "privatbeteiligter_sonstige";

export type RatgTp4Leistung =
  | "anklage"
  | "eingabe"
  | "eingabe_kurz"
  | "rechtsmittelanmeldung"
  | "beschwerde"
  | "berufungsausfuehrung"
  | "hauptverhandlung"
  | "verhandlung_zweite_instanz";

export const RATG_TP4_VERFAHREN: Record<
  RatgTp4Verfahren,
  { label: string; bemessungsgrundlage: number; norm: string }
> = {
  privatanklage_bezirksgericht: {
    label: "Privatanklage, Vergehen vor dem Bezirksgericht",
    bemessungsgrundlage: 6000,
    norm: "TP 4 I Z 1 lit a; § 10 Z 7 lit a",
  },
  privatanklage_sonstige: {
    label: "Privatanklage, sonstige Vergehen",
    bemessungsgrundlage: 11000,
    norm: "TP 4 I Z 1 lit b; § 10 Z 7 lit b",
  },
  mediengesetz: {
    label: "Anträge nach dem Mediengesetz",
    bemessungsgrundlage: 11000,
    norm: "TP 4 I Z 2; § 10 Z 8",
  },
  privatbeteiligter_bezirksgericht: {
    label: "Privatbeteiligte, Vergehen vor dem Bezirksgericht",
    bemessungsgrundlage: 3000,
    norm: "TP 4 II lit a; § 10 Z 9 lit a",
  },
  privatbeteiligter_sonstige: {
    label: "Privatbeteiligte, andere Vergehen und Verbrechen",
    bemessungsgrundlage: 6000,
    norm: "TP 4 II lit b; § 10 Z 9 lit b",
  },
};

export const RATG_TP4_LEISTUNG: Record<RatgTp4Leistung, { label: string; norm: string }> = {
  anklage: { label: "Anklage / selbständiger Antrag", norm: "Z 1, Z 2" },
  eingabe: { label: "Beweisantrag oder andere Eingabe", norm: "Z 3" },
  eingabe_kurz: { label: "Kurze und einfache Eingabe", norm: "Z 3, Hälfte" },
  rechtsmittelanmeldung: { label: "Schriftliche Rechtsmittelanmeldung", norm: "Z 4 lit a" },
  beschwerde: {
    label: "Beschwerde, Einspruch, Wiedereinsetzungs- oder Wiederaufnahmeantrag",
    norm: "Z 4 lit b",
  },
  berufungsausfuehrung: {
    label: "Berufungsausführung, Nichtigkeitsbeschwerde oder Gegenausführung",
    norm: "Z 4 lit c",
  },
  hauptverhandlung: { label: "Hauptverhandlung oder Beweisaufnahme", norm: "Z 5" },
  verhandlung_zweite_instanz: { label: "Verhandlung zweiter Instanz", norm: "Z 6" },
};

export interface RatgTp4Input {
  verfahren: RatgTp4Verfahren;
  leistung: RatgTp4Leistung;
  /** Dauer bei Verhandlungen in Stunden; jede begonnene halbe Stunde zählt. */
  hours?: number;
  einheitssatzFactor?: 0 | 1 | 2 | 3 | 4;
  erv?: "einleitend" | "weiterer" | null;
  label?: string;
}

export function calculateRatgTp4(input: RatgTp4Input): RatgResult {
  const verfahren = RATG_TP4_VERFAHREN[input.verfahren];
  const leistung = RATG_TP4_LEISTUNG[input.leistung];
  if (!verfahren || !leistung) throw new RatgInputError("Unbekannte Leistung nach TP 4.");
  const privatbeteiligter = input.verfahren.startsWith("privatbeteiligter");
  if (privatbeteiligter && input.leistung === "anklage") {
    throw new RatgInputError("Privatbeteiligte bringen keine Anklage ein (TP 4 II).");
  }
  // Grundbetrag „für Anklagen“; Privatbeteiligte erhalten die Hälfte (TP 4 II).
  const anklage =
    input.verfahren === "privatanklage_bezirksgericht" ||
    input.verfahren === "privatbeteiligter_bezirksgericht"
      ? RATG_TP4.anklageBezirksgericht
      : RATG_TP4.anklageSonstige;
  const a = toCents(anklage) * (privatbeteiligter ? 0.5 : 1);

  let feeCents: number;
  let detail: string;
  switch (input.leistung) {
    case "anklage":
    case "eingabe":
    case "beschwerde":
      feeCents = a;
      detail = eur(a / 100);
      break;
    case "eingabe_kurz":
      feeCents = a / 2;
      detail = `½ von ${eur(a / 100)}`;
      break;
    case "rechtsmittelanmeldung":
      feeCents = a / 10;
      detail = `1/10 von ${eur(a / 100)}`;
      break;
    case "berufungsausfuehrung":
      feeCents = a * 1.5;
      detail = `1,5 × ${eur(a / 100)}`;
      break;
    case "hauptverhandlung":
    case "verhandlung_zweite_instanz": {
      const halves = begun((input.hours ?? 0.5) * 2, "Die Dauer");
      const first = input.leistung === "hauptverhandlung" ? a : a * 1.5;
      feeCents = first + (halves - 1) * (a / 2);
      detail =
        halves === 1
          ? `erste halbe Stunde ${eur(first / 100)}`
          : `erste halbe Stunde ${eur(first / 100)} + ${halves - 1} × ${eur(a / 200)}`;
      break;
    }
  }
  feeCents = Math.round(feeCents);

  const lines: RatgLine[] = [
    {
      key: "entlohnung",
      label: `${input.label?.trim() || leistung.label} (TP 4)`,
      amount: toEuro(feeCents),
      basis: `TP 4 ${leistung.norm}, ${verfahren.label}${privatbeteiligter ? ", Hälfte (TP 4 II)" : ""}: ${detail}`,
    },
  ];
  const es = einheitssatzLine(
    feeCents,
    verfahren.bemessungsgrundlage,
    input.einheitssatzFactor ?? 1
  );
  if (es.line) lines.push(es.line);
  if (input.erv) {
    lines.push({
      key: "erv",
      label:
        input.erv === "einleitend" ? "ERV-Zuschlag (einleitender Schriftsatz)" : "ERV-Zuschlag",
      amount: ERV_SURCHARGE[input.erv],
      basis: "§ 23a RATG idF BGBl. II Nr. 131/2023",
    });
  }
  return result(lines);
}

// ── TP 5, 6, 8: Nebenleistungen, einzeln verrechnet ────────────────────

/** TP 5: einfaches Schreiben. */
export function ratgTp5Fee(bemessungsgrundlage: number): number {
  requirePositive(bemessungsgrundlage, "Die Bemessungsgrundlage");
  const band = RATG_TP5.bands.find((b) => bemessungsgrundlage <= b.upTo);
  if (band) return band.amount;
  const last = RATG_TP5.bands[RATG_TP5.bands.length - 1].amount;
  const steps = Math.ceil((bemessungsgrundlage - RATG_TP5.stepFrom) / RATG_TP5.stepEvery);
  return toEuro(
    Math.min(toCents(last) + steps * toCents(RATG_TP5.stepAmount), toCents(RATG_TP5.cap))
  );
}

/** TP 6: Brief anderer Art — das Doppelte der TP 5, höchstens RATG_TP6_CAP. */
export function ratgTp6Fee(bemessungsgrundlage: number): number {
  return toEuro(Math.min(toCents(ratgTp5Fee(bemessungsgrundlage)) * 2, toCents(RATG_TP6_CAP)));
}

/** TP 8 Abs 1: Besprechung, je begonnene halbe Stunde. */
export function ratgTp8Fee(bemessungsgrundlage: number): number {
  requirePositive(bemessungsgrundlage, "Die Bemessungsgrundlage");
  const t = RATG_TP8;
  const band = t.bands.find((b) => bemessungsgrundlage <= b.upTo);
  if (band) return band.amount;
  let cents = toCents(t.bands[t.bands.length - 1].amount);
  cents +=
    Math.ceil((Math.min(bemessungsgrundlage, t.stepTo) - t.stepFrom) / t.stepEvery) *
    toCents(t.stepAmount);
  if (bemessungsgrundlage > t.stepTo) cents += toCents(t.stepAmount);
  if (bemessungsgrundlage > t.extraStepTo) {
    cents +=
      Math.ceil((bemessungsgrundlage - t.extraStepTo) / t.step2Every) * toCents(t.step2Amount);
  }
  return toEuro(Math.min(cents, toCents(t.cap)));
}

export type RatgNebenleistung = "schreiben" | "brief" | "besprechung" | "besprechung_kurz";

export interface RatgNebenleistungInput {
  art: RatgNebenleistung;
  bemessungsgrundlage: number;
  /** Anzahl der Schreiben bzw. Briefe. */
  anzahl?: number;
  /** Besprechung: Dauer in Stunden; jede begonnene halbe Stunde zählt. */
  hours?: number;
  /** TP 5/6 Anmerkung: Information aus den Akten oder mit der Partei (+ Hälfte). */
  information?: boolean;
  label?: string;
}

/**
 * TP 5, 6 und 8 deckt der Einheitssatz ab (§ 23 Abs 1). Einzeln verrechnet
 * werden sie gegenüber der eigenen Partei statt des Einheitssatzes (Abs 2),
 * bei aufwendigen außergerichtlichen Vergleichsgesprächen (Abs 4) oder wenn
 * es kein Gerichtsverfahren gibt.
 */
export function calculateRatgNebenleistung(input: RatgNebenleistungInput): RatgResult {
  const bg = input.bemessungsgrundlage;
  const bgText = `BG ${eur(bg)}`;
  const lines: RatgLine[] = [];
  const count = input.anzahl ?? 1;
  if (input.art === "schreiben" || input.art === "brief") {
    requirePositive(count, "Die Anzahl");
    const one = input.art === "schreiben" ? ratgTp5Fee(bg) : ratgTp6Fee(bg);
    const tp = input.art === "schreiben" ? "TP 5" : "TP 6";
    const cents = toCents(one) * Math.ceil(count);
    lines.push({
      key: "entlohnung",
      label: `${input.label?.trim() || (input.art === "schreiben" ? "Einfaches Schreiben" : "Brief")} (${tp})`,
      amount: toEuro(cents),
      basis: `${tp} RATG, ${Math.ceil(count)} × ${eur(one)}, ${bgText}`,
    });
    if (input.information) {
      lines.push({
        key: "information",
        label: "Information aus den Akten oder mit der Partei",
        amount: toEuro(Math.round(cents / 2)),
        basis: `Anmerkung zu TP 5 und 6 RATG, Hälfte von ${eur(cents / 100)}`,
      });
    }
  } else if (input.art === "besprechung") {
    const halves = begun((input.hours ?? 0.5) * 2, "Die Dauer");
    const one = ratgTp8Fee(bg);
    lines.push({
      key: "entlohnung",
      label: `${input.label?.trim() || "Besprechung"} (TP 8)`,
      amount: toEuro(toCents(one) * halves),
      basis: `TP 8 Abs 1 RATG, ${halves} begonnene halbe Stunde${halves > 1 ? "n" : ""} × ${eur(one)}, ${bgText}`,
    });
  } else {
    const full = ratgTp8Fee(bg);
    const amount = toEuro(
      Math.min(Math.round(toCents(full) * RATG_TP8.shortFactor), toCents(RATG_TP8.shortCap))
    );
    lines.push({
      key: "entlohnung",
      label: `${input.label?.trim() || "Kurze Besprechung unter 10 Minuten"} (TP 8)`,
      amount,
      basis: `TP 8 Abs 2 RATG, 4/10 von ${eur(full)}, ${bgText}`,
    });
  }
  return result(lines);
}

// ── TP 7: Geschäfte außerhalb der Kanzlei ──────────────────────────────

export interface RatgTp7Input {
  bemessungsgrundlage: number;
  hours: number;
  /** Kanzleikraft: TP 6 je halbe Stunde; Rechtsanwalt/Anwärter, wenn erforderlich: das Doppelte. */
  durch: "kanzleikraft" | "anwalt";
  einheitssatzFactor?: 0 | 1 | 2 | 3 | 4;
  label?: string;
}

export function calculateRatgTp7(input: RatgTp7Input): RatgResult {
  const halves = begun(input.hours * 2, "Die Dauer");
  const tp6 = ratgTp6Fee(input.bemessungsgrundlage);
  const perHalf =
    input.durch === "anwalt"
      ? Math.min(toCents(tp6) * 2, toCents(RATG_TP7.capAnwalt))
      : Math.min(toCents(tp6), toCents(RATG_TP7.capGehilfe));
  const feeCents = perHalf * halves;
  const lines: RatgLine[] = [
    {
      key: "entlohnung",
      label: `${input.label?.trim() || "Geschäft außerhalb der Kanzlei"} (TP 7)`,
      amount: toEuro(feeCents),
      basis: `TP 7 Abs 1 RATG, ${input.durch === "anwalt" ? "durch Rechtsanwalt" : "durch Kanzleikraft"}, ${halves} × ${eur(perHalf / 100)}, BG ${eur(input.bemessungsgrundlage)}`,
    },
  ];
  const es = einheitssatzLine(feeCents, input.bemessungsgrundlage, input.einheitssatzFactor ?? 1);
  if (es.line) lines.push(es.line);
  return result(lines);
}

// ── TP 9: Reise ─────────────────────────────────────────────────────────

export interface RatgTp9Input {
  /** Z 4: Stunden auf dem Weg oder am Ort außerhalb des Geschäfts selbst. */
  zeitversaeumnisHours?: number;
  /** Z 1 lit c: Wegentschädigung, wenn weder Massenverkehrsmittel noch Wagen. */
  wegentschaedigungHours?: number;
  label?: string;
}

/**
 * Reisekosten und Zeitversäumnis gehören nicht in die Verdienstsumme des
 * Einheitssatzes (§ 23 Abs 3). Fahrkarten, Kilometergeld, Verpflegung und
 * Übernachtung (Z 1 lit a/b, Z 2, 3) sind Barauslagen der Akte.
 */
export function calculateRatgTp9(input: RatgTp9Input): RatgResult {
  const lines: RatgLine[] = [];
  if (input.zeitversaeumnisHours) {
    const h = begun(input.zeitversaeumnisHours, "Die Zeitversäumnis");
    lines.push({
      key: "entlohnung",
      label: `${input.label?.trim() || "Entschädigung für Zeitversäumnis"} (TP 9)`,
      amount: toEuro(toCents(RATG_TP9.zeitversaeumnisStunde) * h),
      basis: `TP 9 Z 4 RATG, ${h} begonnene Stunde${h > 1 ? "n" : ""} × ${eur(RATG_TP9.zeitversaeumnisStunde)}`,
    });
  }
  if (input.wegentschaedigungHours) {
    const h = begun(input.wegentschaedigungHours, "Die Wegzeit");
    lines.push({
      key: "entlohnung",
      label: "Wegentschädigung (TP 9)",
      amount: toEuro(toCents(RATG_TP9.wegentschaedigungStunde) * h),
      basis: `TP 9 Z 1 lit c RATG, ${h} begonnene Stunde${h > 1 ? "n" : ""} × ${eur(RATG_TP9.wegentschaedigungStunde)}`,
    });
  }
  if (lines.length === 0) throw new RatgInputError("Bitte Zeitversäumnis oder Wegzeit angeben.");
  return result(lines);
}
