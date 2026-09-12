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
  quickstart: { title: string; sub: string; steps: { num: string; title: string; desc: string }[] };
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
  quickstart: {
    title: "In 5 Schritten starten",
    sub: "Vom Login bis zur ersten Akte — so schnell geht Subsumio live.",
    steps: [
      {
        num: "01",
        title: "Brain einrichten",
        desc: "Onboarding-Wizard starten, Datenquellen verbinden, Brain indexieren.",
      },
      {
        num: "02",
        title: "Erste Akte anlegen",
        desc: "Mandant erfassen, Akte erstellen, Dokumente per Drag-and-drop hochladen.",
      },
      {
        num: "03",
        title: "Fristen konfigurieren",
        desc: "AI scannt automatisch alle Dokumente nach Fristen — Kalender-Export aktivieren.",
      },
      {
        num: "04",
        title: "Copilot nutzen",
        desc: "Fragen an das Brain stellen, Antworten mit Fundstellen, Zeit buchen per Chat.",
      },
      {
        num: "05",
        title: "Team einladen",
        desc: "Mitglieder hinzufügen, Rollen vergeben, gemeinsam am Brain arbeiten.",
      },
    ],
  },
  categories: [
    {
      id: "brain",
      title: "Brain & KI",
      sub: "Semantisches Wissen, zitierte Antworten, Agenten.",
      features: [
        {
          icon: "Brain",
          title: "Semantic Brain",
          desc: "Fragen in normaler Sprache stellen — Antworten aus der gesamten Wissensbasis. Jedes Dokument, jede Email, jede Notiz ist sofort durchsuchbar.",
        },
        {
          icon: "Search",
          title: "KI-Chat mit Fundstellen",
          desc: "Jede Antwort verweist auf die exakte Quelle. Keine Halluzinationen — wenn das Brain es nicht findet, sagt es das auch.",
        },
        {
          icon: "Zap",
          title: "Think / Reasoning",
          desc: "Komplexe Rechtsfragen bekommen Schritt-für-Schritt-Argumentationen. Das Brain zeigt seinen Gedankengang — jede Schlussfolgerung nachprüfbar.",
        },
        {
          icon: "Network",
          title: "Agenten-System",
          desc: "Spezialisierte KI-Agenten für wiederkehrende Aufgaben einsetzen — Recherche, Entwurf, Review. Jeder Agent hat eigene Skills und ist evaluierbar.",
        },
        {
          icon: "GitBranch",
          title: "Graph & Entity View",
          desc: "Netzwerkansicht aller Entitäten und Beziehungen. Verborgene Verbindungen zwischen Mandanten und Gegenstellen.",
        },
        {
          icon: "ScanSearch",
          title: "RAG Evaluation",
          desc: "Eingebautes Qualitäts-Dashboard für KI-Antworten. Teste die Trefferqualität gegen echte Anfragen — weißt genau, wie zuverlässig das Brain ist.",
        },
        {
          icon: "Zap",
          title: "KI-Assistent",
          desc: "Integrierter KI-Assistent im Dashboard. Kontextbewusste Hilfe für alle Workflow-Schritte — von der Aktenanlage bis zur Rechnung.",
        },
        {
          icon: "Layers",
          title: "Cross-Dokument-Analyse",
          desc: "KI liest mehrere Dokumente gleichzeitig — erkennt Themen, Risiken und Muster, die in Einzeldokumenten unsichtbar bleiben.",
        },
        {
          icon: "BarChart3",
          title: "Portfolio Insights",
          desc: "Kanzlei-Portfolio-Analyse: Akten-Mix, Erfolgsraten, Risikocluster und Trends — auf Basis aller Brain-Daten.",
        },
        {
          icon: "BarChart3",
          title: "Adoption Analytics",
          desc: "Sieh, wer welche Funktionen wie oft nutzt. Trainingslücken erkennen, Adoption steuern, ROI messen.",
        },
        {
          icon: "Users",
          title: "Geteilte Räume",
          desc: "Shared Spaces für Teams: gemeinsame Wissensbereiche, geteilte Aktenzüge und kollaborative Notizen — mit granularer Zugriffskontrolle.",
        },
        {
          icon: "Database",
          title: "Datenquellen-Verwaltung",
          desc: "Alle Datenquellen in einem Dashboard: Sync-Status, Frequenz, Fehlerprotokolle. Probleme erkennen, bevor sie welche werden.",
        },
        {
          icon: "BarChart3",
          title: "Chat-Analytics",
          desc: "Copilot-Nutzung tracken: Sessions, Nachrichten, Token-Kosten, gepinnte Antworten — pro Nutzer, pro Tag.",
        },
        {
          icon: "GitCompare",
          title: "Modell-Vergleich",
          desc: "Side-by-Side-Vergleich verschiedener KI-Modelle: dieselbe Frage an mehrere Modelle gleichzeitig, Antworten nebeneinander bewerten.",
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
          desc: "Native Anbindung an NetDocuments, iManage, Google Drive, Box. Bi-direktionale Synchronisation.",
        },
        {
          icon: "Users",
          title: "Co-Editing & Presence",
          desc: "Echtzeit-Präsenzanzeige: sieh, wer gerade an welchem Dokument arbeitet. Live-Cursor, Avatars, kollaborative Notizen — WebSocket-basiert.",
        },
        {
          icon: "Layers",
          title: "OCR & Dokumentenverarbeitung",
          desc: "Scans, Fotos oder PDFs hochladen — Text wird automatisch extrahiert. Jedes Dokument wird durchsuchbar und klassifiziert.",
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
        {
          icon: "FileClock",
          title: "Dokumentenanfragen",
          desc: "Strukturierte Anforderung von Unterlagen an Mandanten. Status-Tracking, automatische Erinnerungen nach 7 Tagen, Eskalation nach 3 Remindern — per WhatsApp und In-App-Benachrichtigung.",
        },
        {
          icon: "GitBranch",
          title: "Versionshistorie",
          desc: "Vollständige Versionierung jedes Dokuments. Änderungen vergleichen, frühere Versionen wiederherstellen, Audit-Trail pro Version.",
        },
        {
          icon: "Layers",
          title: "Review-Sets & eDiscovery",
          desc: "Defensible Review-Sets mit Privilege Log und Redactions. Deduplication, Bulk-Tagging, Export gerichtsfertig.",
        },
        {
          icon: "CheckSquare",
          title: "Review-Queue",
          desc: "Strukturierte Durchsicht von Dokumenten: Taggen, Kommentieren, Priorisieren. Batch-Weise mit Filtern und Saved Views.",
        },
        {
          icon: "AlertTriangle",
          title: "Altlasten-Management",
          desc: "Risikobehaftete und veraltete Akten identifizieren, klassifizieren und überwachen. Pipeline-Status, Eskalationsstufen, Fristen-Warnung — nichts fällt durchs Raster.",
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
        {
          icon: "BookOpen",
          title: "Fristenbuch",
          desc: "Chronologisches Fristenregister — alle Fristen einer Akte in einer Übersicht. Sortierbar nach Datum, Art, Status. Revisionssicher dokumentiert.",
        },
        {
          icon: "CheckSquare",
          title: "Aufgabenverwaltung",
          desc: "Aufgaben und To-Dos pro Akte oder global. Fälligkeitsdaten, Prioritäten, Zuweisung an Teammitglieder, Status-Tracking.",
        },
        {
          icon: "CalendarClock",
          title: "Kalender mit Inline-Bearbeitung",
          desc: "Monatskalender mit Klick-zu-Erstellen, Drag-Bearbeitung, Termin-Typen (Termin, Verhandlung, Beratung). Aktenverknüpfung, Erinnerungen.",
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
        {
          icon: "Shield",
          title: "Treuhandkonten",
          desc: "Verwaltung von Klientengeldern auf Anderkonten. Ein- und Auszahlungen, Salden, Buchungsnachweise — revisionssicher.",
        },
        {
          icon: "FileText",
          title: "Berichte & Reports",
          desc: "Strukturierte Berichte: Aktenauswertungen, Umsatzstatistiken, Fristen-Reports, Produktivitätsanalysen. Export als PDF oder CSV.",
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
          desc: "DSGVO eingebaut ins Platform: AVV-Vorlagen, Datenportabilität, Löschrecht — alles out-of-the-box ready.",
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
          desc: "Jede Akte ist strikt getrennt. Ein Nutzer auf Akte A kann Akte B nicht sehen — per Design garantiert, fuzz-getestet auf zero leaks.",
        },
        {
          icon: "ShieldCheck",
          title: "Ethical Walls",
          desc: "Strikte Informationsbarrieren zwischen Akten und Teams. Konfigurierbare Zugriffsblockaden verhindern Interessenkonflikte — durchgesetzt auf Datenbankebene.",
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
        {
          icon: "Gauge",
          title: "Engine-Monitoring (APM)",
          desc: "Echtzeit-Performance-Dashboard: Antwortzeiten, Brain-Qualität, Queue-Tiefe und Fehlerraten — alles auf einen Blick.",
        },
        {
          icon: "FileArchive",
          title: "Aufbewahrungsrichtlinien",
          desc: "Automatisierte Retention-Rules nach DSGVO und BRAO: Aufbewahrungsfristen pro Dokumententyp, automatische Löschung nach Ablauf, Audit-Trail.",
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
        {
          icon: "Inbox",
          title: "Eingangspost (Intake)",
          desc: "Neue Mandanten und Eingänge strukturiert erfassen. Schnellerfassung mit automatischer Aktenanlage, Kontaktanreicherung und Fristenerkennung.",
        },
        {
          icon: "BookOpen",
          title: "Verzeichnis (Gerichte & Behörden)",
          desc: "Zentrales Verzeichnis aller Gerichte, Behörden und Institutionen. Adressen, Zuständigkeiten, Aktenzeichen-Formate — direkt verknüpfbar mit Akten.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp-Vorlagen",
          desc: "Vorlagenbibliothek für WhatsApp-Nachrichten: Standard-Antworten, Mandanten-Anschreiben, Erinnerungs-Templates. Mit Variablen und Freigabe-Workflow.",
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
          desc: "Jede Drittanbieter-Software per offener API anbinden. Echtzeit-Webhooks halten alles synchron — keine manuellen Exporte.",
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
        {
          icon: "Languages",
          title: "Juristische Übersetzung",
          desc: "KI-gestützte Übersetzung juristischer Texte mit fachsprachlicher Genauigkeit. Erkennt Vertragsklauseln, Rechtsbegriffe und Behördentermini.",
        },
        {
          icon: "Zap",
          title: "Onboarding-Wizard",
          desc: "Geführtes Onboarding für neue Nutzer: Brain einrichten, erste Akte anlegen, Kontakte importieren, Fristen konfigurieren — Schritt für Schritt.",
        },
        {
          icon: "Cpu",
          title: "KI-Modell-Konfiguration",
          desc: "Modell-Auswahl im Dashboard: Provider, Geschwindigkeit, Kosten, Kontextfenster. Pro Organisation konfigurierbar — von Budget-Modell bis Premium-Reasoning.",
        },
        {
          icon: "Network",
          title: "SCIM-Provisioning",
          desc: "Automatisierte Benutzer-Verwaltung via SCIM 2.0: User anlegen, aktualisieren, deaktivieren — direkt aus Identity-Provider (Okta, Azure AD, Google).",
        },
        {
          icon: "CreditCard",
          title: "Abrechnung & Abo-Verwaltung",
          desc: "Plan-Verwaltung, Upgrade/Downgrade, Zahlungsmethoden, Rechnungshistorie. Stripe-Integration mit Self-Service-Portal für Mandanten.",
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
          desc: "Agenten für wiederkehrende Aufgaben einrichten — sie laufen nach Zeitplan, melden Ergebnisse und lernen aus Feedback.",
        },
        {
          icon: "Zap",
          title: "Workflow-Automatisierung",
          desc: "Wiederkehrende Workflows automatisieren: Dokumentenfreigaben, Fristen-Eskalationen, Akten-Status-Übergänge. Trigger-basiert, mit Bedingungen und Aktionen.",
        },
        {
          icon: "CheckSquare",
          title: "Freigaben & Approvals",
          desc: "Strukturierte Freigabeprozesse für Dokumente, Rechnungen und Schriftsätze. Mehrstufige Approval-Ketten, Delegation, Audit-Trail pro Freigabe.",
        },
        {
          icon: "Shield",
          title: "Obliegenheits-Tracking",
          desc: "Verfolgung aller Obliegenheiten pro Akte: Fristen, Formvorschriften, Darlegungspflichten. Automatische Warnung bei drohender Verletzung.",
        },
        {
          icon: "RefreshCw",
          title: "Urteils-Synchronisation",
          desc: "Automatischer Abruf neuer Gerichtsentscheidungen aus externen Quellen. Täglicher Sync, Delta-Erkennung, automatische Indexierung ins Brain.",
        },
        {
          icon: "Workflow",
          title: "Workflow-Builder",
          desc: "Visueller Drag-and-Drop-Editor für Automatisierungen: Trigger, Bedingungen, Aktionen. Kein Code nötig — Workflows grafisch erstellen und testen.",
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
        {
          icon: "BookOpen",
          title: "Playbooks",
          desc: "Wiederverwendbare Prozessvorlagen für wiederkehrende Falltypen. Schritt-folgen, Checklisten, Fristen-Muster — pro Rechtsgebiet.",
        },
        {
          icon: "FileText",
          title: "Vorlagenverwaltung",
          desc: "Zentrale Bibliothek für Dokumentvorlagen. Schriftsätze, Verträge, Anschreiben — mit Variablen und Brain-Anbindung für Auto-Fill.",
        },
        {
          icon: "Layers",
          title: "Klauselbibliothek",
          desc: "Strukturierte Sammlung wiederverwendbarer Klauseln. Kategorisiert nach Vertragstyp, Rechtsgebiet und Risiko. Mit KI-Vorschlägen bei der Drafting.",
        },
        {
          icon: "MessageSquare",
          title: "Juristische Kommentierungen",
          desc: "Annotationen und Kommentare zu Normen, Urteilen und Vertragsklauseln. Team-weit geteilt, mit Diskussionsverlauf.",
        },
        {
          icon: "Brain",
          title: "Wissensmanagement (Experience)",
          desc: "Strukturierte Erfassung von Kanzlei-Wissen: Fallstricke, Best Practices, Lessons Learned. Durchsuchbar, verknüpfbar mit Akten.",
        },
        {
          icon: "Database",
          title: "Urteilsdatenbank",
          desc: "Volltext-Suche in tausenden Gerichtsentscheidungen. Filter nach Gericht, Datum, Aktenzeichen, Rechtsgebiet — mit KI-Zusammenfassung pro Urteil.",
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
          icon: "Mic",
          title: "Voice-to-Prompt",
          desc: "Spracheingabe für Prompts auf Mobile und Desktop. Web Speech API, transkribiert in Echtzeit, sendet als Text — ideal für Diktat nach dem Termin.",
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
        {
          icon: "Search",
          title: "Globale Volltextsuche",
          desc: "Suche über alle Akten, Dokumente, Notizen, Rechnungen und Chats — mit Scope-Filter pro Typ. Hybrid-Suche: Vektor + BM25 + Graph.",
        },
        {
          icon: "Zap",
          title: "Mobile Pipeline-Status",
          desc: "Pipeline-Runs mobil überwachen: Status (running, completed, failed, awaiting_review), Layer-Details tap-to-expand, Output-Viewer mit Markdown-Rendering.",
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
        {
          icon: "PenTool",
          title: "Drafting-Editor",
          desc: "Vollständiger Drafting-Editor mit Brain-Anbindung: KI-Vorschläge inline, Fundstellen-Einfügung, Klauselbibliothek-Integration, Versionsvergleich.",
        },
        {
          icon: "FileSearch",
          title: "Standalone-Dokumentenanalyse",
          desc: "Dokumente analysieren ohne Aktenkontext: Upload, KI-Analyse, Risiko-Highlighting, Zusammenfassung — ideal für Ersteinschätzungen und Due Diligence.",
        },
      ],
    },
    {
      id: "litigation",
      title: "Prozessführung & eDiscovery",
      sub: "Phasen, Analytics, Review-Sets, Präzedenzsuche.",
      features: [
        {
          icon: "Gavel",
          title: "Prozessführung (Litigation)",
          desc: "Strukturierte Prozessverwaltung mit Phasen und Schritten. Status pro Phase, zugewiesene Teammitglieder, Fristen und Dokumente pro Schritt.",
        },
        {
          icon: "BarChart3",
          title: "Prozess-Analytics",
          desc: "Erfolgsraten, Verfahrensdauer, Gerichtsstatistiken. Trends pro Gericht, pro Verfahrensart, pro Gegner — auf Basis historischer Daten.",
        },
        {
          icon: "Search",
          title: "Präzedenzfall-Suche",
          desc: "KI-gestützte Suche nach ähnlichen Fällen im Brain und in externen Rechtsprechungsdatenbanken. Automatische Relevanz-Sortierung.",
        },
        {
          icon: "Zap",
          title: "Prozessstrategie",
          desc: "Strukturierte Strategie-Erfassung pro Akte: Argumentationslinien, Beweisführung, Gegenargumente. Mit KI-Vorschlägen und Erfolgsprognose.",
        },
        {
          icon: "BarChart3",
          title: "Rechtsprechungs-Analytics",
          desc: "Statistische Analyse der Rechtsprechung: Erfolgsquoten pro Gericht, Trend-Kurven, Verfahrensarten-Verteilung — auf Basis tausender Entscheidungen.",
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
        title: "480+ API-Endpunkte",
        desc: "Vollständige REST-API mit Auth, Rate-Limiting, Audit-Logging und TypeScript-Typen.",
      },
      {
        icon: "FolderOpen",
        title: "150+ Dashboard-Seiten",
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
  quickstart: {
    title: "Get started in 5 steps",
    sub: "From login to first case — how fast Subsumio goes live.",
    steps: [
      {
        num: "01",
        title: "Set up Brain",
        desc: "Run the onboarding wizard, connect data sources, index your brain.",
      },
      {
        num: "02",
        title: "Create first case",
        desc: "Add client, create case, upload documents via drag-and-drop.",
      },
      {
        num: "03",
        title: "Configure deadlines",
        desc: "AI automatically scans all documents for deadlines — enable calendar export.",
      },
      {
        num: "04",
        title: "Use Copilot",
        desc: "Ask the brain questions, get cited answers, book time via chat.",
      },
      {
        num: "05",
        title: "Invite team",
        desc: "Add members, assign roles, collaborate on the brain together.",
      },
    ],
  },
  categories: [
    {
      id: "brain",
      title: "Brain & AI",
      sub: "Semantic knowledge, cited answers, agents.",
      features: [
        {
          icon: "Brain",
          title: "Semantic Brain",
          desc: "Ask questions in plain language — get answers from your entire knowledge base. Every document, email and note is instantly searchable.",
        },
        {
          icon: "Search",
          title: "AI Chat with Citations",
          desc: "Every answer links back to the exact source passage. No hallucinations — if the brain can't find it, it says so.",
        },
        {
          icon: "Zap",
          title: "Think / Reasoning",
          desc: "Complex legal questions get step-by-step reasoning. The brain shows its work — so you can verify every conclusion.",
        },
        {
          icon: "Network",
          title: "Agent System",
          desc: "Deploy specialized AI agents for recurring tasks — research, drafting, review. Each agent has its own skills and can be evaluated.",
        },
        {
          icon: "GitBranch",
          title: "Graph & Entity View",
          desc: "Network view of all entities and relationships. Discovers hidden connections between clients and opponents.",
        },
        {
          icon: "ScanSearch",
          title: "RAG Evaluation",
          desc: "Built-in quality dashboard for AI answers. Test retrieval quality against real queries — know exactly how reliable the brain is.",
        },
        {
          icon: "Zap",
          title: "AI Assistant",
          desc: "Integrated AI assistant in the dashboard. Context-aware help for every workflow step — from case creation to invoicing.",
        },
        {
          icon: "Layers",
          title: "Cross-Document Analysis",
          desc: "AI reads across multiple documents at once — finds themes, risks and patterns you'd miss document-by-document.",
        },
        {
          icon: "BarChart3",
          title: "Portfolio Insights",
          desc: "Firm portfolio analysis: case mix, success rates, risk clusters and trends — based on all brain data.",
        },
        {
          icon: "BarChart3",
          title: "Adoption Analytics",
          desc: "See who uses which features and how often. Spot training gaps, drive adoption, measure ROI.",
        },
        {
          icon: "Users",
          title: "Shared Spaces",
          desc: "Shared Spaces for teams: collaborative knowledge areas, shared case streams and notes — with granular access control.",
        },
        {
          icon: "Database",
          title: "Sources Management",
          desc: "All data sources in one dashboard: sync status, frequency, error logs. Spot issues before they become problems.",
        },
        {
          icon: "BarChart3",
          title: "Chat Analytics",
          desc: "Track copilot usage: sessions, messages, token costs, pinned answers — per user, per day.",
        },
        {
          icon: "GitCompare",
          title: "Model Comparison",
          desc: "Side-by-side comparison of different AI models: same question to multiple models at once, evaluate answers next to each other.",
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
          desc: "Native connection to NetDocuments, iManage, Google Drive, Box. Bi-directional synchronization.",
        },
        {
          icon: "Users",
          title: "Co-Editing & Presence",
          desc: "Real-time presence indicator: see who is working on which document. Live cursors, avatars, collaborative notes — WebSocket-based.",
        },
        {
          icon: "Layers",
          title: "OCR & Document Processing",
          desc: "Upload scans, photos or PDFs — text is extracted automatically. Every document becomes searchable and classified.",
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
        {
          icon: "FileClock",
          title: "Document Requests",
          desc: "Structured requests for documents from clients. Status tracking, automatic reminders after 7 days, escalation after 3 reminders — via WhatsApp and in-app notification.",
        },
        {
          icon: "GitBranch",
          title: "Version History",
          desc: "Full versioning of every document. Compare changes, restore previous versions, audit trail per version.",
        },
        {
          icon: "Layers",
          title: "Review Sets & eDiscovery",
          desc: "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export ready for court.",
        },
        {
          icon: "CheckSquare",
          title: "Review Queue",
          desc: "Structured document review: tagging, commenting, prioritizing. Batch-based with filters and saved views.",
        },
        {
          icon: "AlertTriangle",
          title: "Legacy Cases",
          desc: "Identify, classify and monitor risky and outdated cases. Pipeline status, escalation levels, deadline warnings — nothing falls through the cracks.",
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
        {
          icon: "BookOpen",
          title: "Deadline Register",
          desc: "Chronological deadline register — all deadlines of a case in one view. Sortable by date, type, status. Audit-proof documented.",
        },
        {
          icon: "CheckSquare",
          title: "Task Management",
          desc: "Tasks and to-dos per case or global. Due dates, priorities, assignment to team members, status tracking.",
        },
        {
          icon: "CalendarClock",
          title: "Calendar with Inline Editing",
          desc: "Month calendar with click-to-create, drag editing, appointment types (hearing, consultation, meeting). Case linking, reminders.",
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
        {
          icon: "Shield",
          title: "Trust Accounting",
          desc: "Management of client funds on escrow accounts. Deposits and withdrawals, balances, transaction records — audit-proof.",
        },
        {
          icon: "FileText",
          title: "Reports",
          desc: "Structured reports: case evaluations, revenue statistics, deadline reports, productivity analyses. Export as PDF or CSV.",
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
          desc: "GDPR built into the platform: DPA templates, data portability, right to erasure — all ready out of the box.",
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
          desc: "Every case is walled off from others. A user on case A cannot see case B — guaranteed by design, fuzz-tested for zero leaks.",
        },
        {
          icon: "ShieldCheck",
          title: "Ethical Walls",
          desc: "Strict information barriers between cases and teams. Configurable access blocks prevent conflicts of interest — enforced at the database level.",
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
        {
          icon: "Gauge",
          title: "Engine Monitoring (APM)",
          desc: "Real-time performance dashboard: response times, brain quality, queue depth and error rates — all at a glance.",
        },
        {
          icon: "FileArchive",
          title: "Retention Policies",
          desc: "Automated retention rules per GDPR and BRAO: retention periods per document type, automatic deletion after expiry, audit trail.",
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
        {
          icon: "Inbox",
          title: "Intake",
          desc: "Structured intake of new clients and incoming items. Quick capture with automatic case creation, contact enrichment and deadline detection.",
        },
        {
          icon: "BookOpen",
          title: "Directory (Courts & Authorities)",
          desc: "Central directory of all courts, authorities and institutions. Addresses, jurisdictions, file number formats — directly linkable to cases.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp Templates",
          desc: "Template library for WhatsApp messages: standard replies, client letters, reminder templates. With variables and approval workflow.",
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
          desc: "Connect any third-party tool via open API. Real-time webhooks keep everything in sync — no manual exports.",
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
        {
          icon: "Languages",
          title: "Legal Translation",
          desc: "AI-powered translation of legal texts with specialized terminology accuracy. Detects contract clauses, legal terms and authority jargon.",
        },
        {
          icon: "Zap",
          title: "Onboarding Wizard",
          desc: "Guided onboarding for new users: set up brain, create first case, import contacts, configure deadlines — step by step.",
        },
        {
          icon: "Cpu",
          title: "AI Model Configuration",
          desc: "Model selection in the dashboard: provider, speed, cost, context window. Configurable per organization — from budget model to premium reasoning.",
        },
        {
          icon: "Network",
          title: "SCIM Provisioning",
          desc: "Automated user management via SCIM 2.0: create, update, deactivate users — directly from identity providers (Okta, Azure AD, Google).",
        },
        {
          icon: "CreditCard",
          title: "Billing & Subscription",
          desc: "Plan management, upgrade/downgrade, payment methods, invoice history. Stripe integration with self-service portal for clients.",
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
          desc: "Set up agents for recurring tasks — they run on schedule, report results and learn from feedback.",
        },
        {
          icon: "Zap",
          title: "Workflow Automation",
          desc: "Automate recurring workflows: document approvals, deadline escalations, case status transitions. Trigger-based, with conditions and actions.",
        },
        {
          icon: "CheckSquare",
          title: "Approvals",
          desc: "Structured approval processes for documents, invoices and pleadings. Multi-stage approval chains, delegation, audit trail per approval.",
        },
        {
          icon: "Shield",
          title: "Obligation Tracking",
          desc: "Tracking of all obligations per case: deadlines, form requirements, disclosure duties. Automatic warning when violation is imminent.",
        },
        {
          icon: "RefreshCw",
          title: "Judgement Sync",
          desc: "Automatic retrieval of new court decisions from external sources. Daily sync, delta detection, automatic indexing into the brain.",
        },
        {
          icon: "Workflow",
          title: "Workflow Builder",
          desc: "Visual drag-and-drop editor for automations: triggers, conditions, actions. No code needed — build and test workflows visually.",
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
        {
          icon: "BookOpen",
          title: "Playbooks",
          desc: "Reusable process templates for recurring case types. Step sequences, checklists, deadline patterns — per practice area.",
        },
        {
          icon: "FileText",
          title: "Template Management",
          desc: "Central library for document templates. Pleadings, contracts, cover letters — with variables and brain connection for auto-fill.",
        },
        {
          icon: "Layers",
          title: "Clause Library",
          desc: "Structured collection of reusable clauses. Categorized by contract type, practice area and risk. With AI suggestions during drafting.",
        },
        {
          icon: "MessageSquare",
          title: "Legal Commentaries",
          desc: "Annotations and comments on norms, judgments and contract clauses. Shared across the team, with discussion history.",
        },
        {
          icon: "Brain",
          title: "Knowledge Management (Experience)",
          desc: "Structured capture of firm knowledge: pitfalls, best practices, lessons learned. Searchable, linkable to cases.",
        },
        {
          icon: "Database",
          title: "Judgement Database",
          desc: "Full-text search across thousands of court decisions. Filter by court, date, file number, practice area — with AI summary per judgement.",
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
          icon: "Mic",
          title: "Voice-to-Prompt",
          desc: "Voice input for prompts on mobile and desktop. Web Speech API, real-time transcription, sends as text — ideal for post-hearing dictation.",
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
        {
          icon: "Search",
          title: "Global Full-Text Search",
          desc: "Search across all cases, documents, notes, invoices and chats — with scope filters per type. Hybrid search: vector + BM25 + graph.",
        },
        {
          icon: "Zap",
          title: "Mobile Pipeline Status",
          desc: "Monitor pipeline runs on mobile: status (running, completed, failed, awaiting_review), layer details tap-to-expand, output viewer with Markdown rendering.",
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
        {
          icon: "PenTool",
          title: "Drafting Editor",
          desc: "Full drafting editor with brain connection: inline AI suggestions, source insertion, clause library integration, version comparison.",
        },
        {
          icon: "FileSearch",
          title: "Standalone Document Analysis",
          desc: "Analyze documents without case context: upload, AI analysis, risk highlighting, summary — ideal for initial assessments and due diligence.",
        },
      ],
    },
    {
      id: "litigation",
      title: "Litigation & eDiscovery",
      sub: "Phases, analytics, review sets, precedent search.",
      features: [
        {
          icon: "Gavel",
          title: "Litigation Management",
          desc: "Structured litigation management with phases and steps. Status per phase, assigned team members, deadlines and documents per step.",
        },
        {
          icon: "BarChart3",
          title: "Litigation Analytics",
          desc: "Success rates, case duration, court statistics. Trends per court, per case type, per opponent — based on historical data.",
        },
        {
          icon: "Search",
          title: "Precedent Search",
          desc: "AI-powered search for similar cases in the brain and external case law databases. Automatic relevance ranking.",
        },
        {
          icon: "Zap",
          title: "Process Strategy",
          desc: "Structured strategy capture per case: argument lines, evidence, counter-arguments. With AI suggestions and success prognosis.",
        },
        {
          icon: "BarChart3",
          title: "Case Law Analytics",
          desc: "Statistical analysis of case law: success rates per court, trend curves, case type distribution — based on thousands of decisions.",
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
        title: "480+ API Endpoints",
        desc: "Complete REST API with auth, rate limiting, audit logging and TypeScript types.",
      },
      {
        icon: "FolderOpen",
        title: "150+ Dashboard Pages",
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
  if (lang === "de" || lang === "ch") return DE;
  return EN;
}
