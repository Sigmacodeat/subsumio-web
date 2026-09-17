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
    title: "Alles, was",
    claim: "Subsumio kann.",
    sub: "Die Funktionen von Subsumio im Überblick — nach Bereichen geordnet und durchsuchbar.",
  },
  intro:
    "Subsumio ist eine Kanzleisoftware mit dem Kanzleiwissen im Kern. Hier finden Sie die Funktionen und Arbeitsabläufe im Überblick.",
  quickstart: {
    title: "In 5 Schritten starten",
    sub: "Von der Anmeldung bis zur ersten Akte — so richten Sie Subsumio ein.",
    steps: [
      {
        num: "01",
        title: "Kanzleiwissen einrichten",
        desc: "Einrichtungsassistenten starten, Datenquellen verbinden, Wissensbasis aufbauen lassen.",
      },
      {
        num: "02",
        title: "Erste Akte anlegen",
        desc: "Mandant erfassen, Akte erstellen, Dokumente per Drag-and-drop hochladen.",
      },
      {
        num: "03",
        title: "Fristen einrichten",
        desc: "Fristenübersicht prüfen, Erinnerungen festlegen und das Kalender-Abo (ICS) aktivieren.",
      },
      {
        num: "04",
        title: "Assistenten nutzen",
        desc: "Fragen an das Kanzleiwissen stellen, Antworten mit Fundstellen erhalten, Zeiten über den Assistenten buchen.",
      },
      {
        num: "05",
        title: "Team einladen",
        desc: "Mitglieder hinzufügen, Rollen vergeben, gemeinsam mit dem Kanzleiwissen arbeiten.",
      },
    ],
  },
  categories: [
    {
      id: "brain",
      title: "Kanzleiwissen & KI",
      sub: "Semantische Suche, Antworten mit Fundstellen, Agenten.",
      features: [
        {
          icon: "Brain",
          title: "Semantische Wissensbasis",
          desc: "Fragen in normaler Sprache stellen — Antworten aus der gesamten Wissensbasis. Dokumente, E-Mails und Notizen sind nach dem Import durchsuchbar.",
        },
        {
          icon: "Search",
          title: "Antworten mit Fundstellen",
          desc: "Jede Antwort verweist auf ihre Quelle. Findet das Kanzleiwissen keinen Beleg, wird das kenntlich gemacht — die anwaltliche Prüfung bleibt.",
        },
        {
          icon: "Zap",
          title: "Schrittweise Begründung",
          desc: "Komplexe Rechtsfragen werden Schritt für Schritt begründet. Der Assistent legt seinen Gedankengang offen, damit jede Schlussfolgerung nachprüfbar ist.",
        },
        {
          icon: "Network",
          title: "Agenten-System",
          desc: "Spezialisierte KI-Agenten für wiederkehrende Aufgaben — Recherche, Entwurf, Prüfung. Agenten laufen auf Wunsch nach Zeitplan und melden ihre Ergebnisse zur Durchsicht.",
        },
        {
          icon: "GitBranch",
          title: "Beziehungsnetz",
          desc: "Netzwerkansicht der Personen, Unternehmen und ihrer Beziehungen. Macht Verbindungen zwischen Mandanten und Gegenseite sichtbar.",
        },
        {
          icon: "ScanSearch",
          title: "Qualitätsprüfung der KI-Antworten",
          desc: "Eingebaute Qualitätsauswertung für KI-Antworten. Testen Sie die Trefferqualität mit eigenen Anfragen — so sehen Sie, wie zuverlässig das Kanzleiwissen antwortet.",
        },
        {
          icon: "Zap",
          title: "KI-Assistent",
          desc: "Integrierter Assistent in Subsumio. Kontextbezogene Hilfe bei den Arbeitsschritten — von der Aktenanlage bis zur Honorarnote.",
        },
        {
          icon: "Layers",
          title: "Dokumentübergreifende Analyse",
          desc: "Die KI liest mehrere Dokumente gemeinsam und zeigt Themen, Risiken und Muster auf, die im Einzeldokument nicht auffallen.",
        },
        {
          icon: "BarChart3",
          title: "Kanzlei-Auswertung",
          desc: "Auswertung des Aktenbestands: Akten-Mix, Risikohäufungen und Entwicklungen — auf Basis der eigenen Akten.",
        },
        {
          icon: "BarChart3",
          title: "Nutzungsauswertung",
          desc: "Sehen Sie, wer welche Funktionen wie oft nutzt. So erkennen Sie Schulungsbedarf und steuern die Einführung.",
        },
        {
          icon: "Users",
          title: "Geteilte Räume",
          desc: "Gemeinsame Wissensbereiche für Teams: geteilte Akten und gemeinsame Notizen — mit fein einstellbaren Zugriffsrechten.",
        },
        {
          icon: "Database",
          title: "Datenquellen-Verwaltung",
          desc: "Alle Datenquellen in einer Ansicht: Abgleich-Status, Häufigkeit, Fehlerprotokolle. So fallen Probleme früh auf.",
        },
        {
          icon: "BarChart3",
          title: "Assistent-Auswertung",
          desc: "Nutzung des Assistenten nachvollziehen: Sitzungen, Nachrichten, KI-Kosten, angeheftete Antworten — pro Nutzer und Tag.",
        },
        {
          icon: "GitCompare",
          title: "Modell-Vergleich",
          desc: "Dieselbe Frage an mehrere KI-Modelle gleichzeitig stellen und die Antworten nebeneinander bewerten.",
        },
      ],
    },
    {
      id: "cases",
      title: "Akten & Dokumente",
      sub: "Aktenverwaltung, Dokumentenablage, Dokumentenverarbeitung.",
      features: [
        {
          icon: "FolderOpen",
          title: "Aktenverwaltung",
          desc: "Mandanten- und Aktenstruktur mit Zugriffsrechten pro Nutzer und Akte.",
        },
        {
          icon: "FileText",
          title: "Dokumenten-Upload & Ablage",
          desc: "Drag-and-drop, Versionierung, nachvollziehbare Ablage. Speicherung in der EU-Cloud oder On-Premise (Enterprise).",
        },
        {
          icon: "Users",
          title: "Gemeinsames Arbeiten",
          desc: "Präsenzanzeige in Echtzeit: Sehen Sie, wer gerade an welchem Dokument arbeitet. Live-Cursor, Avatare, gemeinsame Notizen.",
        },
        {
          icon: "Layers",
          title: "OCR & Dokumentenverarbeitung",
          desc: "Scans, Fotos oder PDFs hochladen — der Text wird automatisch ausgelesen. Dokumente werden durchsuchbar und klassifiziert.",
        },
        {
          icon: "Mail",
          title: "E-Mail-Import",
          desc: "Postfach per IMAP verbinden oder E-Mails als .eml-/.msg-Datei importieren — mit Anhängen, Metadaten und Aktenzuordnung.",
        },
        {
          icon: "MessageSquare",
          title: "Dokumenten-Analyse",
          desc: "KI-Analyse von Verträgen, Gutachten und Schriftsätzen: Risiken hervorheben, Änderungen vergleichen, zusammenfassen — mit oder ohne Aktenbezug, etwa für Ersteinschätzungen und Due Diligence.",
        },
        {
          icon: "Layers",
          title: "Tabellarische Übersicht",
          desc: "Tabellenansicht aller Akten, Dokumente und Fristen. Sortierbar, filterbar, direkt aus dem Kanzleiwissen.",
        },
        {
          icon: "FileText",
          title: "Vertragsmanagement",
          desc: "Verträge über ihre Laufzeit verwalten: Entwurf, Prüfung, Versionierung, Ablaufdaten, Erinnerungen.",
        },
        {
          icon: "Users",
          title: "Gegenseite & Gegenanwälte",
          desc: "Erfassung der Gegenanwälte, Versicherungen und der Gegenseite — verknüpft mit Akten und Kontakten.",
        },
        {
          icon: "FileClock",
          title: "Dokumentenanfragen",
          desc: "Strukturierte Anforderung von Unterlagen bei Mandanten. Statusverfolgung, automatische Erinnerung nach 7 Tagen, Eskalation nach 3 Erinnerungen — per WhatsApp und Benachrichtigung in Subsumio.",
        },
        {
          icon: "GitBranch",
          title: "Versionshistorie",
          desc: "Versionierung jedes Dokuments. Änderungen vergleichen, frühere Versionen wiederherstellen, Protokoll pro Version.",
        },
        {
          icon: "Layers",
          title: "Dokumentensätze für die Durchsicht",
          desc: "Dokumentensätze für die Durchsicht: Dubletten erkennen, markieren, schwärzen, als Beilagenverzeichnis exportieren.",
        },
        {
          icon: "CheckSquare",
          title: "Dokumentendurchsicht",
          desc: "Strukturierte Durchsicht von Dokumenten: kommentieren und priorisieren — stapelweise, mit Filtern und gespeicherten Ansichten.",
        },
        {
          icon: "AlertTriangle",
          title: "Altlasten-Management",
          desc: "Risikobehaftete und veraltete Akten erkennen, einstufen und überwachen. Bearbeitungsstand, Eskalationsstufen, Fristen-Warnung.",
        },
      ],
    },
    {
      id: "deadlines",
      title: "Fristen & Zeit",
      sub: "Fristenerkennung, Kalender-Abo, Zeiterfassung.",
      features: [
        {
          icon: "CalendarClock",
          title: "Fristen-Management",
          desc: "Zentrale Fristenübersicht mit Ampel-System. Automatische E-Mail-Erinnerungen vor Ablauf.",
        },
        {
          icon: "Zap",
          title: "KI-Fristenerkennung",
          desc: "Die KI durchsucht Dokumente und E-Mails nach Fristen und Terminen — ohne manuelle Eingabe. Erkannte Fristen sind anwaltlich zu prüfen.",
        },
        {
          icon: "CalendarClock",
          title: "Kalender-Export",
          desc: "Fristen als Kalender-Abo (ICS) für Ihr Kalenderprogramm.",
        },
        {
          icon: "Calculator",
          title: "Zeiterfassung & Barauslagen",
          desc: "Per Assistent, WhatsApp oder manuell — Zeiten und Barauslagen werden der richtigen Akte zugeordnet, bestätigungspflichtig.",
        },
        {
          icon: "BookOpen",
          title: "Fristenbuch",
          desc: "Chronologisches Fristenregister — alle Fristen einer Akte in einer Übersicht. Sortierbar nach Datum, Art und Status, nachvollziehbar dokumentiert.",
        },
        {
          icon: "CheckSquare",
          title: "Aufgabenverwaltung",
          desc: "Aufgaben pro Akte oder kanzleiweit. Fälligkeiten, Prioritäten, Zuweisung an Teammitglieder, Statusverfolgung.",
        },
        {
          icon: "CalendarClock",
          title: "Kalender mit Inline-Bearbeitung",
          desc: "Monatskalender: Termine per Klick anlegen und direkt bearbeiten, Termin-Typen (Termin, Verhandlung, Beratung), Aktenverknüpfung, Erinnerungen.",
        },
      ],
    },
    {
      id: "invoicing",
      title: "Honorar & Finanzen",
      sub: "Honorarnoten, Buchhaltungsexport, RATG, Mahnwesen.",
      features: [
        {
          icon: "FileText",
          title: "Honorarnoten",
          desc: "Honorarnoten aus Zeiterfassung und Tarifleistungen erstellen. PDF mit Bankverbindung, auf Wunsch als XRechnung oder ZUGFeRD.",
        },
        {
          icon: "Database",
          title: "Buchhaltungsexport",
          desc: "Export der Buchungsdaten für die Kanzlei-Buchhaltung und die Steuerberatung.",
        },
        {
          icon: "Calculator",
          title: "RATG-Berechnung",
          desc: "Tarifleistungen nach TP 1 bis 3 RATG in der Honorarnote berechnen: Entlohnung nach Bemessungsgrundlage, Einheitssatz, ERV- und Streitgenossenzuschlag. Beträge nach der geltenden Verordnung, als Vorschlag zur Prüfung.",
        },
        {
          icon: "Megaphone",
          title: "Mahnwesen",
          desc: "Mahnungen für überfällige Honorarnoten in drei Stufen, per E-Mail.",
        },
        {
          icon: "Database",
          title: "Controlling & Kennzahlen",
          desc: "Kanzlei-Controlling: Umsatz, Deckungsbeitrag, Auslastung pro Anwalt, Profitabilität pro Mandant.",
        },
        {
          icon: "Shield",
          title: "Treuhandkonten",
          desc: "Verwaltung von Klientengeldern auf Anderkonten. Ein- und Auszahlungen, Salden, Buchungsnachweise — nachvollziehbar dokumentiert.",
        },
        {
          icon: "FileText",
          title: "Berichte",
          desc: "Strukturierte Berichte: Aktenauswertungen, Umsatzstatistiken, Fristenberichte, Auswertungen zur Produktivität. Export als PDF oder CSV.",
        },
      ],
    },
    {
      id: "security",
      title: "Sicherheit & Compliance",
      sub: "DSGVO, Aufbewahrung nach BAO, KI-Verordnung, Audit-Trail, Verschlüsselung.",
      features: [
        {
          icon: "Shield",
          title: "DSGVO",
          desc: "DSGVO-Funktionen in der Plattform: Auftragsverarbeitungsvertrag (AVV), Datenportabilität, Löschung auf Anfrage.",
        },
        {
          icon: "FileText",
          title: "Aufbewahrung nach BAO",
          desc: "Bücher, Aufzeichnungen und Belege werden nach §§ 131, 132 BAO sieben Jahre aufbewahrt; Änderungen werden protokolliert.",
        },
        {
          icon: "ShieldAlert",
          title: "KI-Verordnung (EU AI Act)",
          desc: "Eingebaute Prüfung nach der KI-Verordnung (VO (EU) 2024/1689): Risikostufen und Dokumentationspflichten.",
        },
        {
          icon: "Database",
          title: "Audit-Trail",
          desc: "Protokollierung der Aktionen: wer hat wann was mit welchem Dokument gemacht.",
        },
        {
          icon: "Lock",
          title: "Verschlüsselung",
          desc: "Verschlüsselung bei Speicherung und Übertragung (TLS). Bei On-Premise (Enterprise) liegen die Schlüssel bei der Kanzlei.",
        },
        {
          icon: "ShieldCheck",
          title: "2FA / TOTP",
          desc: "Zwei-Faktor-Authentifizierung per TOTP mit gängigen Authenticator-Apps.",
        },
        {
          icon: "Network",
          title: "Mandanten-Isolation",
          desc: "Jede Akte ist getrennt: Wer nur für Akte A berechtigt ist, sieht Akte B nicht. Die Trennung wird mit automatisierten Tests geprüft.",
        },
        {
          icon: "ShieldCheck",
          title: "Informationsbarrieren",
          desc: "Informationsbarrieren zwischen Akten und Teams. Einstellbare Zugriffssperren helfen, Interessenkollisionen zu vermeiden — durchgesetzt auf Datenbankebene.",
        },
        {
          icon: "ShieldAlert",
          title: "System-Monitoring",
          desc: "Zustand der Komponenten in Echtzeit: API, Datenbank, Hintergrundaufgaben und Warteschlangen, dazu Antwortzeiten und Fehlerraten.",
        },
        {
          icon: "Database",
          title: "Daten-Export",
          desc: "Export Ihrer Daten für Sicherung, Umzug oder Auskunfts- und Portabilitätsanfragen nach DSGVO. JSON, CSV, PDF.",
        },
        {
          icon: "FileArchive",
          title: "Aufbewahrungsrichtlinien",
          desc: "Aufbewahrungsfristen pro Dokumententyp festlegen, Löschung nach Ablauf, mit Protokoll — abgestimmt auf DSGVO, BAO und RAO.",
        },
      ],
    },
    {
      id: "communication",
      title: "Kommunikation",
      sub: "E-Mail, WhatsApp-Assistent, Mandantenportal, Kommentare.",
      features: [
        {
          icon: "Mail",
          title: "E-Mail-Management",
          desc: "Importierte E-Mails Akten zuordnen, kategorisieren und archivieren — an einem Ort.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp-Assistent",
          desc: "Zeit buchen, Belege ablegen, Akten befragen — per WhatsApp Business, ohne zusätzliche App. Jede Buchung ist bestätigungspflichtig.",
        },
        {
          icon: "Users",
          title: "Mandantenportal",
          desc: "Mandantenportal für den Dokumentenaustausch. Zeitlich begrenzte Links, Zugriffsprotokollierung.",
        },
        {
          icon: "MessageSquare",
          title: "Kommentare & Notizen",
          desc: "Akteninterne Kommentare, Notizen und Diskussionen. Antwortverläufe, Erwähnungen, Benachrichtigungen.",
        },
        {
          icon: "Users",
          title: "Kontakteverwaltung",
          desc: "Zentrale Kontakte für Mandanten, Gegenanwälte, Gutachter, Gerichte und Behörden. Verknüpfung mit Akten und Fristen.",
        },
        {
          icon: "Users",
          title: "Team & Organisation",
          desc: "Team-Verwaltung: Organisation anlegen, Mitglieder einladen, Rollen und Zugriffsrechte vergeben. Ein Kanzleiwissen für das ganze Team.",
        },
        {
          icon: "Inbox",
          title: "Posteingang",
          desc: "Neue Mandanten und Eingänge strukturiert erfassen. Schnellerfassung mit Aktenanlage, Kontaktanreicherung und Fristenerkennung.",
        },
        {
          icon: "BookOpen",
          title: "Verzeichnis (Gerichte & Behörden)",
          desc: "Zentrales Verzeichnis der Gerichte, Behörden und Institutionen. Adressen, Zuständigkeiten, Geschäftszahl-Formate — direkt verknüpfbar mit Akten.",
        },
        {
          icon: "MessageSquare",
          title: "WhatsApp-Vorlagen",
          desc: "Vorlagenbibliothek für WhatsApp-Nachrichten: Standard-Antworten, Anschreiben an Mandanten, Erinnerungen. Mit Variablen und Freigabe.",
        },
      ],
    },
    {
      id: "integrations",
      title: "Integrationen",
      sub: "DocuSign, Word-Add-in, REST-API, Webhooks, SSO (Enterprise).",
      features: [
        {
          icon: "FileSignature",
          title: "DocuSign",
          desc: "Dokumente über DocuSign zur Unterschrift senden, Status verfolgen; das unterschriebene PDF landet in der Akte. Einfache Unterschriften holen Sie über das Mandantenportal ein.",
        },
        {
          icon: "Network",
          title: "Schnittstellen",
          desc: "Drittsysteme über REST-API und Webhooks anbinden.",
        },
        {
          icon: "Database",
          title: "API-Schlüssel",
          desc: "Programmatischer Zugriff über die REST-API. Rate-Limits, Berechtigungsumfang pro Schlüssel, Protokollierung.",
        },
        {
          icon: "Shield",
          title: "Single Sign-On (SSO)",
          desc: "Single Sign-On über SAML (Enterprise).",
        },
        {
          icon: "Database",
          title: "Kanzlei-Import",
          desc: "Akten aus Ihrer bisherigen Kanzleisoftware per CSV übernehmen, samt Mandant, Gegner und Gericht als Kontakte. Probelauf vor dem Import, keine bestehende Akte wird überschrieben, importierte Akten lassen sich gesammelt wieder archivieren. Dokumente übernehmen Sie per Ordner-Upload in die jeweilige Akte.",
        },
        {
          icon: "Shield",
          title: "Kanzlei-Einstellungen",
          desc: "Zentrale Verwaltung der Kanzlei-Daten, Bankverbindungen, Logo, Signaturen, Benutzerrollen und Berechtigungen.",
        },
        {
          icon: "FileText",
          title: "Microsoft Word Add-in",
          desc: "Schriftsatz-Entwürfe und Vertragsvergleiche direkt in Microsoft Word. Mit Anbindung an das Kanzleiwissen, Fundstellen-Einfügung und KI-Vorschlägen — ohne Word zu verlassen.",
        },
        {
          icon: "Network",
          title: "Plugin-System",
          desc: "Erweiterbar durch eigene Plugins und Skills (Format subsumio.plugin.json) — für kanzleieigene Arbeitsabläufe.",
        },
        {
          icon: "Languages",
          title: "Juristische Übersetzung",
          desc: "KI-gestützte Übersetzung juristischer Texte. Berücksichtigt Vertragsklauseln, Rechtsbegriffe und Behördensprache; die Übersetzung ist fachlich zu prüfen.",
        },
        {
          icon: "Zap",
          title: "Einrichtungsassistent",
          desc: "Geführte Einrichtung für neue Nutzer: Kanzleiwissen einrichten, erste Akte anlegen, Kontakte importieren, Fristen einrichten — Schritt für Schritt.",
        },
        {
          icon: "Cpu",
          title: "KI-Modell-Konfiguration",
          desc: "Modell-Auswahl in den Einstellungen: Anbieter, Geschwindigkeit, Kosten, Kontextfenster. Pro Organisation einstellbar.",
        },
        {
          icon: "Network",
          title: "SCIM-Provisioning (Enterprise)",
          desc: "Automatisierte Benutzerverwaltung über SCIM 2.0: Nutzer anlegen, aktualisieren, deaktivieren — direkt aus Ihrem Identity-Provider.",
        },
        {
          icon: "CreditCard",
          title: "Abrechnung & Abo-Verwaltung",
          desc: "Tarif verwalten und wechseln, Zahlungsmethoden und Rechnungen einsehen — als Self-Service für die Kanzlei. Zahlungsabwicklung über Stripe.",
        },
      ],
    },
    {
      id: "automation",
      title: "Automatisierung",
      sub: "Judikatur-Abgleich, Akten-Monitor, Freigaben, Arbeitsabläufe.",
      features: [
        {
          icon: "RefreshCw",
          title: "Judikatur-Abgleich",
          desc: "Regelmäßiger Abgleich neuer Entscheidungen aus dem RIS: Neue Judikatur wird erkannt, zusammengefasst und in das Kanzleiwissen eingeordnet.",
        },
        {
          icon: "ScanSearch",
          title: "Akten-Monitor",
          desc: "Nächtliche Prüfung der Akten auf drohende Fristen, neue Themen und Beweislücken.",
        },
        {
          icon: "Workflow",
          title: "Automatisierte Arbeitsabläufe",
          desc: "Wiederkehrende Abläufe automatisieren: Dokumentenfreigaben, Fristen-Eskalationen, Statuswechsel von Akten. Im visuellen Editor aus Auslösern, Bedingungen und Aktionen zusammenstellen und testen — ohne Programmierung.",
        },
        {
          icon: "CheckSquare",
          title: "Freigaben",
          desc: "Strukturierte Freigabeprozesse für Dokumente, Honorarnoten und Schriftsätze. Mehrstufige Freigabeketten, Vertretung, Protokoll pro Freigabe.",
        },
        {
          icon: "Shield",
          title: "Obliegenheiten",
          desc: "Obliegenheiten pro Akte verfolgen: Fristen, Formvorschriften, Behauptungs- und Beweislast. Warnung, wenn eine Verletzung droht.",
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
          title: "Rechtsrecherche (RIS)",
          desc: "Recherche in österreichischen Rechtsquellen aus dem RIS — ABGB, ZPO, EO, UGB, weiteres Bundesrecht und Judikatur. Filter nach Gericht, Datum, Geschäftszahl und Rechtsgebiet; Antworten mit Fundstellen, Argumentationsketten und Gegenargumenten.",
        },
        {
          icon: "ShieldAlert",
          title: "Kollisionsprüfung",
          desc: "Prüfung auf Interessenkollision und Doppelvertretung (§ 10 RAO) vor der Mandatsannahme: durchsucht Akten, Kontakte, Gegenseite, frühere Mandate und verbundene Personen. Das Ergebnis ist ein Hinweis — die Entscheidung bleibt bei Ihnen.",
        },
        {
          icon: "FileText",
          title: "Medizinrecht",
          desc: "Gutachtenanalyse, Durchsicht von Krankengeschichten und Behandlungsunterlagen, Fristenkatalog für Medizinrechtler.",
        },
        {
          icon: "Landmark",
          title: "Immobilienrecht",
          desc: "Kaufverträge, Grundbuchsauszüge, Bebauungspläne und Maklerverträge für Immobilienrechtler.",
        },
        {
          icon: "Shield",
          title: "Versicherungsrecht",
          desc: "Deckungsanfragen, Schadensregulierung, Regress, Rechtsschutz für Versicherungsrechtler.",
        },
        {
          icon: "MessageSquare",
          title: "Beratungsmandate",
          desc: "Modul für Beratungsprojekte: Projektstruktur, Stundenbudgets, Meilensteine, Abrechnung nach Pauschalhonorar oder Stundensatz.",
        },
        {
          icon: "Shield",
          title: "Compliance",
          desc: "Compliance-Modul für DSGVO, Geldwäscheprävention nach §§ 8a ff RAO und KI-Verordnung. Pflichten, Kontrollen und Nachweise — dokumentiert.",
        },
        {
          icon: "BookOpen",
          title: "Playbooks",
          desc: "Wiederverwendbare Prozessvorlagen für wiederkehrende Falltypen. Schrittfolgen, Checklisten, Fristen-Muster — pro Rechtsgebiet.",
        },
        {
          icon: "FileText",
          title: "Vorlagenverwaltung",
          desc: "Zentrale Bibliothek für Dokumentvorlagen. Schriftsätze, Verträge, Anschreiben — mit Variablen und automatischer Befüllung aus dem Kanzleiwissen.",
        },
        {
          icon: "Layers",
          title: "Klauselbibliothek",
          desc: "Strukturierte Sammlung wiederverwendbarer Klauseln. Geordnet nach Vertragstyp, Rechtsgebiet und Risiko. Mit KI-Vorschlägen beim Entwerfen.",
        },
        {
          icon: "MessageSquare",
          title: "Juristische Kommentierungen",
          desc: "Anmerkungen zu Normen, Entscheidungen und Vertragsklauseln. Im Team geteilt, mit Diskussionsverlauf.",
        },
        {
          icon: "Brain",
          title: "Wissensmanagement",
          desc: "Strukturierte Erfassung von Kanzleiwissen: Fallstricke, bewährte Vorgehensweisen, Erfahrungen aus abgeschlossenen Akten. Durchsuchbar, verknüpfbar mit Akten.",
        },
      ],
    },
    {
      id: "mobile",
      title: "Mobil & Offline",
      sub: "Installierbare App (PWA), Offline-Abgleich, mobile Brücke.",
      features: [
        {
          icon: "Zap",
          title: "Als App installierbar (PWA)",
          desc: "Als App installierbar (PWA) auf iOS, Android und Desktop — direkt aus dem Browser.",
        },
        {
          icon: "Mic",
          title: "Spracheingabe",
          desc: "Spracheingabe für Anfragen auf Mobilgerät und Desktop. Die Spracherkennung des Browsers (Web Speech API) wandelt Gesprochenes in Text um — praktisch für das Diktat nach dem Termin.",
        },
        {
          icon: "Database",
          title: "Offline-Abgleich",
          desc: "Arbeiten ohne Internet: lokale Zwischenspeicherung, Abgleich, sobald die Verbindung wieder steht.",
        },
        {
          icon: "MessageSquare",
          title: "Mobile Brücke",
          desc: "Wechsel zwischen Desktop und Mobilgerät: auf dem Handy begonnen, im Browser fortgesetzt.",
        },
        {
          icon: "Search",
          title: "Globale Volltextsuche",
          desc: "Suche über alle Akten, Dokumente, Notizen, Honorarnoten und Assistent-Verläufe — mit Filter pro Typ. Kombiniert Bedeutungssuche, Stichwortsuche und Beziehungsnetz.",
        },
        {
          icon: "Zap",
          title: "Mobiler Bearbeitungsstatus",
          desc: "KI-Abläufe mobil verfolgen: Status (läuft, abgeschlossen, fehlgeschlagen, wartet auf Prüfung), Details pro Schritt zum Aufklappen, Ergebnisansicht.",
        },
      ],
    },
    {
      id: "legal-ai",
      title: "Rechtsspezifische KI",
      sub: "Vertragsentwürfe, Vertragsvergleich, Schriftsätze, Anonymisierung.",
      features: [
        {
          icon: "FileText",
          title: "Vertragsentwürfe",
          desc: "KI-Entwürfe auf Basis von Mustern: AGB, Arbeitsverträge, Kaufverträge, Mietverträge. Entwürfe sind anwaltlich zu prüfen.",
        },
        {
          icon: "Layers",
          title: "Vertragsvergleich (Redlining)",
          desc: "Automatischer Vergleich von Vertragsversionen. Änderungen markieren, Risiken hervorheben.",
        },
        {
          icon: "EyeOff",
          title: "Anonymisierung",
          desc: "Anonymisierung für die Weitergabe an Dritte, an Gutachter oder für Publikationen: Namen, Adressen, Geburtsdaten.",
        },
        {
          icon: "FileText",
          title: "Schriftsatz-Entwürfe",
          desc: "KI-gestützte Entwürfe für Klagen, Klagebeantwortungen, Bescheidbeschwerden, Berufungen und Rekurse. Mit Fundstellen und Zitaten.",
        },
        {
          icon: "PenTool",
          title: "Entwurfs-Editor",
          desc: "Editor für Entwürfe mit Anbindung an das Kanzleiwissen: KI-Vorschläge im Text, Fundstellen-Einfügung, Klauselbibliothek, Versionsvergleich.",
        },
      ],
    },
    {
      id: "litigation",
      title: "Prozessführung",
      sub: "Phasen, Verfahrensauswertung, Judikatur-Suche, Strategie.",
      features: [
        {
          icon: "Gavel",
          title: "Prozessverwaltung",
          desc: "Strukturierte Prozessverwaltung mit Phasen und Schritten. Status pro Phase, zugewiesene Teammitglieder, Fristen und Dokumente pro Schritt.",
        },
        {
          icon: "BarChart3",
          title: "Verfahrensauswertung",
          desc: "Verfahrensdauer und Verteilung nach Gericht, Verfahrensart und Gegenseite — Statistik über die eigenen Akten, keine Prognose.",
        },
        {
          icon: "Search",
          title: "Judikatur-Suche",
          desc: "KI-gestützte Suche nach ähnlichen Fällen im Kanzleiwissen und in der Judikatur aus dem RIS. Sortiert nach Relevanz.",
        },
        {
          icon: "Zap",
          title: "Prozessstrategie",
          desc: "Strukturierte Strategie-Erfassung pro Akte: Argumentationslinien, Beweisführung, Gegenargumente. Mit KI-Vorschlägen.",
        },
      ],
    },
  ],
  arch: {
    title: "Technische Architektur",
    sub: "Betrieb, Datenhaltung und Aktualisierung im Überblick.",
    items: [
      {
        icon: "Shield",
        title: "EU-Cloud oder On-Premise",
        desc: "EU-Cloud (Hetzner) mit Auftragsverarbeitungsvertrag oder On-Premise (Enterprise).",
      },
      {
        icon: "Network",
        title: "Mehrere Wissensbasen und Quellen",
        desc: "Mehrere Wissensbasen pro Organisation, mehrere Quellen pro Wissensbasis — gemeinsam durchsuchbar.",
      },
      {
        icon: "Zap",
        title: "Echtzeit-Aktualisierung",
        desc: "Änderungen erscheinen per WebSocket in Echtzeit auf allen angemeldeten Geräten — ohne Neuladen.",
      },
    ],
  },
  cta: {
    title: "Fragen zu einer Funktion?",
    sub: "Probieren Sie die Funktionen selbst aus — 14 Tage kostenlos, ohne Kreditkarte.",
    button: "14 Tage kostenlos testen",
  },
};

export function getDocs(): DocsContent {
  return DOCS;
}
