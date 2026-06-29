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

const IT_DOCS_REPLACEMENTS: Record<string, string> = {
  Handbook: "Manuale",
  Everything: "Tutto",
  "Subsumio does.": "ciò che Subsumio fa.",
  "Complete feature documentation — extracted directly from the source code. No marketing fluff, just facts.":
    "Documentazione completa delle funzionalità — estratta direttamente dal codice sorgente. Niente marketing, solo fatti.",
  "Subsumio is a complete law practice platform with an AI brain at its core. Here you'll find every feature, every endpoint, and every workflow — at a glance.":
    "Subsumio è una piattaforma completa per studi legali con un brain AI al centro. Qui trovi ogni funzione, ogni endpoint e ogni workflow — a colpo d'occhio.",
  "Brain & AI": "Brain & AI",
  "Semantic knowledge, cited answers, agents.": "Conoscenza semantica, risposte citate, agenti.",
  "Semantic Brain": "Brain Semantico",
  "Vector-based knowledge base (PGLite or Postgres + pgvector). Every entity and document becomes embedding-searchable.":
    "Knowledge base vettoriale (PGLite o Postgres + pgvector). Ogni entità e documento diventa ricercabile via embedding.",
  "AI Chat with Citations": "Chat AI con Citazioni",
  "Every answer cites the exact page. Hallucinated citations are dropped — RAG with groundedness check.":
    "Ogni risposta cita la pagina esatta. Le citazioni allucinate vengono scartate — RAG con controllo di groundedness.",
  "Think / Reasoning": "Think / Ragionamento",
  "Deep-reasoning for complex legal questions. Trajectory tracking for temporal developments.":
    "Ragionamento profondo per questioni legali complesse. Tracciamento delle traiettorie per sviluppi temporali.",
  "Agent System": "Sistema Agenti",
  "Create and control custom agents via API. Skill-based, evaluable, federated across multiple brains.":
    "Crea e controlla agenti personalizzati via API. Basati su skill, valutabili, federati su più brain.",
  "Graph & Entity View": "Vista Grafo & Entità",
  "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.":
    "Vista a rete di tutte le entità e relazioni. Scopre connessioni nascoste tra clienti e controparti.",
  "RAG Evaluation": "Valutazione RAG",
  "Built-in benchmark system for retrieval quality. Replay against captured queries, LongMemEval support.":
    "Sistema di benchmark integrato per la qualità del retrieval. Replay su query catturate, supporto LongMemEval.",
  "AI Assistant": "Assistente AI",
  "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.":
    "Assistente AI integrato nella dashboard. Aiuto context-aware per ogni passo del workflow — dalla creazione del caso alla fatturazione.",
  "Cases & Documents": "Casi & Documenti",
  "Case management, DMS integration, document processing.":
    "Gestione casi, integrazione DMS, elaborazione documenti.",
  "Case Management": "Gestione Casi",
  "Client and case structure with per-user and per-case access rights. Fuzz-tested for zero leaks.":
    "Struttura clienti e casi con diritti di accesso per utente e per caso. Fuzz-tested per zero leak.",
  "Document Upload & Vault": "Upload Documenti & Vault",
  "Drag-and-drop, audit-proof storage, versioning. Local vault or encrypted EU cloud storage.":
    "Drag-and-drop, archiviazione audit-proof, versioning. Vault locale o archiviazione EU cloud crittografata.",
  "DMS Integrations": "Integrazioni DMS",
  "Native connection to NetDocuments, iManage, Google Drive. Bi-directional synchronization.":
    "Connessione nativa a NetDocuments, iManage, Google Drive. Sincronizzazione bi-direzionale.",
  "OCR & Document Processing": "OCR & Elaborazione Documenti",
  "Text recognition, classification, NER. PDFs, scans and images become searchable.":
    "Riconoscimento testo, classificazione, NER. PDF, scansioni e immagini diventano ricercabili.",
  "Email Import": "Import Email",
  "Import emails into the brain — with attachments, metadata and case assignment. Resend integration.":
    "Importa email nel brain — con allegati, metadata e assegnazione caso. Integrazione Resend.",
  "Document Analysis": "Analisi Documenti",
  "AI analysis of contracts, opinions and pleadings. Risk highlighting, redlining, summaries.":
    "Analisi AI di contratti, pareri e atti. Evidenziazione rischi, redlining, riassunti.",
  "Tabular Review": "Revisione Tabellare",
  "Clean table view of all cases, documents and deadlines. Sortable, filterable, directly from the brain.":
    "Vista tabellare pulita di tutti i casi, documenti e scadenze. Ordinabile, filtrabile, direttamente dal brain.",
  "Contract Management": "Gestione Contratti",
  "Contract lifecycle management. Draft, review, versioning, expiry tracking, reminders.":
    "Gestione del ciclo di vita dei contratti. Bozze, revisione, versioning, tracciamento scadenze, promemoria.",
  "Opponent Management": "Gestione Controparti",
  "Capture all opposing counsel, insurers and opponents. Integrated conflict-of-interest check.":
    "Registra tutti gli avvocati avversari, assicurazioni e controparti. Controllo conflitto di interessi integrato.",
  "Deadlines & Time": "Scadenze & Tempo",
  "Automatic deadline detection, calendar export, time tracking.":
    "Rilevamento automatico scadenze, export calendario, tracciamento tempo.",
  "Calendar Export": "Export Calendario",
  "Sync with Outlook, Google Calendar, Apple Calendar. Deadlines exported as calendar entries.":
    "Sincronizzazione con Outlook, Google Calendar, Apple Calendar. Scadenze esportate come voci di calendario.",
  "Billing & Finance": "Fatturazione & Finanza",
  "Invoicing, DATEV export, fee calculation, dunning.":
    "Fatturazione, export DATEV, calcolo onorari, solleciti.",
  "DATEV Export": "Export DATEV",
  "Export all booking data in DATEV-compatible format for the firm's accounting system.":
    "Esporta tutti i dati contabili in formato compatibile DATEV per il sistema di contabilità dello studio.",
  "Controlling & KPIs": "Controlling & KPI",
  "Firm controlling: revenue, contribution margin, per-lawyer utilization, client profitability. Export for tax advisors.":
    "Controlling dello studio: ricavi, margine di contribuzione, utilizzo per avvocato, redditività cliente. Export per commercialisti.",
  "Data Export": "Export Dati",
  "Complete data export for backup, migration or portability requests. JSON, CSV, PDF — GDPR-compliant.":
    "Export completo dei dati per backup, migrazione o richieste di portabilità. JSON, CSV, PDF — conforme GDPR.",
  Integrations: "Integrazioni",
  "DocuSign, connectors, API, SSO, webhooks.": "DocuSign, connector, API, SSO, webhook.",
  Connectors: "Connector",
  "Open API for third-party systems. Webhook-based real-time sync with any tool.":
    "API aperta per sistemi di terze parti. Sincronizzazione real-time via webhook con qualsiasi strumento.",
  "API Keys": "Chiavi API",
  "Programmatic REST API access. Rate limits, scopes, audit logging. Perfect for practice software integrations.":
    "Accesso programmatico REST API. Rate limit, scope, audit logging. Perfetto per integrazioni software legale.",
  "SSO / WorkOS": "SSO / WorkOS",
  "Single sign-on via SAML, OIDC and WorkOS. Active Directory, Google Workspace, Microsoft 365.":
    "Single sign-on via SAML, OIDC e WorkOS. Active Directory, Google Workspace, Microsoft 365.",
  "Firm Import": "Import Studio",
  "Migrate existing firm data from other systems. Contacts, cases, documents, time tracking — all transferred.":
    "Migra dati esistenti dello studio da altri sistemi. Contatti, casi, documenti, tracciamento tempo — tutto trasferito.",
  "Firm Settings": "Impostazioni Studio",
  "Central management of firm data, bank details, logo, signatures, user roles and permissions.":
    "Gestione centrale dei dati dello studio, coordinate bancarie, logo, firme, ruoli utente e permessi.",
  "Microsoft Word Add-in": "Add-in Microsoft Word",
  "Draft pleadings and compare contracts directly in Microsoft Word. With brain connection, source insertion and AI suggestions — without leaving the editor.":
    "Redigi atti e confronta contratti direttamente in Microsoft Word. Con connessione brain, inserimento fonti e suggerimenti AI — senza lasciare l'editor.",
  "Plugin System": "Sistema Plugin",
  "Extensibility through custom plugins and skills. subsumio.plugin.json format, subagents, skillpacks — the platform grows with your workflows.":
    "Estendibilità tramite plugin e skill personalizzati. Formato subsumio.plugin.json, subagent, skillpack — la piattaforma cresce con i tuoi workflow.",
  Automation: "Automazione",
  "Cron jobs, case law, deadline scanner, agents.":
    "Cron job, giurisprudenza, scanner scadenze, agenti.",
  "Case Law Scanner": "Scanner Giurisprudenza",
  "Automatic scan of new court decisions. Classification, summary, integration into the brain.":
    "Scansione automatica di nuove decisioni giudiziarie. Classificazione, riassunto, integrazione nel brain.",
  "Deadline Scanner": "Scanner Scadenze",
  "Automatic scan of all documents for deadlines. No deadline is missed again.":
    "Scansione automatica di tutti i documenti per scadenze. Nessuna scadenza viene più persa.",
  "Case Scanner": "Scanner Casi",
  "Monitoring of ongoing cases for new developments, hearings and decisions.":
    "Monitoraggio dei casi in corso per nuovi sviluppi, udienze e decisioni.",
  "Agent Automation": "Automazione Agenti",
  "Self-configurable agents for recurring tasks. Skill-based, evaluable, federated.":
    "Agenti auto-configurabili per task ricorrenti. Basati su skill, valutabili, federati.",
  "Specialized Modules": "Moduli Specializzati",
  "Practice-area-specific: medical law, real estate law, insurance law and more.":
    "Specifici per area di pratica: diritto medico, diritto immobiliare, diritto assicurativo e altro.",
  "Case Law & Norms": "Giurisprudenza & Norme",
  "Database of German and Austrian legal sources. BGB, StGB, HGB, ABGB, AktG — with AI search.":
    "Database di fonti legali tedesche e austriache. BGB, StGB, HGB, ABGB, AktG — con ricerca AI.",
  "Conflict Check": "Controllo Conflitti",
  "Automatic interest conflict check before client intake. Opponents, prior mandates, related persons.":
    "Controllo automatico conflitto di interessi prima dell'acquisizione cliente. Controparti, mandati precedenti, persone correlate.",
  "BEA Connection": "Connessione BEA",
  "Special electronic lawyer mailbox (BEA) in the dashboard. Send and receive beA messages.":
    "Casella postale elettronica avvocati (BEA) nella dashboard. Invia e ricevi messaggi beA.",
  "Medical Law": "Diritto Medico",
  "Opinion analysis, MDK letters, medical record review, deadline catalog for medical lawyers.":
    "Analisi pareri, lettere MDK, revisione cartelle cliniche, catalogo scadenze per avvocati medicalisti.",
  "Real Estate Law": "Diritto Immobiliare",
  "Purchase contracts, land register queries, development plans, broker agreements for real estate lawyers.":
    "Contratti di compravendita, interrogazioni catasto, piani urbanistici, contratti broker per avvocati immobiliaristi.",
  "Insurance Law": "Diritto Assicurativo",
  "Coverage inquiries, loss adjustment, recourse, legal protection for insurance lawyers.":
    "Richieste di copertura, regolazione sinistri, rivalsa, tutela legale per avvocati assicurativi.",
  Recruiting: "Reclutamento",
  "Application management, talent pool, onboarding checklists, employment contract drafts for law firms.":
    "Gestione candidature, talent pool, checklist onboarding, bozze contratti di lavoro per studi legali.",
  "Legal Research": "Ricerca Legale",
  "AI-powered legal research across all stored sources. Findings, argument chains, counter-arguments — all with sources.":
    "Ricerca legale AI su tutte le fonti archiviate. Risultati, catene argomentative, contro-argomenti — tutto con fonti.",
  Consulting: "Consulenza",
  "Module for legal advice and consulting mandates. Project structure, hour budgets, milestones, billing by flat fee or hourly rate.":
    "Modulo per consulenza legale e mandati di consulenza. Struttura progetto, budget ore, milestone, fatturazione a forfait o a ore.",
  "Compliance & GRC": "Compliance & GRC",
  "Compliance and governance module for GDPR, AML, EU AI Act. Obligations, controls and evidence — all documented.":
    "Modulo compliance e governance per GDPR, AML, EU AI Act. Obblighi, controlli ed evidenze — tutto documentato.",
  "Mobile & Offline": "Mobile & Offline",
  "App, offline sync, mobile bridge.": "App, sync offline, bridge mobile.",
  "Mobile App": "App Mobile",
  "Native iOS and Android app. Time tracking, upload, case access, chat — equally powerful on the go.":
    "App nativa iOS e Android. Tracciamento tempo, upload, accesso casi, chat — ugualmente potente in mobilità.",
  "Offline Sync": "Sync Offline",
  "Work without internet. Local storage, conflict-free sync on reconnection.":
    "Lavora senza internet. Archiviazione locale, sync senza conflitti alla riconnessione.",
  "Mobile Bridge": "Bridge Mobile",
  "Seamless handover desktop ↔ mobile. Started on phone, continued in browser.":
    "Passaggio fluido desktop ↔ mobile. Iniziato sul telefono, continuato nel browser.",
  "Legal AI": "AI Legale",
  "Contract drafts, redlining, conflict check, anonymization.":
    "Bozze contratti, redlining, controllo conflitti, anonimizzazione.",
  "Contract Drafts": "Bozze Contratti",
  "AI-generated drafts based on templates. T&Cs, employment contracts, purchase contracts, lease agreements.":
    "Bozze generate AI basate su template. CGV, contratti di lavoro, contratti di compravendita, contratti di locazione.",
  "Redlining & Comparison": "Redlining & Confronto",
  "Automatic comparison of contract versions. Mark changes, highlight risks.":
    "Confronto automatico delle versioni contratto. Evidenzia modifiche, segnala rischi.",
  Anonymization: "Anonimizzazione",
  "Automatic anonymization for third parties, experts or publications. Names, addresses, birth dates.":
    "Anonimizzazione automatica per terzi, periti o pubblicazioni. Nomi, indirizzi, date di nascita.",
  "Pleadings Drafts": "Bozze Atti",
  "AI-assisted drafts for complaints, defense briefs, review petitions and legal remedies. With sources and citations.":
    "Bozze assistite AI per querelle, memorie di difesa, ricorsi e rimedi legali. Con fonti e citazioni.",
  "Technical Architecture": "Architettura Tecnica",
  "Straight from the backend — no speculation.": "Direttamente dal backend — nessuna speculazione.",
  "72 API Endpoints": "72 Endpoint API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "API REST completa con auth, rate limiting, audit logging e tipi TypeScript.",
  "57 Dashboard Pages": "57 Pagine Dashboard",
  "Every function has its own responsive page — from the case file to the cost calculator.":
    "Ogni funzione ha la sua pagina responsive — dal fascicolo al calcolatore costi.",
  "Self-Hosted or EU Cloud": "Self-Hosted o EU Cloud",
  "Local Docker installation or hosted in the EU with DPA. Data never leaves your control.":
    "Installazione Docker locale o hosting EU con AVV. I dati non escono mai dal tuo controllo.",
  "Multi-Brain / Multi-Source": "Multi-Brain / Multi-Source",
  "Multiple brains per organization, multiple sources per brain. Federated search over latent space.":
    "Più brain per organizzazione, più fonti per brain. Ricerca federata sullo spazio latente.",
  "End-to-End Encryption": "Crittografia End-to-End",
  "At-rest and in-transit. No training on client data. Professional secrecy by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).":
    "At-rest e in-transit. Nessun training sui dati cliente. Segreto professionale per design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).",
  "Real-Time Sync": "Sync Real-Time",
  "WebSocket-based real-time updates between all clients. No refresh needed.":
    "Aggiornamenti real-time via WebSocket tra tutti i client. Nessun refresh necessario.",
  "Something unclear?": "Qualcosa non chiaro?",
  "Every feature can be tried in the dashboard — not just documented.":
    "Ogni funzione può essere provata nella dashboard — non solo documentata.",
  "Open Dashboard": "Apri Dashboard",
  "Comments & Notes": "Commenti & Note",
  "Case-internal comments, notes and discussions. Threading, mentions, notifications.":
    "Commenti interni al caso, note e discussioni. Threading, mention, notifiche.",
  "Contact Management": "Gestione Contatti",
  "Central contacts for clients, opposing counsel, experts, courts and authorities. Linked to cases and deadlines.":
    "Contatti centrali per clienti, avvocati avversari, periti, tribunali e autorità. Collegati a casi e scadenze.",
  "Team & Organization": "Team & Organizzazione",
  "Team workspace management: create organization, invite members, assign roles and access rights. One brain for the whole team.":
    "Gestione workspace team: crea organizzazione, invita membri, assegna ruoli e diritti di accesso. Un brain per tutto il team.",
};

