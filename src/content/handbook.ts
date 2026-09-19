/**
 * Subsumio Handbuch — Inhalte.
 *
 * Regeln (docs/design/audit/WEBSITE_FAKTENBLATT.md, WEBSITE_TEXTREGELN.md):
 * nur Österreich, Sie-Form, keine Technikbegriffe, jede Aussage hat einen
 * Code-Beleg (Datei in der Kommentarzeile über dem Kapitel). Was nicht belegt
 * ist, steht hier nicht.
 */

export type HandbookReplica =
  | "overview"
  | "matter"
  | "deadline-register"
  | "deadline-calculator"
  | "reminders"
  | "calendar-conflicts"
  | "conflict-check"
  | "assistant"
  | "invoice"
  | "trust"
  | "import";

export interface HandbookChapter {
  id: string;
  title: string;
  /** Ein Satz: wofür ist das da? */
  lead: string;
  /** Wo im Produkt (Pfad der Seitenleiste). */
  where: string;
  /** Link in das Produkt. */
  href: string;
  replica?: HandbookReplica;
  replicaCaption?: string;
  steps?: { title: string; body: string }[];
  facts?: { term: string; body: string }[];
  note?: string;
}

export interface HandbookGroup {
  id: string;
  title: string;
  chapters: HandbookChapter[];
}

export const HANDBOOK_META = {
  eyebrow: "Handbuch",
  title: "Subsumio Handbuch",
  lead: "Wie Sie mit Subsumio arbeiten — von der ersten Akte bis zur Honorarnote. Jedes Kapitel zeigt die Ansicht so, wie Sie sie im Produkt sehen.",
  updated: "Stand: September 2026",
  searchPlaceholder: "Suchen, z. B. Vorfrist oder RATG",
};

