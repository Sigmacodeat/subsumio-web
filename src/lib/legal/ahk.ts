// Honorar nach den Allgemeinen Honorar-Kriterien (AHK) — 2. Teil
// (Zivil-/Verwaltungssachen ohne natürlichen RATG-Streitwert) und 3. Teil
// (Straf- und Disziplinarsachen).
//
// Beträge kommen aus src/lib/legal/ahk-tariff-data.ts, selbst gegen den
// amtlichen ÖRAK-Text gelesen (nicht nur eine Recherche-Zusammenfassung
// übernommen). Alles wird in Cent gerechnet, wie im RATG-Modul.
//
// Abgedeckt: § 5 Bemessungsgrundlagen + § 6 RATG-Anwendung (TP 1-3, 5-9,
// Einheitssatz) + § 6 Abs 3a-Zuschlag + § 7 Streitgenossenzuschlag für
// Zivil-/Verwaltungssachen; § 9 feste Honoraransätze (Straf-/Disziplinarsachen)
// mit § 9 Abs 2-Zuschlag, § 11 Einheitssatz, § 12 Erfolgszuschlag, § 10
// Abs 3-Streitgenossenzuschlag; § 10 RATG-Anwendung für sonstige Strafsachen;
// § 13 Verwaltungsstrafsachen (Zuordnung nach Strafdrohung); § 16
// Nacht/Wochenend/Feiertagszuschlag; § 17 Abs 2 Pauschale je sichere
// elektronische Nachricht.
//
// NICHT abgedeckt (eigene Honorarvereinbarung / manuelle Rechnungszeile
// empfohlen): § 8 Sonderfälle (übernationale Tribunale, Rechtsgutachten,
// Schiedsrichtertätigkeit, Notariatstarif für Urkunden), § 14
// Geldverwahrung nach Notariatstarif, § 15 Kilometergeld/Verpflegung/
// Nächtigung außerhalb des Kanzleisitzes, § 18 Bedachtnahme auf
// vergleichbare Leistungen (per Definition ein Einzelfall ohne Tabelle).
// Das Ergebnis ist ein Vorschlag, den der Anwalt prüft; es wird nie
// automatisch verrechnet oder versendet.

import {
  AHK_SOURCE,
  AHK_SURCHARGE,
  AHK_STREITGENOSSEN_BASIS,
  AHK_STREITGENOSSEN_JE_WEITERE,
  AHK_STREITGENOSSEN_MAX,
  AHK_STREITGENOSSEN_STRAFSACHE_PROZENT,
  AHK_ERFOLGSZUSCHLAG_MAX_PROZENT,
  AHK_NACHT_WOCHENENDE_ZUSCHLAG_PROZENT,
  AHK_SICHERE_NACHRICHT_EURO,
  AHK_NICHTIGKEIT_UND_BERUFUNG_ZUSCHLAG_PROZENT,
  AHK_STRAF_POSITIONEN,
  AHK_STRAF_VERFAHREN_LABEL,
  AHK_TP10_BEMESSUNGSGRUNDLAGEN,
  AHK_VERWALTUNGSSTRAFE_SCHWELLEN,
  type AhkStrafVerfahren,
  type AhkStrafPosition,
} from "@/lib/legal/ahk-tariff-data";
import { RATG_TARIFF, type RatgTariffBlock } from "@/lib/legal/ratg-tariff-data";
import { ratgBaseFee, EINHEITSSATZ_THRESHOLD, type RatgTariffItem } from "@/lib/legal/ratg";

export class AhkInputError extends Error {}

const toCents = (euro: number) => Math.round(euro * 100);
const toEuro = (cents: number) => Math.round(cents) / 100;

export interface AhkLine {
  key: string;
  label: string;
  amount: number;
  basis: string;
}

export interface AhkResult {
  lines: AhkLine[];
  net: number;
  source: string;
}

const eur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const SOURCE = () => `${AHK_SOURCE.statute}, ${AHK_SOURCE.version}`;

function result(lines: AhkLine[]): AhkResult {
  return {
    lines,
    net: toEuro(lines.reduce((sum, l) => sum + toCents(l.amount), 0)),
    source: SOURCE(),
  };
}

function requirePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AhkInputError(`${what} muss größer als 0 sein.`);
  }
}

function begun(value: number | undefined, what: string): number {
  const v = value ?? 1;
  requirePositive(v, what);
  return Math.ceil(v - 1e-9);
}

// ── § 5 + § 6: Zivil- und Verwaltungssachen ────────────────────────────

