import { PROOF } from "./proof-points";
export interface SolutionContent {
  slug: string;
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  painsTitle: string;
  pains: { title: string; desc: string }[];
  featuresTitle: string;
  features: { icon: string; title: string; desc: string }[];
  proofTitle: string;
  proof: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

export type SolutionSlug = "law-firms" | "solo" | "in-house";

export const SOLUTION_SLUGS: SolutionSlug[] = ["law-firms", "solo", "in-house"];

/** Short cross-link labels for the "not quite right for you?" switcher on every
 *  /solutions/* page — same icons as the header mega-nav (site.ts), kept here
 *  since this is the solutions domain file. */
export const SOLUTION_CROSS_LINKS: Record<SolutionSlug, { label: string; icon: string }> = {
  "law-firms": {
    label: "Für Kanzleien",
    icon: "Landmark",
  },
  solo: {
    label: "Für Einzelanwälte",
    icon: "User",
  },
  "in-house": {
    label: "Für Rechtsabteilungen",
    icon: "Building2",
  },
};

export const SOLUTIONS: Record<SolutionSlug, SolutionContent> = {
  "law-firms": {
    slug: "law-firms",
    metaTitle: "Subsumio für Kanzleien — KI-Kanzleisoftware mit Fundstellen",
    metaDesc:
      "Gemeinsames Kanzleiwissen, Fristenkontrolle nach ZPO und ABGB, KI-Analysen mit Fundstellen, Kollisionsprüfung, Assistent auf WhatsApp — EU-Hosting mit AVV.",
    badge: "Für Kanzleien",
    h1a: "Das Wissen Ihrer Kanzlei,",
    h1b: "endlich abfragbar.",
    sub: "Subsumio macht Akten, Schriftsätze und Fristen aus vielen Jahren zu einem Kanzleiwissen, das Ihr gesamtes Team befragen kann — mit Fundstellen und mit Zugriffsrechten pro Akte.",
    painsTitle: "Was Kanzleipartner nachts wach hält",
    pains: [
      {
        title: "Wissen in Silos",
        desc: "Jeder Anwalt trägt sein Aktenwissen im Kopf und im Postfach. Wenn jemand geht, gehen Jahre an Kontext mit.",
      },
      {
        title: "Fristenrisiko",
        desc: "Fristen werden per Hand oder in Excel berechnet. Eine versäumte Frist, und aus dem Mandat wird ein Haftpflichtfall.",
      },
      {
        title: "Wohin gehen die Mandantendaten?",
        desc: "Bei vielen KI-Werkzeugen bleibt unklar, wo Akten verarbeitet werden und wer mitliest. Subsumio wird in der EU gehostet; die Auftragsverarbeiter sind im AVV benannt.",
      },
    ],
    featuresTitle: "Für die ganze Kanzlei gebaut",
    features: [
      {
        icon: "Brain",
        title: "Gemeinsames Kanzleiwissen",
        desc: "Akten, Schriftsätze, E-Mails und Fristen sind erfasst und für alle Berechtigten abfragbar. Neue Konzipientinnen und Konzipienten finden sich schneller in laufende Akten ein.",
      },
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle nach ZPO und ABGB",
        desc: "Berufungs-, Rekurs- und Revisionsfristen nach §§ 125 f ZPO, materielle Fristen nach § 902 ABGB — samt Verschiebung bei Samstag, Sonntag und Feiertag und mit Angabe der Norm.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung (§ 10 RAO)",
        desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft, bevor das Mandat angenommen wird. Unterstützt Ihre Prüfung nach § 10 RAO.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Mandat",
        desc: "Zugriffsrechte gelten pro Akte und Nutzer. Die Trennung zwischen Akten und Teams wird automatisiert getestet.",
      },
      {
        icon: "MessageSquare",
        title: "Assistent auf WhatsApp",
        desc: "Anwälte buchen Zeiten, legen Dokumente ab und schicken Sprachnotizen vom Handy. Nach der Bestätigung liegt alles in der richtigen Akte.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Barauslagen & Honorarnoten",
        desc: "Minuten nach Anwalt und Tätigkeit buchen, Honorarnoten aus offenen Leistungen erstellen und als CSV exportieren.",
      },
      {
        icon: "ShieldCheck",
        title: "EU-Cloud oder On-Premise",
        desc: "EU-Cloud mit AVV, die Auftragsverarbeiter sind dort benannt. Im Enterprise-Tarif läuft Subsumio On-Premise auf Ihrer eigenen Hardware.",
      },
      {
        icon: "Search",
        title: "Antworten mit Fundstelle",
        desc: "Antworten nennen die Stelle in der Akte, auf die sie sich stützen. Sie lesen nach, bevor etwas in den Schriftsatz geht.",
      },
    ],
    proofTitle: "Offen gemessen",
    proof: PROOF.recall8.plain,
    faq: [
      {
        q: "Wie lange dauert die Einführung?",
        a: "Wir empfehlen, mit einer abgeschlossenen Akte als Pilot zu beginnen. Danach übernimmt Ihr Team bestehende Akten im eigenen Tempo; im Kanzlei-Tarif steht dafür der Massenimport zur Verfügung.",
      },
      {
        q: "Können wir auf eigenen Servern laufen?",
        a: "Ja, im Enterprise-Tarif. Subsumio läuft dann On-Premise auf Ihrer Hardware — auf Wunsch mit eigenem Sprachmodell, sodass nichts Ihr Netzwerk verlässt.",
      },
      {
        q: "Was ist mit DSGVO und Berufsrecht?",
        a: "Gehostete Tarife kommen mit EU-Hosting und AVV nach Art. 28 DSGVO; die Auftragsverarbeiter sind dort benannt, ergänzt um eine Verschwiegenheitsverpflichtung im Sinn des § 9 Abs. 2 RAO. On-Premise (Enterprise) bleiben die Daten in Ihrem Netzwerk.",
      },
    ],
    ctaTitle: "Starten Sie mit einer abgeschlossenen Akte als Pilot.",
    ctaSub: "14 Tage testen, keine Kreditkarte.",
    ctaButton: "Demo vereinbaren",
  },
  solo: {
    slug: "solo",
    metaTitle: "Subsumio für Einzelanwälte — KI-Kanzleisoftware ohne eigene IT",
    metaDesc:
      "KI-Kanzleisoftware für Einzelkanzleien: Kanzleiwissen, Fristenkontrolle nach ZPO und ABGB, KI-Antworten mit Fundstellen, Assistent auf WhatsApp. EU-Hosting, keine eigene IT.",
    badge: "Für Einzelanwälte",
    h1a: "Ihre gesamte Kanzlei,",
    h1b: "eine Frage entfernt.",
    sub: "Subsumio gibt einer Einzelkanzlei, wofür Großkanzleien eigene Teams haben: Dokumente, Fristen und Notizen erfasst und abfragbar — mit Fundstellen, die Sie überprüfen können.",
    painsTitle: "Der Alltag in der Einzelkanzlei",
    pains: [
      {
        title: "Sie machen alles selbst",
        desc: "Keine Konzipienten für die Recherche, keine IT-Abteilung für die Technik. Jede Minute weniger Verwaltung ist eine Minute für Mandanten.",
      },
      {
        title: "Fristen sind existenziell",
        desc: "Niemand rechnet Ihre Fristen gegen. Sie brauchen eine Fristenberechnung, die sich an das Gesetz hält und die Norm dazu nennt.",
      },
      {
        title: "Verwaltung frisst Ihren Tag",
        desc: "Zeiterfassung, Honorarnoten, Dokumentenablage — die Kanzleiverwaltung kostet verrechenbare Stunden.",
      },
    ],
    featuresTitle: "Was eine Einzelkanzlei braucht",
    features: [
      {
        icon: "Brain",
        title: "Ihr Kanzleiwissen",
        desc: "Akten, E-Mails, PDFs und Sprachnotizen hochladen. Subsumio liest alles ein und antwortet in normaler Sprache — mit seitengenauen Fundstellen.",
      },
      {
        icon: "CalendarClock",
        title: "Fristen, automatisch berechnet",
        desc: "Fristen nach §§ 125, 126 ZPO samt Verschiebung bei Samstag, Sonntag und Feiertag. Kritische Fristen kommen täglich per E-Mail.",
      },
      {
        icon: "MessageSquare",
        title: "Assistent auf WhatsApp",
        desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy schicken. Sie bestätigen, dann liegt es in der richtigen Akte.",
      },
      {
        icon: "Calculator",
        title: "Zeiten & Honorarnoten",
        desc: "Minuten buchen, Honorarnoten aus offenen Leistungen erstellen und als CSV exportieren.",
      },
      {
        icon: "Zap",
        title: "Kein Server, keine IT",
        desc: "Anmelden und loslegen: Subsumio wird vollständig für Sie betrieben. Sie brauchen weder eigene Server noch technische Vorkenntnisse.",
      },
      {
        icon: "ShieldCheck",
        title: "Vertraulichkeit von Anfang an",
        desc: "In der EU gehostet, verschlüsselt übertragen und gespeichert. Ihre Mandantendaten werden nicht zum Training von Sprachmodellen verwendet; die Auftragsverarbeiter sind im AVV benannt.",
      },
    ],
    proofTitle: "Dieselbe Suche wie im Kanzlei-Tarif",
    proof: `Solo nutzt dieselbe Suche wie der Kanzlei-Tarif. ${PROOF.recall8.plain}`,
    faq: [
      {
        q: "Muss ich technisch versiert sein?",
        a: "Nein. Anmelden, Dokumente hochladen, Fragen stellen. Wenn Sie WhatsApp und einen Browser bedienen können, können Sie Subsumio nutzen.",
      },
      {
        q: "Kann ich mir das als Einzelanwalt leisten?",
        a: "Solo kostet 249 €/Monat und ist monatlich kündbar. Ein Nutzer, eigene Akten und Dokumentanalyse mit Fundstellen sind enthalten; Massenimport und Team-Verwaltung beginnen im Kanzlei-Tarif.",
      },
      {
        q: "Was, wenn ich später wachse?",
        a: "Der Wechsel in den Kanzlei-Tarif (1.499 €/Monat, 5 Nutzer inklusive) ist jederzeit möglich. Ihr Kanzleiwissen und alle Akten bleiben erhalten — ohne Umzug der Daten.",
      },
    ],
    ctaTitle: "Ihre Kanzlei. Ihr Kanzleiwissen.",
    ctaSub: "14 Tage testen, keine Kreditkarte. Kein Server, keine eigene IT.",
    ctaButton: "14 Tage kostenlos testen",
  },
  "in-house": {
    slug: "in-house",
    metaTitle: "Subsumio für Rechtsabteilungen — Verträge und Rechtswissen abfragbar",
    metaDesc:
      "KI-Software für Rechtsabteilungen: Vertragsanalyse, Compliance-Übersicht, Wissensmanagement mit Fundstellen. EU-Cloud mit AVV oder On-Premise (Enterprise).",
    badge: "Für Rechtsabteilungen",
    h1a: "Ihre Rechtsabteilung,",
    h1b: "mit Gedächtnis.",
    sub: "Subsumio macht Verträge, Compliance-Unterlagen und Rechtsgutachten Ihrer Rechtsabteilung abfragbar und nachvollziehbar — Antworten mit Fundstellen statt langer Dokumentensuche.",
    painsTitle: "Der Alltag in der Rechtsabteilung",
    pains: [
      {
        title: "Vertrags-Chaos",
        desc: "Hunderte Verträge über Geschäftsbereiche hinweg, jeder mit anderen Verlängerungsterminen, Haftungsgrenzen und Kündigungsfristen. Den einen zu finden, der zählt, kostet Zeit.",
      },
      {
        title: "Compliance-Druck",
        desc: "KI-Verordnung, DSGVO, branchenspezifische Regeln — die Anforderungen ändern sich schneller, als ein Team sie händisch verfolgen kann.",
      },
      {
        title: "Externe Anwaltskosten",
        desc: "Jede Anfrage an eine externe Kanzlei kostet Honorar. Routinefragen soll Ihr Team intern beantworten können.",
      },
    ],
    featuresTitle: "Für die Arbeit der Rechtsabteilung gebaut",
    features: [
      {
        icon: "FolderOpen",
        title: "Vertragsanalyse",
        desc: "Verträge in großer Zahl auswerten: Verlängerungstermine, Haftungsgrenzen, Kündigungsfristen und Auffälligkeiten über den gesamten Vertragsbestand.",
      },
      {
        icon: "ShieldAlert",
        title: "Compliance-Übersicht",
        desc: "Regulatorische Anforderungen den internen Richtlinien zuordnen, Lücken verfolgen, Fristen markieren — mit Protokoll für Aufsicht und Prüfer.",
      },
      {
        icon: "Brain",
        title: "Institutionelles Gedächtnis",
        desc: "Rechtsgutachten, Aktenvermerke und Antworten externer Kanzleien sind erfasst und abfragbar. Neue Teammitglieder finden sich schneller ein.",
      },
      {
        icon: "Search",
        title: "Antwort vor externer Anfrage",
        desc: "Erst Subsumio fragen: Liegt die Antwort in Ihren Dokumenten, sparen Sie das externe Honorar. Wenn nicht, wissen Sie, was fehlt.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Bereich",
        desc: "Zugriffsrechte pro Geschäftsbereich und Nutzer — Arbeitsrecht, Gesellschaftsrecht und Immaterialgüterrecht sehen nur, was sie sehen sollen.",
      },
      {
        icon: "ShieldCheck",
        title: "Nachvollziehbar für die Prüfung",
        desc: "Anfragen und Antworten werden samt Quellen protokolliert. Fragt die Revision, wie Sie zu einem Ergebnis gekommen sind, liegt der Weg dorthin vor.",
      },
    ],
    proofTitle: "Offen gemessen",
    proof: PROOF.recall8.plain,
    faq: [
      {
        q: "Wie kommen unsere Dokumente in Subsumio?",
        a: "Per Upload oder über Ihr verbundenes E-Mail-Postfach (IMAP); einzelne E-Mails auch als .eml- oder .msg-Datei. Weitere Wege — etwa die Übernahme aus Ihrem Dokumentenmanagement — klären wir gemeinsam im Pilot.",
      },
      {
        q: "Können wir kontrollieren, welches Team was sieht?",
        a: "Ja. Zugriffsrechte gelten pro Akte und Nutzer: Das Arbeitsrecht-Team sieht die Akten des Gesellschaftsrecht-Teams nicht und umgekehrt. Diese Trennung wird automatisiert getestet.",
      },
      {
        q: "Was ist mit der KI-Verordnung und internen KI-Richtlinien?",
        a: "KI-Antworten sind als solche gekennzeichnet, nennen ihre Quellen und weisen aus, was in den Unterlagen fehlt; Anfragen und Antworten werden protokolliert. Das unterstützt Sie bei den Transparenzpflichten nach Art. 50 der KI-Verordnung.",
      },
    ],
    ctaTitle: "Machen Sie das Wissen Ihrer Rechtsabteilung abfragbar.",
    ctaSub:
      "Starten Sie mit einem Vertragsbestand als Pilot. EU-Cloud mit AVV oder On-Premise im Enterprise-Tarif.",
    ctaButton: "Demo vereinbaren",
  },
};
