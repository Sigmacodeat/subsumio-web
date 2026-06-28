import { type Lang, applyReplacements, AT_REPLACEMENTS } from "./site";

export interface DocFeature {
  icon: string;
  title: string;
  desc: string;
}
export interface DocCategory {
  id: string;
  title: string;
  sub: string;
  features: DocFeature[];
}
export interface DocsContent {
  hero: { badge: string; title: string; claim: string; sub: string };
  intro: string;
  categories: DocCategory[];
  arch: { title: string; sub: string; items: DocFeature[] };
  cta: { title: string; sub: string; button: string };
}

const DE: DocsContent = {
  hero: {
    badge: "Handbuch",
    title: "Alles was",
    claim: "Subsumio kann.",
    sub: "Vollständige Feature-Dokumentation — direkt aus dem Quellcode. Keine Floskeln, nur Fakten.",
  },
  intro:
    "Subsumio ist eine vollständige Kanzlei-Software mit einem KI-Brain im Kern. Hier findest du jede Funktion, jeden Endpunkt und jeden Workflow — auf einen Blick.",
  categories: [
    {
      id: "brain",
      title: "Brain & KI",
      sub: "Semantisches Wissen, zitierte Antworten, Agenten.",
      features: [
        {
          icon: "Brain",
          title: "Semantic Brain",
          desc: "Vector-basierte Wissensdatenbank (PGLite oder Postgres + pgvector). Jede Entität und jedes Dokument embeddings-durchsuchbar.",
        },
        {
          icon: "Search",
          title: "KI-Chat mit Fundstellen",
          desc: "Jede Antwort zitiert die exakte Seite. Halluzinierte Zitate werden verworfen — RAG mit Groundedness-Check.",
        },
        {
          icon: "Zap",
          title: "Think / Reasoning",
          desc: "Deep-reasoning für komplexe Rechtsfragen. Trajectory-Tracking für zeitliche Entwicklungen und Metriken.",
        },
        {
          icon: "Network",
          title: "Agenten-System",
          desc: "Eigene Agenten erstellen und über API steuern. Skill-basiert, evaluierbar, federated über Multiple Brains.",
        },
        {
          icon: "GitBranch",
          title: "Graph & Entity View",
          desc: "Netzwerkansicht aller Entitäten und Beziehungen. Verborgene Verbindungen zwischen Mandanten und Gegenstellen.",
        },
        {
          icon: "ScanSearch",
          title: "RAG Evaluation",
          desc: "Eingebautes Benchmark-System für Retrieval-Qualität. Replay gegen erfasste Queries, LongMemEval-Support.",
        },
        {
          icon: "Zap",
          title: "KI-Assistent",
          desc: "Integrierter KI-Assistent im Dashboard. Kontextbewusste Hilfe für alle Workflow-Schritte — von der Aktenanlage bis zur Rechnung.",
        },
      ],
    },
    {
      id: "cases",
      title: "Akten & Dokumente",
      sub: "Aktenverwaltung, DMS-Integration, Dokumentenverarbeitung.",
      features: [
        {
          icon: "FolderOpen",
          title: "Aktenverwaltung",
          desc: "Mandanten- und Aktenstruktur mit Zugriffsrechten pro Nutzer und Akte. Fuzz-getestet auf zero leaks.",
        },
        {
          icon: "FileText",
          title: "Dokumenten-Upload & Vault",
          desc: "Drag-and-drop, revisionssichere Speicherung, Versionierung. Lokaler Vault oder verschlüsselter EU-Cloud-Speicher.",
        },
        {
          icon: "Database",
          title: "DMS-Integrationen",
          desc: "Native Anbindung an NetDocuments, iManage, Google Drive. Bi-direktionale Synchronisation.",
        },
        {
          icon: "Layers",
          title: "OCR & Dokumentenverarbeitung",
          desc: "Texterkennung, Klassifizierung, Named-Entity-Recognition. PDFs, Scans und Bilder werden durchsuchbar.",
        },
        {
          icon: "Mail",
          title: "Email-Import",
          desc: "Emails direkt ins Brain importieren — mit Anhängen, Metadaten und Aktenzuordnung. Resend-Integration.",
        },
        {
          icon: "MessageSquare",
          title: "Dokumenten-Analyse",
          desc: "KI-Analyse von Verträgen, Gutachten und Schriftsätzen. Risk-Highlighting, Redlining, Zusammenfassungen.",
        },
        {
          icon: "Layers",
          title: "Tabellarische Übersicht",
          desc: "Übersichtliche Tabellenansicht aller Akten, Dokumente und Fristen. Sortierbar, filterbar, direkt aus dem Brain.",
        },
        {
          icon: "FileText",
          title: "Vertragsmanagement",
          desc: "Vertragslebenszyklus-Management. Entwurf, Review, Versionierung, Ablaufdatum-Tracking, Erinnerungen.",
        },
        {
          icon: "Users",
          title: "Gegenstellen-Verwaltung",
          desc: "Erfassung aller Gegenanwälte, Versicherungen und Gegenstellen. Interessenkonflikt-Prüfung integriert.",
        },
      ],
    },
    {
      id: "deadlines",
      title: "Fristen & Zeit",
      sub: "Automatische Fristenerkennung, Kalender-Export, Zeiterfassung.",
      features: [
        {
          icon: "CalendarClock",
          title: "Fristen-Management",
          desc: "Zentrale Fristenübersicht mit Ampel-System. Automatische Email-Erinnerungen vor Ablauf.",
        },
        {
          icon: "Zap",
          title: "AI-Fristenerkennung",
          desc: "KI scannt automatisch alle Dokumente und Emails nach Fristen, Terminen und Deadlines — ohne manuelle Eingabe.",
        },
        {
          icon: "CalendarClock",
          title: "Kalender-Export",
          desc: "Synchronisation mit Outlook, Google Calendar, Apple Calendar. Fristen als Kalendereinträge exportiert.",
        },
        {
          icon: "Calculator",
          title: "Zeiterfassung & Auslagen",
          desc: "Per Chat, WhatsApp oder manuell — Zeiten und Auslagen der richtigen Akte zugeordnet, bestätigungspflichtig.",
        },
      ],
    },
    {
      id: "invoicing",
      title: "Rechnung & Finanzen",
      sub: "Rechnungsstellung, DATEV-Export, RVG, Mahnwesen.",
      features: [
        {
          icon: "FileText",
          title: "Rechnungsstellung",
          desc: "Automatische Rechnungsgenerierung aus Zeiterfassung. Professionelle PDF-Vorlagen mit Logo und Bankverbindung.",
        },
        {
          icon: "Database",
          title: "DATEV-Export",
          desc: "Export aller Buchungsdaten im DATEV-kompatiblen Format für die Kanzlei-Buchhaltung.",
        },
        {
          icon: "Calculator",
          title: "RVG-Berechnung",
          desc: "Automatische Berechnung nach Rechtsanwaltsvergütungsgesetz. VV, Geschäfts- und Verfahrensgebühr.",
        },
        {
          icon: "Megaphone",
          title: "Mahnwesen",
          desc: "Automatische Mahnungen für überfällige Rechnungen. Eskalationsstufen, Zinsberechnung, Email-Versand.",
        },
        {
          icon: "Calculator",
          title: "Kostenrechner",
          desc: "Interaktiver Rechner für Mandanten: Prozesskosten, RVG-Vorschau, Kostenvoranschlag.",
        },
        {
          icon: "Database",
          title: "Controlling & Kennzahlen",
          desc: "Kanzlei-Controlling: Umsatz, Deckungsbeitrag, Auslastung pro Anwalt, Mandantenprofitabilität. Export für Steuerberater.",
        },
      ],
    },
    {
      id: "security",
      title: "Sicherheit & Compliance",
      sub: "DSGVO, GoBD, AI Act, Audit Trail, Verschlüsselung.",
      features: [
        {
          icon: "Shield",
          title: "DSGVO / GDPR",
          desc: "AVV-Vorlage Art. 28, EU-Standardvertragsklauseln, Recht auf Datenübertragbarkeit, Löschung und Auskunft.",
        },
        {
          icon: "FileText",
          title: "GoBD / Verfahrensdokumentation",
          desc: "Vollautomatische GoBD-Verfahrensdokumentation. Jede Aktion revisionssicher protokolliert — prüfungsfest.",
        },
        {
          icon: "ShieldAlert",
          title: "AI Act Compliance",
          desc: "Eingebauter EU AI Act Compliance-Checker. Risikostufen, Dokumentationspflichten, Konformitätsnachweise.",
        },
        {
          icon: "Database",
          title: "Audit Trail",
          desc: "Lückenlose Protokollierung jeder Aktion: wer hat wann was mit welchem Dokument gemacht — unveränderbar.",
        },
        {
          icon: "Lock",
          title: "Verschlüsselung",
          desc: "End-to-End-Verschlüsselung At-Rest und In-Transit. Schlüsselhaltung beim Kunden bei Self-Hosting.",
        },
        {
          icon: "ShieldCheck",
          title: "2FA / TOTP",
          desc: "Zwei-Faktor-Authentifizierung nach industriellem Standard. Authy, Google Authenticator, Hardware-Keys.",
        },
        {
          icon: "Network",
          title: "Mandanten-Isolation",
          desc: "Strikte Zugriffstrennung pro Akte und Nutzer. Jeder Lesepfad auf Leaks zwischen Mandaten geprüft.",
        },
        {
          icon: "ShieldAlert",
          title: "System-Monitoring",
          desc: "Echtzeit-Health-Check aller Komponenten. API-Status, Datenbank, Background-Jobs, Embedding-Queues — alles im Blick.",
        },
        {
          icon: "Database",
          title: "Daten-Export",
          desc: "Vollständiger Daten-Export für Backup, Migration oder Portabilitätsanfragen. JSON, CSV, PDF — DSGVO-konform.",
        },
      ],
    },
    {
      id: "communication",
      title: "Kommunikation",
      sub: "Email, WhatsApp Copilot, Mandantenportal, Kommentare.",
      features: [
        {
          icon: "Mail",
          title: "Email-Management",
          desc: "Vollständiger Email-Client im Dashboard. Senden, Empfangen, Kategorisieren, Archivieren — alles an einem Ort.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp Copilot",
          desc: "Zeit buchen, Belege ablegen, Akten befragen — alles per WhatsApp. Keine neue App, keine Schulung. Bestätigungspflichtig.",
        },
        {
          icon: "Users",
          title: "Mandantenportal",
          desc: "Sichere Client-Portale für Dokumentenaustausch. Zeitlich begrenzte Links, Zugriffsprotokollierung.",
        },
        {
          icon: "MessageSquare",
          title: "Kommentare & Notizen",
          desc: "Akteninterne Kommentare, Notizen und Diskussionen. Threading, Erwähnungen, Benachrichtigungen.",
        },
        {
          icon: "Users",
          title: "Kontakteverwaltung",
          desc: "Zentrale Kontakte für Mandanten, Gegenanwälte, Gutachter, Gerichte und Behörden. Verknüpfung mit Akten und Fristen.",
        },
        {
          icon: "Users",
          title: "Team & Organisation",
          desc: "Team-Workspace-Verwaltung: Organisation erstellen, Mitglieder einladen, Rollen und Zugriffsrechte verteilen. Ein Brain für das ganze Team.",
        },
      ],
    },
    {
      id: "integrations",
      title: "Integrationen",
      sub: "DocuSign, Connectors, API, SSO, Webhooks.",
      features: [
        {
          icon: "FileSignature",
          title: "DocuSign",
          desc: "Elektronische Signatur direkt aus der Software. Verträge senden, Status tracken, archivieren.",
        },
        {
          icon: "Network",
          title: "Connectors",
          desc: "Offene API für Drittsysteme. Webhook-basierte Echtzeit-Synchronisation mit beliebigen Tools.",
        },
        {
          icon: "Database",
          title: "API Keys",
          desc: "Programmatischer REST-API-Zugriff. Rate-Limits, Scopes, Audit-Logging. Perfekt für Kanzlei-Integrationen.",
        },
        {
          icon: "Shield",
          title: "SSO / WorkOS",
          desc: "Single Sign-On über SAML, OIDC und WorkOS. Active Directory, Google Workspace, Microsoft 365.",
        },
        {
          icon: "Database",
          title: "Kanzlei-Import",
          desc: "Migration bestehender Kanzlei-Daten aus anderen Systemen. Kontakte, Akten, Dokumente, Zeiterfassung — alles übernommen.",
        },
        {
          icon: "Shield",
          title: "Kanzlei-Einstellungen",
          desc: "Zentrale Verwaltung der Kanzlei-Daten, Bankverbindungen, Logo, Signaturen, Benutzerrollen und Berechtigungen.",
        },
        {
          icon: "FileText",
          title: "Microsoft Word Add-in",
          desc: "Schriftsatz-Entwürfe und Vertragsvergleiche direkt in Microsoft Word. Mit Brain-Anbindung, Fundstellen-Einfügung und KI-Vorschlägen — ohne den Editor zu verlassen.",
        },
        {
          icon: "Network",
          title: "Plugin-System",
          desc: "Erweiterbarkeit durch eigene Plugins und Skills. subsumio.plugin.json Format, Subagenten, Skillpacks — die Plattform wächst mit deinen Workflows.",
        },
      ],
    },
    {
      id: "automation",
      title: "Automatisierung",
      sub: "Cron Jobs, Rechtsprechung, Fristen-Scanner, Agents.",
      features: [
        {
          icon: "Zap",
          title: "Rechtsprechungs-Scanner",
          desc: "Automatischer Scan neuer Gerichtsentscheidungen. Klassifizierung, Zusammenfassung, Einordnung ins Brain.",
        },
        {
          icon: "CalendarClock",
          title: "Fristen-Scanner",
          desc: "Automatischer Scan aller Dokumente auf Fristen. Keine Frist wird mehr übersehen.",
        },
        {
          icon: "ScanSearch",
          title: "Case Scanner",
          desc: "Überwachung laufender Verfahren auf neue Entwicklungen, Termine und Entscheidungen.",
        },
        {
          icon: "Brain",
          title: "Agenten-Automatisierung",
          desc: "Selbstkonfigurierbare Agents für wiederkehrende Aufgaben. Skill-basiert, evaluierbar, federated.",
        },
      ],
    },
    {
      id: "specialized",
      title: "Spezialmodule",
      sub: "Rechtsgebietsspezifisch: Medizinrecht, Immobilienrecht, Versicherungsrecht und mehr.",
      features: [
        {
          icon: "Landmark",
          title: "Rechtsprechung & Normen",
          desc: "Datenbank deutscher und österreichischer Rechtsquellen. BGB, StGB, HGB, ABGB, AktG — mit KI-Suche.",
        },
        {
          icon: "ShieldAlert",
          title: "Kollisionsprüfung",
          desc: "Automatische Interessenkonfliktprüfung vor Mandantenannahme. Gegenstellen, frühere Mandate, verbundene Personen.",
        },
        {
          icon: "Mail",
          title: "BEA-Anbindung",
          desc: "Besonderes elektronisches Anwaltspostfach (BEA) im Dashboard. Senden und Empfangen von beA-Nachrichten.",
        },
        {
          icon: "FileText",
          title: "Medizinrecht",
          desc: "Gutachtenanalyse, MDK-Schreiben, Krankenakten-Review, Fristenkatalog für Medizinrechtler.",
        },
        {
          icon: "Landmark",
          title: "Immobilienrecht",
          desc: "Kaufverträge, Grundbuchabfragen, Bebauungspläne, Maklervereinbarungen für Immobilienrechtler.",
        },
        {
          icon: "Shield",
          title: "Versicherungsrecht",
          desc: "Deckungsschutzanfragen, Schadensregulierung, Regress, Rechtsschutz für Versicherungsrechtler.",
        },
        {
          icon: "Users",
          title: "Recruiting",
          desc: "Bewerbungsmanagement, Talent-Pool, Onboarding-Checklisten, Arbeitsvertragsentwürfe für Kanzleien.",
        },
        {
          icon: "Search",
          title: "Rechtsrecherche",
          desc: "KI-gestützte Rechtsrecherche über alle gespeicherten Quellen. Fundstellen, Argumentationsketten, Gegenargumente — alles mit Quellen.",
        },
        {
          icon: "MessageSquare",
          title: "Beratung & Consulting",
          desc: "Modul für Rechtsberatung und Consulting. Projektstruktur, Stundenbudgets, Meilensteine, Abrechnung nach Pauschalhonorar oder Stundensatz.",
        },
        {
          icon: "Shield",
          title: "Compliance & GRC",
          desc: "Compliance- und Governance-Modul für DSGVO, GwG, EU AI Act. Pflichten, Kontrollen und der Nachweis — alles dokumentiert.",
        },
      ],
    },
    {
      id: "mobile",
      title: "Mobile & Offline",
      sub: "App, Offline-Sync, mobile Brücke.",
      features: [
        {
          icon: "Zap",
          title: "Mobile App",
          desc: "Native iOS und Android App. Zeitbuchung, Upload, Aktenzugriff, Chat — unterwegs genauso mächtig.",
        },
        {
          icon: "Database",
          title: "Offline-Sync",
          desc: "Arbeiten ohne Internet. Lokale Speicherung, konfliktfreie Synchronisation beim Wiedereinstieg.",
        },
        {
          icon: "MessageSquare",
          title: "Mobile Brücke",
          desc: "Nahtloser Handover Desktop ↔ Mobile. Auf dem Handy begonnen, im Browser fortgesetzt.",
        },
      ],
    },
    {
      id: "legal-ai",
      title: "Rechtsspezifische KI",
      sub: "Vertragsentwürfe, Redlining, Konfliktprüfung, Anonymisierung.",
      features: [
        {
          icon: "FileText",
          title: "Vertragsentwürfe",
          desc: "KI-generierte Entwürfe auf Basis von Mustern. AGB, Arbeitsverträge, Kaufverträge, Mietverträge.",
        },
        {
          icon: "Layers",
          title: "Redlining & Vertragsvergleich",
          desc: "Automatischer Vergleich von Vertragsversionen. Änderungen markieren, Risiken hervorheben.",
        },
        {
          icon: "ShieldAlert",
          title: "Konfliktprüfung",
          desc: "KI-gestützte Interessenkonfliktprüfung. Durchsucht alle Akten, Kontakte und Gegenstellen.",
        },
        {
          icon: "EyeOff",
          title: "Anonymisierung",
          desc: "Automatische Anonymisierung für Drittanbieter, Gutachter oder Publikationen. Namen, Adressen, Geburtsdaten.",
        },
        {
          icon: "FileText",
          title: "Schriftsatz-Entwürfe",
          desc: "KI-gestützte Entwürfe für Klageschriften, Verteidigungsschriften, Bescheidsprüfungen und Rechtsmittel. Mit Fundstellen und Zitaten.",
        },
      ],
    },
  ],
  arch: {
    title: "Technische Architektur",
    sub: "Aus dem Backend direkt — keine Spekulation.",
    items: [
      {
        icon: "Database",
        title: "72 API Endpunkte",
        desc: "Vollständige REST-API mit Auth, Rate-Limiting, Audit-Logging und TypeScript-Typen.",
      },
      {
        icon: "FolderOpen",
        title: "57 Dashboard-Seiten",
        desc: "Jede Funktion hat eine eigene, responsive Seite — von der Akte bis zum Kostenrechner.",
      },
      {
        icon: "Shield",
        title: "Self-Hosted oder EU-Cloud",
        desc: "Lokale Docker-Installation oder gehostet in der EU mit AVV. Daten verlassen nie deine Kontrolle.",
      },
      {
        icon: "Network",
        title: "Multi-Brain / Multi-Source",
        desc: "Mehrere Brains pro Organisation, mehrere Sources pro Brain. Federated Search über Latent Space.",
      },
      {
        icon: "Lock",
        title: "End-to-End-Verschlüsselung",
        desc: "At-Rest und In-Transit. Kein Training auf Mandantendaten. § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH) im Systemdesign.",
      },
      {
        icon: "Zap",
        title: "Echtzeit-Sync",
        desc: "WebSocket-basierte Echtzeit-Updates zwischen allen Clients. Kein Refresh nötig.",
      },
    ],
  },
  cta: {
    title: "Fragen zu einer Funktion?",
    sub: "Jede Funktion ist im Dashboard ausprobierbar — nicht nur dokumentiert.",
    button: "Dashboard öffnen",
  },
};

