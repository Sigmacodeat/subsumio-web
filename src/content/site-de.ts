// Subsumio — German market content (/de).
// Derived from the Austrian base in site.ts via deepMerge overrides — every
// overridden string is genuine German-market copy (BRAO instead of RAO,
// BGB/HGB instead of ABGB/UGB, RVG instead of RATG, beA instead of ERV,
// gesetze-im-internet.de instead of RIS). Arrays are replaced wholesale, so
// each entry below is complete — never a token-swapped copy.

import { deepMerge, FOOTER, LANDING, NAV, PRODUCT_DEMO, UI_STRINGS } from "./site";

// ---------------------------------------------------------------------------
// Navigation — same IA, minus the Austrian-law blog (posts cite §§ 9/10 RAO)
// ---------------------------------------------------------------------------

export const NAV_DE = deepMerge(NAV, {
  sections: NAV.sections.map((s) =>
    s.label === "Ressourcen"
      ? {
          ...s,
          items: s.items.filter((i) => i.href !== "/blog" && i.href !== "/docs"),
          // Both deep-links pointed at the Austrian-law handbook — no /de twin.
          ctaBottom: undefined,
          featuredContent: {
            title: "Subsumio im Selbstversuch",
            description:
              "Die öffentliche Demo zeigt eine fiktive Akte mit belegten Antworten und Fristen — ohne Registrierung",
            href: "/demo",
            icon: "Zap",
          },
        }
      : s.label === "Unternehmen"
        ? {
            ...s,
            items: s.items.map((i) =>
              i.href === "/about" ? { ...i, description: "Für Kanzleien in Deutschland" } : i
            ),
          }
        : s
  ),
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export const FOOTER_DE = deepMerge(FOOTER, {
  tagline:
    "KI-Kanzleisoftware, die nie vergisst — das Kanzleiwissen für Anwältinnen und Anwälte in Deutschland.",
  columns: FOOTER.columns.map((col) => ({
    ...col,
    links: col.links
      .filter((l) => l.href !== "/blog" && l.href !== "/docs")
      .map((l) => (l.href === "/cities" ? { ...l, label: "Standorte in Deutschland" } : l)),
  })),
});

// ---------------------------------------------------------------------------
// Landing — German legal references throughout
// ---------------------------------------------------------------------------

export const LANDING_DE = deepMerge(LANDING, {
  badge: "KI-Kanzleisoftware & Anwaltssoftware für Deutschland",
  heroBadges: [
    "Jede Antwort mit geprüfter Fundstelle",
    "Berufsgeheimnis nach § 43a Abs. 2 BRAO im Systemdesign",
    "EU-Cloud oder On-Premise — Ihre Wahl",
  ],
  heroTrustItems: [
    { icon: "CreditCard", label: "Keine Kreditkarte" },
    { icon: "Scale", label: "§ 43a BRAO" },
    { icon: "Globe", label: "EU-Cloud" },
  ],
  demo: {
    q: "Was muss ich vor dem Termin Bauer morgen wissen?",
    a: "Akte Bauer ./. Hofer GmbH — Vertragsverletzung, 84.000 €. Landgericht München I, 12. Zivilkammer. Termin morgen, 09:30.\n\n**3 offene Punkte:**\n1. Klageerwiderung heute fällig — entworfen, noch nicht eingereicht\n2. Gutachten von Dr. Klein fehlt noch (angefordert 3. März)\n3. Mandant hat den vorgeschlagenen Vergleichsrahmen nicht bestätigt\n\n⚠️ Frist: Die Klageerwiderung ist eine Notfrist — Einreichung endet um Mitternacht. Zum Gutachten seit 3. März nichts Neues — nachfassen.",
    sources: ["akten/bauer-hofer", "fristen/klageerwiderung", "dokumente/gutachten-klein"],
  },
  showreel: {
    turns: [
      {
        question: "Was muss ich vor dem Termin Bauer morgen wissen?",
        answer:
          "Akte Bauer ./. Hofer GmbH — Vertragsverletzung, 84.000 €. LG München I, 12. Zivilkammer. Termin morgen 09:30. 3 offene Punkte: Klageerwiderung heute fällig, Gutachten Dr. Klein fehlt, Vergleich unbestätigt. ⚠️ Notfrist — Einreichung endet um Mitternacht.",
        sources: ["akten/bauer-hofer", "fristen/klageerwiderung", "dokumente/gutachten-klein"],
      },
      {
        question: "Wo widersprechen sich die Schriftsätze der Gegenseite?",
        answer:
          'Schriftsatz S. 3: „keine Kenntnis" vom Vertrag. S. 7: zitiert denselben Vertrag als Beleg. Widerspruch erkannt — Beweiswert geschwächt.',
        sources: ["schriftsatz/gegenseite", "akten/bauer-hofer"],
      },
      {
        question: "Entwirf die Klageerwiderung dafür.",
        answer:
          "Argument 1: Widerspruch S.3 vs S.7 — Beweiswert geschwächt. Argument 2: Vertragskenntnis nach S.7 begründet Leistungspflicht. Antrag: Beweiswürdigung auf Widerspruch stützen.",
        sources: ["zpo/§276", "akten/bauer-hofer"],
      },
    ],
  },
  stats: [
    LANDING.stats[0],
    {
      value: "DE",
      label: "Gebaut für deutsches Recht: BGB, ZPO, HGB, StGB, BRAO",
    },
    LANDING.stats[2],
    LANDING.stats[3],
  ],
  features: [
    LANDING.features[0],
    {
      icon: "CalendarClock",
      color: "amber",
      title: "Fristen automatisch berechnet",
      desc: "Not- und Rechtsmittelfristen nach ZPO und BGB, samt Wochenend- und Feiertagsverschiebung für alle Bundesländer. Die tägliche Übersicht zeigt, was knapp wird.",
    },
    {
      icon: "MessageSquare",
      color: "emerald",
      title: "Unterwegs über WhatsApp",
      desc: "Zeiten buchen, Belege ablegen, Sprachnotizen diktieren. Alles landet in der richtigen Akte, aufbewahrt nach § 147 AO.",
    },
    {
      icon: "ShieldAlert",
      color: "rose",
      title: "Konflikte vor Mandatsannahme",
      desc: "Jede neue Partei wird gegen den gesamten Aktenbestand geprüft, wie es § 43a Abs. 4 BRAO i.V.m. § 3 BORA verlangt. Treffer sehen Sie, bevor Sie das Mandat annehmen.",
    },
    {
      icon: "Calculator",
      color: "blue",
      title: "Leistungen und Honorar",
      desc: "Zeiten und Auslagen erfassen, Honorar nach RVG oder Stundensatz abrechnen, Rechnungen als PDF oder XRechnung versenden und an DATEV übergeben.",
    },
    LANDING.features[5],
  ],
  comparison: [
    LANDING.comparison[0],
    LANDING.comparison[1],
    {
      feature: "Berufsgeheimnis (§ 43a Abs. 2 BRAO)",
      subsumio: "Eigener Server oder EU-Cloud mit Auftragsverarbeitungsvertrag",
      others: "Oft US-Cloud, Auftragsverarbeitung unklar",
    },
    {
      feature: "Deutsches Recht",
      subsumio: "BGB, ZPO, HGB, StGB, BRAO: Fristen und Paragrafen nach deutschem Recht",
      others: "Meist auf US-Recht oder ohne Fundstellenprüfung trainiert",
    },
    LANDING.comparison[4],
  ],
  faq: [
    {
      q: "Wo liegen meine Daten — und wie unterstützt Subsumio die Verschwiegenheit?",
      a: "Sie wählen: Betrieb auf eigener Hardware mit eigenen Schlüsseln oder verwaltete EU-Cloud mit Auftragsverarbeitungsvertrag. Gespeichert werden Ihre Akten in einem Rechenzentrum in der EU. Für eine KI-Antwort geht der benötigte Ausschnitt an den Anbieter des Sprachmodells; er ist im AVV benannt, über EU-Standardvertragsklauseln gebunden und trainiert nicht mit Ihren Daten. Wer auch das ausschließen will, betreibt im Enterprise-Tarif ein eigenes Sprachmodell auf eigener Hardware. Die Architektur ist für Berufsgeheimnisträger gebaut — § 43a Abs. 2 BRAO, § 203 StGB.",
    },
    LANDING.faq[1],
    LANDING.faq[2],
    LANDING.faq[3],
    LANDING.faq[4],
    {
      q: "Wie werden Fristen berechnet?",
      a: "Not- und Berufungsfristen nach ZPO und BGB — mit korrekter Monatsarithmetik (§§ 187 ff. BGB) und Feiertagsverschiebung für Ihr Bundesland. Eingehende Dokumente — etwa per beA — werden auf fristauslösende Ereignisse analysiert. Der tägliche Digest markiert kritische Fristen vor Ablauf.",
    },
  ],
});

// ---------------------------------------------------------------------------
// UI_STRINGS — only the keys with Austrian references differ
// ---------------------------------------------------------------------------

export const UI_STRINGS_DE: Record<string, string> = {
  ...UI_STRINGS,
  footerLegalTagline: "Kanzleisoftware für Deutschland",
  footerHostingLine: "Berufsgeheimnis nach § 43a Abs. 2 BRAO im Blick",
  trustedBy: "Gebaut für Kanzleien in Deutschland",
  trustHeading: "Gebaut auf deutschem Berufsrecht, nicht nachträglich angepasst",
  testimonialsSub: "Echte Stimmen aus deutschen Kanzleien.",
  verticalTrustNote: "EU-Cloud · On-Premise (Enterprise) · DSGVO · § 43a Abs. 2 BRAO",
  downloadHint: "2 Fristen diese Woche — Klageerwiderung Müller am Do",
  gapWarning: "⚠ Termin Do 14 Uhr: Vollmacht fehlt in der Akte",
};

// ---------------------------------------------------------------------------
// Product demo — German matter: Klageerwiderung nach § 276 ZPO
// (Verteidigungsanzeige § 277 ZPO: zwei Wochen; Klageerwiderung weitere zwei
// Wochen). Dates illustrative, the matter is fictional.
// ---------------------------------------------------------------------------

export const PRODUCT_DEMO_DE = deepMerge(PRODUCT_DEMO, {
  ariaLabel:
    "Beispiel aus Subsumio: Frage zur Klageerwiderung, Antwort mit geprüften Fundstellen aus ZPO und Akte, Fristvorschlag im Fristenbuch.",
  user: "RA Schmidt",
  question: "Bis wann muss die Klageerwiderung eingereicht werden?",
  thinking: "Liest beA-Eingang und ZPO …",
  answer: [
    "Nach Verteidigungsanzeige ist die schriftliche Klageerwiderung binnen zwei weiterer Wochen einzureichen (§ 276 Abs. 1 ZPO).",
    "Laut beA-Eingang in der Akte wurde die Klage am 16.09.2026 zugestellt, die Verteidigungsanzeige ging am 30.09.2026 ein.",
    "Fristende ist daher der 14.10.2026. Die Frist ist nicht verlängerbar.",
  ],
  documents: [
    {
      name: "Klage_beA_Eingang.pdf",
      meta: "beA-Zustellung 16.09.2026 · 2 Seiten",
      hit: true,
      kind: "pdf",
    },
    { name: "Klage_Novak_Versicherung.pdf", meta: "Klage · 14 Seiten", hit: true, kind: "pdf" },
    { name: "Vollmacht_Novak.pdf", meta: "Vollmacht · 1 Seite", hit: false, kind: "pdf" },
    {
      name: "Korrespondenz Versicherung AG",
      meta: "E-Mail · 4 Nachrichten",
      hit: false,
      kind: "mail",
    },
    { name: "Polizze_Auszug.pdf", meta: "Beilage ./B · 6 Seiten", hit: false, kind: "pdf" },
  ],
  deadline: {
    title: "Klageerwiderung",
    date: "14.10.2026",
    basis: "§ 276 Abs. 1 ZPO, Verteidigungsanzeige 30.09.2026",
  },
  deadlines: [
    {
      key: "new",
      title: "Klageerwiderung",
      matter: "Novak ./. Versicherung AG · 2026-003",
      status: "Notfrist",
      tone: "warning",
      date: "14.10.2026",
    },
    {
      key: "a",
      title: "Vorfrist Klageerwiderung",
      matter: "Novak ./. Versicherung AG · 2026-003",
      status: "Vorfrist",
      tone: "info",
      date: "07.10.2026",
    },
    {
      key: "b",
      title: "Berufung",
      matter: "Gruber ./. Immo GmbH · 2026-004",
      status: "Ausstehend",
      tone: "default",
      date: "21.10.2026",
    },
    {
      key: "c",
      title: "Gütetermin",
      matter: "Maier ./. Stadt München · 2026-002",
      status: "Termin",
      tone: "default",
      date: "03.12.2026",
    },
  ],
});
