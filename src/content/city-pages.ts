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
      "KI-Kanzleisoftware für Anwälte in Wien: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. EU-gehostet.",
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
        title: "DSGVO und § 9 Abs. 2 RAO",
        desc: "EU-gehostet mit AVV oder On-Premise. Berufsgeheimnis nach § 9 Abs. 2 RAO durch Architektur.",
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
        a: "Ja. Subsumio importiert aus RA-Micro, anwalt.at und jedem System, das Dokumente exportieren kann. Es ersetzt nicht deine Anwaltssoftware — es ergänzt sie um ein Kanzlei-Brain.",
      },
    ],
  },
  graz: {
    slug: "graz",
    city: "Graz",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Graz",
    metaTitle: "KI-Kanzleisoftware Graz — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Graz: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Grazer Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Graz — von der Boutique-Kanzlei am Schlossberg bis zur Wirtschaftskanzlei in der Innenstadt. Österreichisches Recht statt generischer Übersetzungen: ABGB, ZPO, EO, mit belegten Antworten und Fundstellen.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach österreichischer ZPO (§§ 5, 224, 510) und berücksichtigt steirische Feiertage — einschließlich des steirischen Landesfeiertags (26. Oktober) und aller Bundesfeiertage. Rechtsgebiete: Zivilrecht (ABGB), ZPO, EO und Verwaltungsrecht.",
    courts: [
      "Oberlandesgericht Graz",
      "Landesgericht für Zivilrechtssachen Graz",
      "Bezirksgerichte Graz",
    ],
    features: [
      {
        title: "Akten nach steirischer Praxis",
        desc: "Aktenstruktur nach österreichischer Konvention — Parteienbezeichnung, Gerichtszweig, Verfahrensnummer — egal ob LGZ Graz oder Bezirksgericht.",
      },
      {
        title: "Fristen mit Landesfeiertagen",
        desc: "Notfristen und Berufungsfristen unter Berücksichtigung steirischer Feiertage und der ZPO-Monatsarithmetik — automatisch, ohne Excel.",
      },
      {
        title: "Berufsgeheimnis by Design",
        desc: "EU-Hosting mit AVV oder Self-Hosting auf eigener Infrastruktur. § 9 Abs. 2 RAO ist kein Kleingedrucktes — es ist die Architektur.",
      },
    ],
    faq: [
      {
        q: "Funktioniert Subsumio auch für kleinere Grazer Kanzleien?",
        a: "Ja. Der Solo-Tarif ist für Einzelanwältinnen und Einzelanwälte gedacht — derselbe Retrieval-Kern wie in großen Kanzleien, ohne Mindestnutzer und ohne Einrichtungsgebühr.",
      },
      {
        q: "Kennt die KI die Unterschiede zum deutschen Recht?",
        a: "Ja — das ist der Kern des Produkts. Subsumio indexiert österreichisches Bundesrecht (ABGB, ZPO, EO) und antwortet auf Basis deiner Akten und der korrekten österreichischen Rechtsgrundlage.",
      },
      {
        q: "Wie kommen meine bestehenden Akten in Subsumio?",
        a: "Per Ordner-Import, Upload oder über die Copilot-Schnittstelle. Bestehende Systeme wie RA-Micro oder anwalt.at bleiben unverändert — Subsumio ergänzt sie um die Abfrageschicht.",
      },
    ],
  },
  linz: {
    slug: "linz",
    city: "Linz",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Linz",
    metaTitle: "KI-Kanzleisoftware Linz — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Linz: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Linzer Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Linz und ganz Oberösterreich. Das OLG Linz ist auch für Salzburg zuständig — Subsumio kennt die oberösterreichische Justizlandschaft und arbeitet durchgehend mit österreichischem Recht.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach österreichischer ZPO (§§ 5, 224, 510) und berücksichtigt oberösterreichische Feiertage. Das OLG Linz deckt Oberösterreich und Salzburg ab — relevant für Berufungswege aus beiden Bundesländern.",
    courts: ["Oberlandesgericht Linz", "Landesgericht Linz", "Bezirksgerichte Oberösterreich"],
    features: [
      {
        title: "Wirtschaftsrecht im Zentrum",
        desc: "Linz ist Industriestandort — Subsumio strukturiert Gesellschaftsverträge, Liefervereinbarungen und Konzernakten so, dass du Querverbindungen sofort findest.",
      },
      {
        title: "Fristen nach ZPO und EO",
        desc: "Automatische Fristenberechnung mit oberösterreichischen Feiertagen — inklusive Wochenend- und Feiertagsverschiebung nach ZPO.",
      },
      {
        title: "DSGVO und § 9 Abs. 2 RAO",
        desc: "EU-Cloud mit AVV oder komplett self-hosted. Mandantendaten bleiben, wo sie hingehören: unter deiner Kontrolle.",
      },
    ],
    faq: [
      {
        q: "Ist Subsumio für Wirtschaftskanzleien geeignet?",
        a: "Ja — gerade bei Transaktionsakten mit hunderten Dokumenten zahlt sich die semantische Suche aus: 'Alle Gewährleistungsklauseln in den SPA-Anhängen' liefert belegte Fundstellen statt Stichwort-Treffer.",
      },
      {
        q: "Gilt Subsumio auch für Salzburger Kanzleien?",
        a: "Ja. Das OLG Linz ist für Salzburg zuständig — die Berufungswege sind im System abgebildet. Für Salzburg gibt es außerdem eine eigene Seite: /at/cities/salzburg.",
      },
      {
        q: "Kann ich Subsumio vorher testen?",
        a: "Ja — 14 Tage kostenlos, ohne Kreditkarte. Du lädst eigene Akten hoch und prüfst die belegten Antworten an deinem echten Material.",
      },
    ],
  },
  salzburg: {
    slug: "salzburg",
    city: "Salzburg",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Salzburg",
    metaTitle: "KI-Kanzleisoftware Salzburg — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Salzburg: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Salzburger Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Salzburg — mit echtem österreichischem Recht statt angepasster deutscher Software. Belegte Antworten mit Fundstellen, Fristen nach ZPO und die Salzburger Feiertagslage inklusive.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach österreichischer ZPO (§§ 5, 224, 510) mit Salzburger Feiertagen. Für Rechtsmittel ist das OLG Linz zuständig — die Berufungswege aus Salzburg sind im System korrekt abgebildet.",
    courts: [
      "Landesgericht Salzburg",
      "Oberlandesgericht Linz (zuständige Berufungsinstanz)",
      "Bezirksgerichte Salzburg",
    ],
    features: [
      {
        title: "Grenzüberschreitende Mandate",
        desc: "Salzburger Kanzleien arbeiten oft deutschland-nah. Subsumio trennt klar zwischen österreichischem und deutschem Recht — die Fundstellen zeigen dir, welche Rechtsgrundlage zählt.",
      },
      {
        title: "Fristen mit Salzburger Feiertagen",
        desc: "Rupertikirtag, Bundes- und Landesfeiertage fließen in die Fristenberechnung ein — mit ZPO-korrekter Monatsarithmetik und Wochenendverschiebung.",
      },
      {
        title: "Mandantendaten unter Kontrolle",
        desc: "EU-gehostet mit AVV oder Self-Hosting. Kein Training auf Mandantendaten, mandantenseparierte Verarbeitung — § 9 Abs. 2 RAO per Architektur.",
      },
    ],
    faq: [
      {
        q: "Kennt Subsumio den OLG-Zuständigkeitsbereich für Salzburg?",
        a: "Ja. Berufungen aus Salzburg gehen an das OLG Linz — die Fristen- und Verfahrenslogik bildet das korrekt ab.",
      },
      {
        q: "Funktioniert Subsumio mit Mandaten aus Deutschland?",
        a: "Die KI arbeitet auf Basis deiner Akten — grenzüberschreitende Dokumente werden genauso indexiert. Die Fundstellen zeigen dir transparent, aus welchem Dokument und welcher Rechtsordnung eine Aussage stammt.",
      },
      {
        q: "Brauche ich IT-Personal für den Betrieb?",
        a: "Nein. Die EU-Cloud läuft ohne eigenen Server und ohne Wartung. Wer maximale Kontrolle will, kann Subsumio auch self-hosted betreiben — beides ist aus demselben Produkt wählbar.",
      },
    ],
  },
  innsbruck: {
    slug: "innsbruck",
    city: "Innsbruck",
    country: "Österreich",
    countryCode: "AT",
    title: "Subsumio für Rechtsanwälte in Innsbruck",
    metaTitle: "KI-Kanzleisoftware Innsbruck — Subsumio für Anwälte",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Innsbruck: Akten nach österreichischem Recht (ABGB, ZPO, EO), Fristenkontrolle, belegte KI-Antworten mit Fundstellen. EU-gehostet.",
    h1: "KI-Kanzleisoftware für Innsbrucker Anwaltskanzleien",
    intro:
      "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Innsbruck und Tirol — von der Generalist-Kanzlei bis zur Spezialkanzlei für Baurecht und Tourismusrecht. Österreichisches Recht, belegte Antworten, Fristen nach ZPO.",
    jurisdictionNote:
      "Subsumio berechnet Fristen nach österreichischer ZPO (§§ 5, 224, 510) und berücksichtigt Tiroler Feiertage — einschließlich Herz-Jesu (Landesfeiertag in Tirol). Das OLG Innsbruck ist die Berufungsinstanz für Tirol und Vorarlberg.",
    courts: ["Oberlandesgericht Innsbruck", "Landesgericht Innsbruck", "Bezirksgerichte Tirol"],
    features: [
      {
        title: "Baurecht und Tourismus im Griff",
        desc: "Baubewilligungen, Widmungen, Beherbergungsverträge — Subsumio findet in langen Verwaltungsakten die entscheidenden Stellen und zitiert sie seitengenau.",
      },
      {
        title: "Fristen mit Tiroler Feiertagen",
        desc: "Herz-Jesu-Sonntag und alle Bundesfeiertage sind im Fristenkalender eingerechnet — Notfristen und Berufungsfristen mit korrekter Verschiebung.",
      },
      {
        title: "Auch für kleine Kanzleien",
        desc: "Solo-Tarif ohne Mindestabnahme. Dieselbe Engine wie für Großkanzleien — belegte Antworten, Kollisionsprüfung, Fristenradar.",
      },
    ],
    faq: [
      {
        q: "Gilt Subsumio auch für Vorarlberger Kanzleien?",
        a: "Ja. Das OLG Innsbruck ist für Tirol und Vorarlberg zuständig — die Berufungsinstanzen sind korrekt abgebildet. Subsumio funktioniert österreichweit.",
      },
      {
        q: "Wie schnell ist Subsumio einsatzbereit?",
        a: "In Minuten: registrieren, Akten hochladen oder Ordner verbinden — die erste belegte Antwort bekommst du am selben Tag. 14 Tage kostenlos, ohne Kreditkarte.",
      },
      {
        q: "Bleiben Mandantendaten in Österreich?",
        a: "Die EU-Cloud läuft in europäischen Rechenzentren mit AVV — oder komplett self-hosted auf deiner Infrastruktur. Kein Training auf Mandantendaten, keine Daten an Dritte.",
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
