// Partner program page — affiliate, in-product referral, vertical partners.

export interface PartnersContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  tiers: {
    id: string;
    icon: string;
    name: string;
    headline: string;
    desc: string;
    points: string[];
    cta: string;
    href: string;
    highlight?: boolean;
  }[];
  calcTitle: string;
  calcSub: string;
  calcNote: string;
  howTitle: string;
  how: { step: string; title: string; desc: string }[];
  faqTitle: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

export const PARTNERS: PartnersContent = {
  metaTitle: "Subsumio Partnerprogramm — lebenslang wiederkehrend verdienen",
  metaDesc:
    "Subsumio empfehlen und lebenslang wiederkehrende Provision verdienen. Affiliate-, Referral- und zertifizierte Implementierungspartner-Tracks.",
  badge: "Partnerprogramm",
  h1a: "Empfiehl das Brain.",
  h1b: "Behalte die Provision.",
  sub: "Drei Wege, mit Subsumio zu verdienen — vom geteilten Link bis zur zertifizierten Implementierungs-Practice. Alle nach einem Prinzip: Du verdienst weiter, solange deine Empfehlungen zahlen.",
  tiers: [
    {
      id: "affiliate",
      icon: "Megaphone",
      name: "Affiliates",
      headline: "25 % lebenslang wiederkehrend (bis zu 30 %)",
      desc: "Für Legal-Tech-Blogger, Anwaltsverbands-Communities, Kanzlei-Berater und alle mit einem österreichisches Rechts-Publikum.",
      points: [
        "25 % jeder Zahlung, solange dein geworbener Kunde bleibt — kein Stichtag, keine Obergrenze",
        "+5 % Override auf Kunden von Affiliates, die du rekrutiert hast (gesamt bis zu 30 %) — passives Einkommen aufbauen",
        "90 Tage Cookie-Fenster",
        "Monatliche Auszahlung ab 50 €, Echtzeit-Dashboard",
        "Fertige Assets: Demos, Screenshots, Vergleichsseiten",
      ],
      cta: "Als Affiliate bewerben",
      href: "mailto:partners@subsum.eu?subject=Affiliate-Bewerbung",
      highlight: true,
    },
    {
      id: "referral",
      icon: "Gift",
      name: "Kunden-Empfehlungen",
      headline: "Einen Monat schenken, einen bekommen",
      desc: "Schon Kunde? Dein Empfehlungslink wartet im Dashboard.",
      points: [
        "Du bekommst 1 Monat gratis für jede Empfehlung, die zahlender Kunde wird",
        "Der Geworbene bekommt seinen ersten Monat ebenfalls gratis — dein Link lohnt sich für beide",
        "Keine Obergrenze: 12 Empfehlungen = ein Gratisjahr",
        "Gilt für Pro- und Team-Pläne",
      ],
      cta: "Link in den Einstellungen",
      href: "/dashboard/settings",
    },
    {
      id: "vertical",
      icon: "Handshake",
      name: "Zertifizierte Partner",
      headline: "20 % lifetime + dein Dienstleistungsumsatz",
      desc: "Für Legal-Tech-Integratoren, IT-Häuser und Berater, die Subsumio bei Kanzleien implementieren.",
      points: [
        "20 % Revenue-Share — lebenslang für jeden gebrachten Kunden",
        "100 % deiner Implementierungs- und Beratungshonorare bleiben bei dir",
        "Status „Subsumio Certified Partner“ ab 3 Live-Kunden",
        "Direkter Draht zu unserem Engineering für Integrationen",
      ],
      cta: "Als Partner bewerben",
      href: "mailto:partners@subsum.eu?subject=Partner-Bewerbung",
    },
  ],
  calcTitle: "Was lebenslang wiederkehrend wirklich heißt",
  calcSub:
    "Wirb 10 Team-Seats (1.290 €/Seat/Monat). Bei 25 % sind das 3.225 € jeden Monat — solange sie bleiben. Allein im ersten Jahr sind das 38.700 €. Und es läuft weiter.",
  calcNote:
    "Wir zahlen am oberen Ende der Branche, weil frühe Partner am meisten zählen. Je erfolgreicher deine Empfehlungen, desto mehr wachsen wir gemeinsam.",
  howTitle: "So funktioniert's",
  how: [
    {
      step: "01",
      title: "Bewerben & Link erhalten",
      desc: "Wir prüfen Bewerbungen innerhalb von 48 Stunden. Du bekommst einen getrackten Link und ein Partner-Dashboard.",
    },
    {
      step: "02",
      title: "Ehrlich empfehlen",
      desc: "Teile mit Publikum, das wirklich ein Company Brain braucht. Uns sind 10 echte Fits lieber als 1.000 Klicks.",
    },
    {
      step: "03",
      title: "Monatlich kassieren",
      desc: "Stripe-basierte Auszahlung jeden Monat, ab 50 €. Jede Empfehlung und ihr Status in Echtzeit sichtbar.",
    },
  ],
  faqTitle: "Partner-FAQ",
  faq: [
    {
      q: "Wann beginnt die Provision?",
      a: "Ab der ersten Zahlung deiner Empfehlung. Affiliate-Provisionen laufen so lange, wie der Kunde zahlt — kein Stichtag, keine Obergrenze.",
    },
    {
      q: "Was passiert bei einem Upgrade?",
      a: "Deine Provision folgt den tatsächlichen Zahlungen. Wirbst du einen Pro-Kunden, der auf Team upgradet, gelten deine Prozente auf den neuen Preis, automatisch.",
    },
    {
      q: "Kann ich Affiliate UND zertifizierter Partner sein?",
      a: "Ja. Viele starten als Affiliate und zertifizieren sich nach den ersten Implementierungen.",
    },
    {
      q: "Gibt es Regeln gegen Selbst-Empfehlung?",
      a: "Selbst-Empfehlungen werden nicht ausgezahlt — wir halten das Programm ehrlich, damit es für alle großzügig bleibt.",
    },
    {
      q: "Kann ich andere Affiliates rekrutieren?",
      a: "Ja. Wenn du einen weiteren Affiliate einbringst, verdienst du 5 % Override auf dessen geworbene Kunden. So belohnen wir dich fürs Ausbauen des Partner-Netzwerks.",
    },
    {
      q: "Kann ich Gebietsexklusivität bekommen?",
      a: "Bewirb dich als Regional Launch Partner — leistungsgebundener Vorrang in deiner Region und der volle 5-%-Override auf jeden Affiliate, den du lokal rekrutierst.",
    },
  ],
  ctaTitle: "Dein Publikum braucht ein Kanzlei-Brain. Du brauchst wiederkehrenden Umsatz.",
  ctaSub: "Bewerbungen werden innerhalb von 48 Stunden geprüft. Keine Exklusivität erforderlich.",
  ctaButton: "Jetzt bewerben",
};
