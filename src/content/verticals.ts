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
      "KI-Kanzleisoftware für Anwälte in Österreich: Akten, Fristen nach ZPO/ABGB, KI-Analysen mit seitengenauen Zitaten. DSGVO-konform, EU-gehostet.",
    badge: "Kanzleisoftware für Österreich",
    h1a: "500 Seiten Akte.",
    h1b: "Eine Frage entfernt.",
    sub: "Subsumio ist Kanzleisoftware für Österreich: Akten verwalten, Fristen nach ZPO/ABGB automatisieren, KI-Analysen mit seitengenauen Zitaten erhalten — DSGVO-konform, EU-gehostet oder self-hosted.",
    painsTitle: "Kommt dir bekannt vor?",
    pains: [
      {
        title: "Aktenwissen begraben in PDFs",
        desc: "Das entscheidende Detail steht auf Seite 347 eines Schriftsatzes, den jemand anderes vor acht Monaten gelesen hat.",
      },
      {
        title: "US-Clouds sind ein No-Go",
        desc: "Mandantenakten in einem US-gehosteten KI-Tool? Verschwiegenheitspflicht und Mandanten sagen Nein.",
      },
      {
        title: "Wissen geht mit den Köpfen",
        desc: "Wenn ein erfahrener Anwalt geht, gehen Jahre an Aktenkontext mit — außer das Kanzleiwissen liegt dauerhaft und abfragbar an einem Ort.",
      },
    ],
    demo: {
      windowTitle: "subsumio — case brain",
      you: "Du",
      q: "Wo widersprechen die Schriftsätze der Gegenseite ihren Zeugenaussagen?",
      a: "3 Widersprüche gefunden:\n\n1. **Lieferdatum** — Klageschrift nennt 12. März; Zeuge K. sagt 'Ende April' (Protokoll S. 14).\n2. **Zahlungsziel** — Schriftsatz vom 9. Jan. behauptet 30 Tage netto; die Vertragsanlage zeigt 14 Tage.\n3. **Vorherige Mahnung** — Verteidigung bestreitet jede Mahnung; Anlage B7 dokumentiert eine.\n\n⚠️ Lücke: Die Echtheit von Anlage B7 wurde bisher von keiner Seite thematisiert.",
      sourcesLabel: "Quellen:",
      sources: ["akte/klage-2026-114", "anlagen/b7", "protokolle/zeuge-k"],
    },
    featuresTitle: "Gebaut für Verschwiegenheit zuerst",
    features: [
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle nach ZPO / ABGB",
        desc: "Berechnet Notfristen, Berufungs- und Beschwerdefristen mit korrekter Monatsarithmetik (ABGB) und Wochenend-Verschiebung (ZPO) — inkl. Normzitat. Täglicher E-Mail-Digest für überfällige und kritische Fristen.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp-Kanzlei-Copilot",
        desc: "Anwälte erfassen Zeiten, Notizen, Aufgaben, Fristen, Auslagen, Fragen, PDFs, Fotos und Sprachnotizen direkt vom Handy. Subsumio speichert alles im Brain und ordnet Medien per Aktenzeichen in der Beschriftung der richtigen Akte zu.",
      },
      {
        icon: "FolderOpen",
        title: "Dokumenten-Vault mit dauerhaftem Speicher",
        desc: "Aktendokumente, WhatsApp-Medien und Beweise liegen im Vault mit Hash, Quelle, Größe und Storage-Metadaten — lokal auf Hetzner EU-Servern oder in der Cloud über S3-kompatiblen Objektspeicher (Cloudflare R2).",
      },
      {
        icon: "Mail",
        title: "webERV-Anbindung",
        desc: "webERV-Eingaben (XML-Export) werden direkt zur Akte: Absender, Aktenzeichen und Anlagen strukturiert erfasst und durchsuchbar — ohne Copy-&-Paste.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung (§ 10 RAO)",
        desc: "Prüft jeden neuen Mandanten oder Gegner serverseitig gegen den gesamten Aktenbestand und meldet Interessenkonflikte, bevor das Mandat angenommen wird. Deckt § 10 RAO ab.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Auslagen, Rechnungen & Buchhaltung",
        desc: "Minuten nach Anwalt/Tätigkeit buchen, abrechenbare Auslagen erfassen, Rechnungen aus offener Arbeit erstellen, Einträge als abgerechnet markieren und buchhaltungsfertig exportieren.",
      },
      {
        icon: "Landmark",
        title: "Rechtsprechung Österreich",
        desc: "Live-Recherche in openlegaldata/BGH (DE), RIS-OGD (AT) und bger.ch (CH) — relevante Urteile landen mit einem Klick zitierfähig im Brain.",
      },
      {
        icon: "Shield",
        title: "Dein Server, deine Jurisdiktion",
        desc: "Volle Engine self-hosted auf Kanzlei-Hardware mit lokalem Speicher — oder EU-Cloud mit AVV und dauerhaftem Objektspeicher. Mandantendaten verlassen nie deine Kontrolle.",
      },
      {
        icon: "Zap",
        title: "Offline-first Kanzleialltag",
        desc: "Akten, Kontakte, Fristen, Rechnungen, Vault, Verträge und Recherche nutzen lokale Caches und synchronisieren Änderungen, sobald das Cloud-Brain wieder erreichbar ist.",
      },
      {
        icon: "Brain",
        title: "Widerspruchs-Erkennung",
        desc: "Der Dream Cycle findet widersprüchliche Aussagen über Schriftsätze, Anlagen und Protokolle hinweg — mit Zitaten.",
      },
      {
        icon: "Search",
        title: "Jede Behauptung belegt",
        desc: "Antworten zitieren die exakten Fundstellen. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Mandat",
        desc: "Zugriff pro Mandat und Nutzer gescoped — fuzz-getestet, null Leaks zwischen Akten oder Teams.",
      },
    ],
    proofTitle: "Engine-Klasse Retrieval, kein Chat-Wrapper",
    proof: `Der Retrieval-Kern erreicht ${PROOF.recall8.full} mit Hybrid-Suche und Wissensgraph — und weil er auf Infrastruktur läuft, die du kontrollierst, steuert deine IT jedes System, das Mandantendaten berührt.`,
    faq: [
      {
        q: "Ist das Rechtsberatungs-Software?",
        a: "Nein. Subsumio organisiert und synthetisiert deine Dokumente und Notizen. Die juristische Bewertung bleibt bei den Anwälten — das Brain stellt sicher, dass ihnen nichts aus der Akte entgeht.",
      },
      {
        q: "Kann ich komplett offline arbeiten?",
        a: "Die Engine läuft self-hosted auf deiner Hardware und das Dashboard hält lokale Caches plus Änderungs-Warteschlange für die wichtigsten Kanzlei-Workflows. Die Synthese nutzt LLM-APIs deiner Wahl; Enterprise-Setups können über EU-Endpunkte oder ein eigenes Gateway routen.",
      },
      {
        q: "Wie viel Daten kann ich speichern?",
        a: "Self-hosted nutzt deinen eigenen Speicher oder S3-kompatiblen Objektspeicher. Hosted-Pakete enthalten Cloud-Dateispeicher je Paket; Enterprise bekommt individuelle Speichermengen und Aufbewahrungsregeln.",
      },
      {
        q: "Was ist mit DSGVO und Berufsrecht?",
        a: "Self-hosted heißt: Daten verlassen deine Infrastruktur nicht. Gehostete Pläne kommen mit EU-Hosting und AVV. Lass deinen Datenschutzbeauftragten mit uns sprechen — wir sprechen seine Sprache.",
      },
      {
        q: "Was unterscheidet das von Harvey, Legora oder Noxtua?",
        a: "Das sind exzellente Enterprise-Legal-AI-Workspaces — und sie laufen auf fremder Cloud und fremdem Modell. Subsumio liefert dieselbe Synthese-Qualität auf Infrastruktur, die DU kontrollierst: self-hosted oder EU-Cloud, deine eigenen Akten abfragbar gemacht, mit einem WhatsApp-Copilot, den deine Anwälte täglich nutzen. Es ist keine Rechtsrecherche — es sind die eigenen Mandate deiner Kanzlei, mit seitengenauen Zitaten und Vertraulichkeit per Architektur.",
      },
    ],
    ctaTitle: "Die Akte kennt die Antwort. Jetzt auch du.",
    ctaSub:
      "Starte mit einem abgeschlossenen Mandat als Pilot. Keine Mandantendaten müssen das Haus verlassen.",
    ctaButton: "Kostenlos testen",
  },
};