const ES_DOCS_REPLACEMENTS: Record<string, string> = {
  Handbook: "Manual",
  Everything: "Todo",
  "Subsumio does.": "lo que Subsumio hace.",
  "Complete feature documentation — extracted directly from the source code. No marketing fluff, just facts.":
    "Documentación completa de funciones — extraída directamente del código fuente. Sin marketing, solo hechos.",
  "Subsumio is a complete law practice platform with an AI brain at its core. Here you'll find every feature, every endpoint, and every workflow — at a glance.":
    "Subsumio es una plataforma completa para bufetes con un brain AI en su núcleo. Aquí encuentras cada función, cada endpoint y cada workflow — de un vistazo.",
  "Semantic knowledge, cited answers, agents.":
    "Conocimiento semántico, respuestas citadas, agentes.",
  "Semantic Brain": "Brain Semántico",
  "Vector-based knowledge base (PGLite or Postgres + pgvector). Every entity and document becomes embedding-searchable.":
    "Base de conocimiento vectorial (PGLite o Postgres + pgvector). Cada entidad y documento se vuelve buscable via embedding.",
  "AI Chat with Citations": "Chat AI con Citas",
  "Every answer cites the exact page. Hallucinated citations are dropped — RAG with groundedness check.":
    "Cada respuesta cita la página exacta. Las citas alucinadas se descartan — RAG con control de groundedness.",
  "Think / Reasoning": "Think / Razonamiento",
  "Deep-reasoning for complex legal questions. Trajectory tracking for temporal developments.":
    "Razonamiento profundo para cuestiones legales complejas. Seguimiento de trayectorias para desarrollos temporales.",
  "Agent System": "Sistema de Agentes",
  "Create and control custom agents via API. Skill-based, evaluable, federated across multiple brains.":
    "Crea y controla agentes personalizados via API. Basados en skills, evaluables, federados en múltiples brains.",
  "Graph & Entity View": "Vista Grafo & Entidades",
  "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.":
    "Vista en red de todas las entidades y relaciones. Descubre conexiones ocultas entre clientes y contrapartes.",
  "RAG Evaluation": "Evaluación RAG",
  "Built-in benchmark system for retrieval quality. Replay against captured queries, LongMemEval support.":
    "Sistema de benchmark integrado para la calidad de retrieval. Replay sobre queries capturadas, soporte LongMemEval.",
  "AI Assistant": "Asistente AI",
  "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.":
    "Asistente AI integrado en el dashboard. Ayuda context-aware para cada paso del workflow — desde la creación del caso hasta la facturación.",
  "Cases & Documents": "Casos & Documentos",
  "Case management, DMS integration, document processing.":
    "Gestión de casos, integración DMS, procesamiento de documentos.",
  "Case Management": "Gestión de Casos",
  "Client and case structure with per-user and per-case access rights. Fuzz-tested for zero leaks.":
    "Estructura de clientes y casos con derechos de acceso por usuario y por caso. Fuzz-tested para cero leaks.",
  "Document Upload & Vault": "Subida de Documentos & Vault",
  "Drag-and-drop, audit-proof storage, versioning. Local vault or encrypted EU cloud storage.":
    "Drag-and-drop, almacenamiento audit-proof, versioning. Vault local o almacenamiento EU cloud cifrado.",
  "DMS Integrations": "Integraciones DMS",
  "Native connection to NetDocuments, iManage, Google Drive. Bi-directional synchronization.":
    "Conexión nativa a NetDocuments, iManage, Google Drive. Sincronización bidireccional.",
  "OCR & Document Processing": "OCR & Procesamiento de Documentos",
  "Text recognition, classification, NER. PDFs, scans and images become searchable.":
    "Reconocimiento de texto, clasificación, NER. PDFs, escaneos e imágenes se vuelven buscables.",
  "Email Import": "Import de Email",
  "Import emails into the brain — with attachments, metadata and case assignment. Resend integration.":
    "Importa emails al brain — con adjuntos, metadata y asignación de caso. Integración Resend.",
  "Document Analysis": "Análisis de Documentos",
  "AI analysis of contracts, opinions and pleadings. Risk highlighting, redlining, summaries.":
    "Análisis AI de contratos, dictámenes y escritos. Resaltado de riesgos, redlining, resúmenes.",
  "Tabular Review": "Revisión Tabular",
  "Clean table view of all cases, documents and deadlines. Sortable, filterable, directly from the brain.":
    "Vista tabular limpia de todos los casos, documentos y plazos. Ordenable, filtrable, directamente del brain.",
  "Contract Management": "Gestión de Contratos",
  "Contract lifecycle management. Draft, review, versioning, expiry tracking, reminders.":
    "Gestión del ciclo de vida de contratos. Borradores, revisión, versioning, seguimiento de vencimientos, recordatorios.",
  "Opponent Management": "Gestión de Contrapartes",
  "Capture all opposing counsel, insurers and opponents. Integrated conflict-of-interest check.":
    "Registra a todos los abogados contrarios, aseguradoras y contrapartes. Control de conflictos de intereses integrado.",
  "Deadlines & Time": "Plazos & Tiempo",
  "Automatic deadline detection, calendar export, time tracking.":
    "Detección automática de plazos, export de calendario, seguimiento de tiempo.",
  "Calendar Export": "Export de Calendario",
  "Sync with Outlook, Google Calendar, Apple Calendar. Deadlines exported as calendar entries.":
    "Sincronización con Outlook, Google Calendar, Apple Calendar. Plazos exportados como entradas de calendario.",
  "Billing & Finance": "Facturación & Finanzas",
  "Invoicing, DATEV export, fee calculation, dunning.":
    "Facturación, export DATEV, cálculo de honorarios, cobros.",
  "DATEV Export": "Export DATEV",
  "Export all booking data in DATEV-compatible format for the firm's accounting system.":
    "Exporta todos los datos contables en formato compatible DATEV para el sistema de contabilidad del bufete.",
  "Controlling & KPIs": "Controlling & KPIs",
  "Firm controlling: revenue, contribution margin, per-lawyer utilization, client profitability. Export for tax advisors.":
    "Controlling del bufete: ingresos, margen de contribución, utilización por abogado, rentabilidad de cliente. Export para asesores fiscales.",
  "Data Export": "Export de Datos",
  "Complete data export for backup, migration or portability requests. JSON, CSV, PDF — GDPR-compliant.":
    "Export completo de datos para backup, migración o solicitudes de portabilidad. JSON, CSV, PDF — conforme GDPR.",
  Integrations: "Integraciones",
  "DocuSign, connectors, API, SSO, webhooks.": "DocuSign, conectores, API, SSO, webhooks.",
  Connectors: "Conectores",
  "Open API for third-party systems. Webhook-based real-time sync with any tool.":
    "API abierta para sistemas de terceros. Sincronización real-time via webhook con cualquier herramienta.",
  "API Keys": "Claves API",
  "Programmatic REST API access. Rate limits, scopes, audit logging. Perfect for practice software integrations.":
    "Acceso programático REST API. Rate limits, scopes, audit logging. Perfecto para integraciones de software legal.",
  "SSO / WorkOS": "SSO / WorkOS",
  "Single sign-on via SAML, OIDC and WorkOS. Active Directory, Google Workspace, Microsoft 365.":
    "Single sign-on via SAML, OIDC y WorkOS. Active Directory, Google Workspace, Microsoft 365.",
  "Firm Import": "Import de Bufete",
  "Migrate existing firm data from other systems. Contacts, cases, documents, time tracking — all transferred.":
    "Migra datos existentes del bufete desde otros sistemas. Contactos, casos, documentos, seguimiento de tiempo — todo transferido.",
  "Firm Settings": "Ajustes del Bufete",
  "Central management of firm data, bank details, logo, signatures, user roles and permissions.":
    "Gestión central de datos del bufete, datos bancarios, logo, firmas, roles de usuario y permisos.",
  "Microsoft Word Add-in": "Add-in Microsoft Word",
  "Draft pleadings and compare contracts directly in Microsoft Word. With brain connection, source insertion and AI suggestions — without leaving the editor.":
    "Redacta escritos y compara contratos directamente en Microsoft Word. Con conexión brain, inserción de fuentes y sugerencias AI — sin salir del editor.",
  "Plugin System": "Sistema de Plugins",
  "Extensibility through custom plugins and skills. subsumio.plugin.json format, subagents, skillpacks — the platform grows with your workflows.":
    "Extensibilidad via plugins y skills personalizados. Formato subsumio.plugin.json, subagentes, skillpacks — la plataforma crece con tus workflows.",
  Automation: "Automatización",
  "Cron jobs, case law, deadline scanner, agents.":
    "Cron jobs, jurisprudencia, escáner de plazos, agentes.",
  "Case Law Scanner": "Escáner de Jurisprudencia",
  "Automatic scan of new court decisions. Classification, summary, integration into the brain.":
    "Escaneo automático de nuevas decisiones judiciales. Clasificación, resumen, integración en el brain.",
  "Deadline Scanner": "Escáner de Plazos",
  "Automatic scan of all documents for deadlines. No deadline is missed again.":
    "Escaneo automático de todos los documentos para plazos. Ningún plazo se vuelve a perder.",
  "Case Scanner": "Escáner de Casos",
  "Monitoring of ongoing cases for new developments, hearings and decisions.":
    "Monitoreo de casos en curso para nuevos desarrollos, audiencias y decisiones.",
  "Agent Automation": "Automatización de Agentes",
  "Self-configurable agents for recurring tasks. Skill-based, evaluable, federated.":
    "Agentes auto-configurables para tareas recurrentes. Basados en skills, evaluables, federados.",
  "Specialized Modules": "Módulos Especializados",
  "Practice-area-specific: medical law, real estate law, insurance law and more.":
    "Específicos por área de práctica: derecho médico, derecho inmobiliario, derecho de seguros y más.",
  "Case Law & Norms": "Jurisprudencia & Normas",
  "Database of German and Austrian legal sources. BGB, StGB, HGB, ABGB, AktG — with AI search.":
    "Base de datos de fuentes legales alemanas y austriacas. BGB, StGB, HGB, ABGB, AktG — con búsqueda AI.",
  "Conflict Check": "Control de Conflictos",
  "Automatic interest conflict check before client intake. Opponents, prior mandates, related persons.":
    "Control automático de conflictos de intereses antes de la admisión del cliente. Contrapartes, mandatos previos, personas relacionadas.",
  "BEA Connection": "Conexión BEA",
  "Special electronic lawyer mailbox (BEA) in the dashboard. Send and receive beA messages.":
    "Buzón electrónico especial de abogados (BEA) en el dashboard. Envía y recibe mensajes beA.",
  "Medical Law": "Derecho Médico",
  "Opinion analysis, MDK letters, medical record review, deadline catalog for medical lawyers.":
    "Análisis de dictámenes, cartas MDK, revisión de historias clínicas, catálogo de plazos para abogados medicalistas.",
  "Real Estate Law": "Derecho Inmobiliario",
  "Purchase contracts, land register queries, development plans, broker agreements for real estate lawyers.":
    "Contratos de compraventa, consultas de registro, planes urbanísticos, contratos de mediación para abogados inmobiliarios.",
  "Insurance Law": "Derecho de Seguros",
  "Coverage inquiries, loss adjustment, recourse, legal protection for insurance lawyers.":
    "Consultas de cobertura, ajuste de siniestros, recurso, protección legal para abogados de seguros.",
  Recruiting: "Reclutamiento",
  "Application management, talent pool, onboarding checklists, employment contract drafts for law firms.":
    "Gestión de candidaturas, talent pool, checklists de onboarding, borradores de contratos laborales para bufetes.",
  "Legal Research": "Investigación Legal",
  "AI-powered legal research across all stored sources. Findings, argument chains, counter-arguments — all with sources.":
    "Investigación legal AI sobre todas las fuentes almacenadas. Hallazgos, cadenas argumentativas, contraargumentos — todo con fuentes.",
  Consulting: "Consultoría",
  "Module for legal advice and consulting mandates. Project structure, hour budgets, milestones, billing by flat fee or hourly rate.":
    "Módulo para asesoramiento legal y mandatos de consultoría. Estructura de proyecto, presupuestos de horas, hitos, facturación por tarifa plana o por hora.",
  "Compliance & GRC": "Compliance & GRC",
  "Compliance and governance module for GDPR, AML, EU AI Act. Obligations, controls and evidence — all documented.":
    "Módulo de compliance y governance para GDPR, AML, EU AI Act. Obligaciones, controles y evidencias — todo documentado.",
  "Mobile & Offline": "Móvil & Offline",
  "App, offline sync, mobile bridge.": "App, sync offline, bridge móvil.",
  "Mobile App": "App Móvil",
  "Native iOS and Android app. Time tracking, upload, case access, chat — equally powerful on the go.":
    "App nativa iOS y Android. Seguimiento de tiempo, subida, acceso a casos, chat — igual de potente en movimiento.",
  "Offline Sync": "Sync Offline",
  "Work without internet. Local storage, conflict-free sync on reconnection.":
    "Trabaja sin internet. Almacenamiento local, sync sin conflictos al reconectar.",
  "Mobile Bridge": "Bridge Móvil",
  "Seamless handover desktop ↔ mobile. Started on phone, continued in browser.":
    "Transición fluida desktop ↔ móvil. Empezado en el teléfono, continuado en el navegador.",
  "Legal AI": "AI Legal",
  "Contract drafts, redlining, conflict check, anonymization.":
    "Borradores de contratos, redlining, control de conflictos, anonimización.",
  "Contract Drafts": "Borradores de Contratos",
  "AI-generated drafts based on templates. T&Cs, employment contracts, purchase contracts, lease agreements.":
    "Borradores generados por AI basados en plantillas. CGV, contratos laborales, contratos de compraventa, contratos de arrendamiento.",
  "Redlining & Comparison": "Redlining & Comparación",
  "Automatic comparison of contract versions. Mark changes, highlight risks.":
    "Comparación automática de versiones de contratos. Marca cambios, resalta riesgos.",
  Anonymization: "Anonimización",
  "Automatic anonymization for third parties, experts or publications. Names, addresses, birth dates.":
    "Anonimización automática para terceros, peritos o publicaciones. Nombres, direcciones, fechas de nacimiento.",
  "Pleadings Drafts": "Borradores de Escritos",
  "AI-assisted drafts for complaints, defense briefs, review petitions and legal remedies. With sources and citations.":
    "Borradores asistidos por AI para demandas, escritos de defensa, recursos y remedios legales. Con fuentes y citas.",
  "Technical Architecture": "Arquitectura Técnica",
  "Straight from the backend — no speculation.": "Directo del backend — sin especulación.",
  "72 API Endpoints": "72 Endpoint API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "API REST completa con auth, rate limiting, audit logging y tipos TypeScript.",
  "57 Dashboard Pages": "57 Páginas Dashboard",
  "Every function has its own responsive page — from the case file to the cost calculator.":
    "Cada función tiene su propia página responsive — desde el expediente hasta la calculadora de costos.",
  "Self-Hosted or EU Cloud": "Self-Hosted o EU Cloud",
  "Local Docker installation or hosted in the EU with DPA. Data never leaves your control.":
    "Instalación Docker local o hosting EU con AVV. Los datos nunca salen de tu control.",
  "Multi-Brain / Multi-Source": "Multi-Brain / Multi-Source",
  "Multiple brains per organization, multiple sources per brain. Federated search over latent space.":
    "Múltiples brains por organización, múltiples fuentes por brain. Búsqueda federada sobre espacio latente.",
  "End-to-End Encryption": "Cifrado End-to-End",
  "At-rest and in-transit. No training on client data. Professional secrecy by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).":
    "At-rest e in-transit. Sin entrenamiento con datos de clientes. Secreto profesional por diseño — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).",
  "Real-Time Sync": "Sync Real-Time",
  "WebSocket-based real-time updates between all clients. No refresh needed.":
    "Actualizaciones real-time via WebSocket entre todos los clientes. Sin necesidad de refresh.",
  "Something unclear?": "¿Algo no claro?",
  "Every feature can be tried in the dashboard — not just documented.":
    "Cada función se puede probar en el dashboard — no solo está documentada.",
  "Open Dashboard": "Abrir Dashboard",
  "Comments & Notes": "Comentarios & Notas",
  "Case-internal comments, notes and discussions. Threading, mentions, notifications.":
    "Comentarios internos del caso, notas y discusiones. Threading, menciones, notificaciones.",
  "Contact Management": "Gestión de Contactos",
  "Central contacts for clients, opposing counsel, experts, courts and authorities. Linked to cases and deadlines.":
    "Contactos centrales para clientes, abogados contrarios, peritos, tribunales y autoridades. Vinculados a casos y plazos.",
  "Team & Organization": "Equipo & Organización",
  "Team workspace management: create organization, invite members, assign roles and access rights. One brain for the whole team.":
    "Gestión de workspace del equipo: crea organización, invita miembros, asigna roles y derechos de acceso. Un brain para todo el equipo.",
};

