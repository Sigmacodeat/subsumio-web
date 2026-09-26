export interface CityPageContent {
  slug: string;
  city: string;
  /** Bundesland — shown on the city index cards. */
  state: string;
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
}

const _cities: Record<string, CityPageContent> = {
  wien: {
    slug: "wien",
    city: "Wien",
    state: "Wien",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Wien",
    metaTitle: "KI-Kanzleisoftware Wien — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Wien: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. Hosting in Wien.",
    h1: "KI-Kanzleisoftware für Wiener Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Wien, die mit österreichischem Recht arbeitet — ABGB, ZPO, EO und dem übrigen Bundesrecht aus dem RIS. Antworten nennen ihre Fundstellen; nicht belegbare Aussagen werden gekennzeichnet, die anwaltliche Prüfung bleibt bei Ihnen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 125, 126 ZPO, berücksichtigt die Fristenhemmung nach § 222 ZPO und alle gesetzlichen Feiertage. Das OLG Wien ist für Wien, Niederösterreich und das Burgenland zuständig. Rechtsgebiete: Zivilrecht (ABGB), Zivilprozessrecht (ZPO), Exekutionsrecht (EO) und Verwaltungsrecht.",
    courts: [
      "Oberlandesgericht Wien",
      "Landesgericht für Zivilrechtssachen Wien",
      "Bezirksgerichte Wien",
    ],
    features: [
      {
        title: "Aktenführung nach österreichischer Praxis",
        desc: "Akten mit Parteienbezeichnung, Geschäftszahl und Gericht.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Rekurs (14 Tage), Berufung und Klagebeantwortung (4 Wochen), Fristen nach der EO — automatisch mit gesetzlichen Feiertagen und Fristenhemmung.",
      },
      {
        title: "DSGVO und § 9 Abs. 2 RAO",
        desc: "Hosting in Wien mit Auftragsverarbeitungsvertrag (AVV), On-Premise im Enterprise-Tarif. Für KI-Funktionen eingesetzte Auftragsverarbeiter sind in der Datenschutzerklärung benannt. Zur Verschwiegenheit nach § 9 Abs. 2 RAO unterzeichnen wir auf Wunsch eine gesonderte Verpflichtung.",
      },
    ],
    faq: [
      {
        q: "Kennt Subsumio das österreichische ABGB?",
        a: "Ja. Subsumio arbeitet mit ABGB, ZPO, EO und dem übrigen Bundesrecht; Quelle ist das RIS. Die Antworten stützen sich auf österreichische Rechtsgrundlagen — nicht auf deutsche Paragrafen.",
      },
      {
        q: "Wie berücksichtigt Subsumio Feiertage bei der Fristenberechnung?",
        a: "Fällt das Ende einer Frist auf einen Samstag, Sonntag, gesetzlichen Feiertag oder den Karfreitag, endet sie am nächsten Werktag. Landesfeiertage verschieben keine Fristen.",
      },
      {
        q: "Kann ich Subsumio neben meiner Kanzleisoftware nutzen?",
        a: "Ja. Subsumio ersetzt Ihre Kanzleisoftware nicht. Dokumente kommen per Upload oder über Ihr verbundenes E-Mail-Postfach (IMAP) in Subsumio; Ihr bestehendes System bleibt unverändert.",
      },
    ],
  },
  graz: {
    slug: "graz",
    city: "Graz",
    state: "Steiermark",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Graz",
    metaTitle: "KI-Kanzleisoftware Graz — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Graz: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. Hosting in Wien.",
    h1: "KI-Kanzleisoftware für Grazer Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Graz und der Steiermark — von der Einzelkanzlei bis zur Wirtschaftskanzlei. Österreichisches Recht (ABGB, ZPO, EO) mit belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 125, 126 ZPO, berücksichtigt die Fristenhemmung nach § 222 ZPO und alle gesetzlichen Feiertage. Das OLG Graz ist für die Steiermark und Kärnten zuständig.",
    courts: [
      "Oberlandesgericht Graz",
      "Landesgericht für Zivilrechtssachen Graz",
      "Bezirksgerichte Graz",
    ],
    features: [
      {
        title: "Aktenführung nach österreichischer Praxis",
        desc: "Akten mit Parteienbezeichnung, Geschäftszahl und Gericht — ob Landesgericht für Zivilrechtssachen Graz oder Bezirksgericht.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Rekurs (14 Tage), Berufung und Klagebeantwortung (4 Wochen), Fristen nach der EO — automatisch mit gesetzlichen Feiertagen und Fristenhemmung.",
      },
      {
        title: "Verschwiegenheit nach § 9 Abs. 2 RAO",
        desc: "Hosting in Wien mit AVV, On-Premise im Enterprise-Tarif. Für KI-Funktionen eingesetzte Auftragsverarbeiter sind in der Datenschutzerklärung benannt. Kein Training von KI-Modellen mit Mandantendaten.",
      },
    ],
    faq: [
      {
        q: "Funktioniert Subsumio auch für kleinere Grazer Kanzleien?",
        a: "Ja. Der Solo-Tarif (249 €/Monat, 1 Nutzer) ist für Einzelanwältinnen und Einzelanwälte gedacht. Sie können 30 Tage kostenlos testen, ohne Kreditkarte.",
      },
      {
        q: "Kennt die KI die Unterschiede zum deutschen Recht?",
        a: "Ja. Subsumio arbeitet mit österreichischem Bundesrecht aus dem RIS (ABGB, ZPO, EO) und antwortet auf Basis Ihrer Akten und der österreichischen Rechtsgrundlage.",
      },
      {
        q: "Wie kommen meine bestehenden Akten in Subsumio?",
        a: "Per Upload oder über Ihr verbundenes E-Mail-Postfach (IMAP). Ihre bestehende Kanzleisoftware bleibt unverändert — Subsumio ergänzt sie.",
      },
    ],
  },
  linz: {
    slug: "linz",
    city: "Linz",
    state: "Oberösterreich",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Linz",
    metaTitle: "KI-Kanzleisoftware Linz — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Linz: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. Hosting in Wien.",
    h1: "KI-Kanzleisoftware für Linzer Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Linz und ganz Oberösterreich — durchgehend mit österreichischem Recht, belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 125, 126 ZPO, berücksichtigt die Fristenhemmung nach § 222 ZPO und alle gesetzlichen Feiertage. Das OLG Linz ist für Oberösterreich und Salzburg zuständig.",
    courts: ["Oberlandesgericht Linz", "Landesgericht Linz", "Bezirksgerichte Oberösterreich"],
    features: [
      {
        title: "Wirtschaftsrecht im Zentrum",
        desc: "Linz ist Industriestandort — Subsumio durchsucht Gesellschaftsverträge, Liefervereinbarungen und umfangreiche Akten und zeigt Ihnen die Fundstellen.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Rekurs (14 Tage), Berufung und Klagebeantwortung (4 Wochen), Fristen nach der EO — automatisch mit gesetzlichen Feiertagen und Fristenhemmung.",
      },
      {
        title: "DSGVO und § 9 Abs. 2 RAO",
        desc: "Hosting in Wien mit AVV, On-Premise im Enterprise-Tarif. Für KI-Funktionen eingesetzte Auftragsverarbeiter sind in AVV und Datenschutzerklärung benannt.",
      },
    ],
    faq: [
      {
        q: "Ist Subsumio für Wirtschaftskanzleien geeignet?",
        a: "Ja — gerade bei Transaktionsakten mit hunderten Dokumenten hilft die Suche nach Bedeutung statt nach Stichwort: „Alle Gewährleistungsklauseln in den Anhängen zum Anteilskaufvertrag“ liefert Fundstellen statt bloßer Stichwort-Treffer.",
      },
      {
        q: "Eignet sich Subsumio auch für Salzburger Kanzleien?",
        a: "Ja. Subsumio funktioniert österreichweit; Salzburg gehört zum Sprengel des OLG Linz. Für Salzburg gibt es eine eigene Seite: /at/cities/salzburg.",
      },
      {
        q: "Kann ich Subsumio vorher testen?",
        a: "Ja — 30 Tage kostenlos, ohne Kreditkarte. Sie laden eigene Akten hoch und prüfen die belegten Antworten an Ihrem echten Material.",
      },
    ],
  },
  salzburg: {
    slug: "salzburg",
    city: "Salzburg",
    state: "Salzburg",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Salzburg",
    metaTitle: "KI-Kanzleisoftware Salzburg — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Salzburg: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. Hosting in Wien.",
    h1: "KI-Kanzleisoftware für Salzburger Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Salzburg — mit österreichischem Recht statt angepasster deutscher Software: belegte Antworten mit Fundstellen und Fristen nach der ZPO.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 125, 126 ZPO, berücksichtigt die Fristenhemmung nach § 222 ZPO und alle gesetzlichen Feiertage. Salzburg gehört zum Sprengel des OLG Linz.",
    courts: [
      "Landesgericht Salzburg · OLG-Sprengel Linz",
      "Oberlandesgericht Linz",
      "Bezirksgerichte im Land Salzburg",
    ],
    features: [
      {
        title: "Österreichisches Recht als Grundlage",
        desc: "Die Rechtsrecherche stützt sich auf österreichisches Recht aus dem RIS. Jede Fundstelle zeigt, aus welcher Norm oder welchem Dokument eine Aussage stammt.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Rekurs (14 Tage), Berufung und Klagebeantwortung (4 Wochen), Fristen nach der EO — automatisch mit gesetzlichen Feiertagen und Fristenhemmung.",
      },
      {
        title: "Verschwiegenheit nach § 9 Abs. 2 RAO",
        desc: "Hosting in Wien mit AVV, On-Premise im Enterprise-Tarif. Für KI-Funktionen eingesetzte Auftragsverarbeiter sind in der Datenschutzerklärung benannt. Kein Training von KI-Modellen mit Mandantendaten, getrennte Verarbeitung je Kanzlei.",
      },
    ],
    faq: [
      {
        q: "Kennt Subsumio den OLG-Sprengel für Salzburg?",
        a: "Ja. Salzburg gehört zum Sprengel des OLG Linz; Berufungen gegen Urteile des Landesgerichts Salzburg gehen dorthin.",
      },
      {
        q: "Funktioniert Subsumio mit Akten, die Auslandsbezug haben?",
        a: "Subsumio arbeitet auf Basis Ihrer Akten — auch Dokumente mit Auslandsbezug werden durchsuchbar. Die Rechtsrecherche selbst deckt österreichisches Recht ab; die Fundstellen zeigen, aus welchem Dokument eine Aussage stammt.",
      },
      {
        q: "Brauche ich IT-Personal für den Betrieb?",
        a: "Nein. In der EU-Cloud brauchen Sie weder einen eigenen Server noch Wartung. On-Premise auf eigener Infrastruktur gibt es im Enterprise-Tarif.",
      },
    ],
  },
  innsbruck: {
    slug: "innsbruck",
    city: "Innsbruck",
    state: "Tirol",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Innsbruck",
    metaTitle: "KI-Kanzleisoftware Innsbruck — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Innsbruck: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. Hosting in Wien.",
    h1: "KI-Kanzleisoftware für Innsbrucker Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwältinnen und Rechtsanwälte in Innsbruck und Tirol — von der Allgemeinkanzlei bis zur Spezialkanzlei für Bau- und Tourismusrecht. Österreichisches Recht, belegte Antworten, Fristen nach der ZPO.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach §§ 125, 126 ZPO, berücksichtigt die Fristenhemmung nach § 222 ZPO und alle gesetzlichen Feiertage. Das OLG Innsbruck ist für Tirol und Vorarlberg zuständig.",
    courts: ["Oberlandesgericht Innsbruck", "Landesgericht Innsbruck", "Bezirksgerichte Tirol"],
    features: [
      {
        title: "Bau- und Tourismusrecht",
        desc: "Baubewilligungen, Widmungen, Beherbergungsverträge — Subsumio findet in langen Verwaltungsakten die entscheidenden Stellen und nennt die Fundstelle.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Rekurs (14 Tage), Berufung und Klagebeantwortung (4 Wochen), Fristen nach der EO — automatisch mit gesetzlichen Feiertagen und Fristenhemmung.",
      },
      {
        title: "Auch für kleine Kanzleien",
        desc: "Solo-Tarif für 249 €/Monat (1 Nutzer) — Akten, Fristen und belegte Antworten mit Fundstellen.",
      },
    ],
    faq: [
      {
        q: "Eignet sich Subsumio auch für Vorarlberger Kanzleien?",
        a: "Ja. Subsumio funktioniert österreichweit; Vorarlberg gehört wie Tirol zum Sprengel des OLG Innsbruck.",
      },
      {
        q: "Wie komme ich zu meiner ersten Antwort?",
        a: "Registrieren, Akten hochladen, erste Frage stellen — ohne Installation. 30 Tage kostenlos, ohne Kreditkarte.",
      },
      {
        q: "Bleiben Mandantendaten in Österreich?",
        a: "Anwendung und Daten liegen in einem Rechenzentrum in Wien. Für KI-Antworten und einzelne Zusatzfunktionen setzen wir Auftragsverarbeiter ein, teils mit Sitz in den USA; Grundlage ist ein AVV, in dem alle Auftragsverarbeiter benannt sind. On-Premise auf Ihrer eigenen Infrastruktur gibt es im Enterprise-Tarif.",
      },
    ],
  },
};

export const CITIES: Record<string, CityPageContent> = _cities;

export function getCityBySlug(slug: string): CityPageContent | undefined {
  return CITIES[slug];
}

export function getAllCitySlugs(): string[] {
  return Object.keys(CITIES);
}
