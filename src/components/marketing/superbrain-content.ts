import { TRIAL_DAYS } from "@/lib/billing/credit-constants";
import { deepMerge, type Market } from "@/content/site";

const copyAt = {
  hero: {
    eyebrow: "Das Subsumio SuperBrain",
    title:
      "Ein Gedächtnis für Ihre Kanzlei.\nMit Fundstellen, Widerspruchsprüfung und Judikatur-Wächter.",
    sub: "Das SuperBrain ist das Gedächtnis hinter Subsumio. Neue Dokumente werden nach dem Hochladen erfasst, mit dem bestehenden Kanzleiwissen zusammengeführt und innerhalb der Akte auf Widersprüche geprüft. Jede Nacht sucht der Judikatur-Wächter nach neuen Entscheidungen zu den Normen Ihrer Akten, vor Fristablauf werden Sie erinnert. Den Akten-Scan starten Sie bei Bedarf – mit Kostenvorschau.",
    cta: "30 Tage kostenlos testen",
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
      value: TRIAL_DAYS,
      suffix: "",
      label: "Tage kostenlos testen",
      sub: "Mit Ihren eigenen Akten, ohne Kreditkarte.",
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
  oursNote: "Läuft nach jedem Hochladen. Ergebnisse legt Subsumio Ihnen zur Prüfung vor.",
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
      desc: "Nach dem Hochladen in eine Akte werden Aussagen aus verschiedenen Dokumenten gegeneinandergehalten. Passt etwas nicht zusammen, wird es markiert und Ihnen vorgelegt – nicht stillschweigend geglättet. Unklare Fälle gehen in eine weitere Prüfung.",
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
  cycleTitle: "Was automatisch läuft – und was Sie anstoßen",
  cycleSub:
    "Manches erledigt das SuperBrain von selbst, anderes starten Sie bewusst. Die Abläufe werden protokolliert.",
  cycleSteps: [
    {
      phase: "extract_facts",
      label: "Nach dem Hochladen: erfassen",
      icon: "FileSearch",
      desc: "Neue Schriftsätze, E-Mails und Dokumente werden gelesen, Tatsachen mit Quellenverweis festgehalten.",
    },
    {
      phase: "contradiction_probe",
      label: "Nach dem Hochladen: Widersprüche",
      icon: "AlertTriangle",
      desc: "Aussagen, die anderen Dokumenten derselben Akte widersprechen, werden gekennzeichnet und Ihnen vorgelegt.",
    },
    {
      phase: "embed",
      label: "Nach dem Hochladen: auffindbar",
      icon: "Database",
      desc: "Neue Inhalte werden für die Suche über alle Akten aufbereitet, für die Sie berechtigt sind.",
    },
    {
      phase: "deadline_detect",
      label: "Fristen vorschlagen",
      icon: "CalendarClock",
      desc: "Fristen aus neuen Dokumenten werden erkannt und Ihnen zur Bestätigung vorgelegt.",
    },
    {
      phase: "judikatur_watch",
      label: "Jede Nacht: Judikatur-Wächter",
      icon: "Gavel",
      desc: "Sucht nach neuen Entscheidungen zu den Normen, die in Ihren Akten vorkommen, und meldet Treffer.",
    },
    {
      phase: "deadline_reminders",
      label: "Täglich: Fristen-Erinnerungen",
      icon: "Clock",
      desc: "Vor Ablauf bestätigter Fristen werden Sie und Ihr Team erinnert.",
    },
    {
      phase: "case_scan",
      label: "Auf Abruf: Akten-Scan",
      icon: "ScanSearch",
      desc: "Sie starten ihn für eine Akte, eine Auswahl oder alle offenen Akten – nach einer Kostenvorschau in Credits.",
    },
    {
      phase: "review",
      label: "Ihre Freigabe",
      icon: "CheckCircle2",
      desc: "Ergebnisse erscheinen als Prüfpunkte. In die Akte wird nichts ohne Ihre Bestätigung übernommen.",
    },
  ],
  cycleNote: "Nach dem Hochladen · Judikatur-Wächter jede Nacht · Akten-Scan auf Abruf",
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
    desc: "Das Kanzleiwissen wird aus Ihrer laufenden Arbeit automatisch erweitert – nach dem Hochladen neuer Dokumente.",
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
      subsumio: "Kanzleiwissen, das erhalten bleibt und mit jedem Dokument ergänzt wird",
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
      q: "Was passiert automatisch mit meinen Daten?",
      a: "Nach dem Hochladen werden Tatsachen erfasst, mit dem bestehenden Kanzleiwissen zusammengeführt und innerhalb der Akte auf Widersprüche geprüft. Nachts sucht der Judikatur-Wächter nach neuen Entscheidungen zu den Normen Ihrer Akten; dabei werden keine KI-Modelle aufgerufen. Einen Akten-Scan mit KI starten Sie selbst, nach einer Kostenvorschau. Ihre Daten liegen in der EU-Cloud oder, im Enterprise-Tarif, On-Premise. Die Abläufe werden protokolliert.",
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
      a: "Das SuperBrain ist in jedem Tarif enthalten: Solo 249 €/Monat (1 Nutzer), Kanzlei 1.499 €/Monat inkl. 5 Nutzer, Enterprise auf Anfrage. Mehrverbrauch wird vorab ausgewiesen. Sie können 30 Tage kostenlos testen, ohne Kreditkarte.",
    },
    {
      q: "Was, wenn Subsumio sich irrt?",
      a: "Das kann vorkommen. Deshalb nennt Subsumio zu seinen Aussagen die Fundstelle, damit Sie am Dokument oder am Gesetzestext nachprüfen können, und kennzeichnet, was sich nicht belegen lässt. Subsumio ist ein Hilfsmittel: Die anwaltliche Prüfung und die Verantwortung für das Ergebnis bleiben bei Ihnen.",
    },
  ],
  pricingLink: "Preise ansehen",
  // ── STICKY CTA ──
  stickyCtaText: "30 Tage kostenlos testen",
  stickyCtaHint: "Ohne Kreditkarte",
  ctaTitle: "Testen Sie das SuperBrain mit Ihren eigenen Akten",
  ctaSub:
    "Ab der ersten Akte baut sich Ihr Kanzleiwissen auf. Schon nach dem ersten Hochladen sehen Sie, was dem SuperBrain aufgefallen ist.",
  ctaButton: "30 Tage kostenlos testen",
  ctaContact: "Schreiben Sie uns – wir antworten persönlich.",
};

