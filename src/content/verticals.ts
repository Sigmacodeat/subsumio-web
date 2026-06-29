// Subsumio legal funnel content. EN + DE.

import { type Lang, applyReplacements, AT_REPLACEMENTS } from "./site";

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
      "KI-Kanzleisoftware für Anwälte in AT, DE & CH: Akten, Fristen nach ZPO/BGB/ABGB, KI-Analysen mit seitengenauen Zitaten. DSGVO-konform, EU-gehostet.",
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

const _enVerticals: Record<VerticalSlug, VerticalContent> = {
  legal: {
    slug: "legal",
    navLabel: "Law Firms",
    metaTitle: "Subsumio — Law firm software AT · DE · CH",
    metaDesc:
      "AI legal software for lawyers in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted.",
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
    ctaSub: "Start with one closed matter as a pilot. No client data needs to leave your building.",
    ctaButton: "Try free",
  },
};

export const VERTICALS: Record<Lang, Record<VerticalSlug, VerticalContent>> = {
  en: _enVerticals,
  de: _verticalsDe,
  at: applyReplacements(_verticalsDe, AT_REPLACEMENTS),
  ch: _verticalsDe,
  it: applyReplacements(JSON.parse(JSON.stringify(_enVerticals)), {
    "Subsumio — Law firm software AT · DE · CH":
      "Subsumio — Software per studi legali IT · DE · CH",
    "AI legal software for lawyers in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted.":
      "Software legale AI per avvocati in IT, DE & CH: pratiche, scadenze per ZPO/BGB/ABGB, analisi AI con citazioni a livello di pagina. Conforme GDPR, EU-hosted.",
    "Legal software for AT · DE · CH": "Software legale per IT · DE · CH",
    "500 pages of case file.": "500 pagine di pratica.",
    "One question away.": "A una domanda di distanza.",
    "Subsumio is law firm software for Austria, Germany and Switzerland: manage files, automate deadlines per ZPO/BGB/ABGB, get AI legal analysis with page-level citations — GDPR-compliant, EU-hosted or self-hosted.":
      "Subsumio è software per studi legali per Italia, Germania e Svizzera: gestisci pratiche, automatizza scadenze per ZPO/BGB/ABGB, ottieni analisi legale AI con citazioni a livello di pagina — conforme GDPR, EU-hosted o self-hosted.",
    "Sound familiar?": "Ti suona familiare?",
    "Case knowledge buried in PDFs": "Conoscenza della pratica sepolta nei PDF",
    "US clouds are a non-starter": "Cloud US sono esclusi",
    "The file knows the answer. Now you do too.": "La pratica conosce la risposta. Ora anche tu.",
    "Start with one closed matter as a pilot. No client data needs to leave your building.":
      "Inizia con una pratica chiusa come pilota. Nessun dato cliente deve lasciare il tuo studio.",
    "Try free": "Prova gratis",
    // navLabel
    "Law Firms": "Studi Legali",
    // Pains descs
    "The decisive detail is on page 347 of a brief someone else read eight months ago.":
      "Il dettaglio decisivo è a pagina 347 di una memoria che qualcun altro ha letto otto mesi fa.",
    "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients.":
      "Pratiche clienti in un tool AI US-hosted? Il tuo dovere professionale di riservatezza dice no — e anche i tuoi clienti.",
    "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable.":
      "Quando un associato senior se ne va, anni di contesto della pratica se ne vanno con lui — a meno che la conoscenza dello studio non viva da qualche parte in modo durevole e interrogabile.",
    // Features
    "Built for confidentiality-first work": "Costruito per lavoro confidentiality-first",
    "Deadline control (ZPO / BGB / ABGB / ZGB)": "Controllo scadenze (ZPO / BGB / ABGB / ZGB)",
    "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB / § 80 ABGB) and weekend roll-forward (§ 222 ZPO / § 84 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines.":
      "Calcola scadenze legali e di appello con aritmetica mensile corretta (§ 188 BGB / § 80 ABGB) e roll-forward nei weekend (§ 222 ZPO / § 84 ZPO) — con la norma di riferimento citata. Un digest email giornaliero segnala scadenze overdue e critiche.",
    "WhatsApp matter copilot": "Copilot WhatsApp per pratiche",
    "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference.":
      "Gli avvocati possono inviare registrazioni di tempo, note, task, scadenze, spese, domande, PDF, foto e note vocali dal telefono. Subsumio le archivia nel brain e collega i media alla pratica giusta quando la didascalia contiene il riferimento di pratica.",
    "Document vault with durable storage": "Vault documenti con storage durevole",
    "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local disk on Hetzner EU servers, or S3-compatible object storage (Cloudflare R2) for hosted plans.":
      "Documenti di pratica, media WhatsApp e prove caricate sono conservati nel vault con hash, fonte, dimensione e metadati di storage — disco locale su server Hetzner UE, o object storage S3-compatibile (Cloudflare R2) per piani hosted.",
    "beA integration": "Integrazione beA",
    "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste.":
      "La posta legale elettronica tedesca (export XML beA) arriva direttamente nella pratica: mittente, riferimento di pratica e allegati catturati e ricercabili — senza copy-paste.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Controllo conflitti (§ 43a BRAO / § 10 RAO / BGFA)",
    "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Verifica ogni nuovo cliente o controparte server-side contro l'intero database di pratiche e segnala conflitti di interesse prima che il mandato sia accettato. Copre § 43a BRAO (DE), § 10 RAO (AT) e BGFA (CH).",
    "Time, expenses, invoices & DATEV": "Tempi, spese, fatture & DATEV",
    "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready (DE) or ADATEV-ready (AT) accounting file.":
      "Registra minuti per avvocato/attività, cattura spese fatturabili, crea fatture dal lavoro aperto, marca voci fatturate ed esporta un file contabile DATEV-ready (DE) o ADATEV-ready (AT).",
    "Case law DE · AT · CH": "Giurisprudenza DE · AT · CH",
    "Live search across openlegaldata/BGH (DE), RIS-OGD (AT) and bger.ch (CH) — relevant judgements land in the brain, citable, in one click.":
      "Ricerca live su openlegaldata/BGH (DE), RIS-OGD (AT) e bger.ch (CH) — le sentenze pertinenti arrivano nel brain, citabili, con un clic.",
    "Your server, your jurisdiction": "Il tuo server, la tua giurisdizione",
    "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control.":
      "Self-host del motor completo su hardware dello studio con storage locale, o scegli cloud EU-hosted con DPA e object storage durevole. I dati clienti non lasciano mai il tuo controllo.",
    "Offline-first daily work": "Lavoro quotidiano offline-first",
    "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again.":
      "Pratiche, contatti, scadenze, fatture, vault, contratti e research mantengono cache locali e accodano modifiche finché il cloud brain non è di nuovo raggiungibile.",
    "Contradiction detection": "Rilevamento contraddizioni",
    "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations.":
      "Il Dream Cycle evidenzia affermazioni contraddittorie tra memorie, allegati e protocolli — con citazioni.",
    "Every claim, sourced": "Ogni affermazione, citata",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Le risposte citano le pagine esatte da cui provengono. Verifica con un clic prima che qualcosa finisca in una memoria.",
    "Matter-level isolation": "Isolamento a livello di pratica",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Accesso scoped per pratica e per utente — fuzz-testato, zero leak tra pratiche o team.",
    // Proof + FAQ
    "Engine-grade retrieval, not a chat wrapper": "Retrieval di grado engine, non un chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.":
      "Il core di retrieval raggiunge 97,9% Recall@5 con ricerca ibrida e knowledge graph — e poiché gira su infrastruttura che controlli, la tua IT governa ogni sistema che tocca dati clienti.",
    "Is this legal advice software?": "È software per consulenza legale?",
    "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them.":
      "No. Subsumio organizza e sintetizza i tuoi documenti e note. Il giudizio legale resta con gli avvocati — il brain si assicura solo che nulla nella pratica sfugga loro.",
    "Can we run it fully offline?": "Possiamo usarlo completamente offline?",
    "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway.":
      "Il motor si self-hosta sul tuo hardware e il dashboard mantiene cache locali con una coda di mutazioni per i core legal workflows. La sintesi usa LLM API di tua scelta; i setup enterprise possono routare attraverso endpoint UE o il tuo gateway.",
    "How much data can we store?": "Quanti dati possiamo archiviare?",
    "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms.":
      "Self-hosted usa il tuo disco o storage S3-compatibile. I piani hosted includono cloud file storage per pacchetto e possono scalare a retention e volumi di storage personalizzati per studi enterprise.",
    "What about GDPR and our bar obligations?": "E per GDPR e i nostri obblighi forensi?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language.":
      "Self-hosted significa che i dati non lasciano mai la tua infrastruttura. I piani hosted vengono con hosting UE e DPA. Fai parlare il tuo responsabile della protezione dei dati con noi — parliamo la sua lingua.",
    "How is this different from Harvey, Legora or Noxtua?":
      "In cosa differisce da Harvey, Legora o Noxtua?",
    "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture.":
      "Sono eccellenti workspace enterprise legal-AI — e girano su cloud e modelli di altri. Subsumio ti dà la stessa qualità di sintesi su infrastruttura che TU controlli: self-hosted o cloud UE, i tuoi file resi interrogabili, con un copilot WhatsApp che i tuoi avvocati usano ogni giorno. Non è ricerca legale — sono le pratiche del tuo studio, con citazioni a livello di pagina e riservatezza per architettura.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enVerticals)), {
    "Subsumio — Law firm software AT · DE · CH": "Subsumio — Software para bufetes ES · DE · CH",
    "AI legal software for lawyers in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted.":
      "Software legal IA para abogados en ES, DE & CH: asuntos, plazos según ZPO/BGB/ABGB, análisis IA con citas a nivel de página. Conforme GDPR, EU-hosted.",
    "Legal software for AT · DE · CH": "Software legal para ES · DE · CH",
    "500 pages of case file.": "500 páginas de asunto.",
    "One question away.": "A una pregunta de distancia.",
    "Subsumio is law firm software for Austria, Germany and Switzerland: manage files, automate deadlines per ZPO/BGB/ABGB, get AI legal analysis with page-level citations — GDPR-compliant, EU-hosted or self-hosted.":
      "Subsumio es software para bufetes de España, Alemania y Suiza: gestiona asuntos, automatiza plazos según ZPO/BGB/ABGB, obtén análisis legal IA con citas a nivel de página — conforme GDPR, EU-hosted o self-hosted.",
    "Sound familiar?": "¿Te suena familiar?",
    "Case knowledge buried in PDFs": "Conocimiento del asunto enterrado en PDFs",
    "US clouds are a non-starter": "Clouds de EE.UU. no son opción",
    "The file knows the answer. Now you do too.":
      "El asunto conoce la respuesta. Ahora tú también.",
    "Start with one closed matter as a pilot. No client data needs to leave your building.":
      "Empieza con un asunto cerrado como piloto. Ningún dato de cliente necesita salir de tu despacho.",
    "Try free": "Prueba gratis",
    // navLabel
    "Law Firms": "Bufetes",
    // Pains descs
    "The decisive detail is on page 347 of a brief someone else read eight months ago.":
      "El detalle decisivo está en la página 347 de un escrito que alguien más leyó hace ocho meses.",
    "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients.":
      "¿Archivos de clientes en una herramienta AI US-hosted? Tu deber profesional de confidencialidad dice no — y también tus clientes.",
    "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable.":
      "Cuando un asociado senior se va, años de contexto del asunto se van con él — a menos que el conocimiento del bufete viva en algún lugar durable y consultable.",
    // Features
    "Built for confidentiality-first work": "Construido para trabajo confidentiality-first",
    "Deadline control (ZPO / BGB / ABGB / ZGB)": "Control de plazos (ZPO / BGB / ABGB / ZGB)",
    "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB / § 80 ABGB) and weekend roll-forward (§ 222 ZPO / § 84 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines.":
      "Calcula plazos legales y de apelación con aritmética mensual correcta (§ 188 BGB / § 80 ABGB) y roll-forward en fines de semana (§ 222 ZPO / § 84 ZPO) — con la norma aplicable citada. Un digest email diario señala plazos vencidos y críticos.",
    "WhatsApp matter copilot": "Copilot WhatsApp para asuntos",
    "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference.":
      "Los abogados pueden enviar registros de tiempo, notas, tareas, plazos, gastos, preguntas, PDFs, fotos y notas de voz desde su teléfono. Subsumio los almacena en el brain y vincula los medios al asunto correcto cuando el título contiene la referencia del caso.",
    "Document vault with durable storage": "Vault de documentos con almacenamiento durable",
    "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local disk on Hetzner EU servers, or S3-compatible object storage (Cloudflare R2) for hosted plans.":
      "Documentos de asuntos, media de WhatsApp y pruebas subidas se guardan en el vault con hash, fuente, tamaño y metadatos de almacenamiento — disco local en servidores Hetzner UE, u object storage S3-compatible (Cloudflare R2) para planes hosted.",
    "beA integration": "Integración beA",
    "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste.":
      "El correo legal electrónico alemán (export XML beA) llega directamente al asunto: remitente, referencia del caso y adjuntos capturados y buscables — sin copy-paste.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Control de conflictos (§ 43a BRAO / § 10 RAO / BGFA)",
    "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Verifica cada nuevo cliente o contraparte server-side contra toda la base de asuntos y señala conflictos de interés antes de que se acepte el mandato. Cubre § 43a BRAO (DE), § 10 RAO (AT) y BGFA (CH).",
    "Time, expenses, invoices & DATEV": "Tiempos, gastos, facturas & DATEV",
    "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready (DE) or ADATEV-ready (AT) accounting file.":
      "Registra minutos por abogado/actividad, captura gastos facturables, crea facturas desde trabajo abierto, marca entradas facturadas y exporta un fichero contable DATEV-ready (DE) o ADATEV-ready (AT).",
    "Case law DE · AT · CH": "Jurisprudencia DE · AT · CH",
    "Live search across openlegaldata/BGH (DE), RIS-OGD (AT) and bger.ch (CH) — relevant judgements land in the brain, citable, in one click.":
      "Búsqueda live en openlegaldata/BGH (DE), RIS-OGD (AT) y bger.ch (CH) — las sentencias relevantes llegan al brain, citables, con un clic.",
    "Your server, your jurisdiction": "Tu servidor, tu jurisdicción",
    "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control.":
      "Self-host del motor completo en hardware del bufete con almacenamiento local, o elige cloud EU-hosted con DPA y object storage durable. Los datos de clientes nunca salen de tu control.",
    "Offline-first daily work": "Trabajo diario offline-first",
    "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again.":
      "Asuntos, contactos, plazos, facturas, vault, contratos y research mantienen caches locales y encolan cambios hasta que el cloud brain vuelve a ser alcanzable.",
    "Contradiction detection": "Detección de contradicciones",
    "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations.":
      "El Dream Cycle saca a la luz afirmaciones contradictorias entre escritos, pruebas y protocolos — con citas.",
    "Every claim, sourced": "Cada afirmación, citada",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Las respuestas citan las páginas exactas de donde provienen. Verifica con un clic antes de que algo vaya a un escrito.",
    "Matter-level isolation": "Aislamiento a nivel de asunto",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Acceso scoped por asunto y por usuario — fuzz-testeado, cero fugas entre asuntos o equipos.",
    // Proof + FAQ
    "Engine-grade retrieval, not a chat wrapper": "Retrieval de grado engine, no un chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.":
      "El core de retrieval alcanza 97,9% Recall@5 con búsqueda híbrida y knowledge graph — y como corre en infraestructura que controlas, tu IT gobierna cada sistema que toca datos de clientes.",
    "Is this legal advice software?": "¿Es software de asesoría legal?",
    "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them.":
      "No. Subsumio organiza y sintetiza tus documentos y notas. El juicio legal queda con los abogados — el brain solo se asegura de que nada del asunto se les escape.",
    "Can we run it fully offline?": "¿Podemos ejecutarlo completamente offline?",
    "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway.":
      "El motor se self-hostea en tu hardware y el dashboard mantiene caches locales con una cola de mutaciones para los core legal workflows. La síntesis usa LLM APIs de tu elección; los setups enterprise pueden rutar a través de endpoints UE o tu propio gateway.",
    "How much data can we store?": "¿Cuántos datos podemos almacenar?",
    "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms.":
      "Self-hosted usa tu propio disco o almacenamiento S3-compatible. Los planes hosted incluyen cloud file storage por paquete y pueden escalar a retención y volúmenes de almacenamiento personalizados para bufetes enterprise.",
    "What about GDPR and our bar obligations?":
      "¿Y sobre GDPR y nuestras obligaciones del colegio?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language.":
      "Self-hosted significa que los datos nunca salen de tu infraestructura. Los planes hosted vienen con hosting UE y DPA. Haz que tu delegado de protección de datos hable con nosotros — hablamos su idioma.",
    "How is this different from Harvey, Legora or Noxtua?":
      "¿En qué se diferencia de Harvey, Legora o Noxtua?",
    "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture.":
      "Son excelentes workspaces enterprise legal-AI — y corren en la cloud y el modelo de otro. Subsumio te da la misma calidad de síntesis en infraestructura que TÚ controlas: self-hosted o cloud UE, tus propios ficheros hechos consultables, con un copilot WhatsApp que tus abogados usan cada día. No es investigación legal — son los asuntos de tu bufete, con citas a nivel de página y confidencialidad por arquitectura.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enVerticals)), {
    "Subsumio — Law firm software AT · DE · CH":
      "Subsumio — Oprogramowanie dla kancelarii PL · DE · CH",
    "AI legal software for lawyers in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted.":
      "Oprogramowanie prawne AI dla adwokatów w PL, DE & CH: sprawy, terminy według ZPO/BGB/ABGB, analiza AI z cytatami na poziomie strony. Zgodne z GDPR, EU-hosted.",
    "Legal software for AT · DE · CH": "Oprogramowanie prawne dla PL · DE · CH",
    "500 pages of case file.": "500 stron akt sprawy.",
    "One question away.": "O jedno pytanie stąd.",
    "Subsumio is law firm software for Austria, Germany and Switzerland: manage files, automate deadlines per ZPO/BGB/ABGB, get AI legal analysis with page-level citations — GDPR-compliant, EU-hosted or self-hosted.":
      "Subsumio to oprogramowanie dla kancelarii w Polsce, Niemczech i Szwajcarii: zarządzaj sprawami, automatyzuj terminy według ZPO/BGB/ABGB, otrzymuj analizę prawną AI z cytatami na poziomie strony — zgodne z GDPR, EU-hosted lub self-hosted.",
    "Sound familiar?": "Brzmi znajomo?",
    "Case knowledge buried in PDFs": "Wiedza o sprawie pogrzebana w PDF-ach",
    "US clouds are a non-starter": "Chmury US nie wchodzą w grę",
    "The file knows the answer. Now you do too.": "Akta znają odpowiedź. Teraz ty też.",
    "Start with one closed matter as a pilot. No client data needs to leave your building.":
      "Zacznij z jedną zamkniętą sprawą jako pilot. Żadne dane klienta nie muszą opuszczać twojego biura.",
    "Try free": "Wypróbuj za darmo",
    // navLabel
    "Law Firms": "Kancelarie",
    // Pains descs
    "The decisive detail is on page 347 of a brief someone else read eight months ago.":
      "Decydujący szczegół jest na stronie 347 pisma, które ktoś inny czytał osiem miesięcy temu.",
    "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients.":
      "Akta klientów w narzędziu AI hostowanym w US? Twój zawodowy obowiązek poufności mówi nie — i twoi klienci też.",
    "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable.":
      "Kiedy odchodzi doświadczony asocjat, lata kontekstu sprawy odchodzą z nim — chyba że wiedza kancelarii żyje gdzieś trwale i odpytywalnie.",
    // Features
    "Built for confidentiality-first work": "Zbudowany dla pracy confidentiality-first",
    "Deadline control (ZPO / BGB / ABGB / ZGB)": "Kontrola terminów (ZPO / BGB / ABGB / ZGB)",
    "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB / § 80 ABGB) and weekend roll-forward (§ 222 ZPO / § 84 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines.":
      "Oblicza terminy ustawowe i apelacyjne z poprawną arytmetyką miesięczną (§ 188 BGB / § 80 ABGB) i roll-forward w weekendy (§ 222 ZPO / § 84 ZPO) — z powołaniem na właściwą normę. Codzienny digest email flaguje terminy overdue i krytyczne.",
    "WhatsApp matter copilot": "Copilot WhatsApp dla spraw",
    "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference.":
      "Prawnicy mogą wysyłać wpisy czasu, notatki, zadania, terminy, koszty, pytania, PDFy, zdjęcia i notatki głosowe z telefonu. Subsumio przechowuje je w brain i linkuje media do właściwej sprawy, gdy podpis zawiera referencję sprawy.",
    "Document vault with durable storage": "Vault dokumentów z trwałym storage",
    "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local disk on Hetzner EU servers, or S3-compatible object storage (Cloudflare R2) for hosted plans.":
      "Dokumenty spraw, media WhatsApp i dowody uploadowane są przechowywane w vault z hash, źródłem, rozmiarem i metadanymi storage — lokalny dysk na serwerach Hetzner UE, lub object storage S3-compatible (Cloudflare R2) dla planów hosted.",
    "beA integration": "Integracja beA",
    "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste.":
      "Niemiecka elektroniczna poczta prawna (export XML beA) trafia prosto do akt sprawy: nadawca, referencja sprawy i załączniki przechwycone i przeszukiwalne — bez copy-paste.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Kontrola konfliktów (§ 43a BRAO / § 10 RAO / BGFA)",
    "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Sprawdza każdego nowego klienta lub przeciwnika server-side przeciw całej bazie spraw i flaguje konflikty interesów przed przyjęciem mandatu. Pokrywa § 43a BRAO (DE), § 10 RAO (AT) i BGFA (CH).",
    "Time, expenses, invoices & DATEV": "Czas, koszty, faktury & DATEV",
    "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready (DE) or ADATEV-ready (AT) accounting file.":
      "Rejestruj minuty per prawnik/aktywność, przechwytuj koszty rachunkowe, twórz faktury z otwartej pracy, oznaczaj wpisy zafakturowane i eksportuj plik księgowy DATEV-ready (DE) lub ADATEV-ready (AT).",
    "Case law DE · AT · CH": "Orzecznictwo DE · AT · CH",
    "Live search across openlegaldata/BGH (DE), RIS-OGD (AT) and bger.ch (CH) — relevant judgements land in the brain, citable, in one click.":
      "Wyszukiwanie live w openlegaldata/BGH (DE), RIS-OGD (AT) i bger.ch (CH) — istotne orzeczenia trafiają do brain, cytowalne, jednym kliknięciem.",
    "Your server, your jurisdiction": "Twój serwer, twoja jurysdykcja",
    "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control.":
      "Self-host pełnego engine na hardware kancelarii z lokalnym storage, lub wybierz cloud EU-hosted z DPA i trwałym object storage. Dane klientów nigdy nie wychodzą spod twojej kontroli.",
    "Offline-first daily work": "Codzienna praca offline-first",
    "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again.":
      "Sprawy, kontakty, terminy, faktury, vault, kontrakty i research utrzymują lokalne cache i kolejkują zmiany, aż cloud brain będzie znów osiągalny.",
    "Contradiction detection": "Wykrywanie sprzeczności",
    "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations.":
      "Dream Cycle ujawnia sprzeczne stwierdzenia między pismami, dowodami i protokołami — z cytatami.",
    "Every claim, sourced": "Każda teza, z cytatem",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Odpowiedzi cytują dokładne strony, z których pochodzą. Zweryfikuj jednym kliknięciem, zanim coś trafi do pisma.",
    "Matter-level isolation": "Izolacja na poziomie sprawy",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Dostęp scoped per sprawa i per użytkownik — fuzz-testowane, zero wycieków między sprawami lub zespołami.",
    // Proof + FAQ
    "Engine-grade retrieval, not a chat wrapper": "Retrieval klasy engine, nie chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.":
      "Rdzeń retrieval osiąga 97,9% Recall@5 z wyszukiwaniem hybrydowym i knowledge graph — a ponieważ działa na infrastrukturze, którą kontrolujesz, twoja IT zarządza każdym systemem, który dotyka danych klientów.",
    "Is this legal advice software?": "Czy to software do porad prawnych?",
    "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them.":
      "Nie. Subsumio organizuje i syntetyzuje twoje dokumenty i notatki. Ocena prawna zostaje przy prawnikach — brain tylko dba, by nic z akt im nie umknęło.",
    "Can we run it fully offline?": "Czy możemy działać w pełni offline?",
    "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway.":
      "Engine self-hostuje na twoim hardware i dashboard utrzymuje lokalne cache z kolejką mutacji dla core legal workflows. Synteza używa LLM API twojego wyboru; setupy enterprise mogą rutować przez endpointy UE lub własny gateway.",
    "How much data can we store?": "Ile danych możemy przechować?",
    "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms.":
      "Self-hosted używa twojego dysku lub storage S3-compatible. Plany hosted zawierają cloud file storage per pakiet i mogą skalować do custom retention i wolumenów storage dla kancelarii enterprise.",
    "What about GDPR and our bar obligations?": "A co z GDPR i naszymi obowiązkami adwokackimi?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language.":
      "Self-hosted oznacza, że dane nigdy nie wychodzą z twojej infrastruktury. Plany hosted mają hosting UE i DPA. Niech twój inspektor ochrony danych porozmawia z nami — mówimy jego językiem.",
    "How is this different from Harvey, Legora or Noxtua?":
      "Czym to się różni od Harvey, Legora lub Noxtua?",
    "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture.":
      "To świetne workspace enterprise legal-AI — i działają na cudzej cloud i cudzym modelu. Subsumio daje ci tę samą jakość syntezy na infrastrukturze, którą TY kontrolujesz: self-hosted lub cloud UE, twoje własne pliki uczynione odpytywalnymi, z copilot WhatsApp, którego twoi prawnicy używają codziennie. To nie jest research prawny — to sprawy twojej kancelarii, z cytatami na poziomie strony i poufnością w architekturze.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enVerticals)), {
    "Subsumio — Law firm software AT · DE · CH": "Subsumio — Logiciel pour cabinets FR · DE · CH",
    "AI legal software for lawyers in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted.":
      "Logiciel juridique IA pour avocats en FR, DE & CH: dossiers, délais selon ZPO/BGB/ABGB, analyse IA avec citations au niveau de la page. Conforme RGPD, EU-hosted.",
    "Legal software for AT · DE · CH": "Logiciel juridique pour FR · DE · CH",
    "500 pages of case file.": "500 pages de dossier.",
    "One question away.": "À une question près.",
    "Subsumio is law firm software for Austria, Germany and Switzerland: manage files, automate deadlines per ZPO/BGB/ABGB, get AI legal analysis with page-level citations — GDPR-compliant, EU-hosted or self-hosted.":
      "Subsumio est un logiciel pour cabinets en France, Allemagne et Suisse: gérez les dossiers, automatisez les délais selon ZPO/BGB/ABGB, obtenez des analyses juridiques IA avec citations au niveau de la page — conforme RGPD, EU-hosted ou self-hosted.",
    "Sound familiar?": "Ça vous dit quelque chose?",
    "Case knowledge buried in PDFs": "Connaissance du dossier enfouie dans les PDFs",
    "US clouds are a non-starter": "Clouds US exclus d'office",
    "The file knows the answer. Now you do too.":
      "Le dossier connaît la réponse. Maintenant vous aussi.",
    "Start with one closed matter as a pilot. No client data needs to leave your building.":
      "Commencez avec un dossier clôturé comme pilote. Aucune donnée client ne doit quitter votre cabinet.",
    "Try free": "Essayer gratuitement",
    // navLabel
    "Law Firms": "Cabinets",
    // Pains descs
    "The decisive detail is on page 347 of a brief someone else read eight months ago.":
      "Le détail décisif est à la page 347 d'une conclusion que quelqu'un d'autre a lue il y a huit mois.",
    "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients.":
      "Dossiers de clients dans un outil AI hébergé aux US? Votre devoir professionnel de confidentialité dit non — et vos clients aussi.",
    "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable.":
      "Quand un collaborateur senior part, des années de contexte du dossier partent avec lui — à moins que la connaissance du cabinet ne vive quelque part de manière durable et interrogeable.",
    // Features
    "Built for confidentiality-first work": "Construit pour un travail confidentiality-first",
    "Deadline control (ZPO / BGB / ABGB / ZGB)": "Contrôle des délais (ZPO / BGB / ABGB / ZGB)",
    "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB / § 80 ABGB) and weekend roll-forward (§ 222 ZPO / § 84 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines.":
      "Calcule les délais légaux et d'appel avec arithmétique mensuelle correcte (§ 188 BGB / § 80 ABGB) et report aux weekends (§ 222 ZPO / § 84 ZPO) — avec la norme applicable citée. Un digest email quotidien signale les délais échus et critiques.",
    "WhatsApp matter copilot": "Copilot WhatsApp pour dossiers",
    "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference.":
      "Les avocats peuvent envoyer des enregistrements de temps, notes, tâches, délais, frais, questions, PDFs, photos et notes vocales depuis leur téléphone. Subsumio les stocke dans le brain et lie les médias au bon dossier quand la légende contient la référence du dossier.",
    "Document vault with durable storage": "Vault de documents avec stockage durable",
    "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local disk on Hetzner EU servers, or S3-compatible object storage (Cloudflare R2) for hosted plans.":
      "Documents de dossiers, médias WhatsApp et preuves uploadées sont conservés dans le vault avec hash, source, taille et métadonnées de stockage — disque local sur serveurs Hetzner UE, ou object storage S3-compatible (Cloudflare R2) pour plans hosted.",
    "beA integration": "Intégration beA",
    "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste.":
      "Le courrier juridique électronique allemand (export XML beA) arrive directement dans le dossier: expéditeur, référence du dossier et pièces jointes capturés et recherchables — sans copy-paste.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Contrôle des conflits (§ 43a BRAO / § 10 RAO / BGFA)",
    "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Vérifie chaque nouveau client ou partie adverse server-side contre toute la base de dossiers et signale les conflits d'intérêts avant l'acceptation du mandat. Couvre § 43a BRAO (DE), § 10 RAO (AT) et BGFA (CH).",
    "Time, expenses, invoices & DATEV": "Temps, frais, factures & DATEV",
    "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready (DE) or ADATEV-ready (AT) accounting file.":
      "Enregistrer les minutes par avocat/activité, capturer les frais facturables, créer des factures depuis le travail ouvert, marquer les entrées facturées et exporter un fichier comptable DATEV-ready (DE) ou ADATEV-ready (AT).",
    "Case law DE · AT · CH": "Jurisprudence DE · AT · CH",
    "Live search across openlegaldata/BGH (DE), RIS-OGD (AT) and bger.ch (CH) — relevant judgements land in the brain, citable, in one click.":
      "Recherche live sur openlegaldata/BGH (DE), RIS-OGD (AT) et bger.ch (CH) — les jugements pertinents arrivent dans le brain, citables, en un clic.",
    "Your server, your jurisdiction": "Votre serveur, votre juridiction",
    "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control.":
      "Self-host du moteur complet sur le matériel du cabinet avec stockage local, ou choisissez cloud EU-hosted avec DPA et object storage durable. Les données clients ne quittent jamais votre contrôle.",
    "Offline-first daily work": "Travail quotidien offline-first",
    "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again.":
      "Dossiers, contacts, délais, factures, vault, contrats et research maintiennent des caches locaux et encodent les changements jusqu'à ce que le cloud brain soit de nouveau accessible.",
    "Contradiction detection": "Détection de contradictions",
    "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations.":
      "Le Dream Cycle met en évidence des affirmations contradictoires entre conclusions, pièces et protocoles — avec des citations.",
    "Every claim, sourced": "Chaque affirmation, citée",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Les réponses citent les pages exactes d'où elles proviennent. Vérifiez en un clic avant que quoi que ce soit n'aille dans une conclusion.",
    "Matter-level isolation": "Isolation au niveau du dossier",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Accès scoped par dossier et par utilisateur — fuzz-testé, zéro fuite entre dossiers ou équipes.",
    // Proof + FAQ
    "Engine-grade retrieval, not a chat wrapper": "Retrieval de grade engine, pas un chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.":
      "Le core de retrieval atteint 97,9% Recall@5 avec recherche hybride et knowledge graph — et comme il tourne sur une infrastructure que vous contrôlez, votre IT gouverne chaque système qui touche les données clients.",
    "Is this legal advice software?": "Est-ce un logiciel de conseil juridique?",
    "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them.":
      "Non. Subsumio organise et synthétise vos documents et notes. Le jugement juridique reste avec les avocats — le brain s'assure juste que rien dans le dossier ne leur échappe.",
    "Can we run it fully offline?": "Pouvons-nous l'exécuter entièrement offline?",
    "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway.":
      "Le moteur se self-hoste sur votre hardware et le dashboard maintient des caches locaux avec une queue de mutations pour les core legal workflows. La synthèse utilise des LLM APIs de votre choix; les setups enterprise peuvent router via des endpoints UE ou votre propre gateway.",
    "How much data can we store?": "Combien de données pouvons-nous stocker?",
    "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms.":
      "Self-hosted utilise votre propre disque ou stockage S3-compatible. Les plans hosted incluent cloud file storage par forfait et peuvent scaler à des retention et volumes de stockage personnalisés pour cabinets enterprise.",
    "What about GDPR and our bar obligations?":
      "Qu'en est-il du RGPD et de nos obligations du barreau?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language.":
      "Self-hosted signifie que les données ne quittent jamais votre infrastructure. Les plans hosted viennent avec hosting UE et DPA. Faites parler votre délégué à la protection des données avec nous — nous parlons sa langue.",
    "How is this different from Harvey, Legora or Noxtua?":
      "En quoi cela diffère-t-il de Harvey, Legora ou Noxtua?",
    "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture.":
      "Ce sont d'excellents workspaces enterprise legal-AI — et ils tournent sur la cloud et le modèle de quelqu'un d'autre. Subsumio vous donne la même qualité de synthèse sur une infrastructure que VOUS contrôlez: self-hosted ou cloud UE, vos propres fichiers rendus interrogeables, avec un copilot WhatsApp que vos avocats utilisent chaque jour. Ce n'est pas de la recherche juridique — ce sont les dossiers de votre cabinet, avec des citations au niveau de la page et confidentialité par architecture.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enVerticals)), {
    "Subsumio — Law firm software AT · DE · CH":
      "Subsumio — Software voor advocatenkantoren NL · DE · CH",
    "AI legal software for lawyers in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, AI analysis with page-level citations. GDPR-compliant, EU-hosted.":
      "AI juridische software voor advocaten in NL, DE & CH: zaken, termijnen volgens ZPO/BGB/ABGB, AI-analyse met paginaniveau-citaten. GDPR-conform, EU-hosted.",
    "Legal software for AT · DE · CH": "Juridische software voor NL · DE · CH",
    "500 pages of case file.": "500 pagina's dossier.",
    "One question away.": "Op één vraag afstand.",
    "Subsumio is law firm software for Austria, Germany and Switzerland: manage files, automate deadlines per ZPO/BGB/ABGB, get AI legal analysis with page-level citations — GDPR-compliant, EU-hosted or self-hosted.":
      "Subsumio is software voor advocatenkantoren in Nederland, Duitsland en Zwitserland: beheer dossiers, automatiseer termijnen volgens ZPO/BGB/ABGB, krijg AI-juridische analyse met paginaniveau-citaten — GDPR-conform, EU-hosted of self-hosted.",
    "Sound familiar?": "Klinkt bekend?",
    "Case knowledge buried in PDFs": "Zaakkennis begraven in PDF's",
    "US clouds are a non-starter": "US-clouds zijn geen optie",
    "The file knows the answer. Now you do too.": "Het dossier kent het antwoord. Nu jij ook.",
    "Start with one closed matter as a pilot. No client data needs to leave your building.":
      "Begin met één gesloten zaak als pilot. Geen klantdata hoeft je kantoor te verlaten.",
    "Try free": "Probeer gratis",
    // navLabel
    "Law Firms": "Advocatenkantoren",
    // Pains descs
    "The decisive detail is on page 347 of a brief someone else read eight months ago.":
      "Het beslissende detail staat op pagina 347 van een pleidooi dat iemand anders acht maanden geleden las.",
    "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients.":
      "Klantdossiers in een AI-tool gehost in de US? Jouw beroepsgeheim zegt nee — en jouw klanten ook.",
    "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable.":
      "Als een senior medewerker vertrekt, gaan jaren van zaak-context met hem mee — tenzij de kennis van het kantoor ergens duurzaam en bevraagbaar leeft.",
    // Features
    "Built for confidentiality-first work": "Gebouwd voor confidentiality-first werk",
    "Deadline control (ZPO / BGB / ABGB / ZGB)": "Termijncontrole (ZPO / BGB / ABGB / ZGB)",
    "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB / § 80 ABGB) and weekend roll-forward (§ 222 ZPO / § 84 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines.":
      "Berekent wettelijke en hoger-beroep termijnen met correcte maand-arithmetiek (§ 188 BGB / § 80 ABGB) en weekend roll-forward (§ 222 ZPO / § 84 ZPO) — met de relevante norm geciteerd. Een dagelijkse email-digest markeert vervallen en kritieke termijnen.",
    "WhatsApp matter copilot": "WhatsApp copilot voor zaken",
    "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference.":
      "Advocaten kunnen tijdregistraties, notities, taken, termijnen, kosten, vragen, PDFs, foto's en spraaknotities vanaf hun telefoon sturen. Subsumio slaat ze op in het brain en linkt media naar de juiste zaak als het bijschrift de zaakreferentie bevat.",
    "Document vault with durable storage": "Document-vault met duurzame opslag",
    "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local disk on Hetzner EU servers, or S3-compatible object storage (Cloudflare R2) for hosted plans.":
      "Zaakdocumenten, WhatsApp-media en geüploade bewijsstukken worden bewaard in de vault met hash, bron, grootte en opslag-metadata — lokale schijf op Hetzner UE-servers, of S3-compatible object storage (Cloudflare R2) voor hosted plannen.",
    "beA integration": "beA-integratie",
    "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste.":
      "Duitse elektronische juridische post (beA XML-export) landt direct in het zaakdossier: afzender, zaakreferentie en bijlagen vastgelegd en doorzoekbaar — zonder copy-paste.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Conflictencontrole (§ 43a BRAO / § 10 RAO / BGFA)",
    "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Screent elke nieuwe cliënt of tegenpartij server-side tegen de hele zaakbasis en markeert belangenconflicten voordat de opdracht wordt aangenomen. Dekt § 43a BRAO (DE), § 10 RAO (AT) en BGFA (CH).",
    "Time, expenses, invoices & DATEV": "Tijd, kosten, facturen & DATEV",
    "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready (DE) or ADATEV-ready (AT) accounting file.":
      "Registreer minuten per advocaat/activiteit, leg factureerbare kosten vast, maak facturen uit open werk, markeer gefactureerde entries en exporteer een DATEV-ready (DE) of ADATEV-ready (AT) boekhoudbestand.",
    "Case law DE · AT · CH": "Jurisprudentie DE · AT · CH",
    "Live search across openlegaldata/BGH (DE), RIS-OGD (AT) and bger.ch (CH) — relevant judgements land in the brain, citable, in one click.":
      "Live zoekopdracht in openlegaldata/BGH (DE), RIS-OGD (AT) en bger.ch (CH) — relevante uitspraken landen in het brain, citeerbaar, met één klik.",
    "Your server, your jurisdiction": "Jouw server, jouw jurisdictie",
    "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control.":
      "Self-host de volledige engine op kantoor-hardware met lokale opslag, of kies EU-hosted cloud met DPA en duurzame object storage. Klantdata verlaat nooit jouw controle.",
    "Offline-first daily work": "Offline-first dagelijks werk",
    "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again.":
      "Zaken, contacten, termijnen, facturen, vault, contracten en research houden lokale caches en wachtrijen wijzigingen tot de cloud brain weer bereikbaar is.",
    "Contradiction detection": "Tegenstrijdighedendetectie",
    "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations.":
      "De Dream Cycle brengt tegenstrijdige uitspraken tussen pleidooien, bewijsstukken en protocollen aan het licht — met citaten.",
    "Every claim, sourced": "Elke bewering, geciteerd",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Antwoorden citeren de exacte pagina's waar ze vandaan komen. Verifieer met één klik voordat iets in een pleidooi gaat.",
    "Matter-level isolation": "Isolatie op zaakniveau",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Toegang scoped per zaak en per gebruiker — fuzz-getest, zero lekken tussen zaken of teams.",
    // Proof + FAQ
    "Engine-grade retrieval, not a chat wrapper":
      "Retrieval van engine-kwaliteit, geen chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.":
      "De retrieval-kern bereikt 97,9% Recall@5 met hybride zoek en een knowledge graph — en omdat het draait op infrastructuur die jij controleert, beheert jouw IT elk systeem dat klantdata aanraakt.",
    "Is this legal advice software?": "Is dit software voor juridisch advies?",
    "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them.":
      "Nee. Subsumio organiseert en synthetiseert je documenten en notities. Juridisch oordeel blijft bij de advocaten — het brain zorgt er alleen voor dat niets in het dossier hen ontgaat.",
    "Can we run it fully offline?": "Kunnen we het volledig offline draaien?",
    "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway.":
      "De engine self-host op jouw hardware en het dashboard houdt lokale caches bij met een mutatie-wachtrij voor core legal workflows. Synthese gebruikt LLM APIs naar keuze; enterprise setups kunnen ruten via EU-endpoints of je eigen gateway.",
    "How much data can we store?": "Hoeveel data kunnen we opslaan?",
    "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms.":
      "Self-hosted gebruikt je eigen schijf of S3-compatible opslag. Hosted plannen bevatten cloud file storage per pakket en kunnen schalen naar custom retention en opslagvolumes voor enterprise kantoren.",
    "What about GDPR and our bar obligations?": "Wat about GDPR en onze balieplichten?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language.":
      "Self-hosted betekent dat data nooit je infrastructuur verlaat. Hosted plannen komen met EU-hosting en een DPA. Laat je functionaris voor gegevensbescherming met ons praten — we spreken hun taal.",
    "How is this different from Harvey, Legora or Noxtua?":
      "Hoe verschilt dit van Harvey, Legora of Noxtua?",
    "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture.":
      "Het zijn uitstekende enterprise legal-AI workspaces — en ze draaien op iemand anders' cloud en iemand anders' model. Subsumio geeft je dezelfde kwaliteit synthese op infrastructuur die JIJ controleert: self-hosted of EU-cloud, je eigen bestanden bevraagbaar gemaakt, met een WhatsApp copilot die je advocaten elke dag gebruiken. Het is geen juridisch onderzoek — het zijn de zaken van jouw kantoor, met paginaniveau-citaten en vertrouwelijkheid in de architectuur.",
  }),
};
