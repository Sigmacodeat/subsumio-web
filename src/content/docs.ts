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

export const DOCS: DocsContent = {
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
      sub: "Rechnungsstellung, Buchhaltungsexport, RATG, Mahnwesen.",
      features: [
        {
          icon: "FileText",
          title: "Rechnungsstellung",
          desc: "Automatische Rechnungsgenerierung aus Zeiterfassung. Professionelle PDF-Vorlagen mit Logo und Bankverbindung.",
        },
        {
          icon: "Database",
          title: "Buchhaltungsexport",
          desc: "Export aller Buchungsdaten im buchhaltungskompatiblen Format für die Kanzlei-Buchhaltung.",
        },
        {
          icon: "Calculator",
          title: "RATG-Berechnung",
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
          desc: "Interaktiver Rechner für Mandanten: Prozesskosten, RATG-Vorschau, Kostenvoranschlag.",
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
          desc: "Automatisierte Retention-Rules nach DSGVO und RAO: Aufbewahrungsfristen pro Dokumententyp, automatische Löschung nach Ablauf, Audit-Trail.",
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
          desc: "Datenbank österreichischer Rechtsquellen — ABGB, ZPO, EO, UGB und Bundesrecht, mit KI-Suche.",
        },
        {
          icon: "ShieldAlert",
          title: "Kollisionsprüfung",
          desc: "Automatische Interessenkonfliktprüfung vor Mandantenannahme. Gegenstellen, frühere Mandate, verbundene Personen.",
        },
        {
          icon: "Mail",
          title: "BEA-Anbindung",
          desc: "Besonderes elektronisches Anwaltspostfach (BEA) im Dashboard. Senden und Empfangen von webERV-Eingaben.",
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
        desc: "At-Rest und In-Transit. Kein Training auf Mandantendaten. § 9 Abs. 2 RAO im Systemdesign.",
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

export function getDocs(): DocsContent {
  return DOCS;
}
