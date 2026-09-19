import { PROOF } from "@/content/proof-points";

export const copy = {
  de: {
    hero: {
      eyebrow: "Das Subsumio SuperBrain",
      title: "Über Nacht geprüft.\nAm Morgen wissen Sie, was sich in Ihren Akten geändert hat.",
      sub: "Das SuperBrain ist das Gedächtnis hinter Subsumio. Jede Nacht geht es die neuen Dokumente Ihrer Kanzlei durch und führt sie mit dem bestehenden Kanzleiwissen zusammen. Am Morgen sehen Sie in Ihrer Übersicht, was aufgefallen ist: neue Widersprüche, anstehende Fristen, fehlende Unterlagen.",
      cta: "14 Tage kostenlos testen",
      ctaSecondary: "Funktionen ansehen",
    },
    stats: [
      {
        value: 5,
        suffix: "",
        label: "Prüfschritte",
        sub: "Erfassen → Zusammenführen → Bewerten → Widerspruchsprüfung → Schlusskontrolle",
      },
      {
        value: PROOF.recall8.numeric,
        suffix: "\u00a0%",
        label: "Trefferquote beim Wiederfinden",
        sub: `So oft lag die richtige Textstelle unter den ersten acht Treffern (${PROOF.recall8.benchmark}, ${PROOF.recall8.sampleSize} Testfragen). Gemessen wird das Wiederfinden, nicht die Qualität der Antwort.`,
      },
    ],
    // ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
    othersTitle: "Allgemeine KI-Werkzeuge: fragen, antworten, vergessen",
    othersSub:
      "Sie stellen eine Frage, das Werkzeug antwortet – und beim nächsten Mal beginnt es wieder bei null. Ihre Akten kennt es nicht, frühere Antworten auch nicht.",
    othersSteps: [
      {
        label: "Frage",
        desc: "Sie fragen ein allgemeines KI-Werkzeug",
        icon: "FileSearch",
      },
      {
        label: "Antwort",
        desc: "Die Antwort entsteht ohne Kenntnis Ihrer Akten",
        icon: "Sparkles",
      },
      {
        label: "Vergessen",
        desc: "Die nächste Frage beginnt wieder ohne Zusammenhang",
        icon: "AlertTriangle",
      },
    ],
    othersPain: [
      "Widersprüche zwischen zwei Schriftsätzen fallen nur auf, wenn jemand gezielt danach sucht.",
      "Eine Frist, die in einer Beilage steht, bleibt unbemerkt, bis jemand die Beilage liest.",
      "Fehlt in der Akte eine Unterlage oder eine Gesprächsnotiz, weist niemand darauf hin.",
    ],
    // ── NARRATIVE SECTION 2: "Wie unser Gehirn arbeitet" ──
    oursTitle: "Das SuperBrain: ein Gedächtnis für Ihre Kanzlei",
    oursSub:
      "Subsumio führt Ihre Dokumente zu einem Kanzleiwissen zusammen, das über die einzelne Akte hinaus erhalten bleibt. Bevor eine Aussage dort aufgenommen wird, durchläuft sie eine zweite, unabhängige Prüfung. Je länger Sie es nutzen, desto mehr Zusammenhang steht dem SuperBrain zur Verfügung.",
    oursSteps: [
      {
        label: "Sammeln",
        desc: "Schriftsätze, E-Mails, Verträge und Notizen aus Ihren Akten",
        icon: "FileSearch",
      },
      {
        label: "Prüfen",
        desc: "Fünf Schritte vom Erfassen bis zur Schlusskontrolle",
        icon: "Layers",
      },
      {
        label: "Aufbewahren",
        desc: "Geprüfte Tatsachen, Einschätzungen und ihre Zusammenhänge bleiben im Kanzleiwissen",
        icon: "Database",
      },
      {
        label: "Antworten",
        desc: "Antworten verweisen auf die Fundstelle; was nicht belegt ist, wird gekennzeichnet",
        icon: "CheckCircle2",
      },
    ],
    oursNote: "Läuft nachts. Das Ergebnis liegt am Morgen in Ihrer Übersicht.",
    // ── 5-LAYER ARCHITECTURE ──
    architectureTitle: "Fünf Prüfschritte, bevor etwas ins Kanzleiwissen gelangt",
    architectureSub:
      "Keine Aussage wird ungeprüft übernommen. Was einen der fünf Schritte nicht besteht, wird verworfen oder zur Durchsicht markiert.",
    layers: [
      {
        icon: "FileSearch",
        title: "Erfassen",
        desc: "Aus Schriftsätzen, E-Mails und Dokumenten werden Tatsachen herausgezogen: wer, was, wann, mit welcher Unterlage belegt. Rechtlich beurteilt wird hier noch nichts.",
        detail: "Jede Tatsache behält den Verweis auf ihr Ausgangsdokument",
        color: "violet",
      },
      {
        icon: "Sparkles",
        title: "Zusammenführen",
        desc: "Die Tatsachen einer Akte werden zu einer zusammenhängenden Darstellung verbunden und den einschlägigen Rechtsquellen zugeordnet.",
        detail: "Mit Fundstellen aus Akte und Rechtsquelle",
        color: "blue",
      },
      {
        icon: "CheckCircle2",
        title: "Bewerten",
        desc: "Eine zweite, unabhängige Prüfung beurteilt jede Einschätzung: übernehmen, verwerfen oder überarbeiten. Was nicht ausreichend belegt ist, gelangt nicht ins Kanzleiwissen.",
        detail: "Mit Angabe, wie gut eine Aussage belegt ist",
        color: "emerald",
      },
      {
        icon: "AlertTriangle",
        title: "Widerspruchsprüfung",
        desc: "Nachts werden Aussagen aus verschiedenen Dokumenten gegeneinandergehalten. Passt etwas nicht zusammen, wird es markiert und Ihnen vorgelegt – nicht stillschweigend geglättet. Unklare Fälle gehen in eine weitere Prüfung.",
        detail: "Auch über mehrere Dokumente einer Akte hinweg",
        color: "amber",
      },
      {
        icon: "ShieldCheck",
        title: "Schlusskontrolle",
        desc: "Zum Schluss beurteilen zwei voneinander unabhängige Prüfungen die juristische Qualität. Es gilt die strengere der beiden Bewertungen.",
        detail: "Zwei Bewertungen, die strengere zählt",
        color: "rose",
      },
    ],
    costNote:
      "Was die fünf Schritte besteht, wird Ihnen vorgelegt. Ob Sie es verwenden, entscheiden Sie.",
    // ── DREAM CYCLE ──
    cycleTitle: "Was nachts passiert",
    cycleSub:
      "Nach Kanzleischluss arbeitet das SuperBrain die Dokumente des Tages durch. Der Ablauf ist automatisch und wird protokolliert.",
    cycleSteps: [
      {
        phase: "extract_facts",
        label: "Fakten erfassen",
        icon: "FileSearch",
        desc: "Neue Schriftsätze, E-Mails und Dokumente werden gelesen, Tatsachen mit Quellenverweis festgehalten.",
      },
      {
        phase: "synthesize",
        label: "Zusammenführen",
        icon: "Sparkles",
        desc: "Neue Tatsachen werden in die Darstellung der jeweiligen Akte eingearbeitet.",
      },
      {
        phase: "consolidate",
        label: "Doppeltes bereinigen",
        icon: "Layers",
        desc: "Dieselbe Angabe aus mehreren Dokumenten wird zu einem Eintrag zusammengelegt.",
      },
      {
        phase: "grade_takes",
        label: "Bewerten",
        icon: "Target",
        desc: "Neue Einschätzungen durchlaufen die unabhängige Prüfung.",
      },
      {
        phase: "contradiction_probe",
        label: "Widersprüche markieren",
        icon: "AlertTriangle",
        desc: "Aussagen, die einander widersprechen, werden gekennzeichnet.",
      },
      {
        phase: "deadline_monitor",
        label: "Fristen durchsehen",
        icon: "CalendarClock",
        desc: "Anstehende und überfällige Fristen werden durchgesehen.",
      },
      {
        phase: "patterns",
        label: "Muster erkennen",
        icon: "Network",
        desc: "Wiederkehrende Themen, Verbindungen und Risiken über Akten hinweg.",
      },
      {
        phase: "embed",
        label: "Auffindbar machen",
        icon: "Database",
        desc: "Neue Inhalte werden für die Suche über alle Akten aufbereitet.",
      },
    ],
    cycleNote: "Automatisch · jede Nacht · protokolliert",
    // ── KANZLEI-GEHIRN LERNT MIT ──
    // Belege: docs/architecture/BRAIN_LEARNING.md (Schalter, was er steuert,
    // was weiterläuft), src/components/dashboard/brain-learning-card.tsx.
    learningBadge: "Kanzlei-Gehirn",
    learningTitle: "Ihr Kanzlei-Gehirn lernt mit – nur für Ihre Kanzlei",
    learningSub:
      "Jedes Dokument, jede Notiz und jedes Mandat erweitert das Wissen Ihrer Kanzlei. Beim nächsten Fall finden Sie frühere Mandate mit ähnlichem Sachverhalt, Ihre eigenen Schriftsätze und die passende Rechtsprechung aus dem RIS – mit Fundstelle. Dieses Wissen liegt in dem Bereich Ihrer Kanzlei, auf den nur Sie und Ihr Team zugreifen.",
    learningPoints: [
      {
        icon: "Database",
        title: "Aus Dokumenten wird Wissen",
        desc: "Aus Schriftsätzen, E-Mails und Notizen werden Tatsachen und Einschätzungen abgeleitet und mit dem bestehenden Kanzleiwissen verknüpft – jede mit Verweis auf das Ausgangsdokument.",
      },
      {
        icon: "ScanSearch",
        title: "Ähnliche frühere Mandate finden",
        desc: "Die Suche findet vergleichbare Sachverhalte auch dann, wenn damals andere Worte verwendet wurden – über alle Akten, für die Sie berechtigt sind.",
      },
      {
        icon: "Scale",
        title: "Eigene Arbeit und Rechtsprechung zusammen",
        desc: "Der Assistent antwortet aus Ihren Akten und aus Gesetzen und Entscheidungen im RIS und nennt zu beidem die Fundstelle, damit Sie zitieren und nachprüfen können.",
      },
      {
        icon: "PenTool",
        title: "Ihre Arbeitsweise",
        desc: "Der Assistent merkt sich Vorgaben aus Gesprächen. Für Ihre Prüfleitfäden werden Ergänzungen aus unterzeichneten Verträgen vorgeschlagen – übernommen wird nur, was Sie bestätigen.",
      },
    ],
    learningSwitchTitle: "Ein Schalter für die ganze Kanzlei",
    learningSwitchOn: {
      label: "Eingeschaltet (Voreinstellung)",
      desc: "Das Kanzleiwissen wird aus Ihrer laufenden Arbeit automatisch erweitert – nach dem Hochladen und jede Nacht.",
    },
    learningSwitchOff: {
      label: "Ausgeschaltet",
      desc: "Ihre Dokumente bleiben gespeichert und voll durchsuchbar, der Assistent antwortet wie gewohnt. Es wird nur nichts Neues mehr automatisch abgeleitet. Bereits Gelerntes bleibt erhalten.",
    },
    learningSwitchNote:
      "Administratorinnen und Administratoren schalten es unter Einstellungen › Kanzleiprofil. Jede Änderung wird protokolliert.",
    learningNeverTitle: "Was dabei nie passiert",
    learningNever: [
      "Mit Ihren Daten wird kein KI-Modell trainiert – auch nicht, wenn das Kanzlei-Gehirn mitlernt.",
      "Was Ihr Kanzlei-Gehirn lernt, fließt nicht in das Wissen anderer Kanzleien ein.",
      "Andere Kanzleien sehen Ihr Kanzleiwissen nicht.",
    ],
    // ── COMPARISON ──
    compareTitle: "Allgemeine KI-Werkzeuge und das SuperBrain im Vergleich",
    compareSub: "Vier Punkte, die Sie im Test selbst nachprüfen können.",
    compareOthersLabel: "Allgemeine KI-Werkzeuge",
    compareRows: [
      {
        feature: "Fundstellen",
        others: "Antworten häufig ohne überprüfbare Quelle",
        subsumio: "Antworten verweisen auf die Stelle in Ihrer Akte oder in der Rechtsquelle",
      },
      {
        feature: "Verschwiegenheit und Hosting",
        others: "Verarbeitung je nach Anbieter auch außerhalb der EU",
        subsumio: "EU-Hosting mit Auftragsverarbeitungsvertrag (AVV)",
      },
      {
        feature: "Österreichisches Recht",
        others: "Nicht auf österreichisches Recht ausgerichtet",
        subsumio: "Rechtsquellen aus dem RIS, mit Paragraf zitiert",
      },
      {
        feature: "Gedächtnis über Akten hinweg",
        others: "Jede Frage steht für sich",
        subsumio: "Kanzleiwissen, das erhalten bleibt und jede Nacht ergänzt wird",
      },
    ],
    // ── LEGAL SOURCES ──
    finetuneBadge: "Rechtsquellen",
    finetuneTitle: "Österreichisches Recht als Grundlage",
    finetuneSub: "Subsumio arbeitet mit den Rechtsquellen, die Sie auch selbst heranziehen würden.",
    finetunePoints: [
      {
        label: "Rechtsquelle",
        value: "RIS",
        desc: "Zentrale Bundesgesetze aus dem RIS: ABGB, ZPO, EO, UGB, StGB, StPO, BAO u. a.",
      },
      {
        label: "Zitierweise",
        value: "Mit Paragraf",
        desc: "Gesetzesstellen werden mit Paragraf und Quelle angegeben, damit Sie am Originaltext nachprüfen können.",
      },
    ],
    finetuneResultLabel: "Hinweis",
    finetuneResult: "Maßgeblich bleibt der im RIS kundgemachte Gesetzestext.",
    // ── PRIVACY ──
    privacyTitle: "Wo Ihre Daten liegen und wer sie sieht",
    privacySub:
      "Das SuperBrain verarbeitet Ihre Akten in einer Umgebung, die von anderen Kanzleien getrennt ist. Wer in unserem Auftrag Daten verarbeitet, ist im Auftragsverarbeitungsvertrag (AVV) benannt.",
    privacyPoints: [
      {
        icon: "Lock",
        title: "Akten getrennt",
        desc: "Jede Akte ist logisch getrennt. Der Zugriff richtet sich nach den Rechten, die Sie in der Benutzerverwaltung vergeben.",
      },
      {
        icon: "ShieldCheck",
        title: "Kein Training mit Ihren Daten",
        desc: "Ihre Dokumente werden nicht zum Training von Modellen verwendet.",
      },
      {
        icon: "Globe",
        title: "EU-Cloud oder On-Premise",
        desc: "EU-Cloud – oder On-Premise im Enterprise-Tarif.",
      },
      {
        icon: "Eye",
        title: "Nachvollziehbar",
        desc: "Jeder Prüfschritt und jede Bewertung wird protokolliert. So sehen Sie später, wie eine Aussage zustande kam.",
      },
    ],
    // ── USE CASES ──
    useCasesTitle: "Was Sie mit dem SuperBrain machen können",
    useCasesSub: "Sechs Aufgaben, bei denen das Kanzleiwissen im Alltag hilft.",
    useCases: [
      {
        icon: "FileSearch",
        title: "Rechtsrecherche mit Fundstellen",
        desc: "Sie stellen eine Frage zum Sachverhalt. Das SuperBrain durchsucht Ihre Akten und die hinterlegten Rechtsquellen und nennt Dokument und Stelle.",
      },
      {
        icon: "FileSearch",
        title: "Vertragsprüfung",
        desc: "Verträge werden durchgesehen, Risiken markiert und Änderungen vorgeschlagen – mit Verweis auf ABGB und UGB. Was übernommen wird, entscheiden Sie.",
      },
      {
        icon: "Target",
        title: "Fristenkontrolle",
        desc: "Fristen aus neuen Dokumenten werden erkannt, berechnet und Ihnen zur Bestätigung vorgelegt. Vor Ablauf werden Sie erinnert.",
      },
      {
        icon: "Database",
        title: "Kanzleiwissen",
        desc: "Was in einem Mandat erarbeitet wurde, steht beim nächsten wieder zur Verfügung – auch ähnliche frühere Fälle und Ihre eigenen Schriftsätze, im Rahmen der Zugriffsrechte Ihrer Kanzlei.",
      },
      {
        icon: "Network",
        title: "Kollisionsprüfung",
        desc: "Neue Beteiligte werden mit bestehenden Mandaten abgeglichen, damit mögliche Interessenkonflikte früh auffallen.",
      },
      {
        icon: "TrendingUp",
        title: "Berichte an Mandanten",
        desc: "Zusammenfassungen und Sachstandsberichte entstehen aus der Akte. Sie prüfen den Entwurf und geben ihn frei.",
      },
    ],
    useCasesLink: "Alle Funktionen ansehen",
    // ── TRUST & COMPLIANCE ──
    trustTitle: "Berufsrecht und Datenschutz",
    trustSub:
      "Diese Vorgaben haben wir beim Bau des SuperBrain berücksichtigt. Die berufsrechtliche Verantwortung bleibt bei Ihnen.",
    trustBadges: [
      { label: "§ 9 Abs. 2 RAO", desc: "Verschwiegenheit" },
      { label: "§ 10 RAO", desc: "Kollisionsprüfung vor Mandatsannahme" },
      { label: "§§ 131, 132 BAO", desc: "Aufbewahrung 7 Jahre" },
      { label: "DSGVO", desc: "AVV nach Art. 28" },
    ],
    integrationsTitle: "Anbindungen",
    integrations: [
      { name: "E-Mail-Postfach (IMAP)", desc: "Eingang wird der Akte zugeordnet" },
      { name: "WhatsApp Business", desc: "Mandantenkommunikation" },
      { name: "Word-Add-in", desc: "Arbeiten direkt im Dokument" },
      { name: "DocuSign", desc: "Elektronische Unterschrift" },
      { name: "SSO/SAML", desc: "Zentrale Anmeldung (Enterprise)" },
    ],
    securityLink: "Sicherheit im Detail",
    // ── FAQ ──
    faqTitle: "Häufige Fragen",
    faqSub: "Sechs Fragen, die Kanzleien vor dem Test stellen.",
    faq: [
      {
        q: "Was passiert nachts mit meinen Daten?",
        a: "Das SuperBrain geht die Dokumente durch, die tagsüber neu in Ihre Akten gekommen sind: Tatsachen werden erfasst, mit dem bestehenden Kanzleiwissen zusammengeführt und auf Widersprüche geprüft. Ihre Daten liegen dabei in der EU-Cloud oder, im Enterprise-Tarif, On-Premise. Der Ablauf wird protokolliert.",
      },
      {
        q: "Lernt Subsumio aus meinen Akten – und wird damit KI trainiert?",
        a: "Ihr Kanzlei-Gehirn lernt aus Ihren Akten: Tatsachen, Einschätzungen und Verknüpfungen werden abgeleitet und stehen Ihnen beim nächsten Mandat zur Verfügung. Das bleibt im Bereich Ihrer Kanzlei. Ein KI-Modell wird damit nicht trainiert, und nichts davon fließt in das Wissen anderer Kanzleien ein.",
      },
      {
        q: "Kann ich das Mitlernen abschalten?",
        a: "Ja. Unter Einstellungen › Kanzleiprofil schalten Administratorinnen und Administratoren „Kanzlei-Gehirn lernt mit“ für die ganze Kanzlei aus. Dokumente bleiben durchsuchbar und der Assistent antwortet weiter; es wird nur nichts Neues mehr automatisch abgeleitet. Was sich der Assistent gemerkt hat, sehen und löschen Sie unter Einstellungen › Gedächtnis des Assistenten.",
      },
      {
        q: "Wer sieht meine Daten?",
        a: "In Ihrer Kanzlei die Personen, denen Sie in der Benutzerverwaltung Zugriff geben. Andere Kanzleien sehen Ihre Daten nicht. Auftragsverarbeiter sind im AVV nach Art. 28 DSGVO benannt; Einzelheiten zu Zugriffen durch unseren Betrieb finden Sie auf der Seite „Sicherheit“ und im AVV.",
      },
      {
        q: "Was kostet es?",
        a: "Das SuperBrain ist in jedem Tarif enthalten: Solo 249 €/Monat (1 Nutzer), Kanzlei 1.499 €/Monat inkl. 5 Nutzer, Enterprise auf Anfrage. Mehrverbrauch wird vorab ausgewiesen. Sie können 14 Tage kostenlos testen, ohne Kreditkarte.",
      },
      {
        q: "Was, wenn Subsumio sich irrt?",
        a: "Das kann vorkommen. Deshalb nennt Subsumio zu seinen Aussagen die Fundstelle, damit Sie am Dokument oder am Gesetzestext nachprüfen können, und kennzeichnet, was sich nicht belegen lässt. Subsumio ist ein Hilfsmittel: Die anwaltliche Prüfung und die Verantwortung für das Ergebnis bleiben bei Ihnen.",
      },
    ],
    pricingLink: "Preise ansehen",
    // ── STICKY CTA ──
    stickyCtaText: "14 Tage kostenlos testen",
    stickyCtaHint: "Ohne Kreditkarte",
    ctaTitle: "Testen Sie das SuperBrain mit Ihren eigenen Akten",
    ctaSub:
      "Ab der ersten Akte baut sich Ihr Kanzleiwissen auf. Nach der ersten Nacht sehen Sie, was dem SuperBrain aufgefallen ist.",
    ctaButton: "14 Tage kostenlos testen",
    ctaContact: "Schreiben Sie uns – wir antworten persönlich.",
  },
};

export type SuperbrainCopy = typeof copy;
export type SuperbrainCopyDe = SuperbrainCopy["de"];

export function getCopy() {
  return copy.de;
}

export function superbrainFaq(): readonly { q: string; a: string }[] {
  return getCopy().faq;
}
