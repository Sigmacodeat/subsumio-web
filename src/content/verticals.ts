import { PROOF } from "./proof-points";
// Subsumio legal funnel content.

export interface VerticalContent {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  painsTitle: string;
  pains: { title: string; desc: string }[];
  demo: {
    windowTitle: string;
    you: string;
    q: string;
    a: string;
    sourcesLabel: string;
    sources: string[];
  };
  featuresTitle: string;
  features: { icon: string; title: string; desc: string }[];
  proofTitle: string;
  proof: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

export const VERTICAL_SLUGS = ["legal"] as const;
export type VerticalSlug = (typeof VERTICAL_SLUGS)[number];

export const VERTICALS: Record<VerticalSlug, VerticalContent> = {
  legal: {
    slug: "legal",
    navLabel: "Kanzleien",
    metaTitle: "Subsumio — Kanzleisoftware Österreich",
    metaDesc:
      "KI-Kanzleisoftware für Anwälte in Österreich: Akten, Fristen nach ZPO und ABGB, KI-Analysen mit seitengenauen Fundstellen. EU-Hosting mit AVV.",
    badge: "Kanzleisoftware für Österreich",
    h1a: "500 Seiten Akte.",
    h1b: "Eine Frage entfernt.",
    sub: "Subsumio ist Kanzleisoftware für Österreich: Akten verwalten, Fristen nach ZPO und ABGB berechnen, KI-Analysen mit seitengenauen Fundstellen erhalten — in der EU-Cloud mit AVV oder On-Premise (Enterprise).",
    painsTitle: "Kommt Ihnen bekannt vor?",
    pains: [
      {
        title: "Aktenwissen begraben in PDFs",
        desc: "Das entscheidende Detail steht auf Seite 347 eines Schriftsatzes, den jemand anderes vor acht Monaten gelesen hat.",
      },
      {
        title: "Wohin gehen die Mandantendaten?",
        desc: "Bei vielen KI-Werkzeugen bleibt unklar, wo Akten verarbeitet werden und wer mitliest. Die Verschwiegenheitspflicht verlangt eine klare Antwort: Hosting in der EU, Auftragsverarbeiter im AVV benannt.",
      },
      {
        title: "Wissen geht mit den Köpfen",
        desc: "Wenn ein erfahrener Anwalt geht, gehen Jahre an Aktenkontext mit — außer das Kanzleiwissen liegt dauerhaft und abfragbar an einem Ort.",
      },
    ],
    demo: {
      windowTitle: "Subsumio — Frage an die Akte",
      you: "Sie",
      q: "Wo widersprechen die Schriftsätze der Gegenseite ihren Zeugenaussagen?",
      a: "3 Widersprüche gefunden:\n\n1. **Lieferdatum** — Klage nennt 12. März; Zeuge K. sagt 'Ende April' (Protokoll S. 14).\n2. **Zahlungsziel** — Schriftsatz vom 9. Jan. behauptet 30 Tage netto; die Vertragsbeilage zeigt 14 Tage.\n3. **Vorherige Mahnung** — die Klagebeantwortung bestreitet jede Mahnung; Beilage B7 dokumentiert eine.\n\n⚠️ Lücke: Die Echtheit von Beilage B7 wurde bisher von keiner Seite thematisiert.",
      sourcesLabel: "Quellen:",
      sources: ["Klage 2026-114", "Beilage B7", "Protokoll Zeuge K."],
    },
    featuresTitle: "Gebaut für die Verschwiegenheitspflicht",
    features: [
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle nach ZPO und ABGB",
        desc: "Berechnet Berufungs-, Rekurs- und Revisionsfristen nach §§ 125 f ZPO und materielle Fristen nach § 902 ABGB — samt Verschiebung bei Samstag, Sonntag und Feiertag und mit Angabe der Norm. Überfällige und kritische Fristen kommen täglich per E-Mail.",
      },
      {
        icon: "MessageSquare",
        title: "Assistent auf WhatsApp",
        desc: "Anwälte erfassen Zeiten, Notizen, Aufgaben, Fristen, Barauslagen, Fragen, PDFs, Fotos und Sprachnotizen direkt vom Handy. Subsumio legt alles im Kanzleiwissen ab und ordnet Dateien über das Aktenkürzel in der Beschriftung der richtigen Akte zu.",
      },
      {
        icon: "FolderOpen",
        title: "Dokumentenablage mit Herkunftsnachweis",
        desc: "Aktendokumente, WhatsApp-Dateien und Beweismittel werden mit Prüfsumme, Quelle und Größe abgelegt — auf EU-Servern (Hetzner) oder On-Premise (Enterprise).",
      },
      {
        icon: "Mail",
        title: "E-Mail-Import und Word-Add-in",
        desc: "Ihr Postfach wird per IMAP abgerufen; E-Mails landen in der passenden Akte und werden durchsuchbar. Im Word-Add-in arbeiten Sie direkt im Dokument; Unterschriften holen Sie über DocuSign ein.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung (§ 10 RAO)",
        desc: "Prüft jeden neuen Mandanten oder Gegner serverseitig gegen den gesamten Aktenbestand und meldet Interessenkonflikte, bevor das Mandat angenommen wird. Unterstützt Ihre Prüfung nach § 10 RAO.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Barauslagen & Honorarnoten",
        desc: "Minuten nach Anwalt und Tätigkeit buchen, verrechenbare Barauslagen erfassen, Honorarnoten aus offenen Leistungen erstellen, Einträge als abgerechnet markieren und als CSV exportieren.",
      },
      {
        icon: "Landmark",
        title: "Judikatur aus dem RIS",
        desc: "Recherche in der Judikatur des RIS (OGH, OLG, VwGH, VfGH) — relevante Entscheidungen übernehmen Sie mit einem Klick zitierfähig in die Akte.",
      },
      {
        icon: "Shield",
        title: "EU-Cloud oder On-Premise",
        desc: "Standard ist die EU-Cloud (Hetzner) mit AVV; die Auftragsverarbeiter sind dort benannt. Im Enterprise-Tarif läuft Subsumio On-Premise auf Ihrer eigenen Hardware.",
      },
      {
        icon: "Zap",
        title: "Arbeiten ohne Verbindung",
        desc: "Akten, Kontakte, Fristen, Honorarnoten, Dokumente und Recherche bleiben bei Verbindungsabbruch lokal verfügbar; Änderungen werden übertragen, sobald die Verbindung wieder steht.",
      },
      {
        icon: "Brain",
        title: "Widersprüche erkennen",
        desc: "Die nächtliche Prüfung findet widersprüchliche Aussagen über Schriftsätze, Beilagen und Protokolle hinweg und nennt beide Stellen.",
      },
      {
        icon: "Search",
        title: "Die anwaltliche Prüfung bleibt",
        desc: "KI-Antworten sind als solche gekennzeichnet. Subsumio bringt nichts ein und versendet nichts von selbst — Freigabe und rechtliche Beurteilung bleiben bei Ihnen.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Mandat",
        desc: "Zugriffsrechte gelten pro Mandat und Nutzer. Die Trennung zwischen Akten und Teams wird automatisiert getestet.",
      },
    ],
    proofTitle: "Offen gemessen",
    proof: PROOF.recall8.plain,
    faq: [
      {
        q: "Gibt Subsumio Rechtsberatung?",
        a: "Nein. Subsumio ordnet Ihre Dokumente und Notizen und fasst sie zusammen. Die rechtliche Beurteilung bleibt bei den Anwältinnen und Anwälten — das Kanzleiwissen hilft, dass dabei weniger aus der Akte übersehen wird.",
      },
      {
        q: "Kann ich ohne Internetverbindung arbeiten?",
        a: "Die wichtigsten Arbeitsbereiche bleiben bei Verbindungsabbruch lokal verfügbar; Änderungen werden nachgetragen, sobald die Verbindung wieder steht. KI-Antworten brauchen eine Verbindung zum Sprachmodell — im Enterprise-Tarif kann das ein eigenes Modell im Kanzleinetz sein.",
      },
      {
        q: "Wie viel Daten kann ich speichern?",
        a: "Der Solo-Tarif enthält 75 GB verwalteten Cloud-Speicher. Im Enterprise-Tarif werden Speichermengen und Aufbewahrungsregeln individuell vereinbart; On-Premise nutzen Sie Ihren eigenen Speicher.",
      },
      {
        q: "Was ist mit DSGVO und Berufsrecht?",
        a: "Gehostete Tarife kommen mit EU-Hosting und AVV nach Art. 28 DSGVO; die Auftragsverarbeiter sind dort benannt, ergänzt um eine Verschwiegenheitsverpflichtung im Sinn des § 9 Abs. 2 RAO. On-Premise (Enterprise) bleiben die Daten in Ihrem Netzwerk. Ihr Datenschutzbeauftragter kann gern direkt mit uns sprechen.",
      },
    ],
    ctaTitle: "Die Akte kennt die Antwort. Jetzt auch Sie.",
    ctaSub:
      "Starten Sie mit einem abgeschlossenen Mandat als Pilot. 14 Tage testen, keine Kreditkarte.",
    ctaButton: "14 Tage kostenlos testen",
  },
};