export interface AhkZivilInput {
  item: RatgTariffItem;
  kind: "schriftsatz" | "verhandlung";
  bemessungsgrundlage: number;
  hours?: number;
  einheitssatzFactor?: 0 | 1 | 2 | 3 | 4;
  personen?: { vertreten: number; gegenueber: number };
  /** § 6 Abs 3a-Zuschlag mitrechnen (Standard: ja — siehe AHK_SURCHARGE). */
  withSurcharge?: boolean;
  label?: string;
  sachgebiet?: string;
}

function ratgTariffBlock(item: RatgTariffItem): RatgTariffBlock {
  const b = RATG_TARIFF[item];
  if (!b) throw new AhkInputError(`Unbekannte Tarifpost: ${item}`);
  return b;
}

/** § 5 und § 6 AHK: Zivil-/Verwaltungssache ohne natürlichen RATG-Streitwert. */
export function calculateAhkZivilverwaltung(input: AhkZivilInput): AhkResult {
  const t = ratgTariffBlock(input.item);
  const base = ratgBaseFee(input.item, input.bemessungsgrundlage);
  const bgText = `BG ${eur(input.bemessungsgrundlage)}${input.sachgebiet ? `, ${input.sachgebiet}` : ""}`;
  const lines: AhkLine[] = [];

  let feeCents: number;
  let feeBasis: string;
  const what =
    input.label?.trim() || (input.kind === "schriftsatz" ? "Schriftsatz" : "Verhandlung");
  if (input.kind === "verhandlung") {
    if (input.item === "TP1" || t.hourCap === null) {
      throw new AhkInputError("Nach TP 1 werden keine Verhandlungen entlohnt.");
    }
    const hours = Math.max(1, Math.ceil(input.hours ?? 1));
    const further = Math.min(toCents(base / 2), toCents(t.hourCap));
    feeCents = toCents(base) + (hours - 1) * further;
    feeBasis =
      hours === 1
        ? `§ 6 Abs 1 AHK iVm TP ${input.item.slice(2)} RATG, 1 Stunde, ${bgText}`
        : `§ 6 Abs 1 AHK iVm TP ${input.item.slice(2)} RATG, erste Stunde ${eur(base)} + ${hours - 1} × ${eur(further / 100)}, ${bgText}`;
  } else {
    feeCents = toCents(base);
    feeBasis = `§ 6 Abs 1 AHK iVm TP ${input.item.slice(2)} RATG, ${bgText}`;
  }
  lines.push({
    key: "entlohnung",
    label: `${what} (§ 6 AHK)`,
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
      basis: `§ 6 Abs 1 AHK iVm § 23 RATG, ${rate * 100} %${factor > 1 ? ` × ${factor}` : ""} von ${eur(feeCents / 100)}`,
    });
  }

  let sgCents = 0;
  if (input.personen) {
    const extra =
      Math.max(0, input.personen.vertreten - 1) + Math.max(0, input.personen.gegenueber - 1);
    const pct =
      extra === 0
        ? 0
        : Math.min(
            AHK_STREITGENOSSEN_MAX,
            AHK_STREITGENOSSEN_BASIS + AHK_STREITGENOSSEN_JE_WEITERE * (extra - 1)
          );
    if (pct > 0) {
      sgCents = Math.round(((feeCents + esCents) * pct) / 100);
      lines.push({
        key: "streitgenossen",
        label: `Streitgenossenzuschlag ${pct} %`,
        amount: toEuro(sgCents),
        basis: `§ 7 Abs 1 AHK, ${pct} % von ${eur((feeCents + esCents) / 100)}`,
      });
    }
  }

  if (input.withSurcharge ?? true) {
    const baseForSurcharge = feeCents + esCents + sgCents;
    const surchargeCents = Math.round((baseForSurcharge * AHK_SURCHARGE.percent) / 100);
    lines.push({
      key: "zuschlag_6_3a",
      label: `VPI-Zuschlag ${AHK_SURCHARGE.percent} %`,
      amount: toEuro(surchargeCents),
      basis: `§ 6 Abs 3a AHK, Mitteilung ÖRAK vom ${AHK_SURCHARGE.announcedAt}, ab ${AHK_SURCHARGE.effectiveFrom} — vor Rechnungslegung gegen ${AHK_SURCHARGE.checkUrl} prüfen`,
    });
  }

  return result(lines);
}

// ── § 9 bis § 13: Straf- und Disziplinarsachen ─────────────────────────

export interface AhkStrafInput {
  verfahren: AhkStrafVerfahren;
  positionKey: string;
  hours?: number;
  /** § 9 Abs 2: gleichzeitig Berufung + Nichtigkeitsbeschwerde (nur Schöffen-/Geschworenengericht). */
  nichtigkeitUndBerufung?: boolean;
  einheitssatzFactor?: 0 | 1;
  /** § 12: bis zu 50 %. */
  erfolgszuschlagProzent?: number;
  /** § 10 Abs 3: Anzahl weiterer verteidigter Parteien in derselben Sache. */
  weitereVerteidigtePersonen?: number;
  label?: string;
}

