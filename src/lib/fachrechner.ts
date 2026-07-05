/**
 * Fachrechner — Gerichtskosten (GKG) & Spezialrechner
 * =====================================================
 * Implements:
 * - GKG (Gerichtskostengesetz) — court fees for civil proceedings
 * - Familienrecht: Verfahrenskostenhilfe, Ehesachen, Folgesachen
 * - Arbeitsrecht: Arbeitsgerichtskosten (§ 12 GKG i.V.m. § 61 ArbGG)
 * - Verkehrsrecht: Unfallschadensersatz, Mietwagen, Nutzungsausfall
 * - Mietrecht: Mieterhöhung, Räumungskosten
 * - Erbrecht: Erbschein, Nachlassverfahren
 *
 * GKG Tabelle gültig ab 01.07.2021 (KV-GKG Anlage 2).
 */

// ── GKG (Gerichtskostengesetz) ────────────────────────────────────────

const GKG_STUFEN: Array<{ bis: number; schritt: number; je: number }> = [
  { bis: 500, schritt: 0, je: 0 },
  { bis: 1_000, schritt: 35, je: 500 },
  { bis: 3_000, schritt: 48, je: 1_000 },
  { bis: 6_000, schritt: 62, je: 3_000 },
  { bis: 9_000, schritt: 68, je: 3_000 },
  { bis: 13_000, schritt: 74, je: 4_000 },
  { bis: 17_000, schritt: 80, je: 4_000 },
  { bis: 25_000, schritt: 100, je: 8_000 },
  { bis: 50_000, schritt: 132, je: 25_000 },
  { bis: 100_000, schritt: 220, je: 50_000 },
  { bis: 250_000, schritt: 380, je: 150_000 },
  { bis: 500_000, schritt: 560, je: 250_000 },
  { bis: Infinity, schritt: 760, je: 500_000 },
];

function gkgGebuehr(streitwert: number): number {
  if (streitwert <= 0) return 0;
  let gebuehr = 35;
  let grenze = 500;
  for (const stufe of GKG_STUFEN) {
    while (grenze < streitwert && grenze < stufe.bis) {
      gebuehr += stufe.schritt;
      grenze += stufe.je;
    }
    if (grenze >= streitwert) break;
  }
  return gebuehr;
}

export interface GkgResult {
  streitwert: number;
  verfahrensgebuehr: number;
  terminsgebuehr: number;
  auslagenpauschale: number;
  summe: number;
}

export function calculateGkg(streitwert: number): GkgResult {
  const safeStreitwert = Math.max(0, streitwert);
  const basis = gkgGebuehr(safeStreitwert);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    streitwert: safeStreitwert,
    verfahrensgebuehr: round2(basis * 3),
    terminsgebuehr: round2(basis * 1),
    auslagenpauschale: 20,
    summe: round2(basis * 3 + basis * 1 + 20),
  };
}

// ── Familienrecht ─────────────────────────────────────────────────────

export interface FamilienrechtResult {
  verfahrensart: string;
  streitwert: number;
  gerichtskosten: number;
  anwaltskostenNetto: number;
  anwaltskostenBrutto: number;
  notenkosten?: number;
  gesamtkosten: number;
}

export function calculateFamilienrecht(input: {
  verfahrensart:
    | "ehesachen"
    | "folgesachen"
    | "elterliche_sorge"
    | "unterhalt"
    | "verfahrenskostenhilfe";
  streitwert: number;
  einkommenMonatlich?: number;
}): FamilienrechtResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let streitwert = input.streitwert;
  let gerichtskosten = 0;
  let anwaltskostenNetto = 0;
  let notenkosten: number | undefined;

  switch (input.verfahrensart) {
    case "ehesachen": {
      streitwert = streitwert || 3000;
      const gkg = calculateGkg(streitwert);
      gerichtskosten = gkg.summe;
      anwaltskostenNetto = round2(gkg.verfahrensgebuehr * 1.3 + gkg.terminsgebuehr * 1.2);
      break;
    }
    case "folgesachen": {
      streitwert = streitwert || 4000;
      const gkg = calculateGkg(streitwert);
      gerichtskosten = gkg.summe;
      anwaltskostenNetto = round2(gkg.verfahrensgebuehr * 1.3 + gkg.terminsgebuehr * 1.2);
      break;
    }
    case "unterhalt": {
      streitwert = streitwert || (input.einkommenMonatlich ? input.einkommenMonatlich * 12 : 12000);
      const gkg = calculateGkg(streitwert);
      gerichtskosten = gkg.summe;
      anwaltskostenNetto = round2(gkg.verfahrensgebuehr * 1.3 + gkg.terminsgebuehr * 1.2);
      break;
    }
    case "elterliche_sorge": {
      streitwert = 3000;
      const gkg = calculateGkg(streitwert);
      gerichtskosten = gkg.summe;
      anwaltskostenNetto = round2(gkg.verfahrensgebuehr * 1.3);
      break;
    }
    case "verfahrenskostenhilfe": {
      const einkommen = input.einkommenMonatlich ?? 0;
      const berechtigt = einkommen < 1800;
      gerichtskosten = berechtigt ? 0 : calculateGkg(streitwert || 3000).summe;
      anwaltskostenNetto = berechtigt ? 0 : round2(gerichtskosten * 0.5);
      notenkosten = berechtigt ? 0 : 80;
      break;
    }
  }

  const mwst = round2(anwaltskostenNetto * 0.19);
  const anwaltskostenBrutto = round2(anwaltskostenNetto + mwst);
  const gesamtkosten = round2(gerichtskosten + anwaltskostenBrutto + (notenkosten ?? 0));

  return {
    verfahrensart: input.verfahrensart,
    streitwert,
    gerichtskosten,
    anwaltskostenNetto,
    anwaltskostenBrutto,
    notenkosten,
    gesamtkosten,
  };
}