// German-market copy: genuine DE legal references (§ 43a BRAO instead of
// §§ 9/10 RAO, gesetze-im-internet.de instead of RIS, BGB/HGB instead of
// ABGB/UGB, § 147 AO instead of §§ 131/132 BAO).
const copyDe = deepMerge(copyAt, {
  hero: {},
  compareRows: copyAt.compareRows.map((r) =>
    r.feature === "Österreichisches Recht"
      ? {
          feature: "Deutsches Recht",
          others: "Nicht auf deutsches Recht ausgerichtet",
          subsumio: "Rechtsquellen von gesetze-im-internet.de, mit Paragraf zitiert",
        }
      : r
  ),
  finetuneTitle: "Deutsches Recht als Grundlage",
  finetunePoints: [
    {
      label: "Rechtsquelle",
      value: "gesetze-im-internet.de",
      desc: "Bundesgesetze von gesetze-im-internet.de: BGB, ZPO, HGB, StGB, StPO, AO u. a. — paragraphgenau hinterlegt.",
    },
    copyAt.finetunePoints[1],
  ],
  finetuneResult: "Maßgeblich bleibt der im Bundesgesetzblatt kundgemachte Gesetzestext.",
  trustBadges: [
    { label: "§ 43a Abs. 2 BRAO", desc: "Verschwiegenheit" },
    { label: "§ 43a Abs. 4 BRAO", desc: "Kollisionsprüfung vor Mandatsannahme" },
    { label: "§ 147 AO", desc: "Aufbewahrung" },
    { label: "DSGVO", desc: "AVV nach Art. 28" },
  ],
  learningSub:
    "Jedes Dokument, jede Notiz und jedes Mandat erweitert das Wissen Ihrer Kanzlei. Beim nächsten Fall finden Sie frühere Mandate mit ähnlichem Sachverhalt, Ihre eigenen Schriftsätze und die passende Rechtsprechung deutscher Gerichte – mit Fundstelle. Dieses Wissen liegt in dem Bereich Ihrer Kanzlei, auf den nur Sie und Ihr Team zugreifen.",
  learningPoints: copyAt.learningPoints.map((pt) => ({
    ...pt,
    desc: pt.desc.replace(
      "aus Gesetzen und Entscheidungen im RIS",
      "aus Gesetzen von gesetze-im-internet.de und deutscher Rechtsprechung"
    ),
  })),
  useCases: copyAt.useCases.map((u) => ({
    ...u,
    desc: u.desc.replace("ABGB und UGB", "BGB und HGB"),
  })),
});

export const copy = { at: copyAt, de: copyDe } as const;

export type SuperbrainCopy = typeof copy;
export type SuperbrainCopyDe = SuperbrainCopy["de"];

export function getCopy(market: Market = "at") {
  return copy[market];
}

export function superbrainFaq(market: Market = "at"): readonly { q: string; a: string }[] {
  return getCopy(market).faq;
}
