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
  metaTitle: "Subsumio Partnerprogramm — Provision für vermittelte Kanzleien",
  metaDesc:
    "Subsumio empfehlen und eine wiederkehrende Provision erhalten, solange der Kunde bleibt. Für Kanzleiberater, IT-Systemhäuser und Steuerberater.",
  badge: "Partnerprogramm",
  h1a: "Empfehlen Sie Subsumio.",
  h1b: "Wir vergüten jede Vermittlung.",
  sub: "Drei Wege der Zusammenarbeit — von der einfachen Empfehlung bis zur Einführung von Subsumio bei den Kanzleien, die Sie betreuen. Die Provision läuft, solange der Kunde bleibt (Details in den Partnerbedingungen).",
  tiers: [
    {
      id: "affiliate",
      icon: "Megaphone",
      name: "Empfehlungspartner",
      headline: "25 % Provision, wiederkehrend (bis zu 30 %)",
      desc: "Für Kanzleiberater, Steuerberater, Fachautorinnen und Fachautoren sowie alle, die regelmäßig mit der österreichischen Anwaltschaft arbeiten.",
      points: [
        "25 % jeder Zahlung des vermittelten Kunden — kein Stichtag, keine Obergrenze",
        "Zusätzlich 5 % auf Kunden von Partnern, die Sie selbst für das Programm gewonnen haben (insgesamt bis zu 30 %)",
        "Eine Empfehlung wird Ihnen bis 90 Tage nach dem ersten Klick zugeordnet",
        "Unterlagen für Ihre Empfehlung auf Anfrage",
      ],
      cta: "Als Empfehlungspartner bewerben",
      href: "mailto:partners@subsum.io?subject=Affiliate-Bewerbung",
      highlight: true,
    },
    {
      id: "referral",
      icon: "Gift",
      name: "Kunden-Empfehlungen",
      headline: "Einen Monat schenken, einen bekommen",
      desc: "Sie sind bereits Kunde? Ihren Empfehlungslink finden Sie in den Einstellungen.",
      points: [
        "Sie erhalten 1 Monat gratis für jede Empfehlung, die zahlender Kunde wird",
        "Die empfohlene Kanzlei erhält ihren ersten Monat ebenfalls gratis",
        "12 Empfehlungen ergeben ein Gratisjahr",
        "Gilt für die Tarife Solo und Kanzlei",
      ],
      cta: "Link in den Einstellungen",
      href: "/dashboard/settings",
    },
    {
      id: "vertical",
      icon: "Handshake",
      name: "Einführungspartner",
      headline: "20 % Provision und Ihr eigener Dienstleistungsumsatz",
      desc: "Für IT-Systemhäuser, Kanzleiberater und Steuerberater, die Subsumio bei Kanzleien einführen.",
      points: [
        "20 % der Zahlungen jedes Kunden, den Sie zu uns bringen",
        "Ihre Honorare für Einführung und Beratung bleiben zu 100 % bei Ihnen",
        "Nennung als Subsumio-Einführungspartner ab 3 produktiven Kunden",
        "Direkter Kontakt zu unserer Entwicklung bei Fragen zur Anbindung",
      ],
      cta: "Als Partner bewerben",
      href: "mailto:partners@subsum.io?subject=Partner-Bewerbung",
    },
  ],
  calcTitle: "Ein Rechenbeispiel",
  calcSub:
    "Vermitteln Sie 10 Kanzleien im Kanzlei-Tarif (1.499 €/Monat). Bei 25 % sind das 3.747,50 € pro Monat — im ersten Jahr 44.970 €.",
  calcNote:
    "Das Beispiel ist eine Rechnung, keine Zusage. Maßgeblich sind die tatsächlichen Zahlungen der vermittelten Kunden.",
  howTitle: "So funktioniert's",
  how: [
    {
      step: "01",
      title: "Bewerben und Link erhalten",
      desc: "Wir prüfen Ihre Bewerbung innerhalb von 48 Stunden. Danach erhalten Sie Ihren persönlichen Empfehlungslink.",
    },
    {
      step: "02",
      title: "Ehrlich empfehlen",
      desc: "Empfehlen Sie Subsumio Kanzleien, die ihr Kanzleiwissen wirklich durchsuchbar machen wollen. Zehn passende Empfehlungen sind uns lieber als 1.000 Klicks.",
    },
    {
      step: "03",
      title: "Monatlich abrechnen",
      desc: "Auszahlung monatlich, ab 50 €.",
    },
  ],
  faqTitle: "Fragen zum Partnerprogramm",
  faq: [
    {
      q: "Wann beginnt die Provision?",
      a: "Ab der ersten Zahlung des vermittelten Kunden.",
    },
    {
      q: "Was passiert bei einem Tarifwechsel?",
      a: "Ihre Provision folgt den tatsächlichen Zahlungen. Wechselt ein von Ihnen vermittelter Kunde von Solo auf Kanzlei, gilt Ihr Prozentsatz automatisch für den neuen Preis.",
    },
    {
      q: "Kann ich Empfehlungs- und Einführungspartner zugleich sein?",
      a: "Ja. Sie können mit Empfehlungen beginnen und später auch die Einführung übernehmen.",
    },
    {
      q: "Kann ich mich selbst empfehlen?",
      a: "Nein. Selbst-Empfehlungen werden nicht vergütet.",
    },
    {
      q: "Kann ich Gebietsexklusivität bekommen?",
      a: "Eine ausschließliche Gebietszuteilung gibt es nicht. Wer in seiner Region nachweislich Kunden betreut, erhält dort Vorrang — schreiben Sie uns.",
    },
  ],
  ctaTitle: "Sie beraten Kanzleien? Sprechen wir über eine Partnerschaft.",
  ctaSub:
    "Keine Exklusivität erforderlich. Die Partnerbedingungen erhalten Sie mit der Antwort auf Ihre Bewerbung.",
  ctaButton: "Jetzt bewerben",
};
