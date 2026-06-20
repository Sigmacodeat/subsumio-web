// Partner program page — affiliate, in-product referral, vertical partners. EN + DE.

import type { Lang } from "./site";

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

export const PARTNERS: Record<Lang, PartnersContent> = {
  en: {
    metaTitle: "Subsumio Partner Program — earn lifetime recurring commission",
    metaDesc:
      "Recommend Subsumio and earn lifetime recurring commission. Affiliate, referral and certified implementation partner tracks.",
    badge: "Partner program",
    h1a: "Recommend the brain.",
    h1b: "Keep the commission.",
    sub: "Three ways to earn with Subsumio — from a single shared link to a certified implementation practice. All built on one principle: you keep earning as long as your referrals keep paying.",
    tiers: [
      {
        id: "affiliate",
        icon: "Megaphone",
        name: "Affiliates",
        headline: "30% lifetime recurring",
        desc: "For creators, newsletters, course authors and communities whose audience runs on knowledge.",
        points: [
          "25% of every payment for as long as your referred customer stays",
          "+5% override on customers referred by affiliates you recruit — grow your passive income",
          "90-day cookie window",
          "Monthly payouts from €50, real-time dashboard",
          "Ready-made assets: demos, screenshots, comparison pages",
        ],
        cta: "Apply as affiliate",
        href: "mailto:partners@subsum.eu?subject=Affiliate%20application",
        highlight: true,
      },
      {
        id: "referral",
        icon: "Gift",
        name: "Customer referrals",
        headline: "Give a month, get a month",
        desc: "Already a customer? Your referral link lives in your dashboard.",
        points: [
          "You get 1 month free for every referral who becomes a paying customer",
          "They get their first month free too — your link is worth taking",
          "No caps: 12 referrals = a free year",
          "Counts on Pro and Team plans",
        ],
        cta: "Find your link in Settings",
        href: "/dashboard/settings",
      },
      {
        id: "vertical",
        icon: "Handshake",
        name: "Certified partners",
        headline: "20% lifetime + your services revenue",
        desc: "For legal-tech integrators, IT firms and consultants who implement Subsumio for law firms.",
        points: [
          "20% revenue share for the lifetime of every client you bring",
          "You keep 100% of your implementation and consulting fees",
          "“Subsumio Certified Partner” status after 3 live clients",
          "Direct line to our engineering for integrations",
        ],
        cta: "Apply as partner",
        href: "mailto:partners@subsum.eu?subject=Certified%20partner%20application",
      },
    ],
    calcTitle: "What lifetime recurring actually means",
    calcSub:
      "Refer 10 Team seats (€390/seat/month). At 30%, that's €1,170 every month — for as long as they stay. Year one alone is €14,040. And it keeps compounding.",
    calcNote:
      "We pay at the top of the industry range because early partners matter most. The more successful your referrals, the more we all grow.",
    howTitle: "How it works",
    how: [
      {
        step: "01",
        title: "Apply & get your link",
        desc: "We review applications within 48 hours. You get a tracked link and a partner dashboard.",
      },
      {
        step: "02",
        title: "Recommend honestly",
        desc: "Share with audiences who actually need a company brain. We'd rather have 10 real fits than 1,000 clicks.",
      },
      {
        step: "03",
        title: "Get paid monthly",
        desc: "Stripe-powered payouts every month, from €50. You see every referral and its status in real time.",
      },
    ],
    faqTitle: "Partner FAQ",
    faq: [
      {
        q: "When do commissions start?",
        a: "From the first payment your referral makes. Affiliate commissions continue for as long as they remain a paying customer — no cutoff, no cap.",
      },
      {
        q: "What if a customer upgrades?",
        a: "Your commission follows their actual payments. Refer a Pro customer who upgrades to Team — your percentage applies to the new price, automatically.",
      },
      {
        q: "Can I be both an affiliate and a certified partner?",
        a: "Yes. Many partners start with the affiliate track and certify once they've implemented for a few clients.",
      },
      {
        q: "Is there a self-referral policy?",
        a: "Self-referrals don't pay out — we keep the program honest so it stays generous for everyone.",
      },
      {
        q: "Can I recruit other affiliates?",
        a: "Yes. When you bring in another affiliate, you earn a 5% override on the customers they refer. It's our way of rewarding you for growing the partner network.",
      },
      {
        q: "Can I get territory exclusivity?",
        a: "Apply as a Regional Launch Partner — performance-gated priority in your region and the full 5% override on every affiliate you recruit locally.",
      },
    ],
    ctaTitle: "Your audience needs a brain. You need recurring revenue.",
    ctaSub: "Applications reviewed within 48 hours.",
    ctaButton: "Apply now",
  },
  de: {
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
        headline: "30 % lebenslang wiederkehrend",
        desc: "Für Creator, Newsletter, Kurs-Anbieter und Communities, deren Publikum von Wissen lebt.",
        points: [
          "25 % jeder Zahlung, solange dein geworbener Kunde bleibt",
          "+5 % Override auf Kunden von Affiliates, die du rekrutiert hast — baue dir passives Einkommen auf",
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
      "Wirb 10 Team-Seats (390 €/Seat/Monat). Bei 30 % sind das 1.170 € jeden Monat — solange sie bleiben. Allein im ersten Jahr sind das 14.040 €. Und es läuft weiter.",
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
    ctaTitle: "Dein Publikum braucht ein Brain. Du brauchst wiederkehrenden Umsatz.",
    ctaSub: "Bewerbungen werden innerhalb von 48 Stunden geprüft.",
    ctaButton: "Jetzt bewerben",
  },
};