// ── Arbeitsrecht ──────────────────────────────────────────────────────

export interface ArbeitsrechtResult {
  streitwert: number;
  gerichtskosten: number;
  anwaltskostenNetto: number;
  anwaltskostenBrutto: number;
  gesamtkosten: number;
  bemerkung: string;
}

export function calculateArbeitsrecht(input: {
  streitwert: number;
  withTermin?: boolean;
}): ArbeitsrechtResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const gkg = calculateGkg(input.streitwert);

  // § 12 GKG i.V.m. § 61 ArbGG: 1.0 fache Verfahrensgebühr
  const gerichtskosten = round2(gkg.verfahrensgebuehr / 3);
  const anwaltskostenNetto = round2(
    (gkg.verfahrensgebuehr / 3) * 1.3 + (input.withTermin ? (gkg.terminsgebuehr / 3) * 1.2 : 0)
  );
  const mwst = round2(anwaltskostenNetto * 0.19);
  const anwaltskostenBrutto = round2(anwaltskostenNetto + mwst);
  const gesamtkosten = round2(gerichtskosten + anwaltskostenBrutto);

  return {
    streitwert: input.streitwert,
    gerichtskosten,
    anwaltskostenNetto,
    anwaltskostenBrutto,
    gesamtkosten,
    bemerkung: "Arbeitsgericht: reduzierte Gebühren nach § 61 ArbGG (1/3 GKG)",
  };
}

// ── Verkehrsrecht ─────────────────────────────────────────────────────

export interface VerkehrsrechtResult {
  schadensposten: Array<{ label: string; betrag: number }>;
  gesamtschaden: number;
  unreif: boolean;
  bemerkung: string;
}

export function calculateVerkehrsrecht(input: {
  reparaturkosten?: number;
  gutachterkosten?: number;
  mietwagenkosten?: number;
  nutzungsausfall?: number;
  heilbehandlungskosten?: number;
  schmerzensgeld?: number;
  verdienstausfall?: number;
  generalpauschale?: number;
}): VerkehrsrechtResult {
  const posten: Array<{ label: string; betrag: number }> = [];
  let gesamtschaden = 0;

  if (input.reparaturkosten) {
    posten.push({ label: "Reparaturkosten", betrag: input.reparaturkosten });
    gesamtschaden += input.reparaturkosten;
  }
  if (input.gutachterkosten) {
    posten.push({ label: "Gutachterkosten", betrag: input.gutachterkosten });
    gesamtschaden += input.gutachterkosten;
  }
  if (input.mietwagenkosten) {
    posten.push({ label: "Mietwagenkosten", betrag: input.mietwagenkosten });
    gesamtschaden += input.mietwagenkosten;
  }
  if (input.nutzungsausfall) {
    posten.push({ label: "Nutzungsausfall", betrag: input.nutzungsausfall });
    gesamtschaden += input.nutzungsausfall;
  }
  if (input.heilbehandlungskosten) {
    posten.push({ label: "Heilbehandlungskosten", betrag: input.heilbehandlungskosten });
    gesamtschaden += input.heilbehandlungskosten;
  }
  if (input.schmerzensgeld) {
    posten.push({ label: "Schmerzensgeld", betrag: input.schmerzensgeld });
    gesamtschaden += input.schmerzensgeld;
  }
  if (input.verdienstausfall) {
    posten.push({ label: "Verdienstausfall", betrag: input.verdienstausfall });
    gesamtschaden += input.verdienstausfall;
  }
  if (input.generalpauschale) {
    posten.push({ label: "Generalpauschale", betrag: input.generalpauschale });
    gesamtschaden += input.generalpauschale;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    schadensposten: posten.map((p) => ({ ...p, betrag: round2(p.betrag) })),
    gesamtschaden: round2(gesamtschaden),
    unreif: gesamtschaden === 0,
    bemerkung:
      gesamtschaden === 0
        ? "Schaden noch nicht beziffert — weiterer Sachverhalt erforderlich"
        : "Schadensberechnung nach § 249 BGB (Naturalrestitution)",
  };
}