const PL_DOCS_REPLACEMENTS: Record<string, string> = {
  Handbook: "Podręcznik",
  Everything: "Wszystko",
  "Subsumio does.": "co Subsumio potrafi.",
  "Complete feature documentation — extracted directly from the source code. No marketing fluff, just facts.":
    "Pełna dokumentacja funkcji — wyciągnięta bezpośrednio z kodu źródłowego. Bez marketingu, same fakty.",
  "Subsumio is a complete law practice platform with an AI brain at its core. Here you'll find every feature, every endpoint, and every workflow — at a glance.":
    "Subsumio to kompletna platforma dla kancelarii z brain AI w centrum. Tu znajdziesz każdą funkcję, każdy endpoint i każdy workflow — w skrócie.",
  "Semantic knowledge, cited answers, agents.": "Wiedza semantyczna, cytowane odpowiedzi, agenci.",
  "Semantic Brain": "Brain Semantyczny",
  "Vector-based knowledge base (PGLite or Postgres + pgvector). Every entity and document becomes embedding-searchable.":
    "Baza wiedzy wektorowa (PGLite lub Postgres + pgvector). Każda encja i dokument stają się przeszukiwalne via embedding.",
  "AI Chat with Citations": "Chat AI z cytatami",
  "Every answer cites the exact page. Hallucinated citations are dropped — RAG with groundedness check.":
    "Każda odpowiedź cyta dokładną stronę. Zhalucynowane cytaty są odrzucane — RAG z kontrolą groundedness.",
  "Think / Reasoning": "Think / Rozumowanie",
  "Deep-reasoning for complex legal questions. Trajectory tracking for temporal developments.":
    "Głębokie rozumowanie dla złożonych pytań prawnych. Śledzenie trajektorii dla rozwoju czasowego.",
  "Agent System": "System Agentów",
  "Create and control custom agents via API. Skill-based, evaluable, federated across multiple brains.":
    "Twórz i kontroluj agentów via API. Oparte na skillach, ewaluowalne, federacyjne na wielu brainach.",
  "Graph & Entity View": "Widok Grafu & Encji",
  "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.":
    "Widok sieciowy wszystkich encji i relacji. Odkrywa ukryte połączenia między klientami a przeciwnikami.",
  "RAG Evaluation": "Ewaluacja RAG",
  "Built-in benchmark system for retrieval quality. Replay against captured queries, LongMemEval support.":
    "Wbudowany system benchmark dla jakości retrieval. Replay na przechwyconych zapytaniach, wsparcie LongMemEval.",
  "AI Assistant": "Asystent AI",
  "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.":
    "Zintegrowany asystent AI w dashboard. Pomoc context-aware dla każdego kroku workflow — od tworzenia sprawy po fakturowanie.",
  "Cases & Documents": "Sprawy & Dokumenty",
  "Case management, DMS integration, document processing.":
    "Zarządzanie sprawami, integracja DMS, przetwarzanie dokumentów.",
  "Case Management": "Zarządzanie Sprawami",
  "Client and case structure with per-user and per-case access rights. Fuzz-tested for zero leaks.":
    "Struktura klientów i spraw z prawami dostępu per użytkownik i per sprawa. Fuzz-tested dla zero wycieków.",
  "Document Upload & Vault": "Upload Dokumentów & Vault",
  "Drag-and-drop, audit-proof storage, versioning. Local vault or encrypted EU cloud storage.":
    "Drag-and-drop, przechowywanie audit-proof, versioning. Vault lokalny lub szyfrowane EU cloud.",
  "DMS Integrations": "Integracje DMS",
  "Native connection to NetDocuments, iManage, Google Drive. Bi-directional synchronization.":
    "Natywne połączenie z NetDocuments, iManage, Google Drive. Synchronizacja dwukierunkowa.",
  "OCR & Document Processing": "OCR & Przetwarzanie Dokumentów",
  "Text recognition, classification, NER. PDFs, scans and images become searchable.":
    "Rozpoznawanie tekstu, klasyfikacja, NER. PDF-y, skany i obrazy stają się przeszukiwalne.",
  "Email Import": "Import Email",
  "Import emails into the brain — with attachments, metadata and case assignment. Resend integration.":
    "Importuj emaile do braina — z załącznikami, metadanymi i przypisaniem sprawy. Integracja Resend.",
  "Document Analysis": "Analiza Dokumentów",
  "AI analysis of contracts, opinions and pleadings. Risk highlighting, redlining, summaries.":
    "Analiza AI umów, opinii i pism procesowych. Podświetlanie ryzyk, redlining, podsumowania.",
  "Tabular Review": "Przegląd Tablicowy",
  "Clean table view of all cases, documents and deadlines. Sortable, filterable, directly from the brain.":
    "Czysty widok tablicowy wszystkich spraw, dokumentów i terminów. Sortowalny, filtrowalny, prosto z braina.",
  "Contract Management": "Zarządzanie Umowami",
  "Contract lifecycle management. Draft, review, versioning, expiry tracking, reminders.":
    "Zarządzanie cyklem życia umów. Robocze, przegląd, versioning, śledzenie wygaśnięć, przypomnienia.",
  "Opponent Management": "Zarządzanie Przeciwnikami",
  "Capture all opposing counsel, insurers and opponents. Integrated conflict-of-interest check.":
    "Rejestruj wszystkich adwokatów przeciwnych, ubezpieczycieli i przeciwników. Zintegrowane sprawdzenie konfliktu interesów.",
  "Deadlines & Time": "Terminy & Czas",
  "Automatic deadline detection, calendar export, time tracking.":
    "Automatyczne wykrywanie terminów, export kalendarza, śledzenie czasu.",
  "Calendar Export": "Export Kalendarza",
  "Sync with Outlook, Google Calendar, Apple Calendar. Deadlines exported as calendar entries.":
    "Synchronizacja z Outlook, Google Calendar, Apple Calendar. Terminy eksportowane jako wpisy kalendarza.",
  "Billing & Finance": "Fakturowanie & Finanse",
  "Invoicing, DATEV export, fee calculation, dunning.":
    "Fakturowanie, export DATEV, kalkulacja opłat, windykacja.",
  "DATEV Export": "Export DATEV",
  "Export all booking data in DATEV-compatible format for the firm's accounting system.":
    "Eksportuj wszystkie dane księgowe w formacie kompatybilnym z DATEV dla systemu księgowego kancelarii.",
  "Controlling & KPIs": "Controlling & KPI",
  "Firm controlling: revenue, contribution margin, per-lawyer utilization, client profitability. Export for tax advisors.":
    "Controlling kancelarii: przychody, marża contribucji, wykorzystanie per adwokat, rentowność klienta. Export dla doradców podatkowych.",
  "Data Export": "Export Danych",
  "Complete data export for backup, migration or portability requests. JSON, CSV, PDF — GDPR-compliant.":
    "Pełny export danych dla backup, migracji lub żądań przenoszenia. JSON, CSV, PDF — zgodne z GDPR.",
  Integrations: "Integracje",
  "DocuSign, connectors, API, SSO, webhooks.": "DocuSign, konektory, API, SSO, webhooki.",
  Connectors: "Konektory",
  "Open API for third-party systems. Webhook-based real-time sync with any tool.":
    "Otwarte API dla systemów trzecich. Synchronizacja real-time via webhook z każdym narzędziem.",
  "API Keys": "Klucze API",
  "Programmatic REST API access. Rate limits, scopes, audit logging. Perfect for practice software integrations.":
    "Programmatyczny dostęp REST API. Rate limits, scope, audit logging. Idealne dla integracji software prawniczego.",
  "SSO / WorkOS": "SSO / WorkOS",
  "Single sign-on via SAML, OIDC and WorkOS. Active Directory, Google Workspace, Microsoft 365.":
    "Single sign-on via SAML, OIDC i WorkOS. Active Directory, Google Workspace, Microsoft 365.",
  "Firm Import": "Import Kancelarii",
  "Migrate existing firm data from other systems. Contacts, cases, documents, time tracking — all transferred.":
    "Migruj istniejące dane kancelarii z innych systemów. Kontakty, sprawy, dokumenty, śledzenie czasu — wszystko przeniesione.",
  "Firm Settings": "Ustawienia Kancelarii",
  "Central management of firm data, bank details, logo, signatures, user roles and permissions.":
    "Centralne zarządzanie danymi kancelarii, danymi bankowymi, logo, podpisami, rolami użytkowników i uprawnieniami.",
  "Microsoft Word Add-in": "Add-in Microsoft Word",
  "Draft pleadings and compare contracts directly in Microsoft Word. With brain connection, source insertion and AI suggestions — without leaving the editor.":
    "Redaguj pisma i porównuj umowy bezpośrednio w Microsoft Word. Z połączeniem brain, wstawianiem źródeł i sugestiami AI — bez wychodzenia z edytora.",
  "Plugin System": "System Pluginów",
  "Extensibility through custom plugins and skills. subsumio.plugin.json format, subagents, skillpacks — the platform grows with your workflows.":
    "Rozszerzalność przez własne pluginy i skille. Format subsumio.plugin.json, subagenci, skillpacki — platforma rośnie z Twoimi workflow.",
  Automation: "Automatyzacja",
  "Cron jobs, case law, deadline scanner, agents.":
    "Cron job, orzecznictwo, skaner terminów, agenci.",
  "Case Law Scanner": "Skaner Orzecznictwa",
  "Automatic scan of new court decisions. Classification, summary, integration into the brain.":
    "Automatyczne skanowanie nowych orzeczeń sądowych. Klasyfikacja, podsumowanie, integracja z brainem.",
  "Deadline Scanner": "Skaner Terminów",
  "Automatic scan of all documents for deadlines. No deadline is missed again.":
    "Automatyczne skanowanie wszystkich dokumentów pod kątem terminów. Żaden termin nie zostanie pominięty.",
  "Case Scanner": "Skaner Spraw",
  "Monitoring of ongoing cases for new developments, hearings and decisions.":
    "Monitorowanie bieżących spraw pod kątem nowych wydarzeń, rozpraw i orzeczeń.",
  "Agent Automation": "Automatyzacja Agentów",
  "Self-configurable agents for recurring tasks. Skill-based, evaluable, federated.":
    "Agenci samokonfigurowalni dla powtarzalnych zadań. Oparci na skillach, ewaluowalni, federacyjni.",
  "Specialized Modules": "Moduły Specjalistyczne",
  "Practice-area-specific: medical law, real estate law, insurance law and more.":
    "Specyficzne dla obszaru praktyki: prawo medyczne, prawo nieruchomości, prawo ubezpieczeniowe i więcej.",
  "Case Law & Norms": "Orzecznictwo & Normy",
  "Database of German and Austrian legal sources. BGB, StGB, HGB, ABGB, AktG — with AI search.":
    "Baza danych niemieckich i austriackich źródeł prawnych. BGB, StGB, HGB, ABGB, AktG — z wyszukiwaniem AI.",
  "Conflict Check": "Sprawdzenie Konfliktów",
  "Automatic interest conflict check before client intake. Opponents, prior mandates, related persons.":
    "Automatyczne sprawdzenie konfliktu interesów przed przyjęciem klienta. Przeciwnicy, wcześniejsze mandaty, osoby powiązane.",
  "BEA Connection": "Połączenie BEA",
  "Special electronic lawyer mailbox (BEA) in the dashboard. Send and receive beA messages.":
    "Specjalna elektroniczna skrzynka adwokacka (BEA) w dashboard. Wysyłaj i odbieraj wiadomości beA.",
  "Medical Law": "Prawo Medyczne",
  "Opinion analysis, MDK letters, medical record review, deadline catalog for medical lawyers.":
    "Analiza opinii, pisma MDK, przegląd dokumentacji medycznej, katalog terminów dla adwokatów medycznych.",
  "Real Estate Law": "Prawo Nieruchomości",
  "Purchase contracts, land register queries, development plans, broker agreements for real estate lawyers.":
    "Umowy kupna-sprzedaży, zapytania księgi wieczystej, plany zagospodarowania, umowy pośrednicze dla adwokatów nieruchomościowych.",
  "Insurance Law": "Prawo Ubezpieczeniowe",
  "Coverage inquiries, loss adjustment, recourse, legal protection for insurance lawyers.":
    "Zapytania o pokrycie, likwidacja szkód, regres, ochrona prawna dla adwokatów ubezpieczeniowych.",
  Recruiting: "Rekrutacja",
  "Application management, talent pool, onboarding checklists, employment contract drafts for law firms.":
    "Zarządzanie aplikacjami, talent pool, checklisty onboarding, projekty umów o pracę dla kancelarii.",
  "Legal Research": "Badania Prawne",
  "AI-powered legal research across all stored sources. Findings, argument chains, counter-arguments — all with sources.":
    "Badania prawne AI na wszystkich zapisanych źródłach. Wyniki, łańcuchy argumentów, kontrargumenty — wszystko ze źródłami.",
  Consulting: "Doradztwo",
  "Module for legal advice and consulting mandates. Project structure, hour budgets, milestones, billing by flat fee or hourly rate.":
    "Moduł dla porad prawnych i mandatów doradczych. Struktura projektu, budżety godzinowe, kamienie milowe, fakturowanie ryczałtem lub stawką godzinową.",
  "Compliance & GRC": "Compliance & GRC",
  "Compliance and governance module for GDPR, AML, EU AI Act. Obligations, controls and evidence — all documented.":
    "Moduł compliance i governance dla GDPR, AML, EU AI Act. Obowiązki, kontrole i dowody — wszystko udokumentowane.",
  "Mobile & Offline": "Mobilnie & Offline",
  "App, offline sync, mobile bridge.": "App, sync offline, bridge mobilny.",
  "Mobile App": "App Mobilna",
  "Native iOS and Android app. Time tracking, upload, case access, chat — equally powerful on the go.":
    "Natywna app iOS i Android. Śledzenie czasu, upload, dostęp do spraw, chat — równie potężna w drodze.",
  "Offline Sync": "Sync Offline",
  "Work without internet. Local storage, conflict-free sync on reconnection.":
    "Pracuj bez internetu. Pamięć lokalna, sync bez konfliktów przy ponownym połączeniu.",
  "Mobile Bridge": "Bridge Mobilny",
  "Seamless handover desktop ↔ mobile. Started on phone, continued in browser.":
    "Płynne przejście desktop ↔ mobile. Zacznij na telefonie, kontynuuj w przeglądarce.",
  "Legal AI": "AI Prawna",
  "Contract drafts, redlining, conflict check, anonymization.":
    "Projekty umów, redlining, sprawdzenie konfliktów, anonimizacja.",
  "Contract Drafts": "Projekty Umów",
  "AI-generated drafts based on templates. T&Cs, employment contracts, purchase contracts, lease agreements.":
    "Projekty generowane AI na podstawie szablonów. Regulaminy, umowy o pracę, umowy kupna-sprzedaży, umowy najmu.",
  "Redlining & Comparison": "Redlining & Porównanie",
  "Automatic comparison of contract versions. Mark changes, highlight risks.":
    "Automatyczne porównanie wersji umów. Oznacz zmiany, podświetl ryzyka.",
  Anonymization: "Anonimizacja",
  "Automatic anonymization for third parties, experts or publications. Names, addresses, birth dates.":
    "Automatyczna anonimizacja dla stron trzecich, biegłych lub publikacji. Nazwiska, adresy, daty urodzenia.",
  "Pleadings Drafts": "Projekty Pism",
  "AI-assisted drafts for complaints, defense briefs, review petitions and legal remedies. With sources and citations.":
    "Projekty asystowane AI dla pozwów, pism obronnych, skarg i środków prawnych. Ze źródłami i cytatami.",
  "Technical Architecture": "Architektura Techniczna",
  "Straight from the backend — no speculation.": "Prosto z backendu — bez spekulacji.",
  "72 API Endpoints": "72 Endpoint API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "Kompletne REST API z auth, rate limiting, audit logging i typami TypeScript.",
  "57 Dashboard Pages": "57 Stron Dashboard",
  "Every function has its own responsive page — from the case file to the cost calculator.":
    "Każda funkcja ma własną stronę responsive — od akt sprawy po kalkulator kosztów.",
  "Self-Hosted or EU Cloud": "Self-Hosted lub EU Cloud",
  "Local Docker installation or hosted in the EU with DPA. Data never leaves your control.":
    "Lokalna instalacja Docker lub hosting EU z AVV. Dane nigdy nie wychodzą spod Twojej kontroli.",
  "Multi-Brain / Multi-Source": "Multi-Brain / Multi-Source",
  "Multiple brains per organization, multiple sources per brain. Federated search over latent space.":
    "Wiele brainów per organizacja, wiele źródeł per brain. Wyszukiwanie federacyjne w przestrzeni latentnej.",
  "End-to-End Encryption": "Szyfrowanie End-to-End",
  "At-rest and in-transit. No training on client data. Professional secrecy by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).":
    "At-rest i in-transit. Bez treningu na danych klienta. Tajemnica zawodowa w design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).",
  "Real-Time Sync": "Sync Real-Time",
  "WebSocket-based real-time updates between all clients. No refresh needed.":
    "Aktualizacje real-time via WebSocket między wszystkimi klientami. Bez potrzeby refresh.",
  "Something unclear?": "Coś niejasne?",
  "Every feature can be tried in the dashboard — not just documented.":
    "Każdą funkcję można wypróbować w dashboard — nie tylko jest udokumentowana.",
  "Open Dashboard": "Otwórz Dashboard",
  "Comments & Notes": "Komentarze & Notatki",
  "Case-internal comments, notes and discussions. Threading, mentions, notifications.":
    "Komentarze wewnętrzne sprawy, notatki i dyskusje. Threading, wzmianki, powiadomienia.",
  "Contact Management": "Zarządzanie Kontaktami",
  "Central contacts for clients, opposing counsel, experts, courts and authorities. Linked to cases and deadlines.":
    "Centralne kontakty dla klientów, adwokatów przeciwnych, biegłych, sądów i urzędów. Powiązane ze sprawami i terminami.",
  "Team & Organization": "Zespół & Organizacja",
  "Team workspace management: create organization, invite members, assign roles and access rights. One brain for the whole team.":
    "Zarządzanie workspace zespołu: twórz organizację, zapraszaj członków, przypisuj role i prawa dostępu. Jeden brain dla całego zespołu.",
};