function findPosition(verfahren: AhkStrafVerfahren, positionKey: string): AhkStrafPosition {
  const p = AHK_STRAF_POSITIONEN[verfahren].find((x) => x.key === positionKey);
  if (!p) throw new AhkInputError(`Unbekannte Position: ${positionKey}`);
  return p;
}

/** § 9 AHK: fester Honoraransatz nach Verfahrensart und Position. */
export function calculateAhkStraf(input: AhkStrafInput): AhkResult {
  if (input.erfolgszuschlagProzent !== undefined) {
    if (
      input.erfolgszuschlagProzent < 0 ||
      input.erfolgszuschlagProzent > AHK_ERFOLGSZUSCHLAG_MAX_PROZENT
    ) {
      throw new AhkInputError(
        `Der Erfolgszuschlag darf höchstens ${AHK_ERFOLGSZUSCHLAG_MAX_PROZENT} % betragen.`
      );
    }
  }
  const pos = findPosition(input.verfahren, input.positionKey);
  const verfahrenLabel = AHK_STRAF_VERFAHREN_LABEL[input.verfahren];
  const lines: AhkLine[] = [];

  let feeCents: number;
  let detail: string;
  if (pos.amount !== undefined) {
    feeCents = toCents(pos.amount);
    detail = eur(pos.amount);
  } else {
    if (pos.ersteHalbeStunde === undefined || pos.weitereHalbeStunde === undefined) {
      throw new AhkInputError(`Position ${pos.key} hat weder Pauschale noch Halbe-Stunde-Sätze.`);
    }
    const halves = begun((input.hours ?? 0.5) * 2, "Die Dauer");
    feeCents = toCents(pos.ersteHalbeStunde) + (halves - 1) * toCents(pos.weitereHalbeStunde);
    detail =
      halves === 1
        ? `erste halbe Stunde ${eur(pos.ersteHalbeStunde)}`
        : `erste halbe Stunde ${eur(pos.ersteHalbeStunde)} + ${halves - 1} × ${eur(pos.weitereHalbeStunde)}`;
  }

  // § 9 Abs 2: 20 % Zuschlag, wenn Nichtigkeitsbeschwerde + Berufung gemeinsam
  // erhoben werden — nur bei den lit d/e-Positionen (Berufungsverhandlung,
  // Gerichtstag Nichtigkeitsbeschwerde) der Schöffen-/Geschworenenverfahren.
  const eligibleForZ92 =
    (input.verfahren === "schoeffengericht" || input.verfahren === "geschworenengericht") &&
    (pos.key === "berufungsverhandlung" || pos.key === "gerichtstag_nichtigkeit");
  if (input.nichtigkeitUndBerufung && eligibleForZ92) {
    feeCents = Math.round((feeCents * (100 + AHK_NICHTIGKEIT_UND_BERUFUNG_ZUSCHLAG_PROZENT)) / 100);
    detail += `, + ${AHK_NICHTIGKEIT_UND_BERUFUNG_ZUSCHLAG_PROZENT} % (§ 9 Abs 2)`;
  } else if (input.nichtigkeitUndBerufung && !eligibleForZ92) {
    throw new AhkInputError(
      "Der Zuschlag nach § 9 Abs 2 gilt nur für Berufungsverhandlung/Gerichtstag Nichtigkeitsbeschwerde im Schöffen- oder Geschworenenverfahren."
    );
  }

  lines.push({
    key: "entlohnung",
    label: `${input.label?.trim() || pos.label} (${pos.norm})`,
    amount: toEuro(feeCents),
    basis: `${pos.norm}, ${verfahrenLabel}: ${detail}`,
  });

  // § 11: Einheitssatz sinngemäß, mit den § 9-Leistungen als Bemessungsgrundlage.
  if ((input.einheitssatzFactor ?? 0) > 0) {
    const esCents = Math.round(feeCents * 0.6);
    lines.push({
      key: "einheitssatz",
      label: "Einheitssatz",
      amount: toEuro(esCents),
      basis: `§ 11 AHK iVm § 23 RATG, 60 % von ${eur(feeCents / 100)}`,
    });
  }

  if (input.weitereVerteidigtePersonen && input.weitereVerteidigtePersonen > 0) {
    const sgCents = Math.round(
      (feeCents * AHK_STREITGENOSSEN_STRAFSACHE_PROZENT * input.weitereVerteidigtePersonen) / 100
    );
    lines.push({
      key: "streitgenossen",
      label: `Streitgenossenzuschlag Strafsache, ${input.weitereVerteidigtePersonen} weitere Partei${input.weitereVerteidigtePersonen > 1 ? "en" : ""}`,
      amount: toEuro(sgCents),
      basis: `§ 10 Abs 3 AHK, ${AHK_STREITGENOSSEN_STRAFSACHE_PROZENT} % × ${input.weitereVerteidigtePersonen} von ${eur(feeCents / 100)}`,
    });
  }

  if (input.erfolgszuschlagProzent) {
    const base = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
    const cents = Math.round((base * input.erfolgszuschlagProzent) / 100);
    lines.push({
      key: "erfolgszuschlag",
      label: `Erfolgszuschlag ${input.erfolgszuschlagProzent} %`,
      amount: toEuro(cents),
      basis: `§ 12 AHK, ${input.erfolgszuschlagProzent} % von ${eur(base / 100)}`,
    });
  }

  return result(lines);
}