// ── Mietrecht ─────────────────────────────────────────────────────────

export interface MietrechtResult {
  art: string;
  betrag: number;
  gerichtskosten: number;
  anwaltskostenBrutto: number;
  gesamtkosten: number;
}

export function calculateMietrecht(input: {
  art: "raeumungsklage" | "mieterhoehung" | "mietminderung" | "betriebskostenabrechnung";
  streitwert: number;
  monateRueckstand?: number;
  monatsmiete?: number;
}): MietrechtResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let streitwert = input.streitwert;
  let artLabel = "";

  switch (input.art) {
    case "raeumungsklage": {
      streitwert =
        input.monatsmiete && input.monateRueckstand
          ? input.monatsmiete * Math.max(input.monateRueckstand, 12)
          : streitwert;
      artLabel = "Räumungsklage";
      break;
    }
    case "mieterhoehung":
      artLabel = "Mieterhöhung";
      streitwert = streitwert || 2400;
      break;
    case "mietminderung":
      artLabel = "Mietminderung";
      break;
    case "betriebskostenabrechnung":
      artLabel = "Betriebskostenabrechnung";
      break;
  }

  const gkg = calculateGkg(streitwert);
  const gerichtskosten = round2(gkg.summe);
  const anwaltskostenNetto = round2(gkg.verfahrensgebuehr * 1.3 + gkg.terminsgebuehr * 1.2);
  const mwst = round2(anwaltskostenNetto * 0.19);
  const anwaltskostenBrutto = round2(anwaltskostenNetto + mwst);
  const gesamtkosten = round2(gerichtskosten + anwaltskostenBrutto);

  return {
    art: artLabel,
    betrag: round2(streitwert),
    gerichtskosten,
    anwaltskostenBrutto,
    gesamtkosten,
  };
}

// ── Erbrecht ──────────────────────────────────────────────────────────

export interface ErbrechtResult {
  art: string;
  nachlasswert: number;
  gerichtskosten: number;
  notarkosten: number;
  anwaltskostenBrutto: number;
  gesamtkosten: number;
}

export function calculateErbrecht(input: {
  art: "erbschein" | "nachlassverwaltung" | "erbstreitigkeit";
  nachlasswert: number;
}): ErbrechtResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let gerichtskosten = 0;
  let notarkosten = 0;
  let anwaltskostenNetto = 0;
  let artLabel = "";

  switch (input.art) {
    case "erbschein": {
      artLabel = "Erbscheinsverfahren";
      const gebuehr = gkgGebuehr(input.nachlasswert);
      gerichtskosten = round2(gebuehr);
      notarkosten = 0;
      anwaltskostenNetto = round2(gebuehr * 1.3);
      break;
    }
    case "nachlassverwaltung": {
      artLabel = "Nachlassverwaltung";
      const gebuehr = gkgGebuehr(input.nachlasswert);
      gerichtskosten = round2(gebuehr * 2);
      notarkosten = round2(gebuehr * 2);
      anwaltskostenNetto = round2(gebuehr * 1.3);
      break;
    }
    case "erbstreitigkeit": {
      artLabel = "Erbstreitigkeit";
      const gkg = calculateGkg(input.nachlasswert);
      gerichtskosten = round2(gkg.summe);
      notarkosten = 0;
      anwaltskostenNetto = round2(gkg.verfahrensgebuehr * 1.3 + gkg.terminsgebuehr * 1.2);
      break;
    }
  }

  const mwst = round2(anwaltskostenNetto * 0.19);
  const anwaltskostenBrutto = round2(anwaltskostenNetto + mwst);
  const gesamtkosten = round2(gerichtskosten + notarkosten + anwaltskostenBrutto);

  return {
    art: artLabel,
    nachlasswert: input.nachlasswert,
    gerichtskosten,
    notarkosten,
    anwaltskostenBrutto,
    gesamtkosten,
  };
}

// ── Streitwert-Bestimmung ─────────────────────────────────────────────

export function bestimmeStreitwert(input: {
  art: "unterhalt_monatlich" | "rente_monatlich" | "einmalig" | "wohnung_miete";
  betrag: number;
  faktor?: number;
}): number {
  switch (input.art) {
    case "unterhalt_monatlich":
      return input.betrag * (input.faktor ?? 12);
    case "rente_monatlich":
      return input.betrag * (input.faktor ?? 36);
    case "einmalig":
      return input.betrag;
    case "wohnung_miete":
      return input.betrag * (input.faktor ?? 12);
  }
}