export const HANDBOOK: HandbookGroup[] = [
  {
    id: "grundlagen",
    title: "Grundlagen",
    chapters: [
      // src/app/dashboard/onboarding, src/lib/kanzlei-import, src/app/dashboard/team
      {
        id: "erste-schritte",
        title: "Erste Schritte",
        lead: "In fünf Schritten von der Anmeldung zur arbeitsfähigen Kanzlei.",
        where: "Nach der Registrierung · Einrichtung",
        href: "/dashboard/onboarding",
        steps: [
          {
            title: "Kanzlei anlegen",
            body: "Nach der Registrierung führt Sie die Einrichtung durch Kanzleiname, Rechtsgebiete und Ihre Rolle. Sie können jeden Schritt überspringen und später in den Einstellungen nachholen.",
          },
          {
            title: "Bestand übernehmen",
            body: "Akten, Kontakte, Fristen und Zeiten übernehmen Sie per CSV- oder Excel-Datei. Vor dem Import sehen Sie Zeile für Zeile, was angelegt wird — nichts wird überschrieben.",
          },
          {
            title: "Postfach verbinden",
            body: "Verbinden Sie das Kanzleipostfach, damit eingehende E-Mails den Akten zugeordnet werden. Der Zugriff ist nur lesend.",
          },
          {
            title: "Team einladen",
            body: "Laden Sie Kolleginnen, Kollegen und die Kanzleiassistenz per E-Mail ein und vergeben Sie Rollen.",
          },
          {
            title: "Erste Frage stellen",
            body: "Öffnen Sie den Assistenten und fragen Sie zu einer Akte. Jede Antwort nennt ihre Fundstellen.",
          },
        ],
      },
      // src/app/dashboard/page.tsx, src/lib/overview-agenda.ts
      {
        id: "uebersicht",
        title: "Übersicht",
        lead: "Ihr Arbeitstag auf einer Seite: was fällig ist, was wartet und woran Sie zuletzt gearbeitet haben.",
        where: "Seitenleiste › Übersicht",
        href: "/dashboard",
        replica: "overview",
        replicaCaption:
          "„Mein Tag“: Kennzahlen, Fristen und Termine nach Tagen, offene Punkte und aktive Akten.",
        facts: [
          {
            term: "Fristen & Termine",
            body: "Überfälliges steht immer oben. Darunter folgen die nächsten 14 Tage, nach Kalendertagen geordnet — Vorfristen erscheinen als eigener Eintrag. Ist in diesem Zeitraum nichts fällig, zeigt die Liste, was danach kommt.",
          },
          {
            term: "Zu erledigen",
            body: "Eingänge ohne Zuordnung, Freigaben, ausstehende Unterschriften, Dokumente ohne Akte, offene Rechnungen und fällige Treuhand-Abgleiche. Es erscheint nur, was tatsächlich offen ist.",
          },
          {
            term: "Aktive Akten",
            body: "Die zuletzt bearbeiteten offenen Akten mit Aktenzeichen, Mandant, Rechtsgebiet und der jeweils nächsten Frist.",
          },
          {
            term: "Kanzlei",
            body: "Die zweite Ansicht zeigt Kennzahlen der Kanzlei — Umsatz und neue Akten der letzten sechs Monate — und lässt sich anpassen.",
          },
        ],
      },
      // src/components/dashboard/command-palette.tsx, keyboard-shortcuts.tsx, topbar.tsx
      {
        id: "navigation",
        title: "Navigation & Tastatur",
        lead: "Alles ist zwei Tastendrücke entfernt.",
        where: "Kopfzeile · überall",
        href: "/dashboard",
        facts: [
          {
            term: "⌘ K / Strg K",
            body: "Öffnet die Suche über Akten, Kontakte, Fristen und Funktionen. Geben Sie ein Aktenzeichen oder einen Namen ein und springen Sie direkt hin.",
          },
          {
            term: "Neu",
            body: "Über „Neu“ in der Kopfzeile legen Sie von jeder Seite aus eine Akte, Frist, Rechnung oder Signaturanfrage an.",
          },
          {
            term: "Seitenleiste",
            body: "Oben die täglichen Bereiche, darunter die Gruppen Mandate & Beteiligte, Termine & Aufgaben, Dokumente & Wissen und Honorar & Finanzen. „Alle Funktionen anzeigen“ blendet selten genutzte Werkzeuge ein.",
          },
          {
            term: "Hilfe",
            body: "Das Hilfe-Symbol öffnet zu jeder Seite eine kurze Erklärung und den passenden Abschnitt in diesem Handbuch.",
          },
        ],
      },
    ],
  },
  {
    id: "akten-fristen",
    title: "Akten & Fristen",
    chapters: [
      // src/app/dashboard/cases, src/components/legal/matter-tabs/*
      {
        id: "akten",
        title: "Akten",
        lead: "Die Akte bündelt Beteiligte, Fristen, Dokumente, E-Mails, Zeiten und Notizen eines Mandats.",
        where: "Seitenleiste › Akten",
        href: "/dashboard/cases",
        replica: "matter",
        replicaCaption:
          "Eine Akte mit Kopfdaten, Registern und dem automatisch geführten Aktenblatt.",
        steps: [
          {
            title: "Akte anlegen",
            body: "„Neue Akte“ fragt Mandant, Gegner, Gericht und Rechtsgebiet ab. Beim Speichern läuft die Kollisionsprüfung gegen alle bestehenden Akten und Kontakte.",
          },
          {
            title: "Dokumente ablegen",
            body: "Ziehen Sie Schriftsätze, Beilagen oder E-Mails in die Akte. Texte werden erkannt, Fristen im Dokument als Vorschlag angeboten.",
          },
          {
            title: "Arbeiten und festhalten",
            body: "Zeiten, Telefonnotizen und Aufgaben erfassen Sie direkt in der Akte — sie landen automatisch in Honorarnote und Aktenverlauf.",
          },
        ],
        facts: [
          {
            term: "Register",
            body: "Überblick, Fristen & Aufgaben, Dokumente, E-Mails, Beteiligte, Beweismittel, Notizen, Telefonnotizen, Strategie, Abrechnung und Verlauf.",
          },
          {
            term: "Aktenblatt",
            body: "Jede neue Akte erhält ein Aktenblatt mit den Stammdaten, das der Assistent als Ausgangspunkt nutzt.",
          },
          {
            term: "Archivieren",
            body: "Abgeschlossene Akten werden archiviert, nicht gelöscht — die Aufbewahrungspflicht von sieben Jahren (§ 132 BAO) bleibt gewahrt.",
          },
        ],
      },
      // src/app/dashboard/deadlines, fristenbuch, src/lib/legal/frist-engine.ts, vorfrist.ts
      {
        id: "fristen",
        title: "Fristen & Fristenbuch",
        lead: "Jede Frist mit Rechtsgrundlage, Vorfrist und Vier-Augen-Prüfung — im Fristenbuch chronologisch für die ganze Kanzlei.",
        where: "Seitenleiste › Fristen · Termine & Aufgaben › Fristenbuch",
        href: "/dashboard/fristenbuch",
        replica: "deadline-register",
        replicaCaption:
          "Das Fristenbuch: Notfristen hervorgehoben, Vorfrist und Prüfstatus in jeder Zeile.",
        steps: [
          {
            title: "Frist anlegen oder übernehmen",
            body: "Legen Sie eine Frist von Hand an, lassen Sie sie aus Zustelldatum und Fristart berechnen oder übernehmen Sie einen Vorschlag aus einem Dokument oder eingefügten Text.",
          },
          {
            title: "Prüfen und freigeben",
            body: "Automatisch erkannte Fristen sind „Ungeprüft“, bis eine berechtigte Person sie freigibt. Notfristen verlangen eine zweite Prüfung.",
          },
          {
            title: "Erledigen",
            body: "Erledigte Fristen verlassen die Übersicht und bleiben im Fristenbuch nachvollziehbar. Eine Notfrist lässt sich erst nach der Zweitprüfung durch eine zweite Person als erledigt vermerken.",
          },
        ],
        facts: [
          {
            term: "Notfrist",
            body: "Nicht erstreckbare Fristen (§ 128 Abs 1 ZPO) werden rot markiert und in der Übersicht immer zuerst genannt.",
          },
          {
            term: "Vorfrist",
            body: "Standard ist eine Woche vor Fristende, auf den davorliegenden Werktag gezogen. Die Vorfrist ist in der Frist einstellbar.",
          },
          {
            term: "Ampel",
            body: "Überfällig, kritisch (höchstens zwei Werktage bis Fristende), Vorfrist erreicht oder in Ordnung.",
          },
          {
            term: "Kalender-Export",
            body: "Fristen und Termine exportieren Sie als Kalenderdatei für Outlook, Apple- oder Google-Kalender — mit Erinnerung zur Vorfrist und zwei Tage vor Fristende.",
          },
        ],
      },
      // src/lib/legal/frist-engine.ts (berechneFristAuto)
      {
        id: "fristenrechner",
        title: "Fristenrechner",
        lead: "Berechnet das Fristende aus Zustellung und Fristart — mit Feiertagen, verhandlungsfreier Zeit und Zustellfiktionen.",
        where: "Fristen › Frist berechnen",
        href: "/dashboard/deadlines",
        replica: "deadline-calculator",
        replicaCaption:
          "Probieren Sie es aus: Dieser Rechner verwendet dieselbe Berechnung wie das Produkt.",
        facts: [
          {
            term: "Fristenlauf",
            body: "Tages-, Wochen- und Monatsfristen nach §§ 124–126 ZPO; endet eine Frist an einem Samstag, Sonntag oder Feiertag, endet sie am nächsten Werktag.",
          },
          {
            term: "Verhandlungsfreie Zeit",
            body: "15. Juli bis 17. August und 24. Dezember bis 6. Jänner hemmen Rechtsmittelfristen nach § 222 ZPO — außer in Ferialsachen.",
          },
          {
            term: "Zustellung",
            body: "ERV-Zustellung gilt am folgenden Werktag als bewirkt (§ 89a GOG), Hinterlegung mit dem ersten Tag der Abholfrist (§ 17 Abs 3 ZustG).",
          },
          {
            term: "Verwaltungsverfahren",
            body: "Für Fristen nach dem AVG gelten zusätzlich Karfreitag und 24. Dezember als fristhemmende Endtage (§ 33 Abs 2 AVG).",
          },
        ],
        note: "Der Rechner unterstützt Ihre Berechnung; maßgeblich bleibt die anwaltliche Prüfung im Einzelfall.",
      },
      // src/lib/deadline-reminders.ts, src/app/api/cron/deadline-reminders/route.ts
      {
        id: "erinnerungen",
        title: "Erinnerungen & Vorfristen",
        lead: "Subsumio erinnert gestuft, bis die Frist erledigt ist — per E-Mail, in der App und auf dem Telefon.",
        where: "Automatisch · Einstellungen › Benachrichtigungen",
        href: "/dashboard/settings",
        replica: "reminders",
        replicaCaption:
          "Eine Notfrist und ihre Erinnerungen: Vorfrist, dann 7, 3 und 1 Tag vorher und am Tag selbst.",
        facts: [
          {
            term: "Stufen",
            body: "7 Tage, 3 Tage, 1 Tag vorher und am Fälligkeitstag. Die Vorfrist erinnert einmal, sobald sie erreicht ist.",
          },
          {
            term: "Kanäle",
            body: "E-Mail an die zuständigen Personen (sobald der Mailversand der Kanzlei eingerichtet ist), Benachrichtigung in der App und auf dem Telefon; auf Wunsch zusätzlich per WhatsApp.",
          },
          {
            term: "Was nicht erinnert",
            body: "Erledigte, stornierte oder verworfene Fristen. Eine übersprungene Stufe wird nicht nachgeholt, damit keine veraltete Warnung kommt.",
          },
        ],
      },
      // src/app/dashboard/calendar, src/lib/calendar-conflicts.ts
      {
        id: "kalender",
        title: "Kalender & Terminkollisionen",
        lead: "Termine und Fristen in einem Kalender — Überschneidungen erkennt Subsumio, bevor sie zum Problem werden.",
        where: "Termine & Aufgaben › Kalender",
        href: "/dashboard/calendar",
        replica: "calendar-conflicts",
        replicaCaption:
          "Eine Woche mit zwei überschneidenden Terminen und einer Frist am Verhandlungstag.",
        facts: [
          {
            term: "Überschneidung",
            body: "Zwei Termine, die sich zeitlich überlappen, werden am Tag und am Eintrag markiert. Schon beim Anlegen eines Termins warnt Subsumio vor der Überschneidung.",
          },
          {
            term: "Frist am Verhandlungstag",
            body: "Fällt eine Frist auf einen Tag mit Verhandlung oder Tagsatzung, weist der Kalender darauf hin, damit Sie die Frist rechtzeitig vorziehen.",
          },
          {
            term: "Ansichten",
            body: "Monat oder Woche; Fristen gelb, Notfristen rot, Verhandlungen blau, Termine grau. Ein Klick auf eine Frist öffnet die Akte.",
          },
          {
            term: "Outlook",
            body: "Ist ein Microsoft-365-Konto verbunden, werden neue Termine nach Outlook übertragen.",
          },
        ],
      },
      // src/app/dashboard/tasks, wiedervorlagen
      {
        id: "aufgaben",
        title: "Aufgaben & Wiedervorlagen",
        lead: "Was keine Frist ist, aber nicht vergessen werden darf.",
        where: "Termine & Aufgaben › Aufgaben · Wiedervorlagen",
        href: "/dashboard/wiedervorlagen",
        facts: [
          {
            term: "Aufgaben",
            body: "Angelegt und abgehakt werden Aufgaben in der Akte; die Aufgabenliste zeigt alle Aufgaben aller Akten mit Fälligkeit, überfällige zuerst.",
          },
          {
            term: "Wiedervorlagen",
            body: "Legen Sie eine Akte zu einem Datum wieder vor; fällige Wiedervorlagen stehen gesammelt in der Liste und im Tagesbriefing.",
          },
        ],
      },
    ],
  },
  {
    id: "mandanten",
    title: "Mandanten & Kommunikation",
    chapters: [
      // src/app/dashboard/kollisionspruefung, src/lib/contact-conflict.ts
      {
        id: "kollisionspruefung",
        title: "Kollisionsprüfung",
        lead: "Prüft vor jeder Mandatsübernahme, ob ein Interessenkonflikt nach § 10 RAO besteht.",
        where: "Mandate & Beteiligte › Kollisionsprüfung",
        href: "/dashboard/kollisionspruefung",
        replica: "conflict-check",
        replicaCaption:
          "Ein Name, zwei Treffer: als Gegner in einer offenen Akte und als ähnlicher Name.",
        facts: [
          {
            term: "Umfang",
            body: "Die Prüfung läuft über alle Akten und Kontakte der Kanzlei — Mandanten, Gegner und sonstige Beteiligte, auch ältere und archivierte Akten.",
          },
          {
            term: "Ähnliche Namen",
            body: "Auch Teiltreffer und Schreibvarianten werden angezeigt, jeweils mit Rolle und Akte.",
          },
          {
            term: "Bei der Aktenanlage",
            body: "Die Prüfung läuft beim Anlegen einer Akte automatisch mit; das Ergebnis wird in der Akte vermerkt.",
          },
        ],
        note: "Die Kollisionsprüfung unterstützt die Pflichtprüfung nach § 10 RAO, sie ersetzt sie nicht.",
      },
      // src/app/dashboard/contacts, intake, kyc, src/lib/sanctions*
      {
        id: "mandanten",
        title: "Mandanten, Mandatsannahme & Identifizierung",
        lead: "Vom ersten Kontakt bis zum identifizierten Mandanten — mit den Sorgfaltspflichten nach RAO.",
        where: "Mandate & Beteiligte › Kontakte · Mandatsaufnahme",
        href: "/dashboard/intake",
        facts: [
          {
            term: "Mandatsannahme",
            body: "Anfragen werden erfasst, geprüft und erst nach Annahme und Identifizierung zur Akte.",
          },
          {
            term: "Identifizierung",
            body: "Die Sorgfaltspflichten nach §§ 8b ff. RAO — Ausweis, Geburtsdatum, wirtschaftliche Eigentümer — werden je Mandant dokumentiert; fehlende Angaben zeigt Subsumio an.",
          },
          {
            term: "Sanktionslisten",
            body: "Namen werden gegen die konsolidierte EU-Finanzsanktionsliste abgeglichen; die Liste wird wöchentlich aktualisiert.",
          },
        ],
      },
      // src/lib/email/imap-sync.ts, mail-filing.ts
      {
        id: "posteingang",
        title: "Posteingang & E-Mail",
        lead: "E-Mails aus dem Kanzleipostfach landen in der richtigen Akte — mit Anhängen und Fristvorschlägen.",
        where: "Seitenleiste › Posteingang",
        href: "/dashboard/communications",
        facts: [
          {
            term: "Postfach",
            body: "Verbindung per IMAP, Abruf alle fünf Minuten, nur lesend. Antworten versenden Sie über den Server Ihres Postfachs.",
          },
          {
            term: "Zuordnung",
            body: "Eine E-Mail wird nur dann automatisch einer Akte zugeordnet, wenn die Zuordnung eindeutig ist; sonst entscheiden Sie.",
          },
          {
            term: "Anhänge und Fristen",
            body: "Anhänge werden in der Akte abgelegt; Datumsangaben mit Fristbezug werden als Vorschlag angeboten, nie automatisch übernommen.",
          },
          {
            term: "Antwortentwurf",
            body: "Der Assistent formuliert auf Wunsch einen Antwortentwurf. Gesendet wird nur, was Sie selbst absenden.",
          },
        ],
      },
      // src/app/portal, shared-spaces, document-requests
      {
        id: "mandantenportal",
        title: "Mandantenportal & Unterlagen",
        lead: "Ein sicherer Raum pro Mandat für Dokumente, Nachrichten und Unterschriften.",
        where: "Mandate & Beteiligte › Mandantenportal · Dokumentenanfragen",
        href: "/dashboard/client-portal",
        facts: [
          {
            term: "Freigabe",
            body: "Mandanten sehen nur, was Sie ausdrücklich freigeben.",
          },
          {
            term: "Unterlagen anfordern",
            body: "Fordern Sie Unterlagen gezielt an; Subsumio erinnert den Mandanten und legt Eingänge in der Akte ab.",
          },
        ],
      },
    ],
  },
  {
    id: "wissen",
    title: "Dokumente & Wissen",
    chapters: [
      // src/app/dashboard/vault, upload
      {
        id: "dokumente",
        title: "Dokumente",
        lead: "Hochladen, erkennen, zuordnen — jedes Dokument wird durchsuchbar.",
        where: "Dokumente & Wissen › Dokumente · Hochladen",
        href: "/dashboard/vault",
        facts: [
          {
            term: "Texterkennung",
            body: "Auch eingescannte PDFs werden durchsuchbar. Dokumente, deren Erkennung noch läuft oder geprüft werden sollte, zeigt die Übersicht unter „Dokumente zu prüfen“.",
          },
          {
            term: "Fristerkennung",
            body: "Datumsangaben mit Fristbezug werden erkannt und als ungeprüfte Frist vorgeschlagen — mit Stelle im Dokument.",
          },
          {
            term: "Formate",
            body: "PDF, Word, Excel, PowerPoint, OpenDocument, E-Mails (.eml, .msg), Bilder inklusive Handyfotos (HEIC), Tonaufnahmen und ZIP-Archive.",
          },
        ],
      },
      // src/components/legal/CitationPanel.tsx, src/lib/use-grounded-answer.ts, src/lib/legal-grounding.ts
      {
        id: "assistent",
        title: "Assistent & Fundstellen",
        lead: "Fragen zu Akte und Rechtslage — jede Antwort mit überprüften Fundstellen.",
        where: "Seitenleiste › Assistent · Seitenpanel auf jeder Seite",
        href: "/dashboard/chat",
        replica: "assistant",
        replicaCaption:
          "Eine Antwort mit Fundstellen: jede zitierte Norm wird gegen den Gesetzestext geprüft.",
        facts: [
          {
            term: "Fundstellen",
            body: "Zitierte Normen und Entscheidungen werden nach der Antwort gegen die Rechtsquellen (RIS) geprüft und als geprüft oder ungeprüft gekennzeichnet.",
          },
          {
            term: "Aktenbezug",
            body: "Mit einer gewählten Akte antwortet der Assistent aus deren Dokumenten und nennt, wo verfügbar, die Seite im Dokument.",
          },
          {
            term: "Kennzeichnung",
            body: "Jede Ausgabe ist als KI-Entwurf gekennzeichnet und anwaltlich zu prüfen.",
          },
          {
            term: "Seitenpanel",
            body: "Mit dem Assistenten-Symbol rechts oben öffnen Sie ihn neben jeder Seite — mit dem Kontext der Akte, in der Sie gerade arbeiten.",
          },
        ],
      },
      // docs/architecture/BRAIN_LEARNING.md, src/components/dashboard/brain-learning-card.tsx,
      // src/app/api/settings/brain-learning, src/app/dashboard/settings/memory
      {
        id: "kanzlei-gehirn",
        title: "Kanzlei-Gehirn",
        lead: "Das Wissen Ihrer Kanzlei wächst mit jeder Akte — und bleibt in Ihrer Kanzlei.",
        where: "Einstellungen › Kanzleiprofil › Kanzlei-Gehirn lernt mit",
        href: "/dashboard/settings/kanzlei",
        facts: [
          {
            term: "Was dazulernt",
            body: "Aus Ihren Dokumenten und Notizen werden Tatsachen und Einschätzungen abgeleitet — kurz nach dem Hochladen und jede Nacht. Der Assistent merkt sich Vorgaben aus Gesprächen; für Prüfleitfäden werden Ergänzungen aus unterzeichneten Verträgen vorgeschlagen, die Sie bestätigen.",
          },
          {
            term: "Wofür",
            body: "Beim nächsten Mandat finden Sie ähnliche frühere Fälle, Ihre eigenen Schriftsätze und die passende Rechtsprechung aus dem RIS gemeinsam — mit Fundstelle.",
          },
          {
            term: "Abschalten",
            body: "Administratorinnen und Administratoren schalten „Kanzlei-Gehirn lernt mit“ für die ganze Kanzlei aus. Dokumente bleiben durchsuchbar, der Assistent antwortet weiter; es wird nur nichts Neues mehr automatisch abgeleitet. Bereits Gelerntes bleibt erhalten. Jede Änderung wird protokolliert.",
          },
          {
            term: "Gedächtnis des Assistenten",
            body: "Was sich der Assistent gemerkt hat, sehen, heften und löschen Sie unter Einstellungen › Gedächtnis des Assistenten. Eigene Vorgaben können Sie dort jederzeit eintragen.",
          },
          {
            term: "Kein Training",
            body: "Mit Ihren Daten wird kein KI-Modell trainiert. Was Ihr Kanzlei-Gehirn lernt, fließt nicht in das Wissen anderer Kanzleien ein.",
          },
        ],
      },
      // src/app/dashboard/research
      {
        id: "recherche",
        title: "Rechtsrecherche",
        lead: "Österreichisches Recht und Rechtsprechung durchsuchen, mit Quellenangabe.",
        where: "Seitenleiste › Rechtsrecherche",
        href: "/dashboard/research",
        facts: [
          {
            term: "Quellen",
            body: "Bundes- und Landesrecht sowie Entscheidungen von OGH, VfGH und VwGH aus dem RIS.",
          },
          {
            term: "Ergebnis",
            body: "Treffer mit Fundstelle und Verweis auf die Quelle im RIS.",
          },
        ],
      },
      // src/app/dashboard/drafting, templates, src/app/api/word-export
      {
        id: "schriftsaetze",
        title: "Schriftsätze & Vorlagen",
        lead: "Entwürfe aus Akte und Vorlage — bearbeitet in Subsumio oder Word.",
        where: "Dokumente & Wissen › Schriftsätze · Vorlagen",
        href: "/dashboard/drafting",
        facts: [
          {
            term: "Entwurf",
            body: "Der Assistent erstellt Entwürfe aus Aktendaten und Ihren Vorlagen; Fundstellen werden wie im Assistenten geprüft.",
          },
          {
            term: "Word",
            body: "Export als Word-Dokument; mit dem Word-Add-in arbeiten Sie direkt in Word mit der Akte.",
          },
          {
            term: "Vorlagen",
            body: "Eigene Vorlagen und Klauseln der Kanzlei, nach Rechtsgebiet geordnet.",
          },
        ],
      },
    ],
  },
  {
    id: "honorar",
    title: "Honorar & Finanzen",
    chapters: [
      // src/app/dashboard/time, time-suggestions
      {
        id: "zeiterfassung",
        title: "Zeiterfassung",
        lead: "Leistungen erfassen, wo sie entstehen — und keine vergessen.",
        where: "Honorar & Finanzen › Zeiten",
        href: "/dashboard/time",
        facts: [
          {
            term: "Erfassen",
            body: "Mit Stoppuhr oder nachträglich, immer mit Aktenbezug und Tätigkeitsbeschreibung.",
          },
          {
            term: "Vorschläge",
            body: "Aus bearbeiteten Dokumenten, E-Mails, Telefonaten und Besprechungen schlägt Subsumio Zeiteinträge vor, die Sie bestätigen oder verwerfen.",
          },
        ],
      },
      // src/lib/legal/ratg.ts, src/lib/e-invoice/*
      {
        id: "rechnungen",
        title: "Honorar nach RATG & Rechnungen",
        lead: "Leistungen nach Tarifpost verrechnen und als PDF oder E-Rechnung versenden.",
        where: "Honorar & Finanzen › Rechnungen",
        href: "/dashboard/invoicing",
        replica: "invoice",
        replicaCaption:
          "Eine Honorarnote mit Leistungen nach RATG, Einheitssatz und 20 % Umsatzsteuer.",
        facts: [
          {
            term: "RATG",
            body: "Tarifposten 1 bis 3C mit Einheitssatz, ERV-Kosten und Streitgenossenzuschlag nach § 15 RATG — auf Basis der aktuellen Valorisierung.",
          },
          {
            term: "Zeithonorar",
            body: "Erfasste Zeiten übernehmen Sie mit Stundensatz direkt in die Rechnung.",
          },
          {
            term: "Rechnungsnummern",
            body: "Fortlaufend und lückenlos, vergeben beim Ausstellen.",
          },
          {
            term: "E-Rechnung",
            body: "ebInterface für österreichische Empfänger, außerdem XRechnung und ZUGFeRD.",
          },
        ],
      },
      // src/lib/trust-accounting*, docs/architecture/TRUST_AND_AML.md
      {
        id: "treuhand",
        title: "Treuhandkonten",
        lead: "Fremdgeld je Akte führen — nachvollziehbar und nach RAO.",
        where: "Honorar & Finanzen › Treuhandkonto",
        href: "/dashboard/trust-accounting",
        replica: "trust",
        replicaCaption:
          "Buchungen je Akte: fortlaufend nummeriert, Korrekturen nur als Gegenbuchung.",
        facts: [
          {
            term: "Unveränderlich",
            body: "Buchungen werden fortlaufend nummeriert und nie überschrieben; eine Korrektur ist eine Gegenbuchung.",
          },
          {
            term: "Je Akte",
            body: "Auszahlungen sind nur bis zum Guthaben der jeweiligen Akte möglich.",
          },
          {
            term: "Hinweis ab 40.000 €",
            body: "Ab diesem Betrag weist Subsumio auf die Meldepflicht nach § 10a Abs 2 RAO hin.",
          },
          {
            term: "Abgleich",
            body: "Der Quartalsabgleich wird vermerkt; ein fälliger Abgleich erscheint in der Übersicht.",
          },
        ],
      },
    ],
  },
  {
    id: "kanzlei",
    title: "Kanzlei & Sicherheit",
    chapters: [
      // src/lib/qes/*, src/lib/docusign*
      {
        id: "signatur",
        title: "Elektronische Signatur",
        lead: "Qualifiziert signieren mit ID Austria oder A-Trust — oder Unterschriften einholen.",
        where: "Dokumente & Wissen › Signatur",
        href: "/dashboard/signature",
        facts: [
          {
            term: "Qualifizierte Signatur",
            body: "Mit ID Austria oder A-Trust-Karte; die qualifizierte elektronische Signatur ist der eigenhändigen Unterschrift gleichgestellt.",
          },
          {
            term: "Unterschriften einholen",
            body: "Signaturanfragen an Mandanten per DocuSign oder über das Mandantenportal; das signierte Dokument wird in der Akte abgelegt.",
          },
        ],
      },
      // src/app/dashboard/team, settings
      {
        id: "team",
        title: "Team & Rollen",
        lead: "Jede Person sieht, was sie für ihre Arbeit braucht.",
        where: "Benutzerverwaltung › Team",
        href: "/dashboard/team",
        facts: [
          {
            term: "Rollen",
            body: "Kanzleileitung (Verwaltung und Abrechnung), Anwältin bzw. Anwalt und Kanzleiassistenz. Mandanten haben nur Zugang zum Portal.",
          },
          {
            term: "Einladung",
            body: "Per E-Mail; wer einer Kanzlei beitritt, arbeitet in deren Akten und Kontingent.",
          },
          {
            term: "Aktenzugriff",
            body: "Einzelne Akten lassen sich auf bestimmte Personen beschränken.",
          },
        ],
      },
      // src/lib/auth/*, src/lib/audit*, src/app/api/data-export
      {
        id: "sicherheit",
        title: "Sicherheit & Datenschutz",
        lead: "Verschwiegenheit nach § 9 RAO ist die Grundlage — technisch umgesetzt.",
        where: "Einstellungen › Sicherheit",
        href: "/dashboard/settings",
        facts: [
          {
            term: "Anmeldung",
            body: "Zwei-Faktor-Anmeldung mit Authenticator-App und Wiederherstellungscodes; Single Sign-on für größere Kanzleien.",
          },
          {
            term: "Protokoll",
            body: "Zugriffe und Änderungen werden in einem manipulationssicheren Protokoll festgehalten.",
          },
          {
            term: "Hosting",
            body: "Rechenzentren in der EU; auf Wunsch Betrieb in der eigenen Kanzlei.",
          },
          {
            term: "Datenexport",
            body: "Die Daten Ihres Kontos lassen sich jederzeit als Datei exportieren (Art. 15/20 DSGVO).",
          },
        ],
      },
      // src/lib/kanzlei-import/*
      {
        id: "import",
        title: "Datenübernahme",
        lead: "Bestandsdaten aus Ihrer bisherigen Software übernehmen — ohne Risiko.",
        where: "Einstellungen › Kanzlei-Import",
        href: "/dashboard/import-kanzlei",
        replica: "import",
        replicaCaption:
          "Die Vorschau vor dem Import: jede Zeile mit Ergebnis, bestehende Akten werden übersprungen.",
        facts: [
          {
            term: "Dateien",
            body: "CSV (auch mit Windows-Zeichensatz) und Excel-Dateien für Akten, Kontakte, Fristen und Zeiten.",
          },
          {
            term: "Vorschau",
            body: "Vor dem Import sehen Sie jede Zeile mit dem Ergebnis. Bestehende Aktenzeichen werden übersprungen, nie überschrieben.",
          },
          {
            term: "Rückgängig",
            body: "Unter „Letzte Importe“ nehmen Sie einen Import vollständig zurück.",
          },
        ],
      },
    ],
  },
];

