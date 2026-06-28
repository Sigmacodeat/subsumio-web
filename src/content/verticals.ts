// Subsumio legal funnel content. EN + DE.

import { type Lang, deepMerge, applyReplacements, AT_REPLACEMENTS } from "./site";

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

const _verticalsDe = {
  legal: {
    slug: "legal",
    navLabel: "Kanzleien",
    metaTitle: "Subsumio — Kanzleisoftware AT · DE · CH",
    metaDesc:
      "KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristen nach ZPO/BGB/ABGB, KI-Analysen mit seitengenauen Zitaten. DSGVO-konform, EU-gehostet oder self-hosted.",
    badge: "Kanzleisoftware für AT · DE · CH",
    h1a: "500 Seiten Akte.",
    h1b: "Eine Frage entfernt.",
    sub: "Subsumio ist Kanzleisoftware für Österreich, Deutschland und die Schweiz: Akten verwalten, Fristen nach ZPO/BGB/ABGB automatisieren, KI-Analysen mit seitengenauen Zitaten erhalten — DSGVO-konform, EU-gehostet oder self-hosted.",
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
      a: `3 Widersprüche gefunden:

1. **Lieferdatum** — Klageschrift nennt 12. März; Zeuge K. sagt 'Ende April' (Protokoll S. 14).
2. **Zahlungsziel** — Schriftsatz vom 9. Jan. behauptet 30 Tage netto; die Vertragsanlage zeigt 14 Tage.
3. **Vorherige Mahnung** — Verteidigung bestreitet jede Mahnung; Anlage B7 dokumentiert eine.

⚠️ Lücke: Die Echtheit von Anlage B7 wurde bisher von keiner Seite thematisiert.`,
      sourcesLabel: "Quellen:",
      sources: ["akte/klage-2026-114", "anlagen/b7", "protokolle/zeuge-k"],
    },
    featuresTitle: "Gebaut für Verschwiegenheit zuerst",
    features: [
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle nach ZPO / BGB / ABGB / ZGB",
        desc: "Berechnet Notfristen, Berufungs- und Beschwerdefristen mit korrekter Monatsarithmetik (§ 188 BGB / § 80 ABGB) und Wochenend-Verschiebung (§ 222 ZPO / § 84 ZPO) — inkl. Normzitat. Täglicher E-Mail-Digest für überfällige und kritische Fristen.",
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
        title: "beA-Anbindung",
        desc: "beA-Nachrichten (XML-Export) werden direkt zur Akte: Absender, Aktenzeichen und Anlagen strukturiert erfasst und durchsuchbar — ohne Copy-&-Paste.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
        desc: "Prüft jeden neuen Mandanten oder Gegner serverseitig gegen den gesamten Aktenbestand und meldet Interessenkonflikte, bevor das Mandat angenommen wird. Deckt § 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH) ab.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Auslagen, Rechnungen & DATEV",
        desc: "Minuten nach Anwalt/Tätigkeit buchen, abrechenbare Auslagen erfassen, Rechnungen aus offener Arbeit erstellen, Einträge als abgerechnet markieren und DATEV-ready (DE) bzw. ADATEV-ready (AT) exportieren.",
      },
      {
        icon: "Landmark",
        title: "Rechtsprechung DE · AT · CH",
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
    proof:
      "Der Retrieval-Kern erreicht 97,9 % Recall@5 mit Hybrid-Suche und Wissensgraph — und weil er auf Infrastruktur läuft, die du kontrollierst, steuert deine IT jedes System, das Mandantendaten berührt.",
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

export const VERTICALS: Record<Lang, Record<VerticalSlug, VerticalContent>> = {
  en: {
    legal: {
      slug: "legal",
      navLabel: "Law Firms",
      metaTitle: "Subsumio — Law firm software AT · DE · CH",
      metaDesc:
        "AI legal software for lawyers in Austria, Germany and Switzerland: case management, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted or self-hosted.",
      badge: "Legal software for AT · DE · CH",
      h1a: "500 pages of case file.",
      h1b: "One question away.",
      sub: "Subsumio is law firm software for Austria, Germany and Switzerland: manage files, automate deadlines per ZPO/BGB/ABGB, get AI legal analysis with page-level citations — GDPR-compliant, EU-hosted or self-hosted.",
      painsTitle: "Sound familiar?",
      pains: [
        {
          title: "Case knowledge buried in PDFs",
          desc: "The decisive detail is on page 347 of a brief someone else read eight months ago.",
        },
        {
          title: "US clouds are a non-starter",
          desc: "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients.",
        },
        {
          title: "Knowledge walks out with people",
          desc: "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable.",
        },
      ],
      demo: {
        windowTitle: "subsumio — case brain",
        you: "You",
        q: "Where do the opposing party's submissions contradict their witness statements?",
        a: `3 contradictions found:

1. **Delivery date** — Statement of claim says March 12; witness K. states "end of April" (protocol p. 14).
2. **Payment terms** — Brief of Jan 9 claims 30 days net; the contract exhibit shows 14 days.
3. **Prior notice** — Defense asserts no warning was given; email exhibit B7 documents one.

⚠️ Gap: exhibit B7's authenticity hasn't been addressed by either side yet.`,
        sourcesLabel: "Sources:",
        sources: ["case/claim-2026-114", "exhibits/b7", "protocols/witness-k"],
      },
      featuresTitle: "Built for confidentiality-first work",
      features: [
        {
          icon: "CalendarClock",
          title: "Deadline control (ZPO / BGB / ABGB / ZGB)",
          desc: "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB / § 80 ABGB) and weekend roll-forward (§ 222 ZPO / § 84 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp matter copilot",
          desc: "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference.",
        },
        {
          icon: "FolderOpen",
          title: "Document vault with durable storage",
          desc: "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local disk on Hetzner EU servers, or S3-compatible object storage (Cloudflare R2) for hosted plans.",
        },
        {
          icon: "Mail",
          title: "beA integration",
          desc: "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste.",
        },
        {
          icon: "ShieldAlert",
          title: "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
          desc: "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).",
        },
        {
          icon: "Calculator",
          title: "Time, expenses, invoices & DATEV",
          desc: "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready (DE) or ADATEV-ready (AT) accounting file.",
        },
        {
          icon: "Landmark",
          title: "Case law DE · AT · CH",
          desc: "Live search across openlegaldata/BGH (DE), RIS-OGD (AT) and bger.ch (CH) — relevant judgements land in the brain, citable, in one click.",
        },
        {
          icon: "Shield",
          title: "Your server, your jurisdiction",
          desc: "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control.",
        },
        {
          icon: "Zap",
          title: "Offline-first daily work",
          desc: "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again.",
        },
        {
          icon: "Brain",
          title: "Contradiction detection",
          desc: "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations.",
        },
        {
          icon: "Search",
          title: "Every claim, sourced",
          desc: "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.",
        },
        {
          icon: "Layers",
          title: "Matter-level isolation",
          desc: "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.",
        },
      ],
      proofTitle: "Engine-grade retrieval, not a chat wrapper",
      proof:
        "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.",
      faq: [
        {
          q: "Is this legal advice software?",
          a: "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them.",
        },
        {
          q: "Can we run it fully offline?",
          a: "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway.",
        },
        {
          q: "How much data can we store?",
          a: "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms.",
        },
        {
          q: "What about GDPR and our bar obligations?",
          a: "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language.",
        },
        {
          q: "How is this different from Harvey, Legora or Noxtua?",
          a: "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture.",
        },
      ],
      ctaTitle: "The file knows the answer. Now you do too.",
      ctaSub:
        "Start with one closed matter as a pilot. No client data needs to leave your building.",
      ctaButton: "Try free",
    },
  },
  de: _verticalsDe,
  at: applyReplacements(_verticalsDe, AT_REPLACEMENTS),
  ch: _verticalsDe,
};
