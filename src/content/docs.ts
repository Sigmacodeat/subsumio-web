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
    {
      id: "tax",
      title: "Steuer & Buchhaltung",
      sub: "Steuererklärungen, ELSTER, StBVV, Betriebsprüfung.",
      features: [
        {
          icon: "FileText",
          title: "Steuererklärungen",
          desc: "Erstellung und Verwaltung von Steuererklärungen (ESt, USt, GewSt, KSt). Strukturierte Erfassung, Validierung, Status-Tracking.",
        },
        {
          icon: "FileText",
          title: "Steuerbescheide",
          desc: "Erfassung und Analyse von Steuerbescheiden. Abgleich mit Erklärung, Abweichungsanalyse, Einspruch-Fristen-Tracking.",
        },
        {
          icon: "Shield",
          title: "Betriebsprüfung",
          desc: "Vorbereitung und Begleitung von Betriebsprüfungen. Prüffeld-Management, Dokumentbereitstellung, Protokollführung.",
        },
        {
          icon: "CalendarClock",
          title: "Steuerfristen",
          desc: "Alle steuerlichen Fristen (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) mit automatischer Wochenend- und Feiertagsverschiebung.",
        },
        {
          icon: "Calculator",
          title: "StBVV-Gebührenrechner",
          desc: "Steuerberatervergütungsverordnung: 10 Aktivitäten, VV-Nummern, Faktor-Berechnung, Mehrwertsteuer. Interaktiv und exportierbar.",
        },
        {
          icon: "Users",
          title: "Steuermandanten",
          desc: "Separate Mandantenverwaltung für Steuerberater: Stammdaten, Steuernummer, Finanzamt, Zuordnung zu Erklärungen und Bescheiden.",
        },
        {
          icon: "Landmark",
          title: "ELSTER-Integration",
          desc: "Elektronische Steuererklärungen via ELSTER. XML-Generierung, Form-Typen, Submission-Wizard — direkt aus dem Dashboard.",
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
        title: "90+ API Endpunkte",
        desc: "Vollständige REST-API mit Auth, Rate-Limiting, Audit-Logging und TypeScript-Typen.",
      },
      {
        icon: "FolderOpen",
        title: "97+ Dashboard-Seiten",
        desc: "Jede Funktion hat eine eigene, responsive Seite — von der Akte bis zum ELSTER-Wizard.",
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
    {
      id: "tax",
      title: "Tax & Accounting",
      sub: "Tax returns, ELSTER, StBVV, tax audits.",
      features: [
        {
          icon: "FileText",
          title: "Tax Returns",
          desc: "Preparation and management of tax returns (income, VAT, trade, corporate). Structured entry, validation, status tracking.",
        },
        {
          icon: "FileText",
          title: "Tax Assessments",
          desc: "Capture and analysis of tax assessments. Comparison with return, deviation analysis, objection deadline tracking.",
        },
        {
          icon: "Shield",
          title: "Tax Audit",
          desc: "Preparation and support of tax audits. Audit field management, document provision, protocol management.",
        },
        {
          icon: "CalendarClock",
          title: "Tax Deadlines",
          desc: "All tax deadlines (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) with automatic weekend and holiday shifting.",
        },
        {
          icon: "Calculator",
          title: "StBVV Fee Calculator",
          desc: "Tax adviser remuneration ordinance: 10 activities, VV numbers, factor calculation, VAT. Interactive and exportable.",
        },
        {
          icon: "Users",
          title: "Tax Clients",
          desc: "Separate client management for tax advisers: master data, tax number, tax office, assignment to returns and assessments.",
        },
        {
          icon: "Landmark",
          title: "ELSTER Integration",
          desc: "Electronic tax returns via ELSTER. XML generation, form types, submission wizard — directly from the dashboard.",
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
        title: "90+ API Endpoints",
        desc: "Complete REST API with auth, rate limiting, audit logging and TypeScript types.",
      },
      {
        icon: "FolderOpen",
        title: "97+ Dashboard Pages",
        desc: "Every function has its own responsive page — from the case file to the ELSTER wizard.",
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
  "90+ API Endpoints": "90+ Endpoint API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "API REST completa con auth, rate limiting, audit logging e tipi TypeScript.",
  "97+ Dashboard Pages": "97+ Pagine Dashboard",
  "Every function has its own responsive page — from the case file to the ELSTER wizard.":
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
  // ── New features ──
  "Cross-Document Analysis": "Analisi Cross-Documento",
  "AI-powered analysis across multiple documents: detect themes, risks and patterns invisible in individual documents.":
    "Analisi AI su più documenti: rileva temi, rischi e pattern invisibili nei singoli documenti.",
  "Portfolio Insights": "Insights Portfolio",
  "Firm portfolio analysis: case mix, success rates, risk clusters and trends — based on all brain data.":
    "Analisi portfolio studio: mix casi, tassi di successo, cluster di rischio e trend — basati su tutti i dati del brain.",
  "Adoption Analytics": "Analytics di Adozione",
  "Usage and adoption tracking: who uses which features how often? Basis for training decisions and rollout steering.":
    "Tracciamento di utilizzo e adozione: chi usa quali funzioni e quanto spesso? Base per decisioni di formazione e rollout.",
  "Shared Spaces": "Spazi Condivisi",
  "Shared Spaces for teams: collaborative knowledge areas, shared case streams and notes — with granular access control.":
    "Spazi Condivisi per team: aree di conoscenza collaborative, flussi di casi condivisi e note — con controllo accessi granulare.",
  "Sources Management": "Gestione Fonti",
  "Central management of all data sources and connectors. Status, sync frequency, error logs — all in one place.":
    "Gestione centrale di tutte le fonti dati e connector. Stato, frequenza di sync, log errori — tutto in un posto.",
  "Document Requests": "Richieste Documenti",
  "Structured requests for documents from clients. Status tracking, automatic reminders after 7 days, escalation after 3 reminders — via WhatsApp and in-app notification.":
    "Richieste strutturate di documenti ai clienti. Tracciamento stato, promemoria automatici dopo 7 giorni, escalation dopo 3 promemoria — via WhatsApp e notifica in-app.",
  "Version History": "Cronologia Versioni",
  "Full versioning of every document. Compare changes, restore previous versions, audit trail per version.":
    "Versioning completo di ogni documento. Confronta modifiche, ripristina versioni precedenti, audit trail per versione.",
  "Review Sets & eDiscovery": "Review Set & eDiscovery",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export for court.":
    "Review set difendibili con privilege log e redazioni. Deduplicazione, tagging massivo, export per tribunale.",
  "Review Queue": "Coda di Review",
  "Structured document review: tagging, commenting, prioritizing. Batch-based with filters and saved views.":
    "Review strutturata dei documenti: tagging, commenti, priorità. Per batch con filtri e viste salvate.",
  "Deadline Register": "Registro Scadenze",
  "Chronological deadline register — all deadlines of a case in one view. Sortable by date, type, status. Audit-proof documented.":
    "Registro scadenze cronologico — tutte le scadenze di un caso in una vista. Ordinabile per data, tipo, stato. Documentato audit-proof.",
  "Task Management": "Gestione Task",
  "Tasks and to-dos per case or global. Due dates, priorities, assignment to team members, status tracking.":
    "Task e to-do per caso o globali. Date di scadenza, priorità, assegnazione a membri del team, tracciamento stato.",
  "Calendar with Inline Editing": "Calendario con Modifica Inline",
  "Month calendar with click-to-create, drag editing, appointment types (hearing, consultation, meeting). Case linking, reminders.":
    "Calendario mensile con click-per-creare, modifica drag, tipi appuntamento (udienza, consulenza, riunione). Collegamento casi, promemoria.",
  "Trust Accounting": "Conti Fiduciari",
  "Management of client funds on escrow accounts. Deposits and withdrawals, balances, transaction records — audit-proof.":
    "Gestione fondi cliente su conti fiduciari. Depositi e prelievi, saldi, registrazioni transazioni — audit-proof.",
  Reports: "Report",
  "Structured reports: case evaluations, revenue statistics, deadline reports, productivity analyses. Export as PDF or CSV.":
    "Report strutturati: valutazioni casi, statistiche ricavi, report scadenze, analisi produttività. Export PDF o CSV.",
  Intake: "Intake",
  "Structured intake of new clients and incoming items. Quick capture with automatic case creation, contact enrichment and deadline detection.":
    "Intake strutturato di nuovi clienti e arrivi. Acquisizione rapida con creazione automatica caso, arricchimento contatti e rilevamento scadenze.",
  "Directory (Courts & Authorities)": "Elenco (Tribunali & Autorità)",
  "Central directory of all courts, authorities and institutions. Addresses, jurisdictions, file number formats — directly linkable to cases.":
    "Elenco centrale di tutti i tribunali, autorità e istituzioni. Indirizzi, giurisdizioni, formati numeri di pratica — collegabili direttamente ai casi.",
  "Legal Translation": "Traduzione Legale",
  "AI-powered translation of legal texts with specialized terminology accuracy. Detects contract clauses, legal terms and authority jargon.":
    "Traduzione AI di testi legali con accuratezza terminologica specializzata. Rileva clausole contrattuali, termini legali e gergo burocratico.",
  "Onboarding Wizard": "Wizard Onboarding",
  "Guided onboarding for new users: set up brain, create first case, import contacts, configure deadlines — step by step.":
    "Onboarding guidato per nuovi utenti: configura brain, crea primo caso, importa contatti, configura scadenze — passo per passo.",
  "Workflow Automation": "Automazione Workflow",
  "Automate recurring workflows: document approvals, deadline escalations, case status transitions. Trigger-based, with conditions and actions.":
    "Automatizza workflow ricorrenti: approvazioni documenti, escalation scadenze, transizioni stato casi. Basato su trigger, con condizioni e azioni.",
  Approvals: "Approvazioni",
  "Structured approval processes for documents, invoices and pleadings. Multi-stage approval chains, delegation, audit trail per approval.":
    "Processi di approvazione strutturati per documenti, fatture e atti. Catene di approvazione multi-livello, delega, audit trail per approvazione.",
  "Obligation Tracking": "Tracciamento Obblighi",
  "Tracking of all obligations per case: deadlines, form requirements, disclosure duties. Automatic warning when violation is imminent.":
    "Tracciamento di tutti gli obblighi per caso: scadenze, requisiti formali, obblighi di disclosure. Avviso automatico quando la violazione è imminente.",
  Playbooks: "Playbook",
  "Reusable process templates for recurring case types. Step sequences, checklists, deadline patterns — per practice area.":
    "Template di processo riutilizzabili per tipi di caso ricorrenti. Sequenze di passi, checklist, pattern di scadenze — per area di pratica.",
  "Template Management": "Gestione Template",
  "Central library for document templates. Pleadings, contracts, cover letters — with variables and brain connection for auto-fill.":
    "Libreria centrale per template documentali. Atti, contratti, lettere — con variabili e connessione brain per auto-fill.",
  "Clause Library": "Libreria Clausole",
  "Structured collection of reusable clauses. Categorized by contract type, practice area and risk. With AI suggestions during drafting.":
    "Raccolta strutturata di clausole riutilizzabili. Categorizzate per tipo contratto, area di pratica e rischio. Con suggerimenti AI durante la redazione.",
  "Legal Commentaries": "Commentari Legali",
  "Annotations and comments on norms, judgments and contract clauses. Shared across the team, with discussion history.":
    "Annotazioni e commenti su norme, sentenze e clausole contrattuali. Condivisi nel team, con cronologia discussioni.",
  "Knowledge Management (Experience)": "Gestione Conoscenza (Experience)",
  "Structured capture of firm knowledge: pitfalls, best practices, lessons learned. Searchable, linkable to cases.":
    "Acquisizione strutturata della conoscenza dello studio: insidie, best practice, lezioni apprese. Ricercabile, collegabile ai casi.",
  "Global Full-Text Search": "Ricerca Full-Text Globale",
  "Search across all cases, documents, notes, invoices and chats — with scope filters per type. Hybrid search: vector + BM25 + graph.":
    "Ricerca su tutti i casi, documenti, note, fatture e chat — con filtri scope per tipo. Ricerca ibrida: vettoriale + BM25 + grafo.",
  "Drafting Editor": "Editor di Redazione",
  "Full drafting editor with brain connection: inline AI suggestions, source insertion, clause library integration, version comparison.":
    "Editor di redazione completo con connessione brain: suggerimenti AI inline, inserimento fonti, integrazione libreria clausole, confronto versioni.",
  "Litigation & eDiscovery": "Litigazione & eDiscovery",
  "Phases, analytics, review sets, precedent search.":
    "Fasi, analytics, review set, ricerca precedenti.",
  "Litigation Management": "Gestione Litigazione",
  "Structured litigation management with phases and steps. Status per phase, assigned team members, deadlines and documents per step.":
    "Gestione strutturata della litigazione con fasi e passi. Stato per fase, membri del team assegnati, scadenze e documenti per passo.",
  "Litigation Analytics": "Analytics Litigazione",
  "Success rates, case duration, court statistics. Trends per court, per case type, per opponent — based on historical data.":
    "Tassi di successo, durata casi, statistiche tribunali. Trend per tribunale, per tipo di caso, per controparte — basati su dati storici.",
  "Precedent Search": "Ricerca Precedenti",
  "AI-powered search for similar cases in the brain and external case law databases. Automatic relevance ranking.":
    "Ricerca AI di casi simili nel brain e database di giurisprudenza esterni. Ranking di rilevanza automatico.",
  "Process Strategy": "Strategia di Processo",
  "Structured strategy capture per case: argument lines, evidence, counter-arguments. With AI suggestions and success prognosis.":
    "Acquisizione strutturata della strategia per caso: linee argomentative, prove, contro-argomenti. Con suggerimenti AI e prognosi di successo.",
  "Tax & Accounting": "Fiscali & Contabilità",
  "Tax returns, ELSTER, StBVV, tax audits.": "Dichiarazioni fiscali, ELSTER, StBVV, audit fiscali.",
  "Tax Returns": "Dichiarazioni Fiscali",
  "Preparation and management of tax returns (income, VAT, trade, corporate). Structured entry, validation, status tracking.":
    "Preparazione e gestione di dichiarazioni fiscali (reddito, IVA, commercio, società). Inserimento strutturato, validazione, tracciamento stato.",
  "Tax Assessments": "Valutazioni Fiscali",
  "Capture and analysis of tax assessments. Comparison with return, deviation analysis, objection deadline tracking.":
    "Acquisizione e analisi di valutazioni fiscali. Confronto con dichiarazione, analisi deviazioni, tracciamento scadenze ricorso.",
  "Tax Audit": "Audit Fiscale",
  "Preparation and support of tax audits. Audit field management, document provision, protocol management.":
    "Preparazione e supporto di audit fiscali. Gestione campi di audit, fornitura documenti, gestione protocolli.",
  "Tax Deadlines": "Scadenze Fiscali",
  "All tax deadlines (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) with automatic weekend and holiday shifting.":
    "Tutte le scadenze fiscali (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) con spostamento automatico weekend e festività.",
  "StBVV Fee Calculator": "Calcolatore StBVV",
  "Tax adviser remuneration ordinance: 10 activities, VV numbers, factor calculation, VAT. Interactive and exportable.":
    "Ordinamento remunerazione consulenti fiscali: 10 attività, numeri VV, calcolo fattore, IVA. Interattivo ed esportabile.",
  "Tax Clients": "Clienti Fiscali",
  "Separate client management for tax advisers: master data, tax number, tax office, assignment to returns and assessments.":
    "Gestione clienti separata per consulenti fiscali: dati anagrafici, numero fiscale, ufficio fiscale, assegnazione a dichiarazioni e valutazioni.",
  "ELSTER Integration": "Integrazione ELSTER",
  "Electronic tax returns via ELSTER. XML generation, form types, submission wizard — directly from the dashboard.":
    "Dichiarazioni fiscali elettroniche via ELSTER. Generazione XML, tipi modulo, wizard di invio — direttamente dalla dashboard.",
  "Chat Analytics": "Analytics Chat",
  "Usage statistics for the AI copilot: sessions, messages, token consumption, pinned answers — per day and per user.":
    "Statistiche di utilizzo per il copilota AI: sessioni, messaggi, consumo token, risposte fissate — per giorno e per utente.",
  "Model Comparison": "Confronto Modelli",
  "Side-by-side comparison of different AI models: same question to multiple models at once, evaluate answers next to each other.":
    "Confronto affiancato di diversi modelli AI: stessa domanda a più modelli contemporaneamente, valutazione delle risposte lado a lado.",
  "Legacy Cases": "Pratiche Stagnanti",
  "Identify, classify and monitor risky and outdated cases. Pipeline status, escalation levels, deadline warnings — nothing falls through the cracks.":
    "Identificare, classificare e monitorare pratiche rischiose e obsolete. Stato pipeline, livelli di escalation, avvisi scadenze — nulla sfugge.",
  "Engine Monitoring (APM)": "Monitoraggio Engine (APM)",
  "Performance dashboard: P50/P95/P99 latency, brain quality, embedding queue, quota usage and error events in real time.":
    "Dashboard prestazioni: latenza P50/P95/P99, qualità brain, coda embedding, utilizzo quota ed eventi errore in tempo reale.",
  "Retention Policies": "Politiche di Conservazione",
  "Automated retention rules per GDPR and BRAO: retention periods per document type, automatic deletion after expiry, audit trail.":
    "Regole di conservazione automatiche GDPR e BRAO: periodi di conservazione per tipo documento, cancellazione automatica post-scadenza, audit trail.",
  "WhatsApp Templates": "Modelli WhatsApp",
  "Template library for WhatsApp messages: standard replies, client letters, reminder templates. With variables and approval workflow.":
    "Libreria modelli per messaggi WhatsApp: risposte standard, lettere clienti, modelli promemoria. Con variabili e workflow di approvazione.",
  "AI Model Configuration": "Configurazione Modello AI",
  "Model selection in the dashboard: provider, speed, cost, context window. Configurable per organization — from budget model to premium reasoning.":
    "Selezione modello nella dashboard: provider, velocità, costo, finestra contesto. Configurabile per organizzazione — da modello economico a reasoning premium.",
  "SCIM Provisioning": "Provisioning SCIM",
  "Automated user management via SCIM 2.0: create, update, deactivate users — directly from identity providers (Okta, Azure AD, Google).":
    "Gestione utenti automatizzata via SCIM 2.0: creare, aggiornare, disattivare utenti — direttamente da identity provider (Okta, Azure AD, Google).",
  "Billing & Subscription": "Fatturazione & Abbonamento",
  "Plan management, upgrade/downgrade, payment methods, invoice history. Stripe integration with self-service portal for clients.":
    "Gestione piano, upgrade/downgrade, metodi pagamento, storico fatture. Integrazione Stripe con portale self-service per clienti.",
  "Judgement Sync": "Sincronizzazione Sentenze",
  "Automatic retrieval of new court decisions from external sources. Daily sync, delta detection, automatic indexing into the brain.":
    "Recupero automatico di nuove sentenze da fonti esterne. Sync giornaliero, rilevamento delta, indicizzazione automatica nel brain.",
  "Workflow Builder": "Costruttore Workflow",
  "Visual drag-and-drop editor for automations: triggers, conditions, actions. No code needed — build and test workflows visually.":
    "Editor visuale drag-and-drop per automazioni: trigger, condizioni, azioni. Senza codice — crea e testa workflow visivamente.",
  "Judgement Database": "Database Sentenze",
  "Full-text search across thousands of court decisions. Filter by court, date, file number, practice area — with AI summary per judgement.":
    "Ricerca full-text in migliaia di sentenze. Filtra per tribunale, data, numero ruolo, area pratica — con riassunto AI per sentenza.",
  "Mobile Pipeline Status": "Stato Pipeline Mobile",
  "Monitor pipeline runs on mobile: status (running, completed, failed, awaiting_review), layer details tap-to-expand, output viewer with Markdown rendering.":
    "Monitora esecuzioni pipeline su mobile: stato (running, completed, failed, awaiting_review), dettagli layer tap-to-expand, visualizzatore output con rendering Markdown.",
  "Standalone Document Analysis": "Analisi Documenti Standalone",
  "Analyze documents without case context: upload, AI analysis, risk highlighting, summary — ideal for initial assessments and due diligence.":
    "Analizza documenti senza contesto pratica: upload, analisi AI, evidenziazione rischi, riepilogo — ideale per valutazioni iniziali e due diligence.",
  "Case Law Analytics": "Analytics Giurisprudenza",
  "Statistical analysis of case law: success rates per court, trend curves, case type distribution — based on thousands of decisions.":
    "Analisi statistica giurisprudenza: tassi successo per tribunale, curve trend, distribuzione tipi causa — su migliaia di sentenze.",
  "Get started in 5 steps": "Inizia in 5 passi",
  "From login to first case — how fast Subsumio goes live.":
    "Dal login alla prima pratica — quanto velocemente Subsumio va live.",
  "Set up Brain": "Configura Brain",
  "Run the onboarding wizard, connect data sources, index your brain.":
    "Avvia il wizard onboarding, collega fonti dati, indicizza il brain.",
  "Create first case": "Crea prima pratica",
  "Add client, create case, upload documents via drag-and-drop.":
    "Aggiungi cliente, crea pratica, carica documenti via drag-and-drop.",
  "Configure deadlines": "Configura scadenze",
  "AI automatically scans all documents for deadlines — enable calendar export.":
    "AI scansiona automaticamente tutti i documenti per scadenze — attiva export calendario.",
  "Use Copilot": "Usa Copilot",
  "Ask the brain questions, get cited answers, book time via chat.":
    "Fai domande al brain, ottieni risposte con citazioni, registra tempo via chat.",
  "Invite team": "Invita team",
  "Add members, assign roles, collaborate on the brain together.":
    "Aggiungi membri, assegna ruoli, collabora sul brain insieme.",
  // ── User-centric description rewrites ──
  "Ask questions in plain language — get answers from your entire knowledge base. Every document, email and note is instantly searchable.":
    "Fai domande in linguaggio semplice — ottieni risposte da tutta la base di conoscenza. Ogni documento, email e nota è ricercabile istantaneamente.",
  "Every answer links back to the exact source passage. No hallucinations — if the brain can't find it, it says so.":
    "Ogni risposta rimanda al passaggio esatto della fonte. Nessuna allucinazione — se il brain non lo trova, lo dice.",
  "Complex legal questions get step-by-step reasoning. The brain shows its work — so you can verify every conclusion.":
    "Questioni legali complesse con ragionamento passo-passo. Il brain mostra il suo lavoro — ogni conclusione verificabile.",
  "Deploy specialized AI agents for recurring tasks — research, drafting, review. Each agent has its own skills and can be evaluated.":
    "Distribuisci agenti AI specializzati per task ricorrenti — ricerca, drafting, review. Ogni agente ha le proprie skill ed è valutabile.",
  "Built-in quality dashboard for AI answers. Test retrieval quality against real queries — know exactly how reliable the brain is.":
    "Dashboard qualità integrata per le risposte AI. Testa la qualità del retrieval su query reali — sai esattamente quanto è affidabile il brain.",
  "AI reads across multiple documents at once — finds themes, risks and patterns you'd miss document-by-document.":
    "L'AI legge più documenti contemporaneamente — trova temi, rischi e pattern che perderesti documento per documento.",
  "See who uses which features and how often. Spot training gaps, drive adoption, measure ROI.":
    "Vedi chi usa quali funzioni e quanto spesso. Identifica gap di formazione, guida l'adozione, misura il ROI.",
  "All data sources in one dashboard: sync status, frequency, error logs. Spot issues before they become problems.":
    "Tutte le fonti dati in un dashboard: stato sync, frequenza, log errori. Individua problemi prima che lo diventino.",
  "Track copilot usage: sessions, messages, token costs, pinned answers — per user, per day.":
    "Traccia l'uso del copilota: sessioni, messaggi, costi token, risposte fissate — per utente, per giorno.",
  "Upload scans, photos or PDFs — text is extracted automatically. Every document becomes searchable and classified.":
    "Carica scansioni, foto o PDF — il testo viene estratto automaticamente. Ogni documento diventa ricercabile e classificato.",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export ready for court.":
    "Review set difendibili con privilege log e redazioni. Deduplicazione, tagging massivo, export pronto per il tribunale.",
  "Every case is walled off from others. A user on case A cannot see case B — guaranteed by design, fuzz-tested for zero leaks.":
    "Ogni caso è isolato dagli altri. Un utente sul caso A non può vedere il caso B — garantito per design, fuzz-testato per zero leak.",
  "Real-time performance dashboard: response times, brain quality, queue depth and error rates — all at a glance.":
    "Dashboard prestazioni in tempo reale: tempi di risposta, qualità brain, profondità coda e tassi di errore — tutto a colpo d'occhio.",
  "GDPR built into the platform: DPA templates, data portability, right to erasure — all ready out of the box.":
    "GDPR integrato nella piattaforma: template DPA, portabilità dati, diritto alla cancellazione — tutto pronto out-of-the-box.",
  "Connect any third-party tool via open API. Real-time webhooks keep everything in sync — no manual exports.":
    "Collega qualsiasi strumento di terze parti via API aperta. Webhook real-time tengono tutto sincronizzato — nessun export manuale.",
  "Set up agents for recurring tasks — they run on schedule, report results and learn from feedback.":
    "Configura agenti per task ricorrenti — girano su pianificazione, riferiscono risultati e imparano dai feedback.",
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
  "90+ API Endpoints": "90+ Endpoint API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "API REST completa con auth, rate limiting, audit logging y tipos TypeScript.",
  "97+ Dashboard Pages": "97+ Páginas Dashboard",
  "Every function has its own responsive page — from the case file to the ELSTER wizard.":
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
  // ── New features ──
  "Cross-Document Analysis": "Análisis Cross-Documento",
  "AI-powered analysis across multiple documents: detect themes, risks and patterns invisible in individual documents.":
    "Análisis AI en múltiples documentos: detecta temas, riesgos y patrones invisibles en documentos individuales.",
  "Portfolio Insights": "Insights de Portafolio",
  "Firm portfolio analysis: case mix, success rates, risk clusters and trends — based on all brain data.":
    "Análisis de portafolio del bufete: mix de casos, tasas de éxito, clusters de riesgo y tendencias — basado en todos los datos del brain.",
  "Adoption Analytics": "Analytics de Adopción",
  "Usage and adoption tracking: who uses which features how often? Basis for training decisions and rollout steering.":
    "Seguimiento de uso y adopción: ¿quién usa qué funciones y con qué frecuencia? Base para decisiones de formación y rollout.",
  "Shared Spaces": "Espacios Compartidos",
  "Shared Spaces for teams: collaborative knowledge areas, shared case streams and notes — with granular access control.":
    "Espacios Compartidos para equipos: áreas de conocimiento colaborativas, flujos de casos compartidos y notas — con control de acceso granular.",
  "Sources Management": "Gestión de Fuentes",
  "Central management of all data sources and connectors. Status, sync frequency, error logs — all in one place.":
    "Gestión central de todas las fuentes de datos y conectores. Estado, frecuencia de sync, logs de errores — todo en un lugar.",
  "Document Requests": "Solicitudes de Documentos",
  "Structured requests for documents from clients. Status tracking, automatic reminders after 7 days, escalation after 3 reminders — via WhatsApp and in-app notification.":
    "Solicitudes estructuradas de documentos a clientes. Seguimiento de estado, recordatorios automáticos tras 7 días, escalación tras 3 recordatorios — vía WhatsApp y notificación in-app.",
  "Version History": "Historial de Versiones",
  "Full versioning of every document. Compare changes, restore previous versions, audit trail per version.":
    "Versionado completo de cada documento. Compara cambios, restaura versiones anteriores, audit trail por versión.",
  "Review Sets & eDiscovery": "Review Sets & eDiscovery",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export for court.":
    "Review sets defendibles con privilege log y redacciones. Deduplicación, tagging masivo, exportación para tribunal.",
  "Review Queue": "Cola de Review",
  "Structured document review: tagging, commenting, prioritizing. Batch-based with filters and saved views.":
    "Review estructurado de documentos: tagging, comentarios, priorización. Por lotes con filtros y vistas guardadas.",
  "Deadline Register": "Registro de Plazos",
  "Chronological deadline register — all deadlines of a case in one view. Sortable by date, type, status. Audit-proof documented.":
    "Registro cronológico de plazos — todos los plazos de un caso en una vista. Ordenable por fecha, tipo, estado. Documentado audit-proof.",
  "Task Management": "Gestión de Tareas",
  "Tasks and to-dos per case or global. Due dates, priorities, assignment to team members, status tracking.":
    "Tareas y to-dos por caso o globales. Fechas límite, prioridades, asignación a miembros del equipo, seguimiento de estado.",
  "Calendar with Inline Editing": "Calendario con Edición Inline",
  "Month calendar with click-to-create, drag editing, appointment types (hearing, consultation, meeting). Case linking, reminders.":
    "Calendario mensual con clic-para-crear, edición drag, tipos de cita (audiencia, consulta, reunión). Vinculación de casos, recordatorios.",
  "Trust Accounting": "Contabilidad Fiduciaria",
  "Management of client funds on escrow accounts. Deposits and withdrawals, balances, transaction records — audit-proof.":
    "Gestión de fondos de clientes en cuentas fiduciarias. Depósitos y retiros, saldos, registros de transacciones — audit-proof.",
  Reports: "Informes",
  "Structured reports: case evaluations, revenue statistics, deadline reports, productivity analyses. Export as PDF or CSV.":
    "Informes estructurados: evaluaciones de casos, estadísticas de ingresos, informes de plazos, análisis de productividad. Exportación PDF o CSV.",
  Intake: "Recepción",
  "Structured intake of new clients and incoming items. Quick capture with automatic case creation, contact enrichment and deadline detection.":
    "Recepción estructurada de nuevos clientes y entradas. Captura rápida con creación automática de caso, enriquecimiento de contactos y detección de plazos.",
  "Directory (Courts & Authorities)": "Directorio (Tribunales & Autoridades)",
  "Central directory of all courts, authorities and institutions. Addresses, jurisdictions, file number formats — directly linkable to cases.":
    "Directorio central de todos los tribunales, autoridades e instituciones. Direcciones, jurisdicciones, formatos de número de expediente — vinculables directamente a casos.",
  "Legal Translation": "Traducción Legal",
  "AI-powered translation of legal texts with specialized terminology accuracy. Detects contract clauses, legal terms and authority jargon.":
    "Traducción AI de textos legales con precisión terminológica especializada. Detecta cláusulas contractuales, términos legales y jerga de autoridades.",
  "Onboarding Wizard": "Asistente de Onboarding",
  "Guided onboarding for new users: set up brain, create first case, import contacts, configure deadlines — step by step.":
    "Onboarding guiado para nuevos usuarios: configurar brain, crear primer caso, importar contactos, configurar plazos — paso a paso.",
  "Workflow Automation": "Automatización de Workflows",
  "Automate recurring workflows: document approvals, deadline escalations, case status transitions. Trigger-based, with conditions and actions.":
    "Automatiza workflows recurrentes: aprobaciones de documentos, escalaciones de plazos, transiciones de estado de casos. Basado en triggers, con condiciones y acciones.",
  Approvals: "Aprobaciones",
  "Structured approval processes for documents, invoices and pleadings. Multi-stage approval chains, delegation, audit trail per approval.":
    "Procesos de aprobación estructurados para documentos, facturas y escritos. Cadenas de aprobación multi-nivel, delegación, audit trail por aprobación.",
  "Obligation Tracking": "Seguimiento de Obligaciones",
  "Tracking of all obligations per case: deadlines, form requirements, disclosure duties. Automatic warning when violation is imminent.":
    "Seguimiento de todas las obligaciones por caso: plazos, requisitos formales, deberes de divulgación. Advertencia automática cuando la violación es inminente.",
  Playbooks: "Playbooks",
  "Reusable process templates for recurring case types. Step sequences, checklists, deadline patterns — per practice area.":
    "Plantillas de proceso reutilizables para tipos de caso recurrentes. Secuencias de pasos, checklists, patrones de plazos — por área de práctica.",
  "Template Management": "Gestión de Plantillas",
  "Central library for document templates. Pleadings, contracts, cover letters — with variables and brain connection for auto-fill.":
    "Biblioteca central de plantillas de documentos. Escritos, contratos, cartas de presentación — con variables y conexión brain para auto-fill.",
  "Clause Library": "Biblioteca de Cláusulas",
  "Structured collection of reusable clauses. Categorized by contract type, practice area and risk. With AI suggestions during drafting.":
    "Colección estructurada de cláusulas reutilizables. Categorizadas por tipo de contrato, área de práctica y riesgo. Con sugerencias AI durante la redacción.",
  "Legal Commentaries": "Comentarios Legales",
  "Annotations and comments on norms, judgments and contract clauses. Shared across the team, with discussion history.":
    "Anotaciones y comentarios sobre normas, sentencias y cláusulas contractuales. Compartidos en el equipo, con historial de discusión.",
  "Knowledge Management (Experience)": "Gestión de Conocimiento (Experience)",
  "Structured capture of firm knowledge: pitfalls, best practices, lessons learned. Searchable, linkable to cases.":
    "Captura estructurada del conocimiento del bufete: trampas, mejores prácticas, lecciones aprendidas. Buscable, vinculable a casos.",
  "Global Full-Text Search": "Búsqueda Full-Text Global",
  "Search across all cases, documents, notes, invoices and chats — with scope filters per type. Hybrid search: vector + BM25 + graph.":
    "Búsqueda en todos los casos, documentos, notas, facturas y chats — con filtros de scope por tipo. Búsqueda híbrida: vectorial + BM25 + grafo.",
  "Drafting Editor": "Editor de Redacción",
  "Full drafting editor with brain connection: inline AI suggestions, source insertion, clause library integration, version comparison.":
    "Editor de redacción completo con conexión brain: sugerencias AI inline, inserción de fuentes, integración de biblioteca de cláusulas, comparación de versiones.",
  "Litigation & eDiscovery": "Litigación & eDiscovery",
  "Phases, analytics, review sets, precedent search.":
    "Fases, analytics, review sets, búsqueda de precedentes.",
  "Litigation Management": "Gestión de Litigación",
  "Structured litigation management with phases and steps. Status per phase, assigned team members, deadlines and documents per step.":
    "Gestión estructurada de litigación con fases y pasos. Estado por fase, miembros del equipo asignados, plazos y documentos por paso.",
  "Litigation Analytics": "Analytics de Litigación",
  "Success rates, case duration, court statistics. Trends per court, per case type, per opponent — based on historical data.":
    "Tasas de éxito, duración de casos, estadísticas de tribunales. Tendencias por tribunal, por tipo de caso, por contraparte — basadas en datos históricos.",
  "Precedent Search": "Búsqueda de Precedentes",
  "AI-powered search for similar cases in the brain and external case law databases. Automatic relevance ranking.":
    "Búsqueda AI de casos similares en el brain y bases de datos de jurisprudencia externas. Ranking de relevancia automático.",
  "Process Strategy": "Estrategia de Proceso",
  "Structured strategy capture per case: argument lines, evidence, counter-arguments. With AI suggestions and success prognosis.":
    "Captura estructurada de estrategia por caso: líneas argumentativas, evidencia, contraargumentos. Con sugerencias AI y pronóstico de éxito.",
  "Tax & Accounting": "Fiscal & Contabilidad",
  "Tax returns, ELSTER, StBVV, tax audits.":
    "Declaraciones fiscales, ELSTER, StBVV, auditorías fiscales.",
  "Tax Returns": "Declaraciones Fiscales",
  "Preparation and management of tax returns (income, VAT, trade, corporate). Structured entry, validation, status tracking.":
    "Preparación y gestión de declaraciones fiscales (renta, IVA, comercio, sociedades). Entrada estructurada, validación, seguimiento de estado.",
  "Tax Assessments": "Liquidaciones Fiscales",
  "Capture and analysis of tax assessments. Comparison with return, deviation analysis, objection deadline tracking.":
    "Captura y análisis de liquidaciones fiscales. Comparación con declaración, análisis de desviaciones, seguimiento de plazos de recurso.",
  "Tax Audit": "Auditoría Fiscal",
  "Preparation and support of tax audits. Audit field management, document provision, protocol management.":
    "Preparación y soporte de auditorías fiscales. Gestión de campos de auditoría, provisión de documentos, gestión de protocolos.",
  "Tax Deadlines": "Plazos Fiscales",
  "All tax deadlines (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) with automatic weekend and holiday shifting.":
    "Todos los plazos fiscales (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) con desplazamiento automático de fines de semana y festivos.",
  "StBVV Fee Calculator": "Calculadora StBVV",
  "Tax adviser remuneration ordinance: 10 activities, VV numbers, factor calculation, VAT. Interactive and exportable.":
    "Ordenanza de remuneración de asesores fiscales: 10 actividades, números VV, cálculo de factor, IVA. Interactiva y exportable.",
  "Tax Clients": "Clientes Fiscales",
  "Separate client management for tax advisers: master data, tax number, tax office, assignment to returns and assessments.":
    "Gestión de clientes separada para asesores fiscales: datos maestros, número fiscal, oficina fiscal, asignación a declaraciones y liquidaciones.",
  "ELSTER Integration": "Integración ELSTER",
  "Electronic tax returns via ELSTER. XML generation, form types, submission wizard — directly from the dashboard.":
    "Declaraciones fiscales electrónicas vía ELSTER. Generación XML, tipos de formulario, asistente de envío — directamente desde el dashboard.",
  "Chat Analytics": "Analytics Chat",
  "Usage statistics for the AI copilot: sessions, messages, token consumption, pinned answers — per day and per user.":
    "Estadísticas de uso del copiloto AI: sesiones, mensajes, consumo de tokens, respuestas fijadas — por día y por usuario.",
  "Model Comparison": "Comparación de Modelos",
  "Side-by-side comparison of different AI models: same question to multiple models at once, evaluate answers next to each other.":
    "Comparación lado a lado de diferentes modelos AI: misma pregunta a múltiples modelos a la vez, evaluar respuestas una al lado de otra.",
  "Legacy Cases": "Casos Obsoletos",
  "Identify, classify and monitor risky and outdated cases. Pipeline status, escalation levels, deadline warnings — nothing falls through the cracks.":
    "Identificar, clasificar y monitorizar casos riesgosos y obsoletos. Estado pipeline, niveles escalación, avisos plazos — nada se escapa.",
  "Engine Monitoring (APM)": "Monitorización Engine (APM)",
  "Performance dashboard: P50/P95/P99 latency, brain quality, embedding queue, quota usage and error events in real time.":
    "Dashboard rendimiento: latencia P50/P95/P99, calidad brain, cola embedding, uso quota y eventos error en tiempo real.",
  "Retention Policies": "Políticas de Conservación",
  "Automated retention rules per GDPR and BRAO: retention periods per document type, automatic deletion after expiry, audit trail.":
    "Reglas de conservación automáticas GDPR y BRAO: periodos por tipo documento, borrado automático tras vencimiento, audit trail.",
  "WhatsApp Templates": "Plantillas WhatsApp",
  "Template library for WhatsApp messages: standard replies, client letters, reminder templates. With variables and approval workflow.":
    "Biblioteca de plantillas para mensajes WhatsApp: respuestas estándar, cartas clientes, plantillas recordatorias. Con variables y workflow aprobación.",
  "AI Model Configuration": "Configuración Modelo AI",
  "Model selection in the dashboard: provider, speed, cost, context window. Configurable per organization — from budget model to premium reasoning.":
    "Selección modelo en dashboard: provider, velocidad, coste, ventana contexto. Configurable por organización — de modelo económico a reasoning premium.",
  "SCIM Provisioning": "Provisioning SCIM",
  "Automated user management via SCIM 2.0: create, update, deactivate users — directly from identity providers (Okta, Azure AD, Google).":
    "Gestión usuarios automatizada vía SCIM 2.0: crear, actualizar, desactivar usuarios — directamente desde identity providers (Okta, Azure AD, Google).",
  "Billing & Subscription": "Facturación & Suscripción",
  "Plan management, upgrade/downgrade, payment methods, invoice history. Stripe integration with self-service portal for clients.":
    "Gestión plan, upgrade/downgrade, métodos pago, historial facturas. Integración Stripe con portal self-service para clientes.",
  "Judgement Sync": "Sincronización Sentencias",
  "Automatic retrieval of new court decisions from external sources. Daily sync, delta detection, automatic indexing into the brain.":
    "Recuperación automática de nuevas sentencias de fuentes externas. Sync diario, detección delta, indexación automática en brain.",
  "Workflow Builder": "Constructor Workflow",
  "Visual drag-and-drop editor for automations: triggers, conditions, actions. No code needed — build and test workflows visually.":
    "Editor visual drag-and-drop para automatizaciones: triggers, condiciones, acciones. Sin código — crea y testa workflows visualmente.",
  "Judgement Database": "Base de Datos Sentencias",
  "Full-text search across thousands of court decisions. Filter by court, date, file number, practice area — with AI summary per judgement.":
    "Búsqueda full-text en miles de sentencias. Filtrar por tribunal, fecha, número expediente, área práctica — con resumen AI por sentencia.",
  "Mobile Pipeline Status": "Estado Pipeline Móvil",
  "Monitor pipeline runs on mobile: status (running, completed, failed, awaiting_review), layer details tap-to-expand, output viewer with Markdown rendering.":
    "Monitorizar ejecuciones pipeline en móvil: estado (running, completed, failed, awaiting_review), detalles layer tap-to-expand, visor output con rendering Markdown.",
  "Standalone Document Analysis": "Análisis Documentos Standalone",
  "Analyze documents without case context: upload, AI analysis, risk highlighting, summary — ideal for initial assessments and due diligence.":
    "Analizar documentos sin contexto caso: upload, análisis AI, resaltado riesgos, resumen — ideal para evaluaciones iniciales y due diligence.",
  "Case Law Analytics": "Analytics Jurisprudencia",
  "Statistical analysis of case law: success rates per court, trend curves, case type distribution — based on thousands of decisions.":
    "Análisis estadístico jurisprudencia: tasas éxito por tribunal, curvas trend, distribución tipos caso — sobre miles de sentencias.",
  "Get started in 5 steps": "Empieza en 5 pasos",
  "From login to first case — how fast Subsumio goes live.":
    "Del login al primer caso — lo rápido que Subsumio va live.",
  "Set up Brain": "Configurar Brain",
  "Run the onboarding wizard, connect data sources, index your brain.":
    "Ejecuta el wizard onboarding, conecta fuentes datos, indexa tu brain.",
  "Create first case": "Crear primer caso",
  "Add client, create case, upload documents via drag-and-drop.":
    "Añade cliente, crea caso, sube documentos via drag-and-drop.",
  "Configure deadlines": "Configurar plazos",
  "AI automatically scans all documents for deadlines — enable calendar export.":
    "AI escanea automáticamente todos los documentos por plazos — activa export calendario.",
  "Use Copilot": "Usar Copilot",
  "Ask the brain questions, get cited answers, book time via chat.":
    "Haz preguntas al brain, obtén respuestas con citas, registra tiempo via chat.",
  "Invite team": "Invitar equipo",
  "Add members, assign roles, collaborate on the brain together.":
    "Añade miembros, asigna roles, colabora en el brain juntos.",
  // ── User-centric description rewrites ──
  "Ask questions in plain language — get answers from your entire knowledge base. Every document, email and note is instantly searchable.":
    "Haz preguntas en lenguaje normal — obtén respuestas de toda tu base de conocimiento. Cada documento, email y nota es buscable al instante.",
  "Every answer links back to the exact source passage. No hallucinations — if the brain can't find it, it says so.":
    "Cada respuesta remite al pasaje exacto de la fuente. Sin alucinaciones — si el brain no lo encuentra, lo dice.",
  "Complex legal questions get step-by-step reasoning. The brain shows its work — so you can verify every conclusion.":
    "Cuestiones legales complejas con razonamiento paso a paso. El brain muestra su trabajo — cada conclusión verificable.",
  "Deploy specialized AI agents for recurring tasks — research, drafting, review. Each agent has its own skills and can be evaluated.":
    "Despliega agentes AI especializados para tareas recurrentes — investigación, drafting, review. Cada agente tiene sus propias skills y es evaluable.",
  "Built-in quality dashboard for AI answers. Test retrieval quality against real queries — know exactly how reliable the brain is.":
    "Dashboard de calidad integrado para respuestas AI. Prueba la calidad de retrieval contra consultas reales — sabes exactamente cuán fiable es el brain.",
  "AI reads across multiple documents at once — finds themes, risks and patterns you'd miss document-by-document.":
    "La AI lee múltiples documentos a la vez — encuentra temas, riesgos y patrones que perderías documento por documento.",
  "See who uses which features and how often. Spot training gaps, drive adoption, measure ROI.":
    "Ve quién usa qué funciones y con qué frecuencia. Identifica brechas de formación, impulsa la adopción, mide el ROI.",
  "All data sources in one dashboard: sync status, frequency, error logs. Spot issues before they become problems.":
    "Todas las fuentes de datos en un dashboard: estado sync, frecuencia, logs de errores. Detecta problemas antes de que lo sean.",
  "Track copilot usage: sessions, messages, token costs, pinned answers — per user, per day.":
    "Rastrea el uso del copiloto: sesiones, mensajes, costes de token, respuestas fijadas — por usuario, por día.",
  "Upload scans, photos or PDFs — text is extracted automatically. Every document becomes searchable and classified.":
    "Sube escaneos, fotos o PDFs — el texto se extrae automáticamente. Cada documento se vuelve buscable y clasificado.",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export ready for court.":
    "Review sets defendibles con privilege log y redactions. Deduplicación, bulk tagging, export listo para tribunal.",
  "Every case is walled off from others. A user on case A cannot see case B — guaranteed by design, fuzz-tested for zero leaks.":
    "Cada caso está aislado de los demás. Un usuario en el caso A no puede ver el caso B — garantizado por diseño, fuzz-testeado para cero leaks.",
  "Real-time performance dashboard: response times, brain quality, queue depth and error rates — all at a glance.":
    "Dashboard de rendimiento en tiempo real: tiempos de respuesta, calidad del brain, profundidad de cola y tasas de error — todo a primera vista.",
  "GDPR built into the platform: DPA templates, data portability, right to erasure — all ready out of the box.":
    "GDPR integrado en la plataforma: plantillas DPA, portabilidad de datos, derecho de supresión — todo listo out-of-the-box.",
  "Connect any third-party tool via open API. Real-time webhooks keep everything in sync — no manual exports.":
    "Conecta cualquier herramienta de terceros via API abierta. Webhooks en tiempo real mantienen todo sincronizado — sin exports manuales.",
  "Set up agents for recurring tasks — they run on schedule, report results and learn from feedback.":
    "Configura agentes para tareas recurrentes — se ejecutan según planificación, reportan resultados y aprenden del feedback.",
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
  "90+ API Endpoints": "90+ Endpoint API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "Kompletne REST API z auth, rate limiting, audit logging i typami TypeScript.",
  "97+ Dashboard Pages": "97+ Stron Dashboard",
  "Every function has its own responsive page — from the case file to the ELSTER wizard.":
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
  // ── New features ──
  "Cross-Document Analysis": "Analiza Cross-Dokumentowa",
  "AI-powered analysis across multiple documents: detect themes, risks and patterns invisible in individual documents.":
    "Analiza AI na wielu dokumentach: wykrywa motywy, ryzyka i wzorce niewidoczne w pojedynczych dokumentach.",
  "Portfolio Insights": "Insights Portfela",
  "Firm portfolio analysis: case mix, success rates, risk clusters and trends — based on all brain data.":
    "Analiza portfela kancelarii: mix spraw, wskaźniki sukcesu, klastry ryzyka i trendy — na podstawie wszystkich danych brain.",
  "Adoption Analytics": "Analytics Adopcji",
  "Usage and adoption tracking: who uses which features how often? Basis for training decisions and rollout steering.":
    "Śledzenie użycia i adopcji: kto używa których funkcji i jak często? Podstawa dla decyzji szkoleniowych i sterowania rollout.",
  "Shared Spaces": "Wspólne Przestrzenie",
  "Shared Spaces for teams: collaborative knowledge areas, shared case streams and notes — with granular access control.":
    "Wspólne Przestrzenie dla zespołów: współdzielone obszary wiedzy, strumienie spraw i notatki — z granularną kontrolą dostępu.",
  "Sources Management": "Zarządzanie Źródłami",
  "Central management of all data sources and connectors. Status, sync frequency, error logs — all in one place.":
    "Centralne zarządzanie wszystkimi źródłami danych i connectorami. Status, częstotliwość sync, logi błędów — wszystko w jednym miejscu.",
  "Document Requests": "Wnioski o Dokumenty",
  "Structured requests for documents from clients. Status tracking, automatic reminders after 7 days, escalation after 3 reminders — via WhatsApp and in-app notification.":
    "Ustrukturyzowane wnioski o dokumenty od klientów. Śledzenie statusu, automatyczne przypomnienia po 7 dniach, eskalacja po 3 przypomnieniach — przez WhatsApp i powiadomienia in-app.",
  "Version History": "Historia Wersji",
  "Full versioning of every document. Compare changes, restore previous versions, audit trail per version.":
    "Pełne wersjonowanie każdego dokumentu. Porównuj zmiany, przywracaj poprzednie wersje, audit trail na wersję.",
  "Review Sets & eDiscovery": "Review Set & eDiscovery",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export for court.":
    "Defensible review set z privilege log i redactions. Deduplikacja, bulk tagging, eksport dla sądu.",
  "Review Queue": "Kolejka Review",
  "Structured document review: tagging, commenting, prioritizing. Batch-based with filters and saved views.":
    "Ustrukturyzowany review dokumentów: tagowanie, komentarze, priorytetyzacja. Wsadowo z filtrami i zapisanymi widokami.",
  "Deadline Register": "Rejestr Terminów",
  "Chronological deadline register — all deadlines of a case in one view. Sortable by date, type, status. Audit-proof documented.":
    "Chronologiczny rejestr terminów — wszystkie terminy sprawy w jednym widoku. Sortowalne po dacie, typie, statusie. Udokumentowane audit-proof.",
  "Task Management": "Zarządzanie Zadaniami",
  "Tasks and to-dos per case or global. Due dates, priorities, assignment to team members, status tracking.":
    "Zadania i to-do per sprawa lub globalne. Terminy, priorytety, przypisanie do członków zespołu, śledzenie statusu.",
  "Calendar with Inline Editing": "Kalendarz z Edycją Inline",
  "Month calendar with click-to-create, drag editing, appointment types (hearing, consultation, meeting). Case linking, reminders.":
    "Kalendarz miesięczny z kliknij-aby-utworzyć, edycją drag, typami spotkań (rozprawa, konsultacja, spotkanie). Powiązanie spraw, przypomnienia.",
  "Trust Accounting": "Konta Powiernicze",
  "Management of client funds on escrow accounts. Deposits and withdrawals, balances, transaction records — audit-proof.":
    "Zarządzanie funduszami klientów na kontach powierniczych. Wpłaty i wypłaty, salda, zapisy transakcji — audit-proof.",
  Reports: "Raporty",
  "Structured reports: case evaluations, revenue statistics, deadline reports, productivity analyses. Export as PDF or CSV.":
    "Ustrukturyzowane raporty: ewaluacje spraw, statystyki przychodów, raporty terminów, analizy produktywności. Eksport PDF lub CSV.",
  Intake: "Przyjęcie",
  "Structured intake of new clients and incoming items. Quick capture with automatic case creation, contact enrichment and deadline detection.":
    "Ustrukturyzowane przyjęcie nowych klientów i przesyłek. Szybkie przechwytywanie z automatycznym tworzeniem spraw, wzbogacaniem kontaktów i wykrywaniem terminów.",
  "Directory (Courts & Authorities)": "Katalog (Sądy & Urzędy)",
  "Central directory of all courts, authorities and institutions. Addresses, jurisdictions, file number formats — directly linkable to cases.":
    "Centralny katalog wszystkich sądów, urzędów i instytucji. Adresy, jurysdykcje, formaty numerów akt — bezpośrednio linkowalne do spraw.",
  "Legal Translation": "Tłumaczenie Prawnicze",
  "AI-powered translation of legal texts with specialized terminology accuracy. Detects contract clauses, legal terms and authority jargon.":
    "Tłumaczenie AI tekstów prawnych z precyzją terminologii specjalistycznej. Wykrywa klauzule umów, terminy prawne i żargon urzędowy.",
  "Onboarding Wizard": "Kreator Onboardingu",
  "Guided onboarding for new users: set up brain, create first case, import contacts, configure deadlines — step by step.":
    "Guidowany onboarding dla nowych użytkowników: skonfiguruj brain, utwórz pierwszą sprawę, importuj kontakty, skonfiguruj terminy — krok po kroku.",
  "Workflow Automation": "Automatyzacja Workflow",
  "Automate recurring workflows: document approvals, deadline escalations, case status transitions. Trigger-based, with conditions and actions.":
    "Automatyzuj powtarzalne workflow: aprobacje dokumentów, eskalacje terminów, przejścia statusu spraw. Oparte na triggerach, z warunkami i akcjami.",
  Approvals: "Aprobacje",
  "Structured approval processes for documents, invoices and pleadings. Multi-stage approval chains, delegation, audit trail per approval.":
    "Ustrukturyzowane procesy aprobacji dla dokumentów, faktur i pism. Wieloetapowe łańcuchy aprobacji, delegacja, audit trail na aprobację.",
  "Obligation Tracking": "Śledzenie Obowiązków",
  "Tracking of all obligations per case: deadlines, form requirements, disclosure duties. Automatic warning when violation is imminent.":
    "Śledzenie wszystkich obowiązków per sprawa: terminy, wymogi formalne, obowiązki ujawnienia. Automatyczne ostrzeżenie gdy naruszenie jest nieuchronne.",
  Playbooks: "Playbooki",
  "Reusable process templates for recurring case types. Step sequences, checklists, deadline patterns — per practice area.":
    "Wielokrotnie używane szablony procesów dla powtarzalnych typów spraw. Sekwencje kroków, checklisty, wzorce terminów — per obszar praktyki.",
  "Template Management": "Zarządzanie Szablonami",
  "Central library for document templates. Pleadings, contracts, cover letters — with variables and brain connection for auto-fill.":
    "Centralna biblioteka szablonów dokumentów. Pisma, umowy, listy przewodnie — ze zmiennymi i połączeniem brain dla auto-fill.",
  "Clause Library": "Biblioteka Klauzul",
  "Structured collection of reusable clauses. Categorized by contract type, practice area and risk. With AI suggestions during drafting.":
    "Ustrukturyzowana kolekcja klauzul wielokrotnego użytku. Kategoryzowane po typie umowy, obszarze praktyki i ryzyku. Z sugestiami AI podczas redagowania.",
  "Legal Commentaries": "Komentarze Prawnicze",
  "Annotations and comments on norms, judgments and contract clauses. Shared across the team, with discussion history.":
    "Adnotacje i komentarze do norm, orzeczeń i klauzul umów. Współdzielone w zespole, z historią dyskusji.",
  "Knowledge Management (Experience)": "Zarządzanie Wiedzą (Experience)",
  "Structured capture of firm knowledge: pitfalls, best practices, lessons learned. Searchable, linkable to cases.":
    "Ustrukturyzowane przechwytywanie wiedzy kancelarii: pułapki, best practices, lessons learned. Przeszukiwalne, linkowalne do spraw.",
  "Global Full-Text Search": "Globalne Wyszukiwanie Full-Text",
  "Search across all cases, documents, notes, invoices and chats — with scope filters per type. Hybrid search: vector + BM25 + graph.":
    "Wyszukiwanie we wszystkich sprawach, dokumentach, notatkach, fakturach i chat — z filtrami scope per typ. Wyszukiwanie hybrydowe: wektorowe + BM25 + graf.",
  "Drafting Editor": "Editor Redagowania",
  "Full drafting editor with brain connection: inline AI suggestions, source insertion, clause library integration, version comparison.":
    "Pełny editor redagowania z połączeniem brain: sugestie AI inline, wstawianie źródeł, integracja biblioteki klauzul, porównanie wersji.",
  "Litigation & eDiscovery": "Postępowanie & eDiscovery",
  "Phases, analytics, review sets, precedent search.":
    "Fazy, analytics, review set, wyszukiwanie precedensów.",
  "Litigation Management": "Zarządzanie Postępowaniem",
  "Structured litigation management with phases and steps. Status per phase, assigned team members, deadlines and documents per step.":
    "Ustrukturyzowane zarządzanie postępowaniem z fazami i krokami. Status per faza, przypisani członkowie zespołu, terminy i dokumenty per krok.",
  "Litigation Analytics": "Analytics Postępowania",
  "Success rates, case duration, court statistics. Trends per court, per case type, per opponent — based on historical data.":
    "Wskaźniki sukcesu, czas trwania spraw, statystyki sądów. Trendy per sąd, per typ sprawy, per przeciwnik — na podstawie danych historycznych.",
  "Precedent Search": "Wyszukiwanie Precedensów",
  "AI-powered search for similar cases in the brain and external case law databases. Automatic relevance ranking.":
    "Wyszukiwanie AI podobnych spraw w brain i zewnętrznych bazach orzecznictwa. Automatyczny ranking istotności.",
  "Process Strategy": "Strategia Procesu",
  "Structured strategy capture per case: argument lines, evidence, counter-arguments. With AI suggestions and success prognosis.":
    "Ustrukturyzowane przechwytywanie strategii per sprawa: linie argumentacyjne, dowody, kontrargumenty. Z sugestiami AI i prognozą sukcesu.",
  "Tax & Accounting": "Podatki & Księgowość",
  "Tax returns, ELSTER, StBVV, tax audits.": "Zeznania podatkowe, ELSTER, StBVV, audyty podatkowe.",
  "Tax Returns": "Zeznania Podatkowe",
  "Preparation and management of tax returns (income, VAT, trade, corporate). Structured entry, validation, status tracking.":
    "Przygotowanie i zarządzanie zeznaniami podatkowymi (dochodowe, VAT, handlowe, spółkowe). Ustrukturyzowany wpis, walidacja, śledzenie statusu.",
  "Tax Assessments": "Decyzje Podatkowe",
  "Capture and analysis of tax assessments. Comparison with return, deviation analysis, objection deadline tracking.":
    "Przechwytywanie i analiza decyzji podatkowych. Porównanie z zeznaniem, analiza odchyleń, śledzenie terminów odwołań.",
  "Tax Audit": "Audyt Podatkowy",
  "Preparation and support of tax audits. Audit field management, document provision, protocol management.":
    "Przygotowanie i wsparcie audytów podatkowych. Zarządzanie obszarami audytu, dostarczanie dokumentów, zarządzanie protokołami.",
  "Tax Deadlines": "Terminy Podatkowe",
  "All tax deadlines (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) with automatic weekend and holiday shifting.":
    "Wszystkie terminy podatkowe (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) z automatycznym przesunięciem weekendów i świąt.",
  "StBVV Fee Calculator": "Kalkulator StBVV",
  "Tax adviser remuneration ordinance: 10 activities, VV numbers, factor calculation, VAT. Interactive and exportable.":
    "Rozporządzenie o wynagrodzeniu doradców podatkowych: 10 działalności, numery VV, obliczanie czynnika, VAT. Interaktywny i eksportowalny.",
  "Tax Clients": "Klienci Podatkowi",
  "Separate client management for tax advisers: master data, tax number, tax office, assignment to returns and assessments.":
    "Oddzielne zarządzanie klientami dla doradców podatkowych: dane master, NIP, urząd skarbowy, przypisanie do zeznań i decyzji.",
  "ELSTER Integration": "Integracja ELSTER",
  "Electronic tax returns via ELSTER. XML generation, form types, submission wizard — directly from the dashboard.":
    "Elektroniczne zeznania podatkowe przez ELSTER. Generacja XML, typy formularzy, kreator wysyłki — bezpośrednio z dashboard.",
  "Chat Analytics": "Analytics Czatu",
  "Usage statistics for the AI copilot: sessions, messages, token consumption, pinned answers — per day and per user.":
    "Statystyki użycia kopilota AI: sesje, wiadomości, zużycie tokenów, przypięte odpowiedzi — per dzień i per użytkownik.",
  "Model Comparison": "Porównanie Modeli",
  "Side-by-side comparison of different AI models: same question to multiple models at once, evaluate answers next to each other.":
    "Porównanie obok siebie różnych modeli AI: to samo pytanie do wielu modeli naraz, ocena odpowiedzi obok siebie.",
  "Legacy Cases": "Stare Sprawy",
  "Identify, classify and monitor risky and outdated cases. Pipeline status, escalation levels, deadline warnings — nothing falls through the cracks.":
    "Identyfikuj, klasyfikuj i monitoruj ryzykowne i nieaktualne sprawy. Status pipeline, poziomy eskalacji, ostrzeżenia terminów — nic nie umknie.",
  "Engine Monitoring (APM)": "Monitorowanie Engine (APM)",
  "Performance dashboard: P50/P95/P99 latency, brain quality, embedding queue, quota usage and error events in real time.":
    "Dashboard wydajności: latencja P50/P95/P99, jakość brain, kolejka embedding, użycie quota i zdarzenia błędów w czasie rzeczywistym.",
  "Retention Policies": "Polityki Retencji",
  "Automated retention rules per GDPR and BRAO: retention periods per document type, automatic deletion after expiry, audit trail.":
    "Automatyczne reguły retencji GDPR i BRAO: okresy retencji per typ dokumentu, automatyczne usuwanie po wygaśnięciu, audit trail.",
  "WhatsApp Templates": "Szablony WhatsApp",
  "Template library for WhatsApp messages: standard replies, client letters, reminder templates. With variables and approval workflow.":
    "Biblioteka szablonów wiadomości WhatsApp: standardowe odpowiedzi, listy klientów, szablony przypomnień. Ze zmiennymi i workflow zatwierdzania.",
  "AI Model Configuration": "Konfiguracja Modelu AI",
  "Model selection in the dashboard: provider, speed, cost, context window. Configurable per organization — from budget model to premium reasoning.":
    "Wybór modelu w dashboard: provider, prędkość, koszt, okno kontekstu. Konfigurowalne per organizacja — od modelu budżetowego do premium reasoning.",
  "SCIM Provisioning": "Provisioning SCIM",
  "Automated user management via SCIM 2.0: create, update, deactivate users — directly from identity providers (Okta, Azure AD, Google).":
    "Automatyczne zarządzanie użytkownikami via SCIM 2.0: tworzenie, aktualizacja, dezaktywacja — bezpośrednio z identity providers (Okta, Azure AD, Google).",
  "Billing & Subscription": "Fakturacja & Subskrypcja",
  "Plan management, upgrade/downgrade, payment methods, invoice history. Stripe integration with self-service portal for clients.":
    "Zarządzanie planem, upgrade/downgrade, metody płatności, historia faktur. Integracja Stripe z portalem self-service dla klientów.",
  "Judgement Sync": "Sync Orzeczeń",
  "Automatic retrieval of new court decisions from external sources. Daily sync, delta detection, automatic indexing into the brain.":
    "Automatyczne pobieranie nowych orzeczeń ze źródeł zewnętrznych. Codzienny sync, detekcja delta, automatyczna indeksacja w brain.",
  "Workflow Builder": "Kreator Workflow",
  "Visual drag-and-drop editor for automations: triggers, conditions, actions. No code needed — build and test workflows visually.":
    "Wizualny editor drag-and-drop dla automatyzacji: triggery, warunki, akcje. Bez kodu — twórz i testuj workflow wizualnie.",
  "Judgement Database": "Baza Orzeczeń",
  "Full-text search across thousands of court decisions. Filter by court, date, file number, practice area — with AI summary per judgement.":
    "Wyszukiwanie full-text w tysiącach orzeczeń. Filtruj po sądzie, dacie, numerze sprawy, obszarze praktyki — z podsumowaniem AI per orzeczenie.",
  "Mobile Pipeline Status": "Status Pipeline Mobile",
  "Monitor pipeline runs on mobile: status (running, completed, failed, awaiting_review), layer details tap-to-expand, output viewer with Markdown rendering.":
    "Monitoruj uruchomienia pipeline na mobile: status (running, completed, failed, awaiting_review), szczegóły layer tap-to-expand, przeglądarka output z rendering Markdown.",
  "Standalone Document Analysis": "Analiza Dokumentów Standalone",
  "Analyze documents without case context: upload, AI analysis, risk highlighting, summary — ideal for initial assessments and due diligence.":
    "Analizuj dokumenty bez kontekstu sprawy: upload, analiza AI, podświetlanie ryzyk, podsumowanie — idealne dla wstępnych ocen i due diligence.",
  "Case Law Analytics": "Analytics Orzecznictwa",
  "Statistical analysis of case law: success rates per court, trend curves, case type distribution — based on thousands of decisions.":
    "Analiza statystyczna orzecznictwa: wskaźniki sukcesu per sąd, krzywe trendów, dystrybucja typów spraw — na podstawie tysięcy orzeczeń.",
  "Get started in 5 steps": "Zacznij w 5 krokach",
  "From login to first case — how fast Subsumio goes live.":
    "Od logowania do pierwszej sprawy — jak szybko Subsumio startuje.",
  "Set up Brain": "Skonfiguruj Brain",
  "Run the onboarding wizard, connect data sources, index your brain.":
    "Uruchom wizard onboarding, podłącz źródła danych, zindeksuj brain.",
  "Create first case": "Utwórz pierwszą sprawę",
  "Add client, create case, upload documents via drag-and-drop.":
    "Dodaj klienta, utwórz sprawę, wgraj dokumenty via drag-and-drop.",
  "Configure deadlines": "Skonfiguruj terminy",
  "AI automatically scans all documents for deadlines — enable calendar export.":
    "AI automatycznie skanuje wszystkie dokumenty pod kątem terminów — włącz eksport kalendarza.",
  "Use Copilot": "Użyj Copilota",
  "Ask the brain questions, get cited answers, book time via chat.":
    "Zadawaj pytania brain, otrzymuj odpowiedzi z cytatami, rejestruj czas via chat.",
  "Invite team": "Zaproś zespół",
  "Add members, assign roles, collaborate on the brain together.":
    "Dodaj członków, przypisz role, współpracuj nad brain razem.",
  // ── User-centric description rewrites ──
  "Ask questions in plain language — get answers from your entire knowledge base. Every document, email and note is instantly searchable.":
    "Zadawaj pytania w zwykłym języku — otrzymuj odpowiedzi z całej bazy wiedzy. Każdy dokument, email i notatka jest natychmiast przeszukiwalna.",
  "Every answer links back to the exact source passage. No hallucinations — if the brain can't find it, it says so.":
    "Każda odpowiedź odsyła do dokładnego fragmentu źródła. Bez halucynacji — jeśli brain tego nie znajdzie, tak mówi.",
  "Complex legal questions get step-by-step reasoning. The brain shows its work — so you can verify every conclusion.":
    "Złożone pytania prawne otrzymują rozumowanie krok po kroku. Brain pokazuje swoją pracę — każdy wniosek do weryfikacji.",
  "Deploy specialized AI agents for recurring tasks — research, drafting, review. Each agent has its own skills and can be evaluated.":
    "Wdrażaj wyspecjalizowanych agentów AI do powtarzających się zadań — research, drafting, review. Każdy agent ma własne skille i jest evaluable.",
  "Built-in quality dashboard for AI answers. Test retrieval quality against real queries — know exactly how reliable the brain is.":
    "Wbudowany dashboard jakości dla odpowiedzi AI. Testuj jakość retrievalu na realnych zapytaniach — wiesz dokładnie, jak niezawodny jest brain.",
  "AI reads across multiple documents at once — finds themes, risks and patterns you'd miss document-by-document.":
    "AI czyta wiele dokumentów naraz — znajduje motywy, ryzyka i wzorce, które umkną dokument po dokumencie.",
  "See who uses which features and how often. Spot training gaps, drive adoption, measure ROI.":
    "Widzisz, kto używa których funkcji i jak często. Wykrywaj luki szkoleniowe, napędzaj adopcję, mierz ROI.",
  "All data sources in one dashboard: sync status, frequency, error logs. Spot issues before they become problems.":
    "Wszystkie źródła danych w jednym dashboardzie: status sync, częstotliwość, logi błędów. Wykrywaj problemy zanim staną się problemami.",
  "Track copilot usage: sessions, messages, token costs, pinned answers — per user, per day.":
    "Śledź użycie copilota: sesje, wiadomości, koszty tokenów, przypięte odpowiedzi — per użytkownik, per dzień.",
  "Upload scans, photos or PDFs — text is extracted automatically. Every document becomes searchable and classified.":
    "Wgraj skany, zdjęcia lub PDFy — tekst jest automatycznie ekstrahowany. Każdy dokument staje się przeszukiwalny i sklasyfikowany.",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export ready for court.":
    "Defensible review sets z privilege log i redactions. Deduplikacja, bulk tagging, export gotowy dla sądu.",
  "Every case is walled off from others. A user on case A cannot see case B — guaranteed by design, fuzz-tested for zero leaks.":
    "Każda sprawa jest odizolowana od innych. Użytkownik na sprawie A nie może zobaczyć sprawy B — gwarantowane przez design, fuzz-testowane na zero leaków.",
  "Real-time performance dashboard: response times, brain quality, queue depth and error rates — all at a glance.":
    "Dashboard wydajności w czasie rzeczywistym: czasy odpowiedzi, jakość brain, głębokość kolejki i wskaźniki błędów — wszystko na pierwszy rzut oka.",
  "GDPR built into the platform: DPA templates, data portability, right to erasure — all ready out of the box.":
    "RODO wbudowane w platformę: szablony DPA, przenośność danych, prawo do usunięcia — wszystko gotowe out-of-the-box.",
  "Connect any third-party tool via open API. Real-time webhooks keep everything in sync — no manual exports.":
    "Podłącz dowolne narzędzie zewnętrzne przez otwartą API. Webhooki real-time trzymają wszystko w sync — bez manualnych exportów.",
  "Set up agents for recurring tasks — they run on schedule, report results and learn from feedback.":
    "Ustaw agentów dla powtarzających się zadań — działają wg harmonogramu, zgłaszają wyniki i uczą się z feedbacku.",
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
  "90+ API Endpoints": "90+ Endpoints API",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "API REST complète avec auth, rate limiting, audit logging et types TypeScript.",
  "97+ Dashboard Pages": "97+ Pages Dashboard",
  "Every function has its own responsive page — from the case file to the ELSTER wizard.":
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
  // ── New features ──
  "Cross-Document Analysis": "Analyse Cross-Document",
  "AI-powered analysis across multiple documents: detect themes, risks and patterns invisible in individual documents.":
    "Analyse AI sur plusieurs documents: détecte thèmes, risques et patterns invisibles dans les documents individuels.",
  "Portfolio Insights": "Insights Portfolio",
  "Firm portfolio analysis: case mix, success rates, risk clusters and trends — based on all brain data.":
    "Analyse du portfolio du cabinet: mix de dossiers, taux de succès, clusters de risque et tendances — basés sur toutes les données du brain.",
  "Adoption Analytics": "Analytics d'Adoption",
  "Usage and adoption tracking: who uses which features how often? Basis for training decisions and rollout steering.":
    "Suivi d'utilisation et d'adoption: qui utilise quelles fonctions et combien souvent? Base pour décisions de formation et pilotage du rollout.",
  "Shared Spaces": "Espaces Partagés",
  "Shared Spaces for teams: collaborative knowledge areas, shared case streams and notes — with granular access control.":
    "Espaces Partagés pour équipes: zones de connaissance collaboratives, flux de dossiers partagés et notes — avec contrôle d'accès granulaire.",
  "Sources Management": "Gestion des Sources",
  "Central management of all data sources and connectors. Status, sync frequency, error logs — all in one place.":
    "Gestion centrale de toutes les sources de données et connecteurs. Statut, fréquence de sync, logs d'erreurs — tout au même endroit.",
  "Document Requests": "Demandes de Documents",
  "Structured requests for documents from clients. Status tracking, automatic reminders after 7 days, escalation after 3 reminders — via WhatsApp and in-app notification.":
    "Demandes structurées de documents aux clients. Suivi de statut, rappels automatiques après 7 jours, escalade après 3 rappels — via WhatsApp et notification in-app.",
  "Version History": "Historique des Versions",
  "Full versioning of every document. Compare changes, restore previous versions, audit trail per version.":
    "Versioning complet de chaque document. Comparez les changements, restaurez les versions précédentes, audit trail par version.",
  "Review Sets & eDiscovery": "Review Sets & eDiscovery",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export for court.":
    "Review sets défensibles avec privilege log et redactions. Déduplication, tagging en masse, export pour tribunal.",
  "Review Queue": "File de Review",
  "Structured document review: tagging, commenting, prioritizing. Batch-based with filters and saved views.":
    "Review structurée de documents: tagging, commentaires, priorisation. Par lots avec filtres et vues sauvegardées.",
  "Deadline Register": "Registre des Délais",
  "Chronological deadline register — all deadlines of a case in one view. Sortable by date, type, status. Audit-proof documented.":
    "Registre chronologique des délais — tous les délais d'un dossier en une vue. Triable par date, type, statut. Documenté audit-proof.",
  "Task Management": "Gestion des Tâches",
  "Tasks and to-dos per case or global. Due dates, priorities, assignment to team members, status tracking.":
    "Tâches et to-dos par dossier ou globales. Échéances, priorités, assignation aux membres de l'équipe, suivi de statut.",
  "Calendar with Inline Editing": "Calendrier avec Édition Inline",
  "Month calendar with click-to-create, drag editing, appointment types (hearing, consultation, meeting). Case linking, reminders.":
    "Calendrier mensuel avec clic-pour-créer, édition drag, types de rendez-vous (audience, consultation, réunion). Liaison de dossiers, rappels.",
  "Trust Accounting": "Comptabilité Fiduciaire",
  "Management of client funds on escrow accounts. Deposits and withdrawals, balances, transaction records — audit-proof.":
    "Gestion des fonds clients sur comptes fiduciaires. Dépôts et retraits, soldes, enregistrements de transactions — audit-proof.",
  Reports: "Rapports",
  "Structured reports: case evaluations, revenue statistics, deadline reports, productivity analyses. Export as PDF or CSV.":
    "Rapports structurés: évaluations de dossiers, statistiques de revenus, rapports de délais, analyses de productivité. Export PDF ou CSV.",
  Intake: "Réception",
  "Structured intake of new clients and incoming items. Quick capture with automatic case creation, contact enrichment and deadline detection.":
    "Réception structurée de nouveaux clients et entrées. Capture rapide avec création automatique de dossier, enrichissement de contacts et détection de délais.",
  "Directory (Courts & Authorities)": "Annuaire (Tribunaux & Autorités)",
  "Central directory of all courts, authorities and institutions. Addresses, jurisdictions, file number formats — directly linkable to cases.":
    "Annuaire central de tous les tribunaux, autorités et institutions. Adresses, juridictions, formats de numéros de dossier — directement liables aux dossiers.",
  "Legal Translation": "Traduction Juridique",
  "AI-powered translation of legal texts with specialized terminology accuracy. Detects contract clauses, legal terms and authority jargon.":
    "Traduction AI de textes juridiques avec précision terminologique spécialisée. Détecte les clauses contractuelles, termes juridiques et jargon administratif.",
  "Onboarding Wizard": "Assistant d'Onboarding",
  "Guided onboarding for new users: set up brain, create first case, import contacts, configure deadlines — step by step.":
    "Onboarding guidé pour nouveaux utilisateurs: configurer brain, créer premier dossier, importer contacts, configurer délais — étape par étape.",
  "Workflow Automation": "Automatisation de Workflows",
  "Automate recurring workflows: document approvals, deadline escalations, case status transitions. Trigger-based, with conditions and actions.":
    "Automatisez les workflows récurrents: approbations de documents, escalades de délais, transitions de statut de dossiers. Basé sur triggers, avec conditions et actions.",
  Approvals: "Approbations",
  "Structured approval processes for documents, invoices and pleadings. Multi-stage approval chains, delegation, audit trail per approval.":
    "Processus d'approbation structurés pour documents, factures et conclusions. Chaînes d'approbation multi-niveaux, délégation, audit trail par approbation.",
  "Obligation Tracking": "Suivi des Obligations",
  "Tracking of all obligations per case: deadlines, form requirements, disclosure duties. Automatic warning when violation is imminent.":
    "Suivi de toutes les obligations par dossier: délais, exigences formelles, devoirs de divulgation. Avertissement automatique quand la violation est imminente.",
  Playbooks: "Playbooks",
  "Reusable process templates for recurring case types. Step sequences, checklists, deadline patterns — per practice area.":
    "Modèles de processus réutilisables pour types de dossiers récurrents. Séquences d'étapes, checklists, patterns de délais — par domaine de pratique.",
  "Template Management": "Gestion des Modèles",
  "Central library for document templates. Pleadings, contracts, cover letters — with variables and brain connection for auto-fill.":
    "Bibliothèque centrale de modèles de documents. Conclusions, contrats, lettres d'accompagnement — avec variables et connexion brain pour auto-fill.",
  "Clause Library": "Bibliothèque de Clauses",
  "Structured collection of reusable clauses. Categorized by contract type, practice area and risk. With AI suggestions during drafting.":
    "Collection structurée de clauses réutilisables. Catégorisées par type de contrat, domaine de pratique et risque. Avec suggestions AI lors de la rédaction.",
  "Legal Commentaries": "Commentaires Juridiques",
  "Annotations and comments on norms, judgments and contract clauses. Shared across the team, with discussion history.":
    "Annotations et commentaires sur normes, jugements et clauses contractuelles. Partagés dans l'équipe, avec historique de discussion.",
  "Knowledge Management (Experience)": "Gestion des Connaissances (Experience)",
  "Structured capture of firm knowledge: pitfalls, best practices, lessons learned. Searchable, linkable to cases.":
    "Capture structurée des connaissances du cabinet: pièges, best practices, leçons apprises. Consultable, liable aux dossiers.",
  "Global Full-Text Search": "Recherche Full-Text Globale",
  "Search across all cases, documents, notes, invoices and chats — with scope filters per type. Hybrid search: vector + BM25 + graph.":
    "Recherche dans tous les dossiers, documents, notes, factures et chats — avec filtres de scope par type. Recherche hybride: vectorielle + BM25 + graphe.",
  "Drafting Editor": "Éditeur de Rédaction",
  "Full drafting editor with brain connection: inline AI suggestions, source insertion, clause library integration, version comparison.":
    "Éditeur de rédaction complet avec connexion brain: suggestions AI inline, insertion de sources, intégration de bibliothèque de clauses, comparaison de versions.",
  "Litigation & eDiscovery": "Contentieux & eDiscovery",
  "Phases, analytics, review sets, precedent search.":
    "Phases, analytics, review sets, recherche de précédents.",
  "Litigation Management": "Gestion du Contentieux",
  "Structured litigation management with phases and steps. Status per phase, assigned team members, deadlines and documents per step.":
    "Gestion structurée du contentieux avec phases et étapes. Statut par phase, membres de l'équipe assignés, délais et documents par étape.",
  "Litigation Analytics": "Analytics du Contentieux",
  "Success rates, case duration, court statistics. Trends per court, per case type, per opponent — based on historical data.":
    "Taux de succès, durée des dossiers, statistiques des tribunaux. Tendances par tribunal, par type de dossier, par adversaire — basées sur données historiques.",
  "Precedent Search": "Recherche de Précédents",
  "AI-powered search for similar cases in the brain and external case law databases. Automatic relevance ranking.":
    "Recherche AI de dossiers similaires dans le brain et bases de jurisprudence externes. Classement de pertinence automatique.",
  "Process Strategy": "Stratégie de Procédure",
  "Structured strategy capture per case: argument lines, evidence, counter-arguments. With AI suggestions and success prognosis.":
    "Capture structurée de stratégie par dossier: lignes argumentaires, preuves, contre-arguments. Avec suggestions AI et pronostic de succès.",
  "Tax & Accounting": "Fiscalité & Comptabilité",
  "Tax returns, ELSTER, StBVV, tax audits.":
    "Déclarations fiscales, ELSTER, StBVV, audits fiscaux.",
  "Tax Returns": "Déclarations Fiscales",
  "Preparation and management of tax returns (income, VAT, trade, corporate). Structured entry, validation, status tracking.":
    "Préparation et gestion des déclarations fiscales (impôt, TVA, commerce, société). Saisie structurée, validation, suivi de statut.",
  "Tax Assessments": "Avis d'Imposition",
  "Capture and analysis of tax assessments. Comparison with return, deviation analysis, objection deadline tracking.":
    "Capture et analyse des avis d'imposition. Comparaison avec déclaration, analyse des écarts, suivi des délais de recours.",
  "Tax Audit": "Audit Fiscal",
  "Preparation and support of tax audits. Audit field management, document provision, protocol management.":
    "Préparation et support des audits fiscaux. Gestion des domaines d'audit, provision de documents, gestion des protocoles.",
  "Tax Deadlines": "Délais Fiscaux",
  "All tax deadlines (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) with automatic weekend and holiday shifting.":
    "Tous les délais fiscaux (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) avec décalage automatique des week-ends et jours fériés.",
  "StBVV Fee Calculator": "Calculateur StBVV",
  "Tax adviser remuneration ordinance: 10 activities, VV numbers, factor calculation, VAT. Interactive and exportable.":
    "Ordonnance de rémunération des conseillers fiscaux: 10 activités, numéros VV, calcul de facteur, TVA. Interactif et exportable.",
  "Tax Clients": "Clients Fiscaux",
  "Separate client management for tax advisers: master data, tax number, tax office, assignment to returns and assessments.":
    "Gestion séparée des clients pour conseillers fiscaux: données maîtresses, numéro fiscal, bureau des impôts, assignation aux déclarations et avis.",
  "ELSTER Integration": "Intégration ELSTER",
  "Electronic tax returns via ELSTER. XML generation, form types, submission wizard — directly from the dashboard.":
    "Déclarations fiscales électroniques via ELSTER. Génération XML, types de formulaires, assistant de soumission — directement depuis le dashboard.",
  "Chat Analytics": "Analytics Chat",
  "Usage statistics for the AI copilot: sessions, messages, token consumption, pinned answers — per day and per user.":
    "Statistiques d'utilisation du copilote AI: sessions, messages, consommation tokens, réponses épinglées — par jour et par utilisateur.",
  "Model Comparison": "Comparaison de Modèles",
  "Side-by-side comparison of different AI models: same question to multiple models at once, evaluate answers next to each other.":
    "Comparaison côte à côte de différents modèles AI: même question à plusieurs modèles simultanément, évaluer les réponses côte à côte.",
  "Legacy Cases": "Affaires Anciennes",
  "Identify, classify and monitor risky and outdated cases. Pipeline status, escalation levels, deadline warnings — nothing falls through the cracks.":
    "Identifier, classer et surveiller les affaires risquées et obsolètes. Statut pipeline, niveaux d'escalade, alertes échéances — rien n'échappe.",
  "Engine Monitoring (APM)": "Surveillance Engine (APM)",
  "Performance dashboard: P50/P95/P99 latency, brain quality, embedding queue, quota usage and error events in real time.":
    "Tableau de bord performance: latence P50/P95/P99, qualité brain, file embedding, utilisation quota et événements d'erreur en temps réel.",
  "Retention Policies": "Politiques de Conservation",
  "Automated retention rules per GDPR and BRAO: retention periods per document type, automatic deletion after expiry, audit trail.":
    "Règles de conservation automatiques GDPR et BRAO: durées par type de document, suppression automatique après expiration, audit trail.",
  "WhatsApp Templates": "Modèles WhatsApp",
  "Template library for WhatsApp messages: standard replies, client letters, reminder templates. With variables and approval workflow.":
    "Bibliothèque de modèles pour messages WhatsApp: réponses standard, courriers clients, modèles de rappels. Avec variables et workflow d'approbation.",
  "AI Model Configuration": "Configuration Modèle AI",
  "Model selection in the dashboard: provider, speed, cost, context window. Configurable per organization — from budget model to premium reasoning.":
    "Sélection modèle dans dashboard: provider, vitesse, coût, fenêtre contexte. Configurable par organisation — du modèle économique au reasoning premium.",
  "SCIM Provisioning": "Provisioning SCIM",
  "Automated user management via SCIM 2.0: create, update, deactivate users — directly from identity providers (Okta, Azure AD, Google).":
    "Gestion utilisateurs automatisée via SCIM 2.0: créer, mettre à jour, désactiver utilisateurs — directement depuis identity providers (Okta, Azure AD, Google).",
  "Billing & Subscription": "Facturation & Abonnement",
  "Plan management, upgrade/downgrade, payment methods, invoice history. Stripe integration with self-service portal for clients.":
    "Gestion plan, upgrade/downgrade, méthodes paiement, historique factures. Intégration Stripe avec portail self-service pour clients.",
  "Judgement Sync": "Sync Jurisprudence",
  "Automatic retrieval of new court decisions from external sources. Daily sync, delta detection, automatic indexing into the brain.":
    "Récupération automatique des nouvelles décisions de sources externes. Sync quotidien, détection delta, indexation automatique dans brain.",
  "Workflow Builder": "Constructeur Workflow",
  "Visual drag-and-drop editor for automations: triggers, conditions, actions. No code needed — build and test workflows visually.":
    "Éditeur visuel drag-and-drop pour automatisations: triggers, conditions, actions. Sans code — créez et testez workflows visuellement.",
  "Judgement Database": "Base Jurisprudence",
  "Full-text search across thousands of court decisions. Filter by court, date, file number, practice area — with AI summary per judgement.":
    "Recherche full-text dans des milliers de décisions. Filtrer par tribunal, date, numéro dossier, domaine pratique — avec résumé AI par décision.",
  "Mobile Pipeline Status": "Statut Pipeline Mobile",
  "Monitor pipeline runs on mobile: status (running, completed, failed, awaiting_review), layer details tap-to-expand, output viewer with Markdown rendering.":
    "Surveiller exécutions pipeline sur mobile: statut (running, completed, failed, awaiting_review), détails layer tap-to-expand, visionneuse output avec rendering Markdown.",
  "Standalone Document Analysis": "Analyse Documents Standalone",
  "Analyze documents without case context: upload, AI analysis, risk highlighting, summary — ideal for initial assessments and due diligence.":
    "Analyser documents sans contexte affaire: upload, analyse AI, surlignage risques, résumé — idéal pour évaluations initiales et due diligence.",
  "Case Law Analytics": "Analytics Jurisprudence",
  "Statistical analysis of case law: success rates per court, trend curves, case type distribution — based on thousands of decisions.":
    "Analyse statistique jurisprudence: taux succès par tribunal, courbes tendance, distribution types affaires — sur des milliers de décisions.",
  "Get started in 5 steps": "Démarrez en 5 étapes",
  "From login to first case — how fast Subsumio goes live.":
    "Du login à la première affaire — la vitesse à laquelle Subsumio devient opérationnel.",
  "Set up Brain": "Configurer Brain",
  "Run the onboarding wizard, connect data sources, index your brain.":
    "Lancez l'assistant onboarding, connectez les sources de données, indexez votre brain.",
  "Create first case": "Créer première affaire",
  "Add client, create case, upload documents via drag-and-drop.":
    "Ajoutez client, créez affaire, uploadez documents via drag-and-drop.",
  "Configure deadlines": "Configurer échéances",
  "AI automatically scans all documents for deadlines — enable calendar export.":
    "AI scanne automatiquement tous les documents pour échéances — activez export calendrier.",
  "Use Copilot": "Utiliser Copilot",
  "Ask the brain questions, get cited answers, book time via chat.":
    "Posez questions au brain, obtenez réponses avec citations, enregistrez temps via chat.",
  "Invite team": "Inviter équipe",
  "Add members, assign roles, collaborate on the brain together.":
    "Ajoutez membres, assignez rôles, collaborez sur le brain ensemble.",
  // ── User-centric description rewrites ──
  "Ask questions in plain language — get answers from your entire knowledge base. Every document, email and note is instantly searchable.":
    "Posez des questions en langage courant — obtenez des réponses de toute votre base de connaissances. Chaque document, email et note est instantanément recherchable.",
  "Every answer links back to the exact source passage. No hallucinations — if the brain can't find it, it says so.":
    "Chaque réponse renvoie au passage exact de la source. Pas d'hallucinations — si le brain ne trouve pas, il le dit.",
  "Complex legal questions get step-by-step reasoning. The brain shows its work — so you can verify every conclusion.":
    "Les questions juridiques complexes reçoivent un raisonnement étape par étape. Le brain montre son travail — chaque conclusion vérifiable.",
  "Deploy specialized AI agents for recurring tasks — research, drafting, review. Each agent has its own skills and can be evaluated.":
    "Déployez des agents AI spécialisés pour les tâches récurrentes — recherche, drafting, review. Chaque agent a ses propres skills et est évaluable.",
  "Built-in quality dashboard for AI answers. Test retrieval quality against real queries — know exactly how reliable the brain is.":
    "Tableau de bord qualité intégré pour les réponses AI. Testez la qualité de retrieval sur des requêtes réelles — savez exactement combien fiable est le brain.",
  "AI reads across multiple documents at once — finds themes, risks and patterns you'd miss document-by-document.":
    "L'AI lit plusieurs documents à la fois — trouve des thèmes, risques et motifs que vous manqueriez document par document.",
  "See who uses which features and how often. Spot training gaps, drive adoption, measure ROI.":
    "Voyez qui utilise quelles fonctionnalités et à quelle fréquence. Détectez les lacunes de formation, pilotez l'adoption, mesurez le ROI.",
  "All data sources in one dashboard: sync status, frequency, error logs. Spot issues before they become problems.":
    "Toutes les sources de données en un tableau de bord: statut sync, fréquence, logs d'erreurs. Détectez les problèmes avant qu'ils n'en soient.",
  "Track copilot usage: sessions, messages, token costs, pinned answers — per user, per day.":
    "Suivez l'usage du copilote: sessions, messages, coûts de tokens, réponses épinglées — par utilisateur, par jour.",
  "Upload scans, photos or PDFs — text is extracted automatically. Every document becomes searchable and classified.":
    "Téléchargez scans, photos ou PDFs — le texte est extrait automatiquement. Chaque document devient recherchable et classifié.",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export ready for court.":
    "Review sets défendables avec privilege log et redactions. Déduplication, bulk tagging, export prêt pour le tribunal.",
  "Every case is walled off from others. A user on case A cannot see case B — guaranteed by design, fuzz-tested for zero leaks.":
    "Chaque dossier est isolé des autres. Un utilisateur sur le dossier A ne peut pas voir le dossier B — garanti par design, fuzz-testé pour zéro fuite.",
  "Real-time performance dashboard: response times, brain quality, queue depth and error rates — all at a glance.":
    "Tableau de bord performance en temps réel: temps de réponse, qualité du brain, profondeur de file et taux d'erreur — tout d'un coup d'œil.",
  "GDPR built into the platform: DPA templates, data portability, right to erasure — all ready out of the box.":
    "RGPD intégré dans la plateforme: modèles DPA, portabilité des données, droit à l'effacement — tout prêt out-of-the-box.",
  "Connect any third-party tool via open API. Real-time webhooks keep everything in sync — no manual exports.":
    "Connectez tout outil tiers via API ouverte. Les webhooks en temps réel gardent tout synchronisé — sans exports manuels.",
  "Set up agents for recurring tasks — they run on schedule, report results and learn from feedback.":
    "Configurez des agents pour les tâches récurrentes — ils s'exécutent selon planning, rapportent les résultats et apprennent des retours.",
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
  "90+ API Endpoints": "90+ API-Endpoints",
  "Complete REST API with auth, rate limiting, audit logging and TypeScript types.":
    "Compleet REST API met auth, rate limiting, audit logging en TypeScript-types.",
  "97+ Dashboard Pages": "97+ Dashboard-Pagina's",
  "Every function has its own responsive page — from the case file to the ELSTER wizard.":
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
  // ── New features ──
  "Cross-Document Analysis": "Cross-Document Analyse",
  "AI-powered analysis across multiple documents: detect themes, risks and patterns invisible in individual documents.":
    "AI-analyse over meerdere documenten: detecteer thema's, risico's en patronen onzichtbaar in individuele documenten.",
  "Portfolio Insights": "Portfolio Insights",
  "Firm portfolio analysis: case mix, success rates, risk clusters and trends — based on all brain data.":
    "Kantoor-portfolioanalyse: zaak-mix, succespercentages, risicoclusters en trends — gebaseerd op alle brain-data.",
  "Adoption Analytics": "Adoption Analytics",
  "Usage and adoption tracking: who uses which features how often? Basis for training decisions and rollout steering.":
    "Gebruiks- en adoption-tracking: wie gebruikt welke functies hoe vaak? Basis voor trainingsbeslissingen en rollout-sturing.",
  "Shared Spaces": "Gedeelde Ruimtes",
  "Shared Spaces for teams: collaborative knowledge areas, shared case streams and notes — with granular access control.":
    "Gedeelde Ruimtes voor teams: collaboratieve kennisgebieden, gedeelde zaak-streams en notities — met granulaire toegangscontrole.",
  "Sources Management": "Bronbeheer",
  "Central management of all data sources and connectors. Status, sync frequency, error logs — all in one place.":
    "Centraal beheer van alle databronnen en connectors. Status, sync-frequentie, fout-logs — alles op één plek.",
  "Document Requests": "Documentverzoeken",
  "Structured requests for documents from clients. Status tracking, automatic reminders after 7 days, escalation after 3 reminders — via WhatsApp and in-app notification.":
    "Gestructureerde documentverzoeken aan cliënten. Status-tracking, automatische herinneringen na 7 dagen, escalatie na 3 herinneringen — via WhatsApp en in-app notificatie.",
  "Version History": "Versiegeschiedenis",
  "Full versioning of every document. Compare changes, restore previous versions, audit trail per version.":
    "Volledige versiebeheer van elk document. Vergelijk wijzigingen, herstel eerdere versies, audit trail per versie.",
  "Review Sets & eDiscovery": "Review Sets & eDiscovery",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export for court.":
    "Verdedigbare review sets met privilege log en redactions. Deduplicatie, bulk tagging, export voor rechtbank.",
  "Review Queue": "Review-Wachtrij",
  "Structured document review: tagging, commenting, prioritizing. Batch-based with filters and saved views.":
    "Gestructureerde document-review: tagging, commentaar, prioritering. Per batch met filters en opgeslagen weergaven.",
  "Deadline Register": "Termijnregister",
  "Chronological deadline register — all deadlines of a case in one view. Sortable by date, type, status. Audit-proof documented.":
    "Chronologisch termijnregister — alle termijnen van een zaak in één weergave. Sorteerbaar op datum, type, status. Audit-proof gedocumenteerd.",
  "Task Management": "Taakbeheer",
  "Tasks and to-dos per case or global. Due dates, priorities, assignment to team members, status tracking.":
    "Taken en to-do's per zaak of globaal. Deadlines, prioriteiten, toewijzing aan teamleden, status-tracking.",
  "Calendar with Inline Editing": "Kalender met Inline Bewerking",
  "Month calendar with click-to-create, drag editing, appointment types (hearing, consultation, meeting). Case linking, reminders.":
    "Maandkalender met klik-om-te-maken, drag-bewerking, afspraak-types (zitting, consultatie, vergadering). Zaak-koppeling, herinneringen.",
  "Trust Accounting": "Derdengelden",
  "Management of client funds on escrow accounts. Deposits and withdrawals, balances, transaction records — audit-proof.":
    "Beheer van cliëntfondsen op derdenrekeningen. Stortingen en opnames, saldi, transactieregistraties — audit-proof.",
  Reports: "Rapporten",
  "Structured reports: case evaluations, revenue statistics, deadline reports, productivity analyses. Export as PDF or CSV.":
    "Gestructureerde rapporten: zaak-evaluaties, omzetstatistieken, termijnrapporten, productiviteitsanalyses. Export als PDF of CSV.",
  Intake: "Intake",
  "Structured intake of new clients and incoming items. Quick capture with automatic case creation, contact enrichment and deadline detection.":
    "Gestructureerde intake van nieuwe cliënten en inkomende items. Snelle capture met automatische zaak-aanmaak, contactverrijking en termijndetectie.",
  "Directory (Courts & Authorities)": "Register (Rechtbanken & Autoriteiten)",
  "Central directory of all courts, authorities and institutions. Addresses, jurisdictions, file number formats — directly linkable to cases.":
    "Centraal register van alle rechtbanken, autoriteiten en instellingen. Adressen, jurisdicties, dossiernummer-formaten — direct koppelbaar aan zaken.",
  "Legal Translation": "Juridische Vertaling",
  "AI-powered translation of legal texts with specialized terminology accuracy. Detects contract clauses, legal terms and authority jargon.":
    "AI-vertaling van juridische teksten met gespecialiseerde terminologische nauwkeurigheid. Detecteert contractclausules, juridische termen en ambtelijk jargon.",
  "Onboarding Wizard": "Onboarding-Wizard",
  "Guided onboarding for new users: set up brain, create first case, import contacts, configure deadlines — step by step.":
    "Begeleide onboarding voor nieuwe gebruikers: brain instellen, eerste zaak aanmaken, contacten importeren, termijnen configureren — stap voor stap.",
  "Workflow Automation": "Workflow-Automatisering",
  "Automate recurring workflows: document approvals, deadline escalations, case status transitions. Trigger-based, with conditions and actions.":
    "Automatiseer terugkerende workflows: documentgoedkeuringen, termijn-escalaties, zaak-status-overgangen. Trigger-gebaseerd, met voorwaarden en acties.",
  Approvals: "Goedkeuringen",
  "Structured approval processes for documents, invoices and pleadings. Multi-stage approval chains, delegation, audit trail per approval.":
    "Gestructureerde goedkeuringsprocessen voor documenten, facturen en pleidooien. Meestaps goedkeuringsketens, delegatie, audit trail per goedkeuring.",
  "Obligation Tracking": "Verplichtingen-Tracking",
  "Tracking of all obligations per case: deadlines, form requirements, disclosure duties. Automatic warning when violation is imminent.":
    "Tracking van alle verplichtingen per zaak: termijnen, vormvereisten, openbaarheidsplichten. Automatische waarschuwing bij dreigende schending.",
  Playbooks: "Playbooks",
  "Reusable process templates for recurring case types. Step sequences, checklists, deadline patterns — per practice area.":
    "Hergebruikbare processjablonen voor terugkerende zaak-types. Stapsequenties, checklists, termijn-patronen — per praktijkgebied.",
  "Template Management": "Sjabloonbeheer",
  "Central library for document templates. Pleadings, contracts, cover letters — with variables and brain connection for auto-fill.":
    "Centrale bibliotheek voor documentsjablonen. Pleidooien, contracten, begeleidende brieven — met variabelen en brain-verbinding voor auto-fill.",
  "Clause Library": "Clausulebibliotheek",
  "Structured collection of reusable clauses. Categorized by contract type, practice area and risk. With AI suggestions during drafting.":
    "Gestructureerde collectie van herbruikbare clausules. Gecategoriseerd per contracttype, praktijkgebied en risico. Met AI-suggesties tijdens het opstellen.",
  "Legal Commentaries": "Juridische Commentaren",
  "Annotations and comments on norms, judgments and contract clauses. Shared across the team, with discussion history.":
    "Annotaties en commentaren op normen, uitspraken en contractclausules. Gedeeld in het team, met discussiegeschiedenis.",
  "Knowledge Management (Experience)": "Kennisbeheer (Experience)",
  "Structured capture of firm knowledge: pitfalls, best practices, lessons learned. Searchable, linkable to cases.":
    "Gestructureerde vastlegging van kantorkennis: valkuilen, best practices, lessons learned. Doorzoekbaar, koppelbaar aan zaken.",
  "Global Full-Text Search": "Globale Full-Text Zoekfunctie",
  "Search across all cases, documents, notes, invoices and chats — with scope filters per type. Hybrid search: vector + BM25 + graph.":
    "Zoeken in alle zaken, documenten, notities, facturen en chats — met scope-filters per type. Hybride zoekfunctie: vector + BM25 + grafiek.",
  "Drafting Editor": "Opstel-Editor",
  "Full drafting editor with brain connection: inline AI suggestions, source insertion, clause library integration, version comparison.":
    "Volledige opstel-editor met brain-verbinding: inline AI-suggesties, bron-invoeging, clausulebibliotheek-integratie, versievergelijking.",
  "Litigation & eDiscovery": "Litigatie & eDiscovery",
  "Phases, analytics, review sets, precedent search.":
    "Fases, analytics, review sets, precedentenzoekfunctie.",
  "Litigation Management": "Litigatiebeheer",
  "Structured litigation management with phases and steps. Status per phase, assigned team members, deadlines and documents per step.":
    "Gestructureerd litigatiebeheer met fases en stappen. Status per fase, toegewezen teamleden, termijnen en documenten per stap.",
  "Litigation Analytics": "Litigatie-Analytics",
  "Success rates, case duration, court statistics. Trends per court, per case type, per opponent — based on historical data.":
    "Succespercentages, zaakduur, rechtbankstatistieken. Trends per rechtbank, per zaaktype, per tegenpartij — gebaseerd op historische data.",
  "Precedent Search": "Precedentenzoekfunctie",
  "AI-powered search for similar cases in the brain and external case law databases. Automatic relevance ranking.":
    "AI-zoekfunctie voor vergelijkbare zaken in de brain en externe jurisprudentiedatabases. Automatische relevantie-ranking.",
  "Process Strategy": "Processtrategie",
  "Structured strategy capture per case: argument lines, evidence, counter-arguments. With AI suggestions and success prognosis.":
    "Gestructureerde strategie-vastlegging per zaak: argumentatielijnen, bewijs, tegenargumenten. Met AI-suggesties en succesprognose.",
  "Tax & Accounting": "Fiscaliteit & Boekhouding",
  "Tax returns, ELSTER, StBVV, tax audits.": "Belastingaangiften, ELSTER, StBVV, belastingaudits.",
  "Tax Returns": "Belastingaangiften",
  "Preparation and management of tax returns (income, VAT, trade, corporate). Structured entry, validation, status tracking.":
    "Voorbereiding en beheer van belastingaangiften (inkomsten, btw, handel, vennootschap). Gestructureerde invoer, validatie, status-tracking.",
  "Tax Assessments": "Belastingaanslagen",
  "Capture and analysis of tax assessments. Comparison with return, deviation analysis, objection deadline tracking.":
    "Vastlegging en analyse van belastingaanslagen. Vergelijking met aangifte, afwijkingsanalyse, bezwaartermijn-tracking.",
  "Tax Audit": "Belastingaudit",
  "Preparation and support of tax audits. Audit field management, document provision, protocol management.":
    "Voorbereiding en ondersteuning van belastingaudits. Audit-veldbeheer, documentvoorziening, protocolbeheer.",
  "Tax Deadlines": "Belastingtermijnen",
  "All tax deadlines (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) with automatic weekend and holiday shifting.":
    "Alle belastingtermijnen (§ 109, § 153, § 168, § 226, § 355, § 367, § 477 AO) met automatische weekend- en feestdagaverschuiving.",
  "StBVV Fee Calculator": "StBVV-Calculator",
  "Tax adviser remuneration ordinance: 10 activities, VV numbers, factor calculation, VAT. Interactive and exportable.":
    "Belastingadviseurs-vergoedingsverordening: 10 activiteiten, VV-nummers, factorberekening, btw. Interactief en exporteerbaar.",
  "Tax Clients": "Belastingcliënten",
  "Separate client management for tax advisers: master data, tax number, tax office, assignment to returns and assessments.":
    "Separate cliëntbeheer voor belastingadviseurs: masterdata, belastingnummer, belastingkantoor, toewijzing aan aangiften en aanslagen.",
  "ELSTER Integration": "ELSTER-Integratie",
  "Electronic tax returns via ELSTER. XML generation, form types, submission wizard — directly from the dashboard.":
    "Elektronische belastingaangiften via ELSTER. XML-generatie, formuliertypes, indieningswizard — direct vanuit het dashboard.",
  "Chat Analytics": "Chat Analytics",
  "Usage statistics for the AI copilot: sessions, messages, token consumption, pinned answers — per day and per user.":
    "Gebruiksstatistieken voor de AI-copiloot: sessies, berichten, token-verbruik, vastgemaakte antwoorden — per dag en per gebruiker.",
  "Model Comparison": "Modelvergelijking",
  "Side-by-side comparison of different AI models: same question to multiple models at once, evaluate answers next to each other.":
    "Zij-aan-zij vergelijking van verschillende AI-modellen: dezelfde vraag aan meerdere modellen tegelijk, antwoorden naast elkaar evalueren.",
  "Legacy Cases": "Verouderde Dossiers",
  "Identify, classify and monitor risky and outdated cases. Pipeline status, escalation levels, deadline warnings — nothing falls through the cracks.":
    "Identificeer, classificeer en monitor risicovolle en verouderde dossiers. Pipeline-status, escalatieniveaus, deadline-waarschuwingen — niets ontglipt.",
  "Engine Monitoring (APM)": "Engine-Monitoring (APM)",
  "Performance dashboard: P50/P95/P99 latency, brain quality, embedding queue, quota usage and error events in real time.":
    "Prestatie-dashboard: P50/P95/P99-latentie, brain-kwaliteit, embedding-wachtrij, quota-gebruik en foutgebeurtenissen in real-time.",
  "Retention Policies": "Bewaarbeleid",
  "Automated retention rules per GDPR and BRAO: retention periods per document type, automatic deletion after expiry, audit trail.":
    "Geautomatiseerde bewaarregels GDPR en BRAO: bewaartermijnen per documenttype, automatische verwijdering na verloop, audit trail.",
  "WhatsApp Templates": "WhatsApp-Sjablonen",
  "Template library for WhatsApp messages: standard replies, client letters, reminder templates. With variables and approval workflow.":
    "Sjabloonbibliotheek voor WhatsApp-berichten: standaardantwoorden, cliëntbrieven, herinneringssjablonen. Met variabelen en goedkeuringsworkflow.",
  "AI Model Configuration": "AI-Model Configuratie",
  "Model selection in the dashboard: provider, speed, cost, context window. Configurable per organization — from budget model to premium reasoning.":
    "Modelselectie in dashboard: provider, snelheid, kosten, contextvenster. Configureerbaar per organisatie — van budgetmodel tot premium reasoning.",
  "SCIM Provisioning": "SCIM-Provisioning",
  "Automated user management via SCIM 2.0: create, update, deactivate users — directly from identity providers (Okta, Azure AD, Google).":
    "Geautomatiseerd gebruikersbeheer via SCIM 2.0: aanmaken, bijwerken, deactiveren gebruikers — direct vanuit identity providers (Okta, Azure AD, Google).",
  "Billing & Subscription": "Facturering & Abonnement",
  "Plan management, upgrade/downgrade, payment methods, invoice history. Stripe integration with self-service portal for clients.":
    "Planbeheer, upgrade/downgrade, betaalmethoden, factuurgeschiedenis. Stripe-integratie met self-service portal voor cliënten.",
  "Judgement Sync": "Uitspraak-Sync",
  "Automatic retrieval of new court decisions from external sources. Daily sync, delta detection, automatic indexing into the brain.":
    "Automatische ophaling van nieuwe uitspraken uit externe bronnen. Dagelijkse sync, delta-detectie, automatische indexering in brain.",
  "Workflow Builder": "Workflow-Builder",
  "Visual drag-and-drop editor for automations: triggers, conditions, actions. No code needed — build and test workflows visually.":
    "Visuele drag-and-drop editor voor automatiseringen: triggers, voorwaarden, acties. Geen code nodig — maak en test workflows visueel.",
  "Judgement Database": "Uitsprakenendatabase",
  "Full-text search across thousands of court decisions. Filter by court, date, file number, practice area — with AI summary per judgement.":
    "Full-text zoekfunctie in duizenden uitspraken. Filteren op rechtbank, datum, dossiernummer, praktijkgebied — met AI-samenvatting per uitspraak.",
  "Mobile Pipeline Status": "Mobiele Pipeline-Status",
  "Monitor pipeline runs on mobile: status (running, completed, failed, awaiting_review), layer details tap-to-expand, output viewer with Markdown rendering.":
    "Monitor pipeline-runs op mobiel: status (running, completed, failed, awaiting_review), layer-details tap-to-expand, output-viewer met Markdown-rendering.",
  "Standalone Document Analysis": "Standalone Documentanalyse",
  "Analyze documents without case context: upload, AI analysis, risk highlighting, summary — ideal for initial assessments and due diligence.":
    "Analyseer documenten zonder dossiercontext: upload, AI-analyse, risico-markering, samenvatting — ideaal voor eerste beoordelingen en due diligence.",
  "Case Law Analytics": "Jurisprudentie-Analytics",
  "Statistical analysis of case law: success rates per court, trend curves, case type distribution — based on thousands of decisions.":
    "Statistische analyse van jurisprudentie: succespercentages per rechtbank, trendcurves, distributie zaakstypen — op basis van duizenden uitspraken.",
  "Get started in 5 steps": "Start in 5 stappen",
  "From login to first case — how fast Subsumio goes live.":
    "Van login tot eerste dossier — hoe snel Subsumio live gaat.",
  "Set up Brain": "Brain instellen",
  "Run the onboarding wizard, connect data sources, index your brain.":
    "Start de onboarding-wizard, verbind gegevensbronnen, indexeer je brain.",
  "Create first case": "Eerste dossier aanmaken",
  "Add client, create case, upload documents via drag-and-drop.":
    "Voeg cliënt toe, maak dossier aan, upload documenten via drag-and-drop.",
  "Configure deadlines": "Termijnen configureren",
  "AI automatically scans all documents for deadlines — enable calendar export.":
    "AI scant automatisch alle documenten op termijnen — activeer kalender-export.",
  "Use Copilot": "Copilot gebruiken",
  "Ask the brain questions, get cited answers, book time via chat.":
    "Stel vragen aan het brain, krijg antwoorden met bronvermeldingen, registreer tijd via chat.",
  "Invite team": "Team uitnodigen",
  "Add members, assign roles, collaborate on the brain together.":
    "Voeg leden toe, wijs rollen toe, werk samen aan het brain.",
  // ── User-centric description rewrites ──
  "Ask questions in plain language — get answers from your entire knowledge base. Every document, email and note is instantly searchable.":
    "Stel vragen in gewone taal — krijg antwoorden uit je hele kennisbank. Elk document, email en notitie is direct doorzoekbaar.",
  "Every answer links back to the exact source passage. No hallucinations — if the brain can't find it, it says so.":
    "Elk antwoord verwijst naar de exacte bronpassage. Geen hallucinaties — als de brain het niet vindt, zegt hij dat.",
  "Complex legal questions get step-by-step reasoning. The brain shows its work — so you can verify every conclusion.":
    "Complexe juridische vragen krijgen stap-voor-stap redenering. De brain toont zijn werk — elke conclusie verifieerbaar.",
  "Deploy specialized AI agents for recurring tasks — research, drafting, review. Each agent has its own skills and can be evaluated.":
    "Implementeer gespecialiseerde AI-agents voor terugkerende taken — research, drafting, review. Elke agent heeft eigen skills en is evalueerbaar.",
  "Built-in quality dashboard for AI answers. Test retrieval quality against real queries — know exactly how reliable the brain is.":
    "Ingebouwd kwaliteitsdashboard voor AI-antwoorden. Test retrieval-kwaliteit tegen echte queries — weet precies hoe betrouwbaar de brain is.",
  "AI reads across multiple documents at once — finds themes, risks and patterns you'd miss document-by-document.":
    "AI leest meerdere documenten tegelijk — vindt thema's, risico's en patronen die je document-per-document mist.",
  "See who uses which features and how often. Spot training gaps, drive adoption, measure ROI.":
    "Zie wie welke functies hoe vaak gebruikt. Spot trainingsgaten, stuur adoptie, meet ROI.",
  "All data sources in one dashboard: sync status, frequency, error logs. Spot issues before they become problems.":
    "Alle databronnen in één dashboard: sync-status, frequentie, foutlogs. Spot problemen voordat ze problemen worden.",
  "Track copilot usage: sessions, messages, token costs, pinned answers — per user, per day.":
    "Volg copilot-gebruik: sessies, berichten, token-kosten, gepinde antwoorden — per gebruiker, per dag.",
  "Upload scans, photos or PDFs — text is extracted automatically. Every document becomes searchable and classified.":
    "Upload scans, foto's of PDF's — tekst wordt automatisch geëxtraheerd. Elk document wordt doorzoekbaar en geclassificeerd.",
  "Defensible review sets with privilege log and redactions. Deduplication, bulk tagging, export ready for court.":
    "Verdedigbare review sets met privilege log en redactions. Deduplicatie, bulk tagging, export klaar voor rechtbank.",
  "Every case is walled off from others. A user on case A cannot see case B — guaranteed by design, fuzz-tested for zero leaks.":
    "Elke zaak is afgeschermd van andere. Een gebruiker op zaak A kan zaak B niet zien — gegarandeerd door design, fuzz-getest op zero leaks.",
  "Real-time performance dashboard: response times, brain quality, queue depth and error rates — all at a glance.":
    "Real-time prestatiedashboard: responstijden, brain-kwaliteit, queue-diepte en foutpercentages — alles in één oogopslag.",
  "GDPR built into the platform: DPA templates, data portability, right to erasure — all ready out of the box.":
    "AVG ingebouwd in het platform: DPA-sjablonen, dataportabiliteit, recht op wissen — alles ready out-of-the-box.",
  "Connect any third-party tool via open API. Real-time webhooks keep everything in sync — no manual exports.":
    "Verbind elke tool van derden via open API. Real-time webhooks houden alles in sync — geen handmatige exports.",
  "Set up agents for recurring tasks — they run on schedule, report results and learn from feedback.":
    "Stel agents in voor terugkerende taken — ze draaien op schema, rapporteren resultaten en leren van feedback.",
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