export const HANDBOOK_FAQ: { q: string; a: string }[] = [
  {
    q: "Übernimmt Subsumio Fristen automatisch?",
    a: "Nein. Erkannte Fristen sind Vorschläge und bleiben „Ungeprüft“, bis eine berechtigte Person sie freigibt. Notfristen verlangen eine zweite Prüfung.",
  },
  {
    q: "Woher kommen die Rechtsquellen?",
    a: "Aus dem Rechtsinformationssystem des Bundes (RIS): Bundes- und Landesrecht sowie Entscheidungen der Höchstgerichte. Zitate in Antworten werden gegen diese Quellen geprüft.",
  },
  {
    q: "Wer kann meine Akten sehen?",
    a: "Nur Mitglieder Ihrer Kanzlei mit entsprechender Rolle. Mandanten sehen im Portal ausschließlich, was Sie freigeben.",
  },
  {
    q: "Versendet der Assistent E-Mails oder Schriftsätze selbstständig?",
    a: "Nein. Der Assistent erstellt Entwürfe. Versendet oder eingebracht wird nur, was Sie selbst freigeben.",
  },
  {
    q: "Lernt Subsumio aus meinen Akten?",
    a: "Ihr Kanzlei-Gehirn lernt aus Ihren Akten, damit Sie beim nächsten Mandat auf frühere Arbeit zurückgreifen. Das bleibt in Ihrer Kanzlei, trainiert kein KI-Modell und lässt sich unter Einstellungen › Kanzleiprofil abschalten.",
  },
  {
    q: "Kann ich meine Daten mitnehmen?",
    a: "Ja. Der Datenexport liefert Ihre Kontodaten als Datei; Ihre Originaldokumente können Sie jederzeit aus der Akte herunterladen.",
  },
];

