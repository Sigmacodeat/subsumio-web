// German city landing pages (/de/cities/*). Genuine German-law copy:
// Fristen nach ZPO/BGB, § 43a BRAO instead of § 9 RAO, Bundesland-Feiertage,
// real German court names per city.

import type { CityPageContent } from "./city-pages";

export type { CityPageContent };

function deCity(base: Omit<CityPageContent, "country" | "countryCode">): CityPageContent {
  return { ...base, country: "Deutschland", countryCode: "DE" };
}

const sharedFeatures: CityPageContent["features"] = [
  {
    title: "Aktenführung nach deutscher Praxis",
    desc: "Akten mit Parteienbezeichnung, Aktenzeichen und Gericht.",
  },
  {
    title: "Fristen nach ZPO und BGB",
    desc: "Berufung und Berufungsbegründung (§§ 517, 520 ZPO), Notfristen und Rechtsmittelfristen — automatisch mit den gesetzlichen Feiertagen Ihres Bundeslands und Wochenendverschiebung (§ 222 ZPO, §§ 187 ff. BGB).",
  },
  {
    title: "DSGVO und § 43a Abs. 2 BRAO",
    desc: "Hosting in der EU mit Auftragsverarbeitungsvertrag (AVV), On-Premise im Enterprise-Tarif. Zur Verschwiegenheit nach § 43a Abs. 2 BRAO und § 203 StGB unterzeichnen wir auf Wunsch eine gesonderte Verpflichtung.",
  },
];

const sharedFaq = (state: string): CityPageContent["faq"] => [
  {
    q: "Kennt Subsumio das deutsche BGB?",
    a: "Ja. Subsumio arbeitet mit BGB, ZPO, HGB, StGB und dem übrigen Bundesrecht; Quelle ist gesetze-im-internet.de. Die Antworten stützen sich auf deutsche Rechtsgrundlagen — nicht auf ausländische Paragrafen.",
  },
  {
    q: "Wie berücksichtigt Subsumio Feiertage bei der Fristenberechnung?",
    a: `Fällt das Ende einer Frist auf einen Samstag, Sonntag oder gesetzlichen Feiertag, endet sie am nächsten Werktag (§ 222 ZPO i.V.m. §§ 188, 193 BGB). Subsumio kennt die Landesfeiertage von ${state} und alle übrigen Bundesländer.`,
  },
  {
    q: "Kann ich Subsumio neben meiner Kanzleisoftware nutzen?",
    a: "Ja. Subsumio ersetzt Ihre Kanzleisoftware nicht. Dokumente kommen per Upload, über Ihr verbundenes E-Mail-Postfach (IMAP) oder per beA-Import in Subsumio; Ihr bestehendes System bleibt unverändert.",
  },
];