const EN: DocsContent = {
  hero: {
    badge: "Handbook",
    title: "Everything",
    claim: "Subsumio does.",
    sub: "Complete feature documentation — extracted directly from the source code. No marketing fluff, just facts.",
  },
  intro:
    "Subsumio is a complete law practice platform with an AI brain at its core. Here you'll find every feature, every endpoint, and every workflow — at a glance.",
  categories: [
    {
      id: "brain",
      title: "Brain & AI",
      sub: "Semantic knowledge, cited answers, agents.",
      features: [
        {
          icon: "Brain",
          title: "Semantic Brain",
          desc: "Vector-based knowledge base (PGLite or Postgres + pgvector). Every entity and document becomes embedding-searchable.",
        },
        {
          icon: "Search",
          title: "AI Chat with Citations",
          desc: "Every answer cites the exact page. Hallucinated citations are dropped — RAG with groundedness check.",
        },
        {
          icon: "Zap",
          title: "Think / Reasoning",
          desc: "Deep-reasoning for complex legal questions. Trajectory tracking for temporal developments.",
        },
        {
          icon: "Network",
          title: "Agent System",
          desc: "Create and control custom agents via API. Skill-based, evaluable, federated across multiple brains.",
        },
        {
          icon: "GitBranch",
          title: "Graph & Entity View",
          desc: "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.",
        },
        {
          icon: "ScanSearch",
          title: "RAG Evaluation",
          desc: "Built-in benchmark system for retrieval quality. Replay against captured queries, LongMemEval support.",
        },
        {
          icon: "Zap",
          title: "AI Assistant",
          desc: "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.",
        },
      ],
    },
    {
      id: "cases",
      title: "Cases & Documents",
      sub: "Case management, DMS integration, document processing.",
      features: [
        {
          icon: "FolderOpen",
          title: "Case Management",
          desc: "Client and case structure with per-user and per-case access rights. Fuzz-tested for zero leaks.",
        },
        {
          icon: "FileText",
          title: "Document Upload & Vault",
          desc: "Drag-and-drop, audit-proof storage, versioning. Local vault or encrypted EU cloud storage.",
        },
        {
          icon: "Database",
          title: "DMS Integrations",
          desc: "Native connection to NetDocuments, iManage, Google Drive. Bi-directional synchronization.",
        },
        {
          icon: "Layers",
          title: "OCR & Document Processing",
          desc: "Text recognition, classification, NER. PDFs, scans and images become searchable.",
        },
        {
          icon: "Mail",
          title: "Email Import",
          desc: "Import emails into the brain — with attachments, metadata and case assignment. Resend integration.",
        },
        {
          icon: "MessageSquare",
          title: "Document Analysis",
          desc: "AI analysis of contracts, opinions and pleadings. Risk highlighting, redlining, summaries.",
        },
        {
          icon: "Layers",
          title: "Tabular Review",
          desc: "Clean table view of all cases, documents and deadlines. Sortable, filterable, directly from the brain.",
        },
        {
          icon: "FileText",
          title: "Contract Management",
          desc: "Contract lifecycle management. Draft, review, versioning, expiry tracking, reminders.",
        },
        {
          icon: "Users",
          title: "Opponent Management",
          desc: "Capture all opposing counsel, insurers and opponents. Integrated conflict-of-interest check.",
        },
      ],
    },
    {
      id: "deadlines",
      title: "Deadlines & Time",
      sub: "Automatic deadline detection, calendar export, time tracking.",
      features: [
        {
          icon: "CalendarClock",
          title: "Deadline Management",
          desc: "Central deadline overview with traffic-light system. Automatic email reminders before expiration.",
        },
        {
          icon: "Zap",
          title: "AI Deadline Detection",
          desc: "AI automatically scans all documents and emails for deadlines, appointments and due dates — no manual entry.",
        },
        {
          icon: "CalendarClock",
          title: "Calendar Export",
          desc: "Sync with Outlook, Google Calendar, Apple Calendar. Deadlines exported as calendar entries.",
        },
        {
          icon: "Calculator",
          title: "Time Tracking & Expenses",
          desc: "Via chat, WhatsApp or manual — times and expenses assigned to the correct case, confirmation-gated.",
        },
      ],
    },
    {
      id: "invoicing",
      title: "Billing & Finance",
      sub: "Invoicing, DATEV export, fee calculation, dunning.",
      features: [
        {
          icon: "FileText",
          title: "Invoicing",
          desc: "Automatic invoice generation from time tracking. Professional PDF templates with logo and bank details.",
        },
        {
          icon: "Database",
          title: "DATEV Export",
          desc: "Export all booking data in DATEV-compatible format for the firm's accounting system.",
        },
        {
          icon: "Calculator",
          title: "Fee Calculation (RVG)",
          desc: "Automatic calculation per German Lawyers' Remuneration Act. VV, business and procedural fees.",
        },
        {
          icon: "Megaphone",
          title: "Dunning",
          desc: "Automatic reminders for overdue invoices. Escalation levels, interest calculation, email dispatch.",
        },
        {
          icon: "Calculator",
          title: "Cost Calculator",
          desc: "Interactive calculator for clients: process costs, fee preview, quote at the push of a button.",
        },
        {
          icon: "Database",
          title: "Controlling & KPIs",
          desc: "Firm controlling: revenue, contribution margin, per-lawyer utilization, client profitability. Export for tax advisors.",
        },
      ],
    },
    {
      id: "security",
      title: "Security & Compliance",
      sub: "GDPR, GoBD, AI Act, audit trail, encryption.",
      features: [
        {
          icon: "Shield",
          title: "GDPR / DSGVO",
          desc: "DPA template Art. 28, EU standard contractual clauses, right to data portability, erasure and access.",
        },
        {
          icon: "FileText",
          title: "GoBD / Process Documentation",
          desc: "Fully automatic GoBD process documentation. Every action audit-proof logged — inspection-ready.",
        },
        {
          icon: "ShieldAlert",
          title: "AI Act Compliance",
          desc: "Built-in EU AI Act compliance checker. Risk levels, documentation obligations, conformity evidence.",
        },
        {
          icon: "Database",
          title: "Audit Trail",
          desc: "Complete logging of every action: who did what when with which document — immutable.",
        },
        {
          icon: "Lock",
          title: "Encryption",
          desc: "End-to-end encryption at-rest and in-transit. Key custody with the customer for self-hosting.",
        },
        {
          icon: "ShieldCheck",
          title: "2FA / TOTP",
          desc: "Two-factor authentication per industry standard. Authy, Google Authenticator, hardware keys.",
        },
        {
          icon: "Network",
          title: "Client Isolation",
          desc: "Strict access separation per case and user. Every read path checked for leaks between mandates.",
        },
        {
          icon: "ShieldAlert",
          title: "System Monitoring",
          desc: "Real-time health check of all components. API status, database, background jobs, embedding queues — all in view.",
        },
        {
          icon: "Database",
          title: "Data Export",
          desc: "Complete data export for backup, migration or portability requests. JSON, CSV, PDF — GDPR-compliant.",
        },
      ],
    },
    {
      id: "communication",
      title: "Communication",
      sub: "Email, WhatsApp Copilot, client portal, comments.",
      features: [
        {
          icon: "Mail",
          title: "Email Management",
          desc: "Full email client in the dashboard. Send, receive, categorize, archive — all in one place.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp Copilot",
          desc: "Book time, file documents, query cases — all via WhatsApp. No new app, no training. Confirmation-gated.",
        },
        {
          icon: "Users",
          title: "Client Portal",
          desc: "Secure client portals for document exchange. Time-limited links, access logging.",
        },
        {
          icon: "MessageSquare",
          title: "Comments & Notes",
          desc: "Case-internal comments, notes and discussions. Threading, mentions, notifications.",
        },
        {
          icon: "Users",
          title: "Contact Management",
          desc: "Central contacts for clients, opposing counsel, experts, courts and authorities. Linked to cases and deadlines.",
        },
        {
          icon: "Users",
          title: "Team & Organization",
          desc: "Team workspace management: create organization, invite members, assign roles and access rights. One brain for the whole team.",
        },
      ],
    },
    {
      id: "integrations",
      title: "Integrations",
      sub: "DocuSign, connectors, API, SSO, webhooks.",
      features: [
        {
          icon: "FileSignature",
          title: "DocuSign",
          desc: "Electronic signature directly from the software. Send contracts, track status, archive.",
        },
        {
          icon: "Network",
          title: "Connectors",
          desc: "Open API for third-party systems. Webhook-based real-time sync with any tool.",
        },
        {
          icon: "Database",
          title: "API Keys",
          desc: "Programmatic REST API access. Rate limits, scopes, audit logging. Perfect for practice software integrations.",
        },
        {
          icon: "Shield",
          title: "SSO / WorkOS",
          desc: "Single sign-on via SAML, OIDC and WorkOS. Active Directory, Google Workspace, Microsoft 365.",
        },
        {
          icon: "Database",
          title: "Firm Import",
          desc: "Migrate existing firm data from other systems. Contacts, cases, documents, time tracking — all transferred.",
        },
        {
          icon: "Shield",
          title: "Firm Settings",
          desc: "Central management of firm data, bank details, logo, signatures, user roles and permissions.",
        },
        {
          icon: "FileText",
          title: "Microsoft Word Add-in",
          desc: "Draft pleadings and compare contracts directly in Microsoft Word. With brain connection, source insertion and AI suggestions — without leaving the editor.",
        },
        {
          icon: "Network",
          title: "Plugin System",
          desc: "Extensibility through custom plugins and skills. subsumio.plugin.json format, subagents, skillpacks — the platform grows with your workflows.",
        },
      ],
    },
    {
      id: "automation",
      title: "Automation",
      sub: "Cron jobs, case law, deadline scanner, agents.",
      features: [
        {
          icon: "Zap",
          title: "Case Law Scanner",
          desc: "Automatic scan of new court decisions. Classification, summary, integration into the brain.",
        },
        {
          icon: "CalendarClock",
          title: "Deadline Scanner",
          desc: "Automatic scan of all documents for deadlines. No deadline is missed again.",
        },
        {
          icon: "ScanSearch",
          title: "Case Scanner",
          desc: "Monitoring of ongoing cases for new developments, hearings and decisions.",
        },
        {
          icon: "Brain",
          title: "Agent Automation",
          desc: "Self-configurable agents for recurring tasks. Skill-based, evaluable, federated.",
        },
      ],
    },
    {
      id: "specialized",
      title: "Specialized Modules",
      sub: "Practice-area-specific: medical law, real estate law, insurance law and more.",
      features: [
        {
          icon: "Landmark",
          title: "Case Law & Norms",
          desc: "Database of German and Austrian legal sources. BGB, StGB, HGB, ABGB, AktG — with AI search.",
        },
        {
          icon: "ShieldAlert",
          title: "Conflict Check",
          desc: "Automatic interest conflict check before client intake. Opponents, prior mandates, related persons.",
        },
        {
          icon: "Mail",
          title: "BEA Connection",
          desc: "Special electronic lawyer mailbox (BEA) in the dashboard. Send and receive beA messages.",
        },
        {
          icon: "FileText",
          title: "Medical Law",
          desc: "Opinion analysis, MDK letters, medical record review, deadline catalog for medical lawyers.",
        },
        {
          icon: "Landmark",
          title: "Real Estate Law",
          desc: "Purchase contracts, land register queries, development plans, broker agreements for real estate lawyers.",
        },
        {
          icon: "Shield",
          title: "Insurance Law",
          desc: "Coverage inquiries, loss adjustment, recourse, legal protection for insurance lawyers.",
        },
        {
          icon: "Users",
          title: "Recruiting",
          desc: "Application management, talent pool, onboarding checklists, employment contract drafts for law firms.",
        },
        {
          icon: "Search",
          title: "Legal Research",
          desc: "AI-powered legal research across all stored sources. Findings, argument chains, counter-arguments — all with sources.",
        },
        {
          icon: "MessageSquare",
          title: "Consulting",
          desc: "Module for legal advice and consulting mandates. Project structure, hour budgets, milestones, billing by flat fee or hourly rate.",
        },
        {
          icon: "Shield",
          title: "Compliance & GRC",
          desc: "Compliance and governance module for GDPR, AML, EU AI Act. Obligations, controls and evidence — all documented.",
        },
      ],
    },
    {
      id: "mobile",
      title: "Mobile & Offline",
      sub: "App, offline sync, mobile bridge.",
      features: [
        {
          icon: "Zap",
          title: "Mobile App",
          desc: "Native iOS and Android app. Time tracking, upload, case access, chat — equally powerful on the go.",
        },
        {
          icon: "Database",
          title: "Offline Sync",
          desc: "Work without internet. Local storage, conflict-free sync on reconnection.",
        },
        {
          icon: "MessageSquare",
          title: "Mobile Bridge",
          desc: "Seamless handover desktop ↔ mobile. Started on phone, continued in browser.",
        },
      ],
    },
    {
      id: "legal-ai",
      title: "Legal AI",
      sub: "Contract drafts, redlining, conflict check, anonymization.",
      features: [
        {
          icon: "FileText",
          title: "Contract Drafts",
          desc: "AI-generated drafts based on templates. T&Cs, employment contracts, purchase contracts, lease agreements.",
        },
        {
          icon: "Layers",
          title: "Redlining & Comparison",
          desc: "Automatic comparison of contract versions. Mark changes, highlight risks.",
        },
        {
          icon: "ShieldAlert",
          title: "Conflict Check",
          desc: "AI-powered interest conflict check. Searches all cases, contacts and opponents.",
        },
        {
          icon: "EyeOff",
          title: "Anonymization",
          desc: "Automatic anonymization for third parties, experts or publications. Names, addresses, birth dates.",
        },
        {
          icon: "FileText",
          title: "Pleadings Drafts",
          desc: "AI-assisted drafts for complaints, defense briefs, review petitions and legal remedies. With sources and citations.",
        },
      ],
    },
  ],
  arch: {
    title: "Technical Architecture",
    sub: "Straight from the backend — no speculation.",
    items: [
      {
        icon: "Database",
        title: "72 API Endpoints",
        desc: "Complete REST API with auth, rate limiting, audit logging and TypeScript types.",
      },
      {
        icon: "FolderOpen",
        title: "57 Dashboard Pages",
        desc: "Every function has its own responsive page — from the case file to the cost calculator.",
      },
      {
        icon: "Shield",
        title: "Self-Hosted or EU Cloud",
        desc: "Local Docker installation or hosted in the EU with DPA. Data never leaves your control.",
      },
      {
        icon: "Network",
        title: "Multi-Brain / Multi-Source",
        desc: "Multiple brains per organization, multiple sources per brain. Federated search over latent space.",
      },
      {
        icon: "Lock",
        title: "End-to-End Encryption",
        desc: "At-rest and in-transit. No training on client data. Professional secrecy by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).",
      },
      {
        icon: "Zap",
        title: "Real-Time Sync",
        desc: "WebSocket-based real-time updates between all clients. No refresh needed.",
      },
    ],
  },
  cta: {
    title: "Something unclear?",
    sub: "Every feature can be tried in the dashboard — not just documented.",
    button: "Open Dashboard",
  },
};

export function getDocs(lang: Lang): DocsContent {
  if (lang === "en") return EN;
  if (lang === "at") return applyReplacements(DE, AT_REPLACEMENTS);
  return DE;
}