const FR_DOCS_REPLACEMENTS: Record<string, string> = {
  Handbook: "Manuel",
  Everything: "Tout",
  "Subsumio does.": "ce que Subsumio fait.",
  "Complete feature documentation — extracted directly from the source code. No marketing fluff, just facts.":
    "Documentation complète des fonctionnalités — extraite directement du code source. Pas de marketing, juste des faits.",
  "Subsumio is a complete law practice platform with an AI brain at its core. Here you'll find every feature, every endpoint, and every workflow — at a glance.":
    "Subsumio est une plateforme complète pour cabinets avec un brain AI en son cœur. Vous trouverez ici chaque fonction, chaque endpoint et chaque workflow — en un coup d'œil.",
  "Semantic knowledge, cited answers, agents.": "Connaissance sémantique, réponses citées, agents.",
  "Semantic Brain": "Brain Sémantique",
  "Vector-based knowledge base (PGLite or Postgres + pgvector). Every entity and document becomes embedding-searchable.":
    "Base de connaissance vectorielle (PGLite ou Postgres + pgvector). Chaque entité et document devient recherchable via embedding.",
  "AI Chat with Citations": "Chat AI avec Citations",
  "Every answer cites the exact page. Hallucinated citations are dropped — RAG with groundedness check.":
    "Chaque réponse cite la page exacte. Les citations hallucinées sont écartées — RAG avec contrôle de groundedness.",
  "Think / Reasoning": "Think / Raisonnement",
  "Deep-reasoning for complex legal questions. Trajectory tracking for temporal developments.":
    "Raisonnement approfondi pour les questions juridiques complexes. Suivi des trajectoires pour les développements temporels.",
  "Agent System": "Système d'Agents",
  "Create and control custom agents via API. Skill-based, evaluable, federated across multiple brains.":
    "Créez et contrôlez des agents personnalisés via API. Basés sur skills, évaluables, fédérés sur plusieurs brains.",
  "Graph & Entity View": "Vue Graphe & Entités",
  "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.":
    "Vue en réseau de toutes les entités et relations. Découvre les connexions cachées entre clients et adversaires.",
  "RAG Evaluation": "Évaluation RAG",
  "Built-in benchmark system for retrieval quality. Replay against captured queries, LongMemEval support.":
    "Système de benchmark intégré pour la qualité du retrieval. Replay sur requêtes capturées, support LongMemEval.",
  "AI Assistant": "Assistant AI",
  "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.":
    "Assistant AI intégré dans le dashboard. Aide context-aware pour chaque étape du workflow — de la création du dossier à la facturation.",
  "Cases & Documents": "Dossiers & Documents",
  "Case management, DMS integration, document processing.":
    "Gestion des dossiers, intégration DMS, traitement des documents.",
  "Case Management": "Gestion des Dossiers",
  "Client and case structure with per-user and per-case access rights. Fuzz-tested for zero leaks.":
    "Structure clients et dossiers avec droits d'accès par utilisateur et par dossier. Fuzz-tested pour zéro fuite.",
  "Document Upload & Vault": "Upload de Documents & Vault",
  "Drag-and-drop, audit-proof storage, versioning. Local vault or encrypted EU cloud storage.":
    "Drag-and-drop, stockage audit-proof, versioning. Vault local ou stockage EU cloud chiffré.",
  "DMS Integrations": "Intégrations DMS",
  "Native connection to NetDocuments, iManage, Google Drive. Bi-directional synchronization.":
    "Connexion native à NetDocuments, iManage, Google Drive. Synchronisation bi-directionnelle.",
  "OCR & Document Processing": "OCR & Traitement de Documents",
  "Text recognition, classification, NER. PDFs, scans and images become searchable.":
    "Reconnaissance de texte, classification, NER. PDFs, scans et images deviennent recherchables.",
  "Email Import": "Import d'Emails",
  "Import emails into the brain — with attachments, metadata and case assignment. Resend integration.":
    "Importez les emails dans le brain — avec pièces jointes, métadonnées et assignation de dossier. Intégration Resend.",
  "Document Analysis": "Analyse de Documents",
  "AI analysis of contracts, opinions and pleadings. Risk highlighting, redlining, summaries.":
    "Analyse AI des contrats, avis et conclusions. Surlignage des risques, redlining, résumés.",
  "Tabular Review": "Revue Tabulaire",
  "Clean table view of all cases, documents and deadlines. Sortable, filterable, directly from the brain.":
    "Vue tabulaire propre de tous les dossiers, documents et délais. Triable, filtrable, directement du brain.",
  "Contract Management": "Gestion des Contrats",
  "Contract lifecycle management. Draft, review, versioning, expiry tracking, reminders.":
    "Gestion du cycle de vie des contrats. Brouillons, révision, versioning, suivi des expirations, rappels.",
  "Opponent Management": "Gestion des Adversaires",
  "Capture all opposing counsel, insurers and opponents. Integrated conflict-of-interest check.":
    "Enregistrez tous les avocats adverses, assureurs et adversaires. Contrôle des conflits d'intérêts intégré.",
  "Deadlines & Time": "Délais & Temps",
  "Automatic deadline detection, calendar export, time tracking.":
    "Détection automatique des délais, export calendrier, suivi du temps.",
  "Calendar Export": "Export Calendrier",
  "Sync with Outlook, Google Calendar, Apple Calendar. Deadlines exported as calendar entries.":
    "Synchronisation avec Outlook, Google Calendar, Apple Calendar. Délais exportés comme entrées de calendrier.",
  "Billing & Finance": "Facturation & Finances",
  "Invoicing, DATEV export, fee calculation, dunning.":
    "Facturation, export DATEV, calcul des honoraires, recouvrement.",
  "DATEV Export": "Export DATEV",
  "Export all booking data in DATEV-compatible format for the firm's accounting system.":
    "Exportez toutes les données comptables au format compatible DATEV pour le système de comptabilité du cabinet.",
  "Controlling & KPIs": "Controlling & KPIs",
  "Firm controlling: revenue, contribution margin, per-lawyer utilization, client profitability. Export for tax advisors.":
    "Controlling du cabinet: chiffre d'affaires, marge sur coût variable, utilisation par avocat, rentabilité client. Export pour conseillers fiscaux.",
  "Data Export": "Export de Données",
  "Complete data export for backup, migration or portability requests. JSON, CSV, PDF — GDPR-compliant.":
    "Export complet des données pour backup, migration ou demandes de portabilité. JSON, CSV, PDF — conforme RGPD.",
  Integrations: "Intégrations",
  "DocuSign, connectors, API, SSO, webhooks.": "DocuSign, connecteurs, API, SSO, webhooks.",
  Connectors: "Connecteurs",
  "Open API for third-party systems. Webhook-based real-time sync with any tool.":
    "API ouverte pour systèmes tiers. Synchronisation real-time via webhook avec tout outil.",
  "API Keys": "Clés API",
  "Programmatic REST API access. Rate limits, scopes, audit logging. Perfect for practice software integrations.":
    "Accès programmatique REST API. Rate limits, scopes, audit logging. Parfait pour intégrations logicielles juridiques.",
  "SSO / WorkOS": "SSO / WorkOS",
  "Single sign-on via SAML, OIDC and WorkOS. Active Directory, Google Workspace, Microsoft 365.":
    "Single sign-on via SAML, OIDC et WorkOS. Active Directory, Google Workspace, Microsoft 365.",
  "Firm Import": "Import de Cabinet",
  "Migrate existing firm data from other systems. Contacts, cases, documents, time tracking — all transferred.":
    "Migrez les données existantes du cabinet depuis d'autres systèmes. Contacts, dossiers, documents, suivi du temps — tout transféré.",
  "Firm Settings": "Paramètres du Cabinet",
  "Central management of firm data, bank details, logo, signatures, user roles and permissions.":
    "Gestion centrale des données du cabinet, coordonnées bancaires, logo, signatures, rôles utilisateur et permissions.",
  "Microsoft Word Add-in": "Add-in Microsoft Word",
  "Draft pleadings and compare contracts directly in Microsoft Word. With brain connection, source insertion and AI suggestions — without leaving the editor.":
    "Rédigez conclusions et comparez contrats directement dans Microsoft Word. Avec connexion brain, insertion de sources et suggestions AI — sans quitter l'éditeur.",
  "Plugin System": "Système de Plugins",
  "Extensibility through custom plugins and skills. subsumio.plugin.json format, subagents, skillpacks — the platform grows with your workflows.":
    "Extensibilité via plugins et skills personnalisés. Format subsumio.plugin.json, sous-agents, skillpacks — la plateforme grandit avec vos workflows.",
  Automation: "Automatisation",
  "Cron jobs, case law, deadline scanner, agents.":
    "Cron jobs, jurisprudence, scanner de délais, agents.",
  "Case Law Scanner": "Scanner de Jurisprudence",
  "Automatic scan of new court decisions. Classification, summary, integration into the brain.":
    "Scan automatique des nouvelles décisions judiciaires. Classification, résumé, intégration dans le brain.",
  "Deadline Scanner": "Scanner de Délais",
  "Automatic scan of all documents for deadlines. No deadline is missed again.":
    "Scan automatique de tous les documents pour les délais. Aucun délai n'est plus manqué.",
  "Case Scanner": "Scanner de Dossiers",
  "Monitoring of ongoing cases for new developments, hearings and decisions.":
    "Surveillance des dossiers en cours pour nouveaux développements, audiences et décisions.",
  "Agent Automation": "Automatisation d'Agents",
  "Self-configurable agents for recurring tasks. Skill-based, evaluable, federated.":
    "Agents auto-configurables pour tâches récurrentes. Basés sur skills, évaluables, fédérés.",
  "Specialized Modules": "Modules Spécialisés",
  "Practice-area-specific: medical law, real estate law, insurance law and more.":
    "Spécifiques par domaine de pratique: droit médical, droit immobilier, droit des assurances et plus.",
  "Case Law & Norms": "Jurisprudence & Normes",
  "Database of German and Austrian legal sources. BGB, StGB, HGB, ABGB, AktG — with AI search.":
    "Base de données de sources juridiques allemandes et autrichiennes. BGB, StGB, HGB, ABGB, AktG — avec recherche AI.",
  "Conflict Check": "Contrôle des Conflits",
  "Automatic interest conflict check before client intake. Opponents, prior mandates, related persons.":
    "Contrôle automatique des conflits d'intérêts avant l'admission du client. Adversaires, mandats antérieurs, personnes liées.",
  "BEA Connection": "Connexion BEA",
  "Special electronic lawyer mailbox (BEA) in the dashboard. Send and receive beA messages.":
    "Boîte aux lettres électronique spéciale des avocats (BEA) dans le dashboard. Envoyez et recevez des messages beA.",
  "Medical Law": "Droit Médical",
  "Opinion analysis, MDK letters, medical record review, deadline catalog for medical lawyers.":
    "Analyse d'avis, lettres MDK, revue de dossiers médicaux, catalogue de délais pour avocats medicalistes.",
  "Real Estate Law": "Droit Immobilier",
  "Purchase contracts, land register queries, development plans, broker agreements for real estate lawyers.":
    "Contrats de vente, requêtes de registre foncier, plans d'urbanisme, contrats de courtage pour avocats immobiliers.",
  "Insurance Law": "Droit des Assurances",
  "Coverage inquiries, loss adjustment, recourse, legal protection for insurance lawyers.":
    "Demandes de couverture, ajustement des sinistres, recours, protection juridique pour avocats en droit des assurances.",
  Recruiting: "Recrutement",
  "Application management, talent pool, onboarding checklists, employment contract drafts for law firms.":
    "Gestion des candidatures, talent pool, checklists d'onboarding, projets de contrats de travail pour cabinets.",
  "Legal Research": "Recherche Juridique",
  "AI-powered legal research across all stored sources. Findings, argument chains, counter-arguments — all with sources.":
    "Recherche juridique AI sur toutes les sources stockées. Conclusions, chaînes d'arguments, contre-arguments — tout avec sources.",
  Consulting: "Conseil",
  "Module for legal advice and consulting mandates. Project structure, hour budgets, milestones, billing by flat fee or hourly rate.":
    "Module pour conseil juridique et mandats de conseil. Structure de projet, budgets d'heures, jalons, facturation au forfait ou au taux horaire.",
  "Compliance & GRC": "Compliance & GRC",
  "Compliance and governance module for GDPR, AML, EU AI Act. Obligations, controls and evidence — all documented.":
    "Module compliance et governance pour RGPD, AML, EU AI Act. Obligations, contrôles et preuves — tout documenté.",
  "Mobile & Offline": "Mobile & Offline",
  "App, offline sync, mobile bridge.": "App, sync offline, bridge mobile.",
  "Mobile App": "App Mobile",
  "Native iOS and Android app. Time tracking, upload, case access, chat — equally powerful on the go.":
    "App native iOS et Android. Suivi du temps, upload, accès aux dossiers, chat — aussi puissant en mobilité.",
  "Offline Sync": "Sync Offline",
  "Work without internet. Local storage, conflict-free sync on reconnection.":
    "Travaillez sans internet. Stockage local, sync sans conflit à la reconnexion.",
  "Mobile Bridge": "Bridge Mobile",
  "Seamless handover desktop ↔ mobile. Started on phone, continued in browser.":
    "Transition fluide desktop ↔ mobile. Commencé sur le téléphone, continué dans le navigateur.",
  "Legal AI": "AI Juridique",
  "Contract drafts, redlining, conflict check, anonymization.":
    "Projets de contrats, redlining, contrôle des conflits, anonymisation.",
  "Contract Drafts": "Projets de Contrats",
  "AI-generated drafts based on templates. T&Cs, employment contracts, purchase contracts, lease agreements.":
    "Projets générés par AI basés sur des modèles. CGV, contrats de travail, contrats de vente, contrats de location.",
  "Redlining & Comparison": "Redlining & Comparaison",
  "Automatic comparison of contract versions. Mark changes, highlight risks.":
    "Comparaison automatique des versions de contrats. Marquez les changements, surlignez les risques.",
  Anonymization: "Anonymisation",
  "Automatic anonymization for third parties, experts or publications. Names, addresses, birth dates.":
    "Anonymisation automatique pour tiers, experts ou publications. Noms, adresses, dates de naissance.",
  "Pleadings Drafts": "Projets de Conclusions",
  "AI-assisted drafts for complaints, defense briefs, review petitions and legal remedies. With sources and citations.":
    "Projets assistés par AI pour plaintes, mémoires de défense, recours et remèdes juridiques. Avec sources et citations.",
  "Technical Architecture": "Architecture Technique",
  "Straight from the backend — no speculation.": "Directement du backend — sans spéculation.",
  "72 API Endpoints": "72 Endpoints API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "API REST complète avec auth, rate limiting, audit logging et types TypeScript.",
  "57 Dashboard Pages": "57 Pages Dashboard",
  "Every function has its own responsive page — from the case file to the cost calculator.":
    "Chaque fonction a sa propre page responsive — du dossier au calculateur de coûts.",
  "Self-Hosted or EU Cloud": "Self-Hosted ou EU Cloud",
  "Local Docker installation or hosted in the EU with DPA. Data never leaves your control.":
    "Installation Docker locale ou hosting EU avec AVV. Les données ne quittent jamais votre contrôle.",
  "Multi-Brain / Multi-Source": "Multi-Brain / Multi-Source",
  "Multiple brains per organization, multiple sources per brain. Federated search over latent space.":
    "Plusieurs brains par organisation, plusieurs sources par brain. Recherche fédérée sur l'espace latent.",
  "End-to-End Encryption": "Chiffrement End-to-End",
  "At-rest and in-transit. No training on client data. Professional secrecy by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).":
    "At-rest et in-transit. Pas d'entraînement sur les données clients. Secret professionnel par design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).",
  "Real-Time Sync": "Sync Real-Time",
  "WebSocket-based real-time updates between all clients. No refresh needed.":
    "Mises à jour real-time via WebSocket entre tous les clients. Pas de refresh nécessaire.",
  "Something unclear?": "Quelque chose n'est pas clair?",
  "Every feature can be tried in the dashboard — not just documented.":
    "Chaque fonction peut être essayée dans le dashboard — pas seulement documentée.",
  "Open Dashboard": "Ouvrir Dashboard",
  "Comments & Notes": "Commentaires & Notes",
  "Case-internal comments, notes and discussions. Threading, mentions, notifications.":
    "Commentaires internes du dossier, notes et discussions. Threading, mentions, notifications.",
  "Contact Management": "Gestion des Contacts",
  "Central contacts for clients, opposing counsel, experts, courts and authorities. Linked to cases and deadlines.":
    "Contacts centraux pour clients, avocats adverses, experts, tribunaux et autorités. Liés aux dossiers et délais.",
  "Team & Organization": "Équipe & Organisation",
  "Team workspace management: create organization, invite members, assign roles and access rights. One brain for the whole team.":
    "Gestion du workspace d'équipe: créez l'organisation, invitez des membres, assignez rôles et droits d'accès. Un brain pour toute l'équipe.",
};