// ── § 10: sonstige Strafsachen (RATG-Anwendung) ────────────────────────

export interface AhkStrafRatgInput {
  item: RatgTariffItem;
  kind: "schriftsatz" | "verhandlung";
  einstufung: AhkStrafVerfahren | "unbestimmbar";
  hours?: number;
  einheitssatzFactor?: 0 | 1;
  withSurcharge?: boolean;
  label?: string;
}

/** § 10 AHK: Strafsachen, die nicht in § 9 genannt sind, über RATG TP 1-3/5-9. */
export function calculateAhkStrafRatg(input: AhkStrafRatgInput): AhkResult {
  const bg = AHK_TP10_BEMESSUNGSGRUNDLAGEN[input.einstufung];
  const zivilResult = calculateAhkZivilverwaltung({
    item: input.item,
    kind: input.kind,
    bemessungsgrundlage: bg,
    hours: input.hours,
    einheitssatzFactor: input.einheitssatzFactor ?? 1,
    withSurcharge: input.withSurcharge,
    label: input.label,
    sachgebiet: `§ 10 AHK, ${input.einstufung}`,
  });
  return {
    ...zivilResult,
    lines: zivilResult.lines.map((l) =>
      l.key === "entlohnung"
        ? { ...l, basis: l.basis.replace("§ 6 Abs 1 AHK", "§ 10 Abs 1 AHK") }
        : l
    ),
  };
}

/** § 13 Abs 1: ordnet eine Verwaltungsstrafe anhand ihrer Höchststrafe einer § 9-Kategorie zu. */
export function einstufungAusStrafdrohung(
  hoechststrafeEuro: number,
  mitHaft: boolean
): AhkStrafVerfahren {
  const s = AHK_VERWALTUNGSSTRAFE_SCHWELLEN.bisEuro;
  if (mitHaft) return "geschworenengericht"; // § 13 Abs 1 Z 4: Geldstrafe > 4 360 € oder Haft
  if (hoechststrafeEuro <= s.bezirksgericht) return "bezirksgericht";
  if (hoechststrafeEuro <= s.einzelrichter_gerichtshof) return "einzelrichter_gerichtshof";
  if (hoechststrafeEuro <= s.schoeffengericht) return "schoeffengericht";
  return "geschworenengericht";
}

// ── § 16, § 17: Zuschläge und Barauslagen ──────────────────────────────

/** § 16: Zuschlag für Leistungen zwischen 20 und 8 Uhr oder Sa/So/Feiertag. */
export function ahkNachtWochenendeZuschlag(baseAmount: number): AhkLine {
  const cents = Math.round((toCents(baseAmount) * AHK_NACHT_WOCHENENDE_ZUSCHLAG_PROZENT) / 100);
  return {
    key: "nacht_wochenende",
    label: `Zuschlag Nacht/Wochenende/Feiertag ${AHK_NACHT_WOCHENENDE_ZUSCHLAG_PROZENT} %`,
    amount: toEuro(cents),
    basis: `§ 16 AHK, ${AHK_NACHT_WOCHENENDE_ZUSCHLAG_PROZENT} % von ${eur(baseAmount)}`,
  };
}

/** § 17 Abs 2: Barauslage je Versand über einen sicheren elektronischen Kommunikationsweg (z. B. ERV). */
export function ahkSichereNachrichtAuslage(anzahl: number): AhkLine {
  requirePositive(anzahl, "Die Anzahl");
  const count = Math.ceil(anzahl);
  return {
    key: "sichere_nachricht",
    label: `${count} × sichere elektronische Nachricht`,
    amount: toEuro(toCents(AHK_SICHERE_NACHRICHT_EURO) * count),
    basis: `§ 17 Abs 2 AHK, ${count} × ${eur(AHK_SICHERE_NACHRICHT_EURO)}`,
  };
}

export { AHK_SOURCE, AHK_SURCHARGE, AHK_STRAF_POSITIONEN, AHK_STRAF_VERFAHREN_LABEL };
