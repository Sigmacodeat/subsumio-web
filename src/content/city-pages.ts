export interface CityPageContent {
  slug: string;
  city: string;
  country: string;
  countryCode: string;
  title: string;
  metaTitle: string;
  metaDesc: string;
  h1: string;
  intro: string;
  jurisdictionNote: string;
  courts: string[];
  features: { title: string; desc: string }[];
  faq: { q: string; a: string }[];
  geo: { lat: number; lng: number };
  address: { street: string; postalCode: string; region: string };
}

const _cities: Record<string, CityPageContent> = {
  wien: {
    slug: "wien",
    city: "Wien",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Wien",
    metaTitle: "KI-Kanzleisoftware Wien — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Rechtsanwälte in Wien: Aktenverwaltung nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. EU-gehostet oder On-Premise.",
    h1: "KI-Kanzleisoftware für Wiener Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Wien, die mit österreichischem Recht arbeitet — ABGB, ZPO, EO und Bundesrecht. Jede KI-Antwort nennt die exakte Fundstelle. Keine Halluzinationen, keine Kompromisse bei der Schweigepflicht.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach österreichischer ZPO (§§ 5, 224, 510) und kennt Wiener Feiertage (z.B. 26. Oktober, Allerheiligen). Die Rechtsgebiete umfassen Zivilrecht (ABGB), Zivilprozessrecht (ZPO), Exekutionsrecht (EO) und Verwaltungsrecht.",
    courts: [
      "Oberlandesgericht Wien",
      "Landesgericht für Zivilrechtssachen Wien",
      "Bezirksgerichte Wien",
    ],
    features: [
      {
        title: "ABGB-konforme Aktenverwaltung",
        desc: "Aktenstruktur nach österreichischer Praxis — mit Parteienbezeichnung, Verfahren Nummer und Gerichtszweig.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Notfristen (14 Tage), Berufungsfristen (4 Wochen), Exekutionsfristen — automatisch mit Wiener Feiertagen.",
      },
      {
        title: "DSGVO und § 9 ECGBGB",
        desc: "EU-gehostet mit AVV oder On-Premise. Berufsgeheimnis nach § 9 ECGBGB (österreichisches Äquivalent zu § 203 StGB).",
      },
    ],
    faq: [
      {
        q: "Kenne Subsumio das österreichische ABGB?",
        a: "Ja. Subsumio indexiert ABGB, ZPO, EO und österreichisches Bundesrecht. Die KI-Antworten beziehen sich auf die korrekte Rechtsgrundlage — nicht auf deutsche Paragrafen.",
      },
      {
        q: "Werden Wiener Feiertage bei der Fristenberechnung berücksichtigt?",
        a: "Ja. Subsumio kennt alle österreichischen Bundesfeiertage und Wiener Landesfeiertage. Fristen, die auf einen Feiertag fallen, werden automatisch auf den nächsten Werktag verschoben.",
      },
      {
        q: "Ist Subsumio mit RA-Micro und anwalt.at kompatibel?",
        a: "Ja. Subsumio importiert aus RA-Micro, anwalt.at und jedem System, das Dokumente exportieren kann. Es ersetzt nicht Ihre Anwaltssoftware — es ergänzt sie um ein Kanzlei-Brain.",
      },
    ],
    geo: { lat: 48.2082, lng: 16.3738 },
    address: { street: "Schwarzenbergplatz 7", postalCode: "1030", region: "Wien" },
  },
  berlin: {
    slug: "berlin",
    city: "Berlin",
    country: "Deutschland",
    countryCode: "DE",
    title: "Subsumio für Rechtsanwälte in Berlin",
    metaTitle: "KI-Kanzleisoftware Berlin — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Rechtsanwälte in Berlin: Aktenverwaltung nach deutschem Recht (BGB, ZPO, HGB), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. § 203 StGB-konform, EU-gehostet oder On-Premise.",
    h1: "KI-Kanzleisoftware für Berliner Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Berlin, die mit deutschem Recht arbeitet — BGB, ZPO, HGB und Bundesrecht. Jede KI-Antwort nennt die exakte Fundstelle. Keine Halluzinationen, keine Kompromisse bei der Schweigepflicht.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach deutscher ZPO (§§ 224, 519, 548) und kennt Berliner Feiertage (z.B. Tag der Deutschen Einheit, Internationaler Frauentag). Die Rechtsgebiete umfassen Zivilrecht (BGB), Zivilprozessrecht (ZPO), Handelsrecht (HGB) und Verwaltungsrecht.",
    courts: ["Kammergericht Berlin", "Landgericht Berlin", "Amtsgerichte Berlin"],
    features: [
      {
        title: "BGB-konforme Aktenverwaltung",
        desc: "Aktenstruktur nach deutscher Praxis — mit Parteienbezeichnung, Aktenzeichen und Gerichtszweig.",
      },
      {
        title: "Fristen nach ZPO und GKG",
        desc: "Notfristen (2 Wochen), Berufungsfristen (1 Monat), Revisionsfristen — automatisch mit Berliner Feiertagen.",
      },
      {
        title: "§ 203 StGB und DSGVO",
        desc: "EU-gehostet mit AVV oder On-Premise. Berufsgeheimnis nach § 203 StGB — kein Dritter verarbeitet Mandantendaten.",
      },
    ],
    faq: [
      {
        q: "Kennt Subsumio das deutsche BGB und die ZPO?",
        a: "Ja. Subsumio indexiert BGB, ZPO, HGB und deutsches Bundesrecht. Die KI-Antworten beziehen sich auf die korrekte Rechtsgrundlage — nicht auf österreichische Paragrafen.",
      },
      {
        q: "Werden Berliner Feiertage bei der Fristenberechnung berücksichtigt?",
        a: "Ja. Subsumio kennt alle deutschen Bundesfeiertage und Berliner Landesfeiertage (z.B. Internationaler Frauentag am 8. März). Fristen, die auf einen Feiertag fallen, werden automatisch auf den nächsten Werktag verschoben.",
      },
      {
        q: "Ist Subsumio mit DATEV und RA-Micro kompatibel?",
        a: "Ja. Subsumio importiert aus DATEV, RA-Micro, anwalt.de und jedem System, das Dokumente exportieren kann. Es ersetzt nicht Ihre Anwaltssoftware — es ergänzt sie um ein Kanzlei-Brain.",
      },
    ],
    geo: { lat: 52.52, lng: 13.405 },
    address: { street: "Schwarzenbergplatz 7", postalCode: "1030", region: "Wien" },
  },
  zuerich: {
    slug: "zuerich",
    city: "Zürich",
    country: "Schweiz",
    countryCode: "CH",
    title: "Subsumio für Rechtsanwälte in Zürich",
    metaTitle: "KI-Kanzleisoftware Zürich — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Rechtsanwälte in Zürich: Aktenverwaltung nach Schweizer Recht (ZGB, OR, ZPO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. DSGVO-konform, EU-gehostet oder On-Premise.",
    h1: "KI-Kanzleisoftware für Zürcher Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Zürich, die mit Schweizer Recht arbeitet — ZGB, OR, ZPO und kantonales Recht. Jede KI-Antwort nennt die exakte Fundstelle. Keine Halluzinationen, keine Kompromisse bei der Schweigepflicht.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach Schweizer ZPO (Art. 47, 100, 311) und kennt Zürcher Feiertage (z.B. Sechseläuten, Bundesfeiertag). Die Rechtsgebiete umfassen Zivilrecht (ZGB), Obligationenrecht (OR), Zivilprozessrecht (ZPO) und Verwaltungsrecht (VwVG).",
    courts: ["Obergericht Zürich", "Handelsgericht Zürich", "Bezirksgerichte Zürich"],
    features: [
      {
        title: "ZGB-konforme Aktenverwaltung",
        desc: "Aktenstruktur nach Schweizer Praxis — mit Parteienbezeichnung, Aktenzeichen und Gerichtsinstanz.",
      },
      {
        title: "Fristen nach ZPO und SchKG",
        desc: "Rechtsmittelfristen (30 Tage), Klagefristen, Betreibungsfristen — automatisch mit Zürcher Feiertagen.",
      },
      {
        title: "DSG und Berufsgeheimnis (Art. 321 StGB)",
        desc: "EU-gehostet mit AVV oder On-Premise. Berufsgeheimnis nach Schweizer StGB Art. 321 — kein Dritter verarbeitet Mandantendaten.",
      },
    ],
    faq: [
      {
        q: "Kennt Subsumio das Schweizer ZGB und OR?",
        a: "Ja. Subsumio indexiert ZGB, OR, ZPO, SchKG und Schweizer Bundesrecht. Die KI-Antworten beziehen sich auf die korrekte Rechtsgrundlage — nicht auf deutsche oder österreichische Paragrafen.",
      },
      {
        q: "Werden Zürcher Feiertage bei der Fristenberechnung berücksichtigt?",
        a: "Ja. Subsumio kennt alle Schweizer Bundesfeiertage und Zürcher kantonale Feiertage (z.B. Sechseläuten, Knabenschiessen). Fristen, die auf einen Feiertag fallen, werden automatisch auf den nächsten Werktag verschoben.",
      },
      {
        q: "Ist Subsumio mit Swisslex und Weblaw kompatibel?",
        a: "Ja. Subsumio importiert aus jedem System, das Dokumente exportieren kann. Es ersetzt nicht Ihre Anwaltssoftware — es ergänzt sie um ein Kanzlei-Brain.",
      },
    ],
    geo: { lat: 47.3769, lng: 8.5417 },
    address: { street: "Schwarzenbergplatz 7", postalCode: "1030", region: "Wien" },
  },
};

export const CITIES = _cities;

export function getCityBySlug(slug: string): CityPageContent | undefined {
  return _cities[slug];
}

export function getAllCitySlugs(): string[] {
  return Object.keys(_cities);
}