/** Dashboard route → Handbuch chapter, for the help panel's "im Handbuch" link. */
const ROUTE_CHAPTERS: Array<[prefix: string, chapter: string]> = [
  ["/dashboard/kollisionspruefung", "kollisionspruefung"],
  ["/dashboard/fristenbuch", "fristen"],
  ["/dashboard/deadlines", "fristen"],
  ["/dashboard/calendar", "kalender"],
  ["/dashboard/tasks", "aufgaben"],
  ["/dashboard/wiedervorlagen", "aufgaben"],
  ["/dashboard/cases", "akten"],
  ["/dashboard/contacts", "mandanten"],
  ["/dashboard/intake", "mandanten"],
  ["/dashboard/kyc", "mandanten"],
  ["/dashboard/communications", "posteingang"],
  ["/dashboard/email-import", "posteingang"],
  ["/dashboard/client-portal", "mandantenportal"],
  ["/dashboard/document-requests", "mandantenportal"],
  ["/dashboard/vault", "dokumente"],
  ["/dashboard/upload", "dokumente"],
  ["/dashboard/chat", "assistent"],
  ["/dashboard/research", "recherche"],
  ["/dashboard/drafting", "schriftsaetze"],
  ["/dashboard/templates", "schriftsaetze"],
  ["/dashboard/time", "zeiterfassung"],
  ["/dashboard/invoicing", "rechnungen"],
  ["/dashboard/trust-accounting", "treuhand"],
  ["/dashboard/signature", "signatur"],
  ["/dashboard/team", "team"],
  ["/dashboard/import-kanzlei", "import"],
  ["/dashboard/settings/kanzlei", "kanzlei-gehirn"],
  ["/dashboard/settings/memory", "kanzlei-gehirn"],
  ["/dashboard/settings", "sicherheit"],
  ["/dashboard/onboarding", "erste-schritte"],
];

export function handbookChapterForRoute(pathname: string): { id: string; title: string } | null {
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return { id: "uebersicht", title: "Übersicht" };
  }
  const hit = ROUTE_CHAPTERS.find(([prefix]) => pathname.startsWith(prefix));
  if (!hit) return null;
  const chapter = HANDBOOK.flatMap((g) => g.chapters).find((c) => c.id === hit[1]);
  return chapter ? { id: chapter.id, title: chapter.title } : null;
}