export const CITIES_DE: Record<string, CityPageContent> = {
  berlin: deCity({
    slug: "berlin",
    city: "Berlin",
    state: "Berlin",
    title: "Subsumio für Rechtsanwälte in Berlin",
    metaTitle: "KI-Kanzleisoftware Berlin — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Berlin: Akten nach deutschem Recht (BGB, ZPO, HGB), Fristenkontrolle mit Berliner Feiertagen, belegte KI-Antworten mit Fundstellen. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Berliner Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Berlin, die mit deutschem Recht arbeitet — BGB, ZPO, HGB und dem übrigen Bundesrecht von gesetze-im-internet.de. Jede Antwort nennt ihre Fundstelle; nicht belegbare Aussagen werden gekennzeichnet, die anwaltliche Prüfung bleibt bei Ihnen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 187 ff. BGB und § 222 ZPO und berücksichtigt die gesetzlichen Feiertage Berlins. Das Kammergericht ist das Oberlandesgericht für Berlin; daneben bestehen das Landgericht Berlin und die Amtsgerichte der zwölf Bezirke.",
    courts: ["Kammergericht Berlin", "Landgericht Berlin", "Amtsgerichte Berlin"],
    features: sharedFeatures,
    faq: sharedFaq("Berlin"),
  }),
  muenchen: deCity({
    slug: "muenchen",
    city: "München",
    state: "Bayern",
    title: "Subsumio für Rechtsanwälte in München",
    metaTitle: "KI-Kanzleisoftware München — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in München: Akten nach deutschem Recht (BGB, ZPO, HGB), Fristenkontrolle mit bayerischen Feiertagen, belegte KI-Antworten. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Münchner Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in München und Bayern — von der Einzelkanzlei bis zur Wirtschaftskanzlei. Deutsches Recht (BGB, ZPO, HGB) mit belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 187 ff. BGB und § 222 ZPO und berücksichtigt die gesetzlichen Feiertage Bayerns — einschließlich Fronleichnam und Allerheiligen. Zuständige Oberlandesgerichte sind das OLG München sowie die OLG Nürnberg und Bamberg für den Rest Bayerns.",
    courts: ["Oberlandesgericht München", "Landgericht München I und II", "Amtsgericht München"],
    features: sharedFeatures,
    faq: sharedFaq("Bayern"),
  }),
  hamburg: deCity({
    slug: "hamburg",
    city: "Hamburg",
    state: "Hamburg",
    title: "Subsumio für Rechtsanwälte in Hamburg",
    metaTitle: "KI-Kanzleisoftware Hamburg — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Hamburg: Akten nach deutschem Recht (BGB, ZPO, HGB), Fristenkontrolle mit Hamburger Feiertagen, belegte KI-Antworten. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Hamburger Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Hamburg — stark auch im Handels- und Seerecht. Deutsches Recht (BGB, ZPO, HGB) mit belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 187 ff. BGB und § 222 ZPO und berücksichtigt die gesetzlichen Feiertage Hamburgs. Das Hanseatische Oberlandesgericht ist für die Freie und Hansestadt Hamburg zuständig.",
    courts: [
      "Hanseatisches Oberlandesgericht Hamburg",
      "Landgericht Hamburg",
      "Amtsgericht Hamburg",
    ],
    features: sharedFeatures,
    faq: sharedFaq("Hamburg"),
  }),
  koeln: deCity({
    slug: "koeln",
    city: "Köln",
    state: "Nordrhein-Westfalen",
    title: "Subsumio für Rechtsanwälte in Köln",
    metaTitle: "KI-Kanzleisoftware Köln — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Köln: Akten nach deutschem Recht (BGB, ZPO, HGB), Fristenkontrolle mit NRW-Feiertagen, belegte KI-Antworten. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Kölner Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Köln und Nordrhein-Westfalen — von der Medienrechtskanzlei bis zur Sozietät. Deutsches Recht (BGB, ZPO, HGB) mit belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 187 ff. BGB und § 222 ZPO und berücksichtigt die gesetzlichen Feiertage Nordrhein-Westfalens — einschließlich Fronleichnam und Allerheiligen. Das OLG Köln ist für den Bezirk Köln zuständig; NRW hat drei Oberlandesgerichte (Köln, Düsseldorf, Hamm).",
    courts: ["Oberlandesgericht Köln", "Landgericht Köln", "Amtsgericht Köln"],
    features: sharedFeatures,
    faq: sharedFaq("Nordrhein-Westfalen"),
  }),
  "frankfurt-am-main": deCity({
    slug: "frankfurt-am-main",
    city: "Frankfurt am Main",
    state: "Hessen",
    title: "Subsumio für Rechtsanwälte in Frankfurt am Main",
    metaTitle: "KI-Kanzleisoftware Frankfurt — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Frankfurt am Main: Akten nach deutschem Recht (BGB, ZPO, HGB), Fristenkontrolle mit hessischen Feiertagen, belegte KI-Antworten. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Frankfurter Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Frankfurt am Main und Hessen — vom Bank- und Finanzrecht bis zur Sozietät. Deutsches Recht (BGB, ZPO, HGB) mit belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 187 ff. BGB und § 222 ZPO und berücksichtigt die gesetzlichen Feiertage Hessens — einschließlich Fronleichnam. Das OLG Frankfurt am Main ist für den Bezirk Frankfurt zuständig.",
    courts: [
      "Oberlandesgericht Frankfurt am Main",
      "Landgericht Frankfurt am Main",
      "Amtsgericht Frankfurt am Main",
    ],
    features: sharedFeatures,
    faq: sharedFaq("Hessen"),
  }),
};

export function getCityBySlugDe(slug: string): CityPageContent | undefined {
  return CITIES_DE[slug];
}

export function getAllCitySlugsDe(): string[] {
  return Object.keys(CITIES_DE);
}
