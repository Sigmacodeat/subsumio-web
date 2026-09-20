// Features page — what Subsumio does, explained for lawyers (de-AT, Sie-Form).
// Grouped into interactive categories; each has an optional demo window.

export interface FeatureCategory {
  id: string;
  icon: string;
  label: string;
  title: string;
  intro: string;
  /** One-line summary for the "at a glance" grid — deliberately different
   *  from `intro`, so the active category never shows the same text twice. */
  glance: string;
  items: { title: string; desc: string }[];
  demo?: { windowTitle: string; lines: string[] };
}

export interface FeaturesContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  categories: FeatureCategory[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
}

export const FEATURES_PAGE: FeaturesContent = {
  metaTitle: "Subsumio Funktionen — KI-Kanzleisoftware für Rechtsanwälte in Österreich",
  metaDesc:
    "Antworten aus der Akte mit Fundstellen, Beteiligte und Zusammenhänge, Suche nach Sinn und Stichwort, nächtliche Prüfung, Assistent auf WhatsApp. Die anwaltliche Prüfung bleibt.",
  badge: "Alle Funktionen im Überblick",
  h1a: "Was Subsumio für Ihre Kanzlei erledigt.",
  h1b: "Bereich für Bereich erklärt.",
  sub: "Fünf Bereiche, ein System. Klicken Sie sich durch und sehen Sie, wie Subsumio im Kanzleialltag arbeitet.",
  categories: [
    {
      id: "synthesis",
      icon: "Brain",
      label: "Antworten aus der Akte",
      title: "Eine Antwort statt zehn Dokumenten",
      intro:
        "Eine Suche liefert Trefferlisten. Subsumio liest die Treffer und formuliert die Antwort — und sagt Ihnen, was es in den Unterlagen nicht gefunden hat.",
      glance: "Ausformulierte Antworten über mehrere Dokumente hinweg — samt Hinweis, was fehlt.",
      items: [
        {
          title: "Ausformulierte Antworten",
          desc: "Schriftsätze, Beilagen, Protokolle und Korrespondenz werden zu einer Antwort zusammengeführt — über mehrere Dokumente hinweg.",
        },
        {
          title: "Geprüfte Fundstellen",
          desc: "Zitierte Normen und Entscheidungen gleicht Subsumio mit den Rechtsquellen ab und kennzeichnet, was sich nicht bestätigen ließ.",
        },
        {
          title: "Was fehlt, steht dabei",
          desc: "Jede Antwort endet mit dem, was die Unterlagen nicht hergeben. Schweigen wird nicht als Gewissheit ausgegeben.",
        },
        {
          title: "Verhandlungs- und Terminvorbereitung",
          desc: "Fragen Sie vor dem Mandantengespräch oder der Verhandlung: letzter Kontakt, offene Zusagen, gefundene Widersprüche, was sich geändert hat.",
        },
      ],
      demo: {
        windowTitle: "Subsumio — Frage an die Akte",
        lines: [
          "Frage: Was ist in der Akte Bauer noch offen?",
          "→ 3 offene Punkte in 4 Dokumenten:",
          "  1. Vorbereitender Schriftsatz (entworfen, nicht eingebracht)",
          "  2. Gutachten von Dr. Klein (angefordert, überfällig)",
          "  3. Vergleichsrahmen mit Mandant zu bestätigen",
          "  ⚠ Lücke: keine Notiz zum Mandantengespräch am Donnerstag",
        ],
      },
    },
    {
      id: "graph",
      icon: "Network",
      label: "Beteiligte & Zusammenhänge",
      title: "Wer mit wem — ohne Datenpflege",
      intro:
        "Beim Speichern erkennt Subsumio Personen, Firmen und ihre Rollen: wer wen vertritt, wer Gegner ist, wer als Sachverständiger bestellt wurde. Fragen nach Zusammenhängen beantwortet es aus diesen Verknüpfungen, nicht per Stichwortsuche.",
      glance: "Personen, Firmen und ihre Rollen in der Akte werden beim Speichern erkannt.",
      items: [
        {
          title: "Rollen automatisch erkannt",
          desc: "Mandant, Gegner, Gegenvertreter, Sachverständige, Zeugen — beim Speichern erfasst, ohne Verschlagwortung.",
        },
        {
          title: "Fragen nach Zusammenhängen",
          desc: "„Wer ist an der Akte Bauer beteiligt?“ „Was verbindet die Hofer GmbH und Dr. Klein?“ — beantwortet aus den erkannten Verknüpfungen.",
        },
        {
          title: "Ein Eintrag je Person und Firma",
          desc: "Jede Erwähnung ergänzt den Eintrag; die nächtliche Prüfung führt Doppeltes zusammen.",
        },
      ],
      demo: {
        windowTitle: "Subsumio — Beteiligte",
        lines: [
          "Frage: Wer ist an der Akte Bauer beteiligt?",
          "→ 4 Beteiligte:",
          "  Dr. Weber (Rechtsvertreter, seit 2024)",
          "  Hofer GmbH (Gegenpartei) · 2 weitere",
          "Frage: Was verbindet die Hofer GmbH und Dr. Klein?",
          "→ Die Hofer GmbH hat Dr. Klein als Privatgutachter beauftragt (Akte Bauer)",
        ],
      },
    },
    {
      id: "retrieval",
      icon: "Search",
      label: "Suche",
      title: "Findet die Stelle, auch wenn das Wort nicht fällt",
      intro:
        "Subsumio sucht auf drei Wegen zugleich: nach dem Sinn Ihrer Frage, nach exakten Begriffen wie Geschäftszahlen oder Paragrafen und über die erkannten Zusammenhänge. Die Ergebnisse werden zu einer Reihung zusammengeführt.",
      glance:
        "Suche nach Sinn, nach exakten Begriffen und über Zusammenhänge — in einem Durchgang.",
      items: [
        {
          title: "Sinn und Stichwort kombiniert",
          desc: "Die Sinnsuche findet Umschreibungen, die Stichwortsuche exakte Begriffe. Zusammen finden sie mehr als jede für sich.",
        },
        {
          title: "Fragen nach Beziehungen",
          desc: "Geht es um Beteiligte oder Verbindungen, zieht Subsumio die erkannten Zusammenhänge heran. Einfache Nachschlagefragen bleiben einfach.",
        },
        {
          title: "Nur, was Sie sehen dürfen",
          desc: "Die Suche berücksichtigt ausschließlich Akten, für die Sie berechtigt sind.",
        },
      ],
      demo: {
        windowTitle: "Subsumio — Suche",
        lines: [
          "Frage: Wo ist von einer Mahnung die Rede?",
          "→ 3 Fundstellen in 3 Dokumenten:",
          "  Beilage B7, S. 2: „Zahlungserinnerung vom 3. Februar“",
          "  Protokoll Zeuge K., S. 14: „wurde schriftlich aufgefordert“",
          "  Klagebeantwortung, S. 6: Mahnung bestritten",
          "  Zwei Treffer kommen ohne das Wort „Mahnung“ aus",
        ],
      },
    },
    {
      id: "dream",
      icon: "Zap",
      label: "Nächtliche Prüfung",
      title: "Ihr Kanzleiwissen bleibt über Nacht in Ordnung",
      intro:
        "Jede Nacht geht Subsumio die Wissensbasis durch: Dubletten, Verweise ins Leere, widersprüchliche Angaben. Morgens sehen Sie, was aufgefallen ist.",
      glance: "Dubletten, fehlerhafte Verweise und Widersprüche werden über Nacht erkannt.",
      items: [
        {
          title: "Dubletten zusammenführen",
          desc: "Doppelte Einträge zu Personen und Firmen werden erkannt und zusammengeführt.",
        },
        {
          title: "Verweise prüfen",
          desc: "Verweise, die ins Leere zeigen oder veraltet sind, werden gefunden und korrigiert oder zur Prüfung markiert.",
        },
        {
          title: "Widersprüche erkennen",
          desc: "Widersprüchliche Angaben über Dokumente hinweg werden mit beiden Quellen markiert — etwa zwischen Schriftsatz und Zeugenaussage.",
        },
        {
          title: "Tägliche Übersicht",
          desc: "Überfällige und kritische Fristen erhalten Sie jeden Morgen per E-Mail.",
        },
      ],
      demo: {
        windowTitle: "Subsumio — über Nacht",
        lines: [
          "03:00 Nächtliche Prüfung gestartet",
          "  3 doppelte Personeneinträge zusammengeführt",
          "  12 Verweise geprüft und korrigiert",
          "  1 Widerspruch markiert (Lieferdatum: 12. März vs. „Ende April“)",
          "  Tägliche Übersicht vorbereitet: 2 Termine, 4 offene Punkte",
          "03:19 abgeschlossen",
        ],
      },
    },
    {
      id: "integrations",
      icon: "GitBranch",
      label: "Anbindungen",
      title: "Arbeitet mit dem, was Sie schon nutzen",
      intro:
        "E-Mail, Word, WhatsApp und elektronische Unterschrift sind angebunden. Subsumio ersetzt Ihre Kanzleisoftware nicht — es macht deren Inhalte abfragbar.",
      glance: "E-Mail-Import, Word-Add-in, WhatsApp Business und DocuSign.",
      items: [
        {
          title: "E-Mail-Postfach (IMAP)",
          desc: "Nachrichten und Anhänge aus Ihrem Postfach werden eingelesen und durchsuchbar.",
        },
        {
          title: "Word-Add-in",
          desc: "Arbeiten Sie direkt im Dokument, ohne das Programm zu wechseln.",
        },
        {
          title: "Assistent auf WhatsApp",
          desc: "Zeiten, Notizen, Fotos und Sprachnotizen vom Handy in die Akte — über WhatsApp Business, abschaltbar.",
        },
        {
          title: "DocuSign",
          desc: "Elektronische Unterschrift für Vollmachten und Vereinbarungen.",
        },
      ],
      demo: {
        windowTitle: "Subsumio — Posteingang",
        lines: [
          "09:12 E-Mail eingelesen: „Klagebeantwortung Hofer GmbH“",
          "  2 Anhänge abgelegt (PDF, 14 Seiten)",
          "  Zuordnung zur Akte Bauer vorgeschlagen",
          "  ⚠ Wartet auf Ihre Bestätigung",
        ],
      },
    },
  ],
  ctaTitle: "Bereit, es in Ihrer Kanzlei zu sehen?",
  ctaSub: "30 Tage testen, keine Kreditkarte.",
  ctaButton: "30 Tage kostenlos testen",
  faqTitle: "Fragen, beantwortet",
  faq: [
    {
      q: "Muss ich etwas einrichten oder ein Modell trainieren?",
      a: "Nein. Sie laden Ihre Unterlagen hoch, Subsumio liest sie ein und beantwortet Fragen aus Ihren eigenen Dokumenten. Ihre Daten werden nicht zum Training von Sprachmodellen verwendet.",
    },
    {
      q: "Funktioniert es mit meinen bestehenden Programmen?",
      a: "Subsumio übernimmt Dokumente als PDF, Word oder E-Mail-Export, ruft Ihr E-Mail-Postfach per IMAP ab und bindet WhatsApp Business, DocuSign und Word (Add-in) an. Ihre Kanzleisoftware bleibt, wie sie ist.",
    },
    {
      q: "Wie verlässlich sind die Antworten?",
      a: "Subsumio antwortet aus Ihren Unterlagen und weist aus, wenn dort etwas fehlt. Fehler sind trotzdem möglich — deshalb sind KI-Antworten als solche gekennzeichnet, und die rechtliche Beurteilung bleibt bei Ihnen.",
    },
    {
      q: "Sind meine Daten sicher?",
      a: "Ihre Daten werden verschlüsselt übertragen und gespeichert und liegen in der EU-Cloud; On-Premise gibt es im Enterprise-Tarif. Auftragsverarbeiter sind im AVV benannt. Ihre Inhalte werden nicht zum Training von Modellen verwendet.",
    },
  ],
};
