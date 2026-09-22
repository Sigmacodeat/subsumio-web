import {
  BASISZINSSATZ_HISTORIE,
  UGB_AUFSCHLAG_PROZENTPUNKTE,
  UGB_BETREIBUNGSPAUSCHALE_EURO,
  VERZUGSZINSEN_SOURCE,
  ZINSSATZ_ABGB_PROZENT,
} from "./verzugszinsen-data";

export class VerzugszinsenInputError extends Error {}

export type ZinsRechtsgrundlage =
  | "abgb_1333" // § 1333 ABGB — 4 % p.a. (Verbraucher/allgemein)
  | "abgb_1000" // § 1000 Abs 1 ABGB — 4 % Anlaufzinsen
  | "ugb_456" // § 456 UGB — Basiszinssatz + 9,2 PP (Unternehmergeschäft)
  | "vereinbart"; // vertraglicher Zinssatz

export const ZINS_GRUNDLAGE_LABEL: Record<ZinsRechtsgrundlage, string> = {
  abgb_1333: "§ 1333 ABGB — 4 % p.a. (Verbraucher)",
  abgb_1000: "§ 1000 Abs 1 ABGB — 4 % Anlaufzinsen",
  ugb_456: "§ 456 UGB — Basiszinssatz + 9,2 PP (Unternehmer)",
  vereinbart: "Vereinbarter Zinssatz",
};

/** Zinsmethode: AT-Praxis act/365; kaufmännisch 30/360. */
export type ZinsMethode = "act365" | "30/360";

export interface ZinsSegment {
  von: string;
  bis: string;
  tage: number;
  satzProzent: number;
  zinsenCents: number;
}

export interface VerzugszinsenResult {
  kapitalCents: number;
  von: string;
  bis: string;
  grundlage: ZinsRechtsgrundlage;
  methode: ZinsMethode;
  segmente: ZinsSegment[];
  zinsenCents: number;
  betreibungspauschaleCents: number;
  totalCents: number;
  basis: string;
  source: typeof VERZUGSZINSEN_SOURCE;
}

const MS_PER_DAY = 86_400_000;

function parseIso(date: string): Date {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new VerzugszinsenInputError(`Ungültiges Datum: ${date}`);
  }
  return d;
}

function daysBetweenAct(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** 30/360: jeder Monat 30 Tage, Jahr 360. */
function daysBetween30_360(from: Date, to: Date): number {
  const d1 = Math.min(from.getUTCDate(), 30);
  const d2 = Math.min(to.getUTCDate(), 30);
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 360 +
    (to.getUTCMonth() - from.getUTCMonth()) * 30 +
    (d2 - d1)
  );
}

function basiszinssatzAm(date: Date): number {
  const iso = date.toISOString().slice(0, 10);
  const hit = BASISZINSSATZ_HISTORIE.find((s) => s.ab <= iso);
  if (!hit) {
    throw new VerzugszinsenInputError(
      `Kein Basiszinssatz für ${iso} hinterlegt (Historie ab 2013).`
    );
  }
  return hit.prozent;
}

function halbjahresEnde(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return m < 6 ? new Date(Date.UTC(y, 6, 1)) : new Date(Date.UTC(y + 1, 0, 1));
}

/**
 * Gesetzliche Verzugszinsen. `von` = Verzugsbeginn (Zinsen laufen ab diesem
 * Tag), `bis` = Stichtag (exklusiv — Zinsen bis einschließlich Vortag).
 * Bei § 456 UGB wird der Zeitraum an den Halbjahresgrenzen segmentiert.
 */
export function calculateVerzugszinsen(opts: {
  kapital: number;
  von: string;
  bis: string;
  grundlage: ZinsRechtsgrundlage;
  methode?: ZinsMethode;
  /** Nur für "vereinbart": Jahreszinssatz in Prozent. */
  satzProzent?: number;
  /** § 458 UGB Betreibungskostenpauschale 40 € mitberechnen. */
  betreibungspauschale?: boolean;
}): VerzugszinsenResult {
  const methode = opts.methode ?? "act365";
  if (!Number.isFinite(opts.kapital) || opts.kapital <= 0) {
    throw new VerzugszinsenInputError("Kapital muss eine positive Zahl sein.");
  }
  const von = parseIso(opts.von);
  const bis = parseIso(opts.bis);
  if (bis <= von) {
    throw new VerzugszinsenInputError("Stichtag muss nach dem Verzugsbeginn liegen.");
  }
  if (
    opts.grundlage === "vereinbart" &&
    (!Number.isFinite(opts.satzProzent) || (opts.satzProzent ?? 0) < 0)
  ) {
    throw new VerzugszinsenInputError("Vereinbarter Zinssatz fehlt oder ist ungültig.");
  }

  const kapitalCents = Math.round(opts.kapital * 100);
  const divisor = methode === "act365" ? 36500 : 36000;
  const tage = (a: Date, b: Date) =>
    methode === "act365" ? daysBetweenAct(a, b) : daysBetween30_360(a, b);

  const segmente: ZinsSegment[] = [];

  if (opts.grundlage === "ugb_456") {
    // An jedem Halbjahres-Stichtag (1.1./1.7.) wechselt der maßgebliche Satz.
    let cursor = von;
    while (cursor < bis) {
      const ende = halbjahresEnde(cursor);
      const segmentEnde = ende < bis ? ende : bis;
      const satz =
        Math.round((basiszinssatzAm(cursor) + UGB_AUFSCHLAG_PROZENTPUNKTE) * 1000) / 1000;
      const d = tage(cursor, segmentEnde);
      segmente.push({
        von: cursor.toISOString().slice(0, 10),
        bis: segmentEnde.toISOString().slice(0, 10),
        tage: d,
        satzProzent: satz,
        zinsenCents: Math.round((kapitalCents * satz * d) / divisor),
      });
      cursor = segmentEnde;
    }
  } else {
    const satz =
      opts.grundlage === "vereinbart" ? (opts.satzProzent as number) : ZINSSATZ_ABGB_PROZENT;
    const d = tage(von, bis);
    segmente.push({
      von: opts.von,
      bis: opts.bis,
      tage: d,
      satzProzent: satz,
      zinsenCents: Math.round((kapitalCents * satz * d) / divisor),
    });
  }

  const zinsenCents = segmente.reduce((s, seg) => s + seg.zinsenCents, 0);
  const pauschaleCents =
    opts.grundlage === "ugb_456" && opts.betreibungspauschale
      ? Math.round(UGB_BETREIBUNGSPAUSCHALE_EURO * 100)
      : 0;

  return {
    kapitalCents,
    von: opts.von,
    bis: opts.bis,
    grundlage: opts.grundlage,
    methode,
    segmente,
    zinsenCents,
    betreibungspauschaleCents: pauschaleCents,
    totalCents: kapitalCents + zinsenCents + pauschaleCents,
    basis: `${ZINS_GRUNDLAGE_LABEL[opts.grundlage]} · ${segmente.length} Zeitraum${
      segmente.length > 1 ? "abschnitte" : ""
    } (${methode === "act365" ? "act/365" : "30/360"})`,
    source: VERZUGSZINSEN_SOURCE,
  };
}