const NL_DOCS_REPLACEMENTS: Record<string, string> = {
  Handbook: "Handboek",
  Everything: "Alles",
  "Subsumio does.": "wat Subsumio kan.",
  "Complete feature documentation — extracted directly from the source code. No marketing fluff, just facts.":
    "Volledige feature-documentatie — direct uit de broncode gehaald. Geen marketing, alleen feiten.",
  "Subsumio is a complete law practice platform with an AI brain at its core. Here you'll find every feature, every endpoint, and every workflow — at a glance.":
    "Subsumio is een compleet platform voor advocatenkantoren met een AI-brain in de kern. Hier vind je elke functie, elke endpoint en elke workflow — in één oogopslag.",
  "Semantic knowledge, cited answers, agents.":
    "Semantische kennis, geciteerde antwoorden, agenten.",
  "Semantic Brain": "Semantische Brain",
  "Vector-based knowledge base (PGLite or Postgres + pgvector). Every entity and document becomes embedding-searchable.":
    "Vector-gebaseerde kennisbank (PGLite of Postgres + pgvector). Elke entiteit en document wordt embedding-doorzoekbaar.",
  "AI Chat with Citations": "AI-Chat met Citaten",
  "Every answer cites the exact page. Hallucinated citations are dropped — RAG with groundedness check.":
    "Elk antwoord citeert de exacte pagina. Gehallucineerde citaten worden verwijderd — RAG met groundedness-controle.",
  "Think / Reasoning": "Think / Redeneren",
  "Deep-reasoning for complex legal questions. Trajectory tracking for temporal developments.":
    "Diepe redenering voor complexe juridische vragen. Traject-tracking voor temporele ontwikkelingen.",
  "Agent System": "Agent-Systeem",
  "Create and control custom agents via API. Skill-based, evaluable, federated across multiple brains.":
    "Maak en bestuur aangepaste agenten via API. Skill-gebaseerd, evalueerbaar, gefedereerd over meerdere brains.",
  "Graph & Entity View": "Graaf & Entiteit-Weergave",
  "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.":
    "Netwerkweergave van alle entiteiten en relaties. Ontdekt verborgen connecties tussen cliënten en tegenpartijen.",
  "RAG Evaluation": "RAG-Evaluatie",
  "Built-in benchmark system for retrieval quality. Replay against captured queries, LongMemEval support.":
    "Ingebouwd benchmarksysteem voor retrieval-kwaliteit. Replay op vastgelegde queries, LongMemEval-ondersteuning.",
  "AI Assistant": "AI-Assistent",
  "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.":
    "Geïntegreerde AI-assistent in het dashboard. Context-aware hulp voor elke workflow-stap — van zaak-aanmaak tot facturering.",
  "Cases & Documents": "Zaken & Documenten",
  "Case management, DMS integration, document processing.":
    "Zaakbeheer, DMS-integratie, documentverwerking.",
  "Case Management": "Zaakbeheer",
  "Client and case structure with per-user and per-case access rights. Fuzz-tested for zero leaks.":
    "Cliënt- en zaakstructuur met per-gebruiker en per-zaak toegangsrechten. Fuzz-tested voor zero leaks.",
  "Document Upload & Vault": "Document-Upload & Vault",
  "Drag-and-drop, audit-proof storage, versioning. Local vault or encrypted EU cloud storage.":
    "Drag-and-drop, audit-proof opslag, versioning. Lokale vault of versleutelde EU-cloudopslag.",
  "DMS Integrations": "DMS-Integraties",
  "Native connection to NetDocuments, iManage, Google Drive. Bi-directional synchronization.":
    "NATIVE verbinding met NetDocuments, iManage, Google Drive. Bi-directionele synchronisatie.",
  "OCR & Document Processing": "OCR & Documentverwerking",
  "Text recognition, classification, NER. PDFs, scans and images become searchable.":
    "Tekstherkenning, classificatie, NER. PDF's, scans en afbeeldingen worden doorzoekbaar.",
  "Email Import": "E-mail Import",
  "Import emails into the brain — with attachments, metadata and case assignment. Resend integration.":
    "Importeer e-mails in de brain — met bijlagen, metadata en zaak-toewijzing. Resend-integratie.",
  "Document Analysis": "Document-Analyse",
  "AI analysis of contracts, opinions and pleadings. Risk highlighting, redlining, summaries.":
    "AI-analyse van contracten, adviezen en pleidooien. Risico-highlighting, redlining, samenvattingen.",
  "Tabular Review": "Tabellaire Review",
  "Clean table view of all cases, documents and deadlines. Sortable, filterable, directly from the brain.":
    "Schone tabelweergave van alle zaken, documenten en termijnen. Sorteerbaar, filtereerbaar, direct vanuit de brain.",
  "Contract Management": "Contractbeheer",
  "Contract lifecycle management. Draft, review, versioning, expiry tracking, reminders.":
    "Beheer van de contract-levenscyclus. Concepten, review, versioning, verloop-tracking, herinneringen.",
  "Opponent Management": "Tegenpartij-Beheer",
  "Capture all opposing counsel, insurers and opponents. Integrated conflict-of-interest check.":
    "Leg alle tegenadvocaten, verzekeraars en tegenpartijen vast. Geïntegreerde belangenconflict-controle.",
  "Deadlines & Time": "Termijnen & Tijd",
  "Automatic deadline detection, calendar export, time tracking.":
    "Automatische termijn-detectie, kalender-export, tijd-tracking.",
  "Calendar Export": "Kalender-Export",
  "Sync with Outlook, Google Calendar, Apple Calendar. Deadlines exported as calendar entries.":
    "Sync met Outlook, Google Calendar, Apple Calendar. Termijnen geëxporteerd als kalender-items.",
  "Billing & Finance": "Facturering & Financiën",
  "Invoicing, DATEV export, fee calculation, dunning.":
    "Facturering, DATEV-export, honorarium-berekening, aanmaningen.",
  "DATEV Export": "DATEV-Export",
  "Export all booking data in DATEV-compatible format for the firm's accounting system.":
    "Exporteer alle boekingsdata in DATEV-compatibel formaat voor het boekhoudsysteem van het kantoor.",
  "Controlling & KPIs": "Controlling & KPI's",
  "Firm controlling: revenue, contribution margin, per-lawyer utilization, client profitability. Export for tax advisors.":
    "Kantoor-controlling: omzet, bijdragemarge, bezetting per advocaat, cliënt-rentabiliteit. Export voor belastingadviseurs.",
  "Data Export": "Data-Export",
  "Complete data export for backup, migration or portability requests. JSON, CSV, PDF — GDPR-compliant.":
    "Volledige data-export voor backup, migratie of portabiliteitsverzoeken. JSON, CSV, PDF — GDPR-conform.",
  Integrations: "Integraties",
  "DocuSign, connectors, API, SSO, webhooks.": "DocuSign, connectors, API, SSO, webhooks.",
  Connectors: "Connectors",
  "Open API for third-party systems. Webhook-based real-time sync with any tool.":
    "Open API voor systemen van derden. Webhook-gebaseerde real-time sync met elke tool.",
  "API Keys": "API-Sleutels",
  "Programmatic REST API access. Rate limits, scopes, audit logging. Perfect for practice software integrations.":
    "Programmatische REST API-toegang. Rate limits, scopes, audit logging. Perfect voor juridische software-integraties.",
  "SSO / WorkOS": "SSO / WorkOS",
  "Single sign-on via SAML, OIDC and WorkOS. Active Directory, Google Workspace, Microsoft 365.":
    "Single sign-on via SAML, OIDC en WorkOS. Active Directory, Google Workspace, Microsoft 365.",
  "Firm Import": "Kantoor-Import",
  "Migrate existing firm data from other systems. Contacts, cases, documents, time tracking — all transferred.":
    "Migreer bestaande kantoordata van andere systemen. Contacten, zaken, documenten, tijd-tracking — alles overgebracht.",
  "Firm Settings": "Kantoor-Instellingen",
  "Central management of firm data, bank details, logo, signatures, user roles and permissions.":
    "Centraal beheer van kantoordata, bankgegevens, logo, handtekeningen, gebruikersrollen en permissies.",
  "Microsoft Word Add-in": "Microsoft Word Add-in",
  "Draft pleadings and compare contracts directly in Microsoft Word. With brain connection, source insertion and AI suggestions — without leaving the editor.":
    "Concept pleidooien en vergelijk contracten direct in Microsoft Word. Met brain-verbinding, bron-invoeging en AI-suggesties — zonder de editor te verlaten.",
  "Plugin System": "Plugin-Systeem",
  "Extensibility through custom plugins and skills. subsumio.plugin.json format, subagents, skillpacks — the platform grows with your workflows.":
    "Uitbreidbaarheid via aangepaste plugins en skills. subsumio.plugin.json-formaat, subagenten, skillpacks — het platform groeit met je workflows.",
  Automation: "Automatisering",
  "Cron jobs, case law, deadline scanner, agents.":
    "Cron jobs, jurisprudentie, termijn-scanner, agenten.",
  "Case Law Scanner": "Jurisprudentie-Scanner",
  "Automatic scan of new court decisions. Classification, summary, integration into the brain.":
    "Automatische scan van nieuwe rechterlijke uitspraken. Classificatie, samenvatting, integratie in de brain.",
  "Deadline Scanner": "Termijn-Scanner",
  "Automatic scan of all documents for deadlines. No deadline is missed again.":
    "Automatische scan van alle documenten voor termijnen. Geen termijn wordt meer gemist.",
  "Case Scanner": "Zaak-Scanner",
  "Monitoring of ongoing cases for new developments, hearings and decisions.":
    "Monitoring van lopende zaken voor nieuwe ontwikkelingen, zittingen en uitspraken.",
  "Agent Automation": "Agent-Automatisering",
  "Self-configurable agents for recurring tasks. Skill-based, evaluable, federated.":
    "Zelf-configurerende agenten voor terugkerende taken. Skill-gebaseerd, evalueerbaar, gefedereerd.",
  "Specialized Modules": "Gespecialiseerde Modules",
  "Practice-area-specific: medical law, real estate law, insurance law and more.":
    "Specifiek per praktijkgebied: medisch recht, vastgoedrecht, verzekeringsrecht en meer.",
  "Case Law & Norms": "Jurisprudentie & Normen",
  "Database of German and Austrian legal sources. BGB, StGB, HGB, ABGB, AktG — with AI search.":
    "Database van Duitse en Oostenrijkse juridische bronnen. BGB, StGB, HGB, ABGB, AktG — met AI-zoekfunctie.",
  "Conflict Check": "Belangenconflict-Controle",
  "Automatic interest conflict check before client intake. Opponents, prior mandates, related persons.":
    "Automatische belangenconflict-controle voorafgaand aan cliënt-intake. Tegenpartijen, eerdere mandaten, gerelateerde personen.",
  "BEA Connection": "BEA-Verbinding",
  "Special electronic lawyer mailbox (BEA) in the dashboard. Send and receive beA messages.":
    "Speciale elektronische advocatenpostbus (BEA) in het dashboard. Verstuur en ontvang beA-berichten.",
  "Medical Law": "Medisch Recht",
  "Opinion analysis, MDK letters, medical record review, deadline catalog for medical lawyers.":
    "Advies-analyse, MDK-brieven, medisch dossier-onderzoek, termijn-catalogus voor medisch advocaten.",
  "Real Estate Law": "Vastgoedrecht",
  "Purchase contracts, land register queries, development plans, broker agreements for real estate lawyers.":
    "Koopcontracten, kadaster-aanvragen, bestemmingsplannen, makelaarsovereenkomsten voor vastgoed-advocaten.",
  "Insurance Law": "Verzekeringsrecht",
  "Coverage inquiries, loss adjustment, recourse, legal protection for insurance lawyers.":
    "Dekingsaanvragen, schade-afwikkeling, regres, rechtsbescherming voor verzekerings-advocaten.",
  Recruiting: "Werving",
  "Application management, talent pool, onboarding checklists, employment contract drafts for law firms.":
    "Sollicitatiebeheer, talent pool, onboarding-checklists, arbeidscontract-concepten voor advocatenkantoren.",
  "Legal Research": "Juridisch Onderzoek",
  "AI-powered legal research across all stored sources. Findings, argument chains, counter-arguments — all with sources.":
    "AI-gedreven juridisch onderzoek over alle opgeslagen bronnen. Bevindingen, argumentatieketens, tegenargumenten — alles met bronnen.",
  Consulting: "Advisering",
  "Module for legal advice and consulting mandates. Project structure, hour budgets, milestones, billing by flat fee or hourly rate.":
    "Module voor juridisch advies en advies-mandaten. Projectstructuur, uurbudgetten, milestones, facturering per forfait of uurtarief.",
  "Compliance & GRC": "Compliance & GRC",
  "Compliance and governance module for GDPR, AML, EU AI Act. Obligations, controls and evidence — all documented.":
    "Compliance- en governance-module voor GDPR, AML, EU AI Act. Verplichtingen, controles en bewijzen — alles gedocumenteerd.",
  "Mobile & Offline": "Mobiel & Offline",
  "App, offline sync, mobile bridge.": "App, offline sync, mobiele bridge.",
  "Mobile App": "Mobiele App",
  "Native iOS and Android app. Time tracking, upload, case access, chat — equally powerful on the go.":
    "NATIVE iOS- en Android-app. Tijd-tracking, upload, zaak-toegang, chat — even krachtig onderweg.",
  "Offline Sync": "Offline Sync",
  "Work without internet. Local storage, conflict-free sync on reconnection.":
    "Werk zonder internet. Lokale opslag, conflict-vrije sync bij herverbinding.",
  "Mobile Bridge": "Mobiele Bridge",
  "Seamless handover desktop ↔ mobile. Started on phone, continued in browser.":
    "Naadloze overgang desktop ↔ mobiel. Begonnen op de telefoon, voortgezet in de browser.",
  "Legal AI": "Juridische AI",
  "Contract drafts, redlining, conflict check, anonymization.":
    "Contract-concepten, redlining, belangenconflict-controle, anonimisering.",
  "Contract Drafts": "Contract-Concepten",
  "AI-generated drafts based on templates. T&Cs, employment contracts, purchase contracts, lease agreements.":
    "AI-gegenereerde concepten op basis van sjablonen. AV, arbeidscontracten, koopcontracten, huurovereenkomsten.",
  "Redlining & Comparison": "Redlining & Vergelijking",
  "Automatic comparison of contract versions. Mark changes, highlight risks.":
    "Automatische vergelijking van contractversies. Markeer wijzigingen, highlight risico's.",
  Anonymization: "Anonimisering",
  "Automatic anonymization for third parties, experts or publications. Names, addresses, birth dates.":
    "Automatische anonimisering voor derden, experts of publicaties. Namen, adressen, geboortedata.",
  "Pleadings Drafts": "Pleidooi-Concepten",
  "AI-assisted drafts for complaints, defense briefs, review petitions and legal remedies. With sources and citations.":
    "AI-geassisteerde concepten voor klachten, verweerschriften, beroepschriften en juridische remedies. Met bronnen en citaten.",
  "Technical Architecture": "Technische Architectuur",
  "Straight from the backend — no speculation.":
    "Rechtstreeks vanuit de backend — geen speculatie.",
  "72 API Endpoints": "72 API-Endpoints",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "Compleet REST API met auth, rate limiting, audit logging en TypeScript-types.",
  "57 Dashboard Pages": "57 Dashboard-Pagina's",
  "Every function has its own responsive page — from the case file to the cost calculator.":
    "Elke functie heeft zijn eigen responsive pagina — van het dossier tot de kosten-calculator.",
  "Self-Hosted or EU Cloud": "Self-Hosted of EU Cloud",
  "Local Docker installation or hosted in the EU with DPA. Data never leaves your control.":
    "Lokale Docker-installatie of EU-hosting met AVV. Data verlaat nooit jouw controle.",
  "Multi-Brain / Multi-Source": "Multi-Brain / Multi-Source",
  "Multiple brains per organization, multiple sources per brain. Federated search over latent space.":
    "Meerdere brains per organisatie, meerdere bronnen per brain. Federatieve zoekfunctie over latente ruimte.",
  "End-to-End Encryption": "End-to-End Versleuteling",
  "At-rest and in-transit. No training on client data. Professional secrecy by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).":
    "At-rest en in-transit. Geen training op cliëntdata. Beroepsgeheim by design — § 203 StGB (DE) / § 9 RAO (AT) / Art. 321 StGB (CH).",
  "Real-Time Sync": "Real-Time Sync",
  "WebSocket-based real-time updates between all clients. No refresh needed.":
    "WebSocket-gebaseerde real-time updates tussen alle cliënten. Geen refresh nodig.",
  "Something unclear?": "Iets onduidelijk?",
  "Every feature can be tried in the dashboard — not just documented.":
    "Elke functie kan worden uitgeprobeerd in het dashboard — niet alleen gedocumenteerd.",
  "Open Dashboard": "Dashboard Openen",
  "Comments & Notes": "Commentaren & Notities",
  "Case-internal comments, notes and discussions. Threading, mentions, notifications.":
    "Interne zaak-commentaren, notities en discussies. Threading, vermeldingen, notificaties.",
  "Contact Management": "Contactbeheer",
  "Central contacts for clients, opposing counsel, experts, courts and authorities. Linked to cases and deadlines.":
    "Centrale contacten voor cliënten, tegenadvocaten, experts, rechtbanken en autoriteiten. Gekoppeld aan zaken en termijnen.",
  "Team & Organization": "Team & Organisatie",
  "Team workspace management: create organization, invite members, assign roles and access rights. One brain for the whole team.":
    "Team-workspacebeheer: maak organisatie, nodig leden uit, wijs rollen en toegangsrechten toe. Eén brain voor het hele team.",
};

export function getDocs(lang: Lang): DocsContent {
  if (lang === "en") return EN;
  if (lang === "at") return applyReplacements(DE, AT_REPLACEMENTS);
  if (lang === "de" || lang === "ch") return DE;
  if (lang === "it") return applyReplacements(JSON.parse(JSON.stringify(EN)), IT_DOCS_REPLACEMENTS);
  if (lang === "es") return applyReplacements(JSON.parse(JSON.stringify(EN)), ES_DOCS_REPLACEMENTS);
  if (lang === "pl") return applyReplacements(JSON.parse(JSON.stringify(EN)), PL_DOCS_REPLACEMENTS);
  if (lang === "fr") return applyReplacements(JSON.parse(JSON.stringify(EN)), FR_DOCS_REPLACEMENTS);
  if (lang === "nl") return applyReplacements(JSON.parse(JSON.stringify(EN)), NL_DOCS_REPLACEMENTS);
  return EN;
}
