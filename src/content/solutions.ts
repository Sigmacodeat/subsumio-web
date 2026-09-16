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
    label: "Für Justiziariate",
    icon: "Building2",
  },
};

export const SOLUTIONS: Record<SolutionSlug, SolutionContent> = {
  "law-firms": {
    slug: "law-firms",
    metaTitle: "Subsumio für Kanzleien — KI-Kanzleisoftware mit Fundstellen",
    metaDesc:
      "Gemeinsames Kanzlei-Brain, automatische Fristenkontrolle, KI-Analysen mit Zitaten, Kollisionsprüfung, WhatsApp-Copilot — DSGVO-konform, EU-gehostet.",
    badge: "Für etablierte Kanzleien",
    h1a: "Das Wissen deiner Kanzlei,",
    h1b: "endlich abfragbar.",
    sub: "Subsumio macht Jahrzehnte an Akten, Schriftsätzen und Fristen zu einem belegten Workspace, den dein gesamtes Team befragen kann — mit Vertraulichkeit per Architektur.",
    painsTitle: "Was Kanzleipartner nachts wach hält",
    pains: [
      {
        title: "Wissen in Silos",
        desc: "Jeder Anwalt trägt sein Aktenwissen im Kopf und im Postfach. Wenn jemand geht, gehen Jahre an Kontext mit.",
      },
      {
        title: "Fristenrisiko",
        desc: "Notfristen per Hand oder Excel berechnet. Eine versäumte Notfrist und der Haftpflichtfall ist real.",
      },
      {
        title: "US-Clouds sind ein No-Go",
        desc: "Mandantenakten in einem US-gehosteten KI-Tool? Verschwiegenheitspflicht und Mandanten sagen Nein.",
      },
    ],
    featuresTitle: "Für kanzleiweite Wirkung gebaut",
    features: [
      {
        icon: "Brain",
        title: "Gemeinsames Kanzlei-Brain",
        desc: "Jede Akte, jeder Schriftsatz, jede Mail und Frist indiziert und von jedem Anwalt der Kanzlei abfragbar. Neue Mitarbeiter sind in Minuten statt Monaten eingearbeitet.",
      },
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle nach ZPO & ABGB",
        desc: "Notfristen und Berufungsfristen mit korrekter Monatsarithmetik und Wochenend-Verschiebung — inkl. Normzitat.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung (§ 10 RAO)",
        desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft, bevor das Mandat angenommen wird. Deckt § 10 RAO ab.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Mandat",
        desc: "Zugriff pro Akte und Nutzer gescoped — fuzz-getestet, null Leaks zwischen Akten oder Teams.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp-Kanzlei-Copilot",
        desc: "Anwälte buchen Zeiten, legen Dokumente ab, schicken Sprachnotizen vom Handy. Alles landet in der richtigen Akte.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Auslagen, Rechnungen & Buchhaltung",
        desc: "Minuten nach Anwalt/Tätigkeit buchen, Rechnungen aus offener Arbeit erstellen, buchhaltungsfertig exportieren.",
      },
      {
        icon: "ShieldCheck",
        title: "Dein Server, deine Jurisdiktion",
        desc: "Self-hosted auf Kanzlei-Hardware oder EU-Cloud mit AVV. Mandantendaten verlassen nie deine Kontrolle.",
      },
      {
        icon: "Search",
        title: "Jede Behauptung belegt",
        desc: "Antworten zitieren die exakten Fundstellen. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht.",
      },
    ],
    proofTitle: "Engine-Klasse Retrieval, kein Chat-Wrapper",
    proof: `Der Retrieval-Kern erreicht ${PROOF.recall8.full} mit Hybrid-Suche und Wissensgraph — auf Infrastruktur, die deine IT komplett steuert.`,
    faq: [
      {
        q: "Wie lange dauert die Einführung?",
        a: "Ein Pilot mit einer abgeschlossenen Akte dauert unter einer Stunde. Das volle Kanzlei-Rollout dauert typischerweise eine Woche — dein Team indiziert bestehende Akten im eigenen Tempo.",
      },
      {
        q: "Können wir auf eigenen Servern laufen?",
        a: "Ja. Die volle Engine läuft self-hosted auf Kanzlei-Hardware mit lokalem Speicher. Enterprise-Pläne unterstützen On-Prem mit eigenem LLM-Gateway.",
      },
      {
        q: "Was ist mit DSGVO und Berufsrecht?",
        a: "Self-hosted heißt: Daten verlassen deine Infrastruktur nicht. Gehostete Pläne kommen mit EU-Hosting und AVV. Wir sprechen die Sprache deines Datenschutzbeauftragten.",
      },
      {
        q: "Was unterscheidet das von Harvey?",
        a: "Harvey ist exzellent — und läuft auf fremder Cloud und fremdem Modell. Subsumio liefert dieselbe Synthese-Qualität auf Infrastruktur, die DU kontrollierst, mit einem WhatsApp-Copilot, den deine Anwälte täglich nutzen.",
      },
    ],
    ctaTitle: "Starte mit einer abgeschlossenen Akte als Pilot.",
    ctaSub: "Keine Mandantendaten müssen das Haus verlassen. Drei Minuten bis zur ersten Antwort.",
    ctaButton: "Demo vereinbaren",
  },
  solo: {
    slug: "solo",
    metaTitle: "Subsumio für Einzelanwälte — KI-Anwaltssoftware, keine IT nötig",
    metaDesc:
      "KI-Anwaltssoftware für Einzelkanzleien: Akten-Brain, automatische Fristenkontrolle, belegte KI-Antworten, WhatsApp-Copilot. EU-gehostet, kein IT-Aufwand.",
    badge: "Für Einzelanwälte",
    h1a: "Deine gesamte Praxis,",
    h1b: "eine Frage entfernt.",
    sub: "Subsumio gibt einem Einzelanwalt, was das Wissens-Team einer Großkanzlei hätte: jedes Dokument, jede Frist und Notiz indiziert und abfragbar — mit Zitaten, die du überprüfen kannst.",
    painsTitle: "Der Alltag des Einzelanwalts",
    pains: [
      {
        title: "Du bist das Wissens-Team",
        desc: "Keine Associates für Recherche, keine IT-Abteilung für Infrastruktur. Jede gesparte Admin-Minute ist eine Minute für Mandanten.",
      },
      {
        title: "Fristen sind existentiell",
        desc: "Eine versäumte Notfrist und der Haftpflichtfall ist real. Du brauchst Fristenberechnung, die nach Gesetz korrekt ist, nicht nach Bauchgefühl.",
      },
      {
        title: "Admin frisst deinen Tag",
        desc: "Zeitbuchung, Rechnungen, Dokumentenablage — der Overhead der Praxisführung stiehlt abrechenbare Stunden.",
      },
    ],
    featuresTitle: "Alles, was eine Einzelpraxis braucht",
    features: [
      {
        icon: "Brain",
        title: "Dein Akten-Brain",
        desc: "Akten, Mails, PDFs, Sprachnotizen hochladen. Subsumio indiziert alles und antwortet in normaler Sprache — mit seitengenauen Zitaten.",
      },
      {
        icon: "CalendarClock",
        title: "Fristen, automatisch",
        desc: "Notfristen nach ZPO/ABGB mit korrekter Arithmetik und Wochenend-Verschiebung. Täglicher E-Mail-Digest für kritische Fristen.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp-Copilot",
        desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy. Alles landet in der richtigen Akte — ohne App-Wechsel.",
      },
      {
        icon: "Calculator",
        title: "Zeiten & Rechnungen",
        desc: "Minuten buchen, Rechnungen aus offener Arbeit erstellen, buchhaltungsfertig exportieren. Admin in Sekunden, nicht Stunden.",
      },
      {
        icon: "Zap",
        title: "Kein Server, keine IT",
        desc: "Anmelden, Brain läuft — voll verwaltet, keine API-Keys, keine Infrastruktur. Du fokussierst dich auf Recht, nicht auf Sysadmin.",
      },
      {
        icon: "ShieldCheck",
        title: "Vertraulichkeit by Design",
        desc: "EU-gehostet mit Verschlüsselung pro Kunde. Deine Mandantendaten werden nie zum Training geteilter Modelle genutzt. Self-Hosting optional.",
      },
    ],
    proofTitle: "Großkanzlei-Fähigkeit, Einzelanwalt-Preis",
    proof: `Dieselbe Retrieval-Engine, die etablierte Kanzleien bedient — ${PROOF.recall8.full}, Hybrid-Suche, Wissensgraph — zu einem Preis, den ein Einzelanwalt mit der ersten gesparten Stunde rechtfertigen kann.`,
    faq: [
      {
        q: "Muss ich technisch versiert sein?",
        a: "Nein. Anmelden, Dokumente hochladen, Fragen stellen. Wenn du WhatsApp und einen Browser bedienen kannst, kannst du Subsumio nutzen.",
      },
      {
        q: "Kann ich mir das als Einzelanwalt leisten?",
        a: "Solo kostet 249 €/Monat und ist monatlich kündbar. Ein Nutzer, eigene Akten und belegte Dokumentanalyse sind enthalten; Massen-Ingest und Team-Administration beginnen im Kanzlei-Tarif.",
      },
      {
        q: "Was, wenn ich später wachse?",
        a: "Upgraden auf Team jederzeit möglich. Dein Brain und alle indizierten Daten bleiben — keine Migration, kein Downtime.",
      },
    ],
    ctaTitle: "Deine Praxis. Dein Brain.",
    ctaSub:
      "Drei Minuten bis zur ersten belegten Antwort. Keine Kreditkarte, kein Server, keine IT.",
    ctaButton: "14 Tage kostenlos testen",
  },
  "in-house": {
    slug: "in-house",
    metaTitle: "Subsumio für Justiziariate — Legal Ops mit audit-ready Gedächtnis",
    metaDesc:
      "KI-Kanzleisoftware für Justiziariate: Vertragsanalyse, Compliance-Tracking, Wissensmanagement mit Zitaten. EU-gehostet oder self-hosted.",
    badge: "Für Justiziariate und Rechtsabteilungen",
    h1a: "Deine Rechtsabteilung,",
    h1b: "mit Gedächtnis.",
    sub: "Subsumio gibt Justiziariaten, was sie nie hatten: jeden Vertrag, jedes Compliance-Dokument und jede Rechtsmeinung indiziert, abfragbar und audit-fähig — belegte Antworten in Sekunden statt tagelanger Dokumentensuche.",
    painsTitle: "Der Justiziariats-Alltag",
    pains: [
      {
        title: "Vertrags-Chaos",
        desc: "Hunderte Verträge über Geschäftsbereiche hinweg, jeder mit anderen Verlängerungsdaten, Haftungsgrenzen und Kündigungsfristen. Den einen finden, der zählt, dauert Tage.",
      },
      {
        title: "Compliance-Druck",
        desc: "AI Act, DSGVO, branchenspezifische Regeln — die Compliance-Landschaft ändert sich schneller, als jedes Team manuell verfolgen kann.",
      },
      {
        title: "Externe Anwaltskosten",
        desc: "Jede externe Rechtsfrage kostet Tausende. Dein Team muss die routinemäßigen intern beantworten, bevor sie externe Rechnungen werden.",
      },
    ],
    featuresTitle: "Für Legal Operations gebaut",
    features: [
      {
        icon: "FolderOpen",
        title: "Vertrags-Intelligenz",
        desc: "Massenanalyse von Verträgen: Verlängerungsdaten, Haftungsgrenzen, Kündigungsfristen und Anomalien über das gesamte Portfolio.",
      },
      {
        icon: "ShieldAlert",
        title: "Compliance-Tracking",
        desc: "Regulatorische Anforderungen auf interne Richtlinien mappen. Lücken tracken, Fristen flaggen, Audit-Trail für Aufsicht und Regulierer.",
      },
      {
        icon: "Brain",
        title: "Institutionelles Gedächtnis",
        desc: "Jede Rechtsmeinung, jedes Memo und jede externe Anwaltsantwort indiziert und abfragbar. Neue Teammitglieder in Minuten up to speed.",
      },
      {
        icon: "Search",
        title: "Antwort vor externer Anfrage",
        desc: "Erst Subsumio fragen — wenn die Antwort in deinen Dokumenten liegt, sparst du die externe Anwaltsrechnung. Wenn nicht, weißt du genau, was fehlt.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Bereich",
        desc: "Zugriff pro Geschäftsbereich und Nutzer — HR-Recht, M&A-Recht, IP-Recht sehen nur, was sie sollen.",
      },
      {
        icon: "ShieldCheck",
        title: "Audit-ready by Design",
        desc: "Jede Anfrage und Antwort mit Quellen protokolliert. Wenn der Auditor fragt: 'Wie bist du zu diesem Schluss gekommen?', ist die Spur da.",
      },
    ],
    proofTitle: "Von reaktiv zu proaktiv",
    proof: `Der Retrieval-Kern erreicht ${PROOF.recall8.full} — wenn du fragst 'welche Verträge haben automatische Verlängerung im Q3?', bekommst du die komplette Antwort, keine Teilmenge.`,
    faq: [
      {
        q: "Wie integriert das in unser DMS?",
        a: "Subsumio importiert aus Shared Drives, SharePoint und via API. Dokument-Metadaten (Autor, Datum, Akte) bleiben beim Indizieren erhalten.",
      },
      {
        q: "Können wir kontrollieren, welches Team was sieht?",
        a: "Ja. Zugriff ist pro Akte und Nutzer gescoped. HR-Recht kann M&A-Recht nicht sehen und umgekehrt — fuzz-getestet, null Leaks.",
      },
      {
        q: "Was ist mit dem AI Act und interner AI-Governance?",
        a: "Subsumio liefert Quellzitate für jede Antwort, Gap-Analyse für Transparenz und vollständige Audit-Logs. Das aligniert mit AI-Act-Transparenzanforderungen für interne Tools.",
      },
    ],
    ctaTitle: "Gib deinem Rechtsteam eine Antwortmaschine.",
    ctaSub:
      "Starte mit einem Vertragsportfolio als Pilot. Keine Daten müssen deine Infrastruktur verlassen.",
    ctaButton: "Demo vereinbaren",
  },
};
