import { type Lang, applyReplacements, AT_REPLACEMENTS } from "./site";

export interface SolutionContent {
  slug: string;
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  painsTitle: string;
  pains: { title: string; desc: string }[];
  featuresTitle: string;
  features: { icon: string; title: string; desc: string }[];
  proofTitle: string;
  proof: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

export type SolutionSlug = "law-firms" | "solo" | "in-house" | "mid-sized";

export const SOLUTION_SLUGS: SolutionSlug[] = ["law-firms", "solo", "in-house", "mid-sized"];

/** Short cross-link labels for the "not quite right for you?" switcher on every
 *  /solutions/* page — same icons as the header mega-nav (site.ts), kept here
 *  since this is the solutions domain file. */
const _crossLinksDe = {
  "law-firms": { label: "Für Kanzleien", icon: "Landmark" },
  solo: { label: "Für Einzelanwälte", icon: "User" },
  "in-house": { label: "Für Justiziariate", icon: "Building2" },
  "mid-sized": { label: "Für Mittelständische", icon: "Users" },
};

const _crossLinksEn = {
  "law-firms": { label: "For Law Firms", icon: "Landmark" },
  solo: { label: "For Solo Lawyers", icon: "User" },
  "in-house": { label: "For In-House", icon: "Building2" },
  "mid-sized": { label: "For Mid-Sized Firms", icon: "Users" },
};

export const SOLUTION_CROSS_LINKS: Record<
  Lang,
  Record<SolutionSlug, { label: string; icon: string }>
> = {
  en: _crossLinksEn,
  de: _crossLinksDe,
  at: _crossLinksDe,
  ch: _crossLinksDe,
  it: {
    "law-firms": { label: "Per Studi Legali", icon: "Landmark" },
    solo: { label: "Per Avvocati Singoli", icon: "User" },
    "in-house": { label: "Per In-House", icon: "Building2" },
    "mid-sized": { label: "Per Studi Medi", icon: "Users" },
  },
  es: {
    "law-firms": { label: "Para Bufetes", icon: "Landmark" },
    solo: { label: "Para Abogados Individuales", icon: "User" },
    "in-house": { label: "Para In-House", icon: "Building2" },
    "mid-sized": { label: "Para Bufetes Medianos", icon: "Users" },
  },
  pl: {
    "law-firms": { label: "Dla Kancelarii", icon: "Landmark" },
    solo: { label: "Dla Samodzielnych Adwokatów", icon: "User" },
    "in-house": { label: "Dla In-House", icon: "Building2" },
    "mid-sized": { label: "Dla Średnich Kancelarii", icon: "Users" },
  },
  fr: {
    "law-firms": { label: "Pour Cabinets", icon: "Landmark" },
    solo: { label: "Pour Avocats Indépendants", icon: "User" },
    "in-house": { label: "Pour In-House", icon: "Building2" },
    "mid-sized": { label: "Pour Cabinets Moyens", icon: "Users" },
  },
  nl: {
    "law-firms": { label: "Voor Advocatenkantoren", icon: "Landmark" },
    solo: { label: "Voor Zelfstandige Advocaten", icon: "User" },
    "in-house": { label: "Voor In-House", icon: "Building2" },
    "mid-sized": { label: "Voor Mid-Sized Kantoren", icon: "Users" },
  },
};

const _solutionsDe = {
  "law-firms": {
    slug: "law-firms",
    metaTitle: "Subsumio für Kanzleien — KI-Kanzleisoftware mit Fundstellen",
    metaDesc:
      "Gemeinsames Kanzlei-Brain, automatische Fristenkontrolle, KI-Analysen mit Zitaten, Kollisionsprüfung, WhatsApp-Copilot — DSGVO-konform, EU-gehostet.",
    badge: "Für etablierte Kanzleien",
    h1a: "Das Wissen deiner Kanzlei,",
    h1b: "endlich abfragbar.",
    sub: "Subsumio macht Jahrzehnte an Akten, Schriftsätzen und Fristen zu einem belegten Workspace, den dein gesamtes Team befragen kann — mit Vertraulichkeit per Architektur.",
    painsTitle: "Was Kanzleipartner nachts wach hält",
    pains: [
      {
        title: "Wissen in Silos",
        desc: "Jeder Anwalt trägt sein Aktenwissen im Kopf und im Postfach. Wenn jemand geht, gehen Jahre an Kontext mit.",
      },
      {
        title: "Fristenrisiko",
        desc: "Notfristen per Hand oder Excel berechnet. Eine versäumte Notfrist und der Haftpflichtfall ist real.",
      },
      {
        title: "US-Clouds sind ein No-Go",
        desc: "Mandantenakten in einem US-gehosteten KI-Tool? Verschwiegenheitspflicht und Mandanten sagen Nein.",
      },
    ],
    featuresTitle: "Für kanzleiweite Wirkung gebaut",
    features: [
      {
        icon: "Brain",
        title: "Gemeinsames Kanzlei-Brain",
        desc: "Jede Akte, jeder Schriftsatz, jede Mail und Frist indiziert und von jedem Anwalt der Kanzlei abfragbar. Neue Mitarbeiter sind in Minuten statt Monaten eingearbeitet.",
      },
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle nach ZPO & BGB",
        desc: "Notfristen und Berufungsfristen mit korrekter Monatsarithmetik und Wochenend-Verschiebung — inkl. Normzitat.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
        desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft, bevor das Mandat angenommen wird. Deckt § 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH) ab.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Mandat",
        desc: "Zugriff pro Akte und Nutzer gescoped — fuzz-getestet, null Leaks zwischen Akten oder Teams.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp-Kanzlei-Copilot",
        desc: "Anwälte buchen Zeiten, legen Dokumente ab, schicken Sprachnotizen vom Handy. Alles landet in der richtigen Akte.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Auslagen, Rechnungen & DATEV",
        desc: "Minuten nach Anwalt/Tätigkeit buchen, Rechnungen aus offener Arbeit erstellen, DATEV-ready exportieren.",
      },
      {
        icon: "ShieldCheck",
        title: "Dein Server, deine Jurisdiktion",
        desc: "Self-hosted auf Kanzlei-Hardware oder EU-Cloud mit AVV. Mandantendaten verlassen nie deine Kontrolle.",
      },
      {
        icon: "Search",
        title: "Jede Behauptung belegt",
        desc: "Antworten zitieren die exakten Fundstellen. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht.",
      },
    ],
    proofTitle: "Engine-Klasse Retrieval, kein Chat-Wrapper",
    proof:
      "Der Retrieval-Kern erreicht 97,9 % Recall@5 mit Hybrid-Suche und Wissensgraph — auf Infrastruktur, die deine IT komplett steuert.",
    faq: [
      {
        q: "Wie lange dauert die Einführung?",
        a: "Ein Pilot mit einer abgeschlossenen Akte dauert unter einer Stunde. Das volle Kanzlei-Rollout dauert typischerweise eine Woche — dein Team indiziert bestehende Akten im eigenen Tempo.",
      },
      {
        q: "Können wir auf eigenen Servern laufen?",
        a: "Ja. Die volle Engine läuft self-hosted auf Kanzlei-Hardware mit lokalem Speicher. Enterprise-Pläne unterstützen On-Prem mit eigenem LLM-Gateway.",
      },
      {
        q: "Was ist mit DSGVO und Berufsrecht?",
        a: "Self-hosted heißt: Daten verlassen deine Infrastruktur nicht. Gehostete Pläne kommen mit EU-Hosting und AVV. Wir sprechen die Sprache deines Datenschutzbeauftragten.",
      },
      {
        q: "Was unterscheidet das von Harvey?",
        a: "Harvey ist exzellent — und läuft auf fremder Cloud und fremdem Modell. Subsumio liefert dieselbe Synthese-Qualität auf Infrastruktur, die DU kontrollierst, mit einem WhatsApp-Copilot, den deine Anwälte täglich nutzen.",
      },
    ],
    ctaTitle: "Starte mit einer abgeschlossenen Akte als Pilot.",
    ctaSub: "Keine Mandantendaten müssen das Haus verlassen. Drei Minuten bis zur ersten Antwort.",
    ctaButton: "Kostenlos testen",
  },
  solo: {
    slug: "solo",
    metaTitle: "Subsumio für Einzelanwälte — KI-Anwaltssoftware, keine IT nötig",
    metaDesc:
      "KI-Anwaltssoftware für Einzelkanzleien: Akten-Brain, automatische Fristenkontrolle, belegte KI-Antworten, WhatsApp-Copilot. EU-gehostet, kein IT-Aufwand.",
    badge: "Für Einzelanwälte",
    h1a: "Deine gesamte Praxis,",
    h1b: "eine Frage entfernt.",
    sub: "Subsumio gibt einem Einzelanwalt, was das Wissens-Team einer Großkanzlei hätte: jedes Dokument, jede Frist und Notiz indiziert und abfragbar — mit Zitaten, die du überprüfen kannst.",
    painsTitle: "Der Alltag des Einzelanwalts",
    pains: [
      {
        title: "Du bist das Wissens-Team",
        desc: "Keine Associates für Recherche, keine IT-Abteilung für Infrastruktur. Jede gesparte Admin-Minute ist eine Minute für Mandanten.",
      },
      {
        title: "Fristen sind existentiell",
        desc: "Eine versäumte Notfrist und der Haftpflichtfall ist real. Du brauchst Fristenberechnung, die nach Gesetz korrekt ist, nicht nach Bauchgefühl.",
      },
      {
        title: "Admin frisst deinen Tag",
        desc: "Zeitbuchung, Rechnungen, Dokumentenablage — der Overhead der Praxisführung stiehlt abrechenbare Stunden.",
      },
    ],
    featuresTitle: "Alles, was eine Einzelpraxis braucht",
    features: [
      {
        icon: "Brain",
        title: "Dein Akten-Brain",
        desc: "Akten, Mails, PDFs, Sprachnotizen hochladen. Subsumio indiziert alles und antwortet in normaler Sprache — mit seitengenauen Zitaten.",
      },
      {
        icon: "CalendarClock",
        title: "Fristen, automatisch",
        desc: "Notfristen nach ZPO/BGB/ABGB mit korrekter Arithmetik und Wochenend-Verschiebung. Täglicher E-Mail-Digest für kritische Fristen.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp-Copilot",
        desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy. Alles landet in der richtigen Akte — ohne App-Wechsel.",
      },
      {
        icon: "Calculator",
        title: "Zeiten & Rechnungen",
        desc: "Minuten buchen, Rechnungen aus offener Arbeit erstellen, DATEV-ready exportieren. Admin in Sekunden, nicht Stunden.",
      },
      {
        icon: "Zap",
        title: "Kein Server, keine IT",
        desc: "Anmelden, Brain läuft — voll verwaltet, keine API-Keys, keine Infrastruktur. Du fokussierst dich auf Recht, nicht auf Sysadmin.",
      },
      {
        icon: "ShieldCheck",
        title: "Vertraulichkeit by Design",
        desc: "EU-gehostet mit Verschlüsselung pro Kunde. Deine Mandantendaten werden nie zum Training geteilter Modelle genutzt. Self-Hosting optional.",
      },
    ],
    proofTitle: "Großkanzlei-Fähigkeit, Einzelanwalt-Preis",
    proof:
      "Dieselbe Retrieval-Engine, die etablierte Kanzleien bedient — 97,9 % Recall@5, Hybrid-Suche, Wissensgraph — zu einem Preis, den ein Einzelanwalt mit der ersten gesparten Stunde rechtfertigen kann.",
    faq: [
      {
        q: "Muss ich technisch versiert sein?",
        a: "Nein. Anmelden, Dokumente hochladen, Fragen stellen. Wenn du WhatsApp und einen Browser bedienen kannst, kannst du Subsumio nutzen.",
      },
      {
        q: "Kann ich mir das als Einzelanwalt leisten?",
        a: "Der Pro-Plan kostet 890 €/Seat/Monat — weniger als zwei abrechenbare Stunden. Der 14-Tage-Reverse-Trial bedeutet: Du siehst den echten Wert, bevor du zahlst.",
      },
      {
        q: "Was, wenn ich später wachse?",
        a: "Upgraden auf Team jederzeit möglich. Dein Brain und alle indizierten Daten bleiben — keine Migration, kein Downtime.",
      },
    ],
    ctaTitle: "Deine Praxis. Dein Brain.",
    ctaSub:
      "Drei Minuten bis zur ersten belegten Antwort. Keine Kreditkarte, kein Server, keine IT.",
    ctaButton: "Demo anfragen",
  },
  "in-house": {
    slug: "in-house",
    metaTitle: "Subsumio für Justiziariate — Legal Ops mit audit-ready Gedächtnis",
    metaDesc:
      "KI-Kanzleisoftware für Justiziariate: Vertragsanalyse, Compliance-Tracking, Wissensmanagement mit Zitaten. EU-gehostet oder self-hosted.",
    badge: "Für Justiziariate und Rechtsabteilungen",
    h1a: "Deine Rechtsabteilung,",
    h1b: "mit Gedächtnis.",
    sub: "Subsumio gibt Justiziariaten, was sie nie hatten: jeden Vertrag, jedes Compliance-Dokument und jede Rechtsmeinung indiziert, abfragbar und audit-fähig — belegte Antworten in Sekunden statt tagelanger Dokumentensuche.",
    painsTitle: "Der Justiziariats-Alltag",
    pains: [
      {
        title: "Vertrags-Chaos",
        desc: "Hunderte Verträge über Geschäftsbereiche hinweg, jeder mit anderen Verlängerungsdaten, Haftungsgrenzen und Kündigungsfristen. Den einen finden, der zählt, dauert Tage.",
      },
      {
        title: "Compliance-Druck",
        desc: "AI Act, DSGVO, branchenspezifische Regeln — die Compliance-Landschaft ändert sich schneller, als jedes Team manuell verfolgen kann.",
      },
      {
        title: "Externe Anwaltskosten",
        desc: "Jede externe Rechtsfrage kostet Tausende. Dein Team muss die routinemäßigen intern beantworten, bevor sie externe Rechnungen werden.",
      },
    ],
    featuresTitle: "Für Legal Operations gebaut",
    features: [
      {
        icon: "FolderOpen",
        title: "Vertrags-Intelligenz",
        desc: "Massenanalyse von Verträgen: Verlängerungsdaten, Haftungsgrenzen, Kündigungsfristen und Anomalien über das gesamte Portfolio.",
      },
      {
        icon: "ShieldAlert",
        title: "Compliance-Tracking",
        desc: "Regulatorische Anforderungen auf interne Richtlinien mappen. Lücken tracken, Fristen flaggen, Audit-Trail für Aufsicht und Regulierer.",
      },
      {
        icon: "Brain",
        title: "Institutionelles Gedächtnis",
        desc: "Jede Rechtsmeinung, jedes Memo und jede externe Anwaltsantwort indiziert und abfragbar. Neue Teammitglieder in Minuten up to speed.",
      },
      {
        icon: "Search",
        title: "Antwort vor externer Anfrage",
        desc: "Erst Subsumio fragen — wenn die Antwort in deinen Dokumenten liegt, sparst du die externe Anwaltsrechnung. Wenn nicht, weißt du genau, was fehlt.",
      },
      {
        icon: "Layers",
        title: "Trennung pro Bereich",
        desc: "Zugriff pro Geschäftsbereich und Nutzer — HR-Recht, M&A-Recht, IP-Recht sehen nur, was sie sollen.",
      },
      {
        icon: "ShieldCheck",
        title: "Audit-ready by Design",
        desc: "Jede Anfrage und Antwort mit Quellen protokolliert. Wenn der Auditor fragt: 'Wie bist du zu diesem Schluss gekommen?', ist die Spur da.",
      },
    ],
    proofTitle: "Von reaktiv zu proaktiv",
    proof:
      "Der Retrieval-Kern erreicht 97,9 % Recall@5 — wenn du fragst 'welche Verträge haben automatische Verlängerung im Q3?', bekommst du die komplette Antwort, keine Teilmenge.",
    faq: [
      {
        q: "Wie integriert das in unser DMS?",
        a: "Subsumio importiert aus Shared Drives, SharePoint und via API. Dokument-Metadaten (Autor, Datum, Akte) bleiben beim Indizieren erhalten.",
      },
      {
        q: "Können wir kontrollieren, welches Team was sieht?",
        a: "Ja. Zugriff ist pro Akte und Nutzer gescoped. HR-Recht kann M&A-Recht nicht sehen und umgekehrt — fuzz-getestet, null Leaks.",
      },
      {
        q: "Was ist mit dem AI Act und interner AI-Governance?",
        a: "Subsumio liefert Quellzitate für jede Antwort, Gap-Analyse für Transparenz und vollständige Audit-Logs. Das aligniert mit AI-Act-Transparenzanforderungen für interne Tools.",
      },
    ],
    ctaTitle: "Gib deinem Rechtsteam eine Antwortmaschine.",
    ctaSub:
      "Starte mit einem Vertragsportfolio als Pilot. Keine Daten müssen deine Infrastruktur verlassen.",
    ctaButton: "Demo anfragen",
  },
  "mid-sized": {
    slug: "mid-sized",
    metaTitle:
      "Subsumio für Mittelständische Kanzleien — schlanke Teams, überproportionale Wirkung",
    metaDesc:
      "KI-Kanzleisoftware für mittelständische Kanzleien: gemeinsames Brain, Fristenautomatisierung, WhatsApp-Copilot, Kollisionsprüfung. EU-gehostet.",
    badge: "Für mittelständische Kanzleien",
    h1a: "Großkanzlei-Fähigkeit,",
    h1b: "mittelständisches Budget.",
    sub: "Subsumio gibt einer 10-50-Anwalt-Kanzlei die Wissensinfrastruktur einer 200-Anwalt-Kanzlei — jede Akte, Frist und Schriftsatz indiziert und abfragbar, mit Vertraulichkeit per Architektur.",
    painsTitle: "Die Herausforderung mittelständischer Kanzleien",
    pains: [
      {
        title: "Mehr mit weniger",
        desc: "Du konkurrierst mit Großkanzleien um dieselben Mandanten, hast aber einen Bruchteil der Köpfe. Jeder Effizienzgewinn ist ein Wettbewerbsvorteil.",
      },
      {
        title: "Wissen ist fragmentiert",
        desc: "Jeder Anwalt pflegt sein eigenes System — Ordner, Notizen, Postfach-Regeln. Bei Urlaub oder Weggang werden Akten zu Black Boxes.",
      },
      {
        title: "IT ist ein Limit, kein Enabler",
        desc: "Keine dedizierte IT-Abteilung für Legal Tech. Du brauchst Tools, die out-of-the-box funktionieren, keine Projekte mit sechswöchiger Implementierung.",
      },
    ],
    featuresTitle: "Überproportionale Wirkung für schlanke Teams",
    features: [
      {
        icon: "Brain",
        title: "Ein gemeinsames Brain",
        desc: "Jedes Akte, Schriftsatz und Notiz in einem indizierten Workspace. Ein neuer Associate findet den Schriftsatz von 2023 in Sekunden, nicht indem er drei Leute fragt.",
      },
      {
        icon: "CalendarClock",
        title: "Fristenkontrolle für die ganze Kanzlei",
        desc: "Zentraler Fristenkalender mit Ansicht pro Anwalt. Notfristberechnung nach ZPO/BGB/ABGB — keine Excel-Verfolgung mehr.",
      },
      {
        icon: "ShieldAlert",
        title: "Kollisionsprüfung in Sekunden",
        desc: "Neuer Mandant oder Gegner gegen den gesamten Aktenbestand geprüft vor Annahme — automatisiert, nicht manuell.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp-Copilot für jeden Anwalt",
        desc: "Zeitbuchung, Dokumentenablage, Sprachnotizen vom Handy. Das Tool, das deine Anwälte täglich nutzen, nicht ein weiteres System, das sie meiden.",
      },
      {
        icon: "Calculator",
        title: "Zeiten, Rechnungen & DATEV",
        desc: "Kanzleiweite Zeiterfassung, Rechnungen und DATEV-Export. Admin, das früher Freitagnachmittag fraß, in Minuten erledigt.",
      },
      {
        icon: "ShieldCheck",
        title: "EU-gehostet oder self-hosted",
        desc: "Keine US-Cloud, kein US-Modell. EU-Hosting mit AVV oder self-hosted auf eigener Hardware mit eigenen Keys.",
      },
    ],
    proofTitle: "Der Kraft-Multiplikator für dein Team",
    proof:
      "97,9 % Recall@5 bedeutet: Dein Team findet, was zählt — jedes Mal. Wenn eine 15-Anwalt-Kanzlei das entscheidende Präjudiz in Sekunden findet, performt sie wie eine 50-Anwalt-Kanzlei.",
    faq: [
      {
        q: "Wie schnell können wir das einführen?",
        a: "Ein Pilot mit 2-3 Anwälten dauert einen Tag. Das volle Rollout typischerweise eine Woche — dein Team indiziert bestehende Akten im eigenen Tempo.",
      },
      {
        q: "Was kostet das für eine mittelständische Kanzlei?",
        a: "Team-Plan ab 1.290 €/Seat/Monat ab 5 Seats. Jahreszahlung spart 20 %. Transparente Mehrkosten — du siehst den Verbrauch live, keine Überraschungen.",
      },
      {
        q: "Können wir klein anfangen und wachsen?",
        a: "Absolut. Starte mit Pro für einen Anwalt, und upgrade auf Team, wenn du bereit bist. Alle Daten bleiben — keine Migration, kein Downtime.",
      },
    ],
    ctaTitle: "Konkurriere mit den Großkanzleien.",
    ctaSub: "Starte mit einem Team als Pilot. Sieh die Wirkung in einer Woche.",
    ctaButton: "Demo anfragen",
  },
};

const _enSolutions: Record<SolutionSlug, SolutionContent> = {
  "law-firms": {
    slug: "law-firms",
    metaTitle: "Subsumio for Law Firms — AI legal software with citations",
    metaDesc:
      "Shared case brain, automated deadlines, AI analysis with citations, conflict checks, WhatsApp copilot — GDPR-ready, EU-hosted for DACH firms.",
    badge: "For established law firms",
    h1a: "Your firm's knowledge,",
    h1b: "finally answerable.",
    sub: "Subsumio turns decades of matters, briefs and deadlines into one queryable brain your whole team can ask — every answer cited, confidentiality by architecture.",
    painsTitle: "What keeps managing partners up at night",
    pains: [
      {
        title: "Knowledge silos",
        desc: "Each lawyer's case knowledge lives in their head and their inbox. When someone leaves, years of context walk out the door.",
      },
      {
        title: "Deadline risk",
        desc: "Statutory deadlines calculated by hand or spreadsheets. One missed Notfrist and the malpractice claim is real.",
      },
      {
        title: "US clouds are a non-starter",
        desc: "Client files in a US-hosted AI tool? Your duty of confidentiality says no — and so do your clients.",
      },
    ],
    featuresTitle: "Built for firm-wide impact",
    features: [
      {
        icon: "Brain",
        title: "Shared institutional memory",
        desc: "Every matter, brief, email and deadline indexed and queryable — by every lawyer in the firm. New associates get up to speed in minutes, not months.",
      },
      {
        icon: "CalendarClock",
        title: "Deadline control (ZPO & BGB)",
        desc: "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.",
      },
      {
        icon: "ShieldAlert",
        title: "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
        desc: "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).",
      },
      {
        icon: "Layers",
        title: "Matter-level isolation",
        desc: "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp matter copilot",
        desc: "Lawyers book time, file documents, send voice notes from their phone. Everything lands in the right matter.",
      },
      {
        icon: "Calculator",
        title: "Time, expenses, invoices & DATEV",
        desc: "Book minutes by lawyer/activity, create invoices from open work, export DATEV-ready accounting files.",
      },
      {
        icon: "ShieldCheck",
        title: "Your server, your jurisdiction",
        desc: "Self-host on firm hardware or choose EU cloud with DPA. Client data never leaves your control.",
      },
      {
        icon: "Search",
        title: "Every claim, sourced",
        desc: "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.",
      },
    ],
    proofTitle: "Engine-grade retrieval, not a chat wrapper",
    proof:
      "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — running on infrastructure your IT governs end to end.",
    faq: [
      {
        q: "How long does rollout take?",
        a: "A pilot with one closed matter takes under an hour. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.",
      },
      {
        q: "Can we run it on our own servers?",
        a: "Yes. The full engine self-hosts on firm hardware with local storage. Enterprise plans support on-prem with your own LLM gateway.",
      },
      {
        q: "What about GDPR and bar obligations?",
        a: "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. We speak your data protection officer's language.",
      },
      {
        q: "How is this different from Harvey?",
        a: "Harvey is excellent — and runs on someone else's cloud and model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control, with a WhatsApp copilot your lawyers use daily.",
      },
    ],
    ctaTitle: "Start with one closed matter as a pilot.",
    ctaSub: "No client data needs to leave your building. Three minutes to first answer.",
    ctaButton: "Try free",
  },
  solo: {
    slug: "solo",
    metaTitle: "Subsumio for Solo Lawyers — AI legal software, no IT required",
    metaDesc:
      "AI legal software for solo practitioners: case brain, automated deadlines, cited AI answers, WhatsApp copilot. EU-hosted, no API keys, no IT overhead.",
    badge: "For solo practitioners",
    h1a: "Your entire practice,",
    h1b: "one question away.",
    sub: "Subsumio gives a solo lawyer what a big firm's knowledge team would: every document, deadline and note indexed and answerable — with citations you can verify.",
    painsTitle: "The solo lawyer's daily reality",
    pains: [
      {
        title: "You are the knowledge team",
        desc: "No associates to delegate research, no IT department to manage infrastructure. Every minute saved on admin is a minute for clients.",
      },
      {
        title: "Deadlines are existential",
        desc: "One missed Notfrist and you're looking at a malpractice claim. You need deadline computation that's correct by statute, not by guesswork.",
      },
      {
        title: "Admin eats your day",
        desc: "Time booking, invoicing, document filing — the overhead of running a practice steals billable hours.",
      },
    ],
    featuresTitle: "Everything a solo practice needs",
    features: [
      {
        icon: "Brain",
        title: "Your case brain",
        desc: "Upload matters, emails, PDFs, voice notes. Subsumio indexes everything and answers in plain language — with page-level citations.",
      },
      {
        icon: "CalendarClock",
        title: "Deadlines, automatically",
        desc: "Statutory deadlines per ZPO/BGB/ABGB with correct arithmetic and weekend roll-forward. Daily email digest flags what's critical.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp copilot",
        desc: "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — no app switch needed.",
      },
      {
        icon: "Calculator",
        title: "Time & invoices",
        desc: "Book minutes, create invoices from open work, export DATEV-ready files. Admin in seconds, not hours.",
      },
      {
        icon: "Zap",
        title: "No server, no IT",
        desc: "Sign up and your brain runs — fully managed, no API keys, no infrastructure. You focus on law, not sysadmin.",
      },
      {
        icon: "ShieldCheck",
        title: "Confidentiality by design",
        desc: "EU-hosted with encryption per customer. Your client data is never used to train shared models. Self-hosting available if you prefer.",
      },
    ],
    proofTitle: "Big-firm capability, solo-practitioner price",
    proof:
      "The same retrieval engine that serves established firms — 97.9% Recall@5, hybrid search, knowledge graph — at a price a solo lawyer can justify on the first saved hour.",
    faq: [
      {
        q: "Do I need to be tech-savvy?",
        a: "No. Sign up, upload documents, ask questions. If you can use WhatsApp and a browser, you can use Subsumio.",
      },
      {
        q: "Can I afford this as a solo?",
        a: "The Pro plan is €890/seat/month — less than two billable hours. The 14-day reverse trial means you see real value before you pay.",
      },
      {
        q: "What if I grow into a firm later?",
        a: "Upgrade to Team at any time. Your brain and all indexed data carry over — no migration, no downtime.",
      },
    ],
    ctaTitle: "Your practice. Your brain.",
    ctaSub: "Three minutes to first cited answer. No credit card, no server, no IT.",
    ctaButton: "Request a demo",
  },
  "in-house": {
    slug: "in-house",
    metaTitle: "Subsumio for In-House Legal — legal ops with audit-ready memory",
    metaDesc:
      "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.",
    badge: "For in-house legal teams",
    h1a: "Your legal department,",
    h1b: "with a memory.",
    sub: "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — cited answers in seconds, not days of document hunting.",
    painsTitle: "The in-house reality",
    pains: [
      {
        title: "Contract chaos",
        desc: "Hundreds of contracts across business units, each with different renewal dates, liability caps and termination clauses. Finding the one that matters takes days.",
      },
      {
        title: "Compliance pressure",
        desc: "AI Act, GDPR, sector-specific regulations — the compliance landscape shifts faster than any team can track manually.",
      },
      {
        title: "External counsel costs",
        desc: "Every external legal question costs thousands. Your team needs to answer the routine ones internally before they become external bills.",
      },
    ],
    featuresTitle: "Built for legal operations",
    features: [
      {
        icon: "FolderOpen",
        title: "Contract intelligence",
        desc: "Bulk-analyze contracts: surface renewal dates, liability caps, termination clauses and anomalies across the entire portfolio.",
      },
      {
        icon: "ShieldAlert",
        title: "Compliance tracking",
        desc: "Map regulatory requirements to internal policies. Track gaps, flag deadlines, maintain an audit trail for supervisors and regulators.",
      },
      {
        icon: "Brain",
        title: "Institutional memory",
        desc: "Every legal opinion, memo and external counsel answer indexed and queryable. New team members get up to speed in minutes.",
      },
      {
        icon: "Search",
        title: "Answer before you ask external",
        desc: "Ask Subsumio first — if the answer is in your documents, you save the external counsel fee. If not, you know exactly what's missing.",
      },
      {
        icon: "Layers",
        title: "Matter-level isolation",
        desc: "Scoped access per business unit and per user — HR legal, M&A legal, IP legal each see only what they should.",
      },
      {
        icon: "ShieldCheck",
        title: "Audit-ready by design",
        desc: "Every query and answer is logged with sources. When the auditor asks 'how did you reach this conclusion?', the trail is there.",
      },
    ],
    proofTitle: "From reactive to proactive legal ops",
    proof:
      "The retrieval core benchmarks at 97.9% Recall@5 — meaning when you ask 'which contracts have auto-renewal in Q3?', you get the complete answer, not a partial guess.",
    faq: [
      {
        q: "How does this integrate with our existing DMS?",
        a: "Subsumio imports from shared drives, SharePoint, and via API. Document metadata (author, date, matter) is preserved during indexing.",
      },
      {
        q: "Can we control which team sees what?",
        a: "Yes. Access is scoped per matter and per user. HR legal can't see M&A legal's files, and vice versa — fuzz-tested, zero leaks.",
      },
      {
        q: "What about the AI Act and internal AI governance?",
        a: "Subsumio provides source citations on every answer, gap analysis for transparency, and full audit logs. This aligns with AI Act transparency requirements for internal tools.",
      },
    ],
    ctaTitle: "Give your legal team an answer machine.",
    ctaSub:
      "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.",
    ctaButton: "Request a demo",
  },
  "mid-sized": {
    slug: "mid-sized",
    metaTitle: "Subsumio for Mid-Sized Firms — lean team, outsized impact",
    metaDesc:
      "AI legal software for mid-sized law firms: shared brain, deadline automation, WhatsApp copilot, conflict checks. EU-hosted or self-hosted.",
    badge: "For mid-sized law firms",
    h1a: "Big-firm capability,",
    h1b: "mid-sized budget.",
    sub: "Subsumio gives a 10-50 lawyer firm the knowledge infrastructure of a 200-lawyer firm — every matter, deadline and brief indexed and answerable, with confidentiality by architecture.",
    painsTitle: "The mid-sized firm's challenge",
    pains: [
      {
        title: "Doing more with less",
        desc: "You compete with big firms for the same clients but have a fraction of the headcount. Every efficiency gain is a competitive advantage.",
      },
      {
        title: "Knowledge is fragmented",
        desc: "Each lawyer maintains their own system — folders, notes, inbox rules. When someone's on vacation or leaves, their matters become black boxes.",
      },
      {
        title: "IT is a constraint, not an enabler",
        desc: "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-week implementation cycle.",
      },
    ],
    featuresTitle: "Outsized impact for lean teams",
    features: [
      {
        icon: "Brain",
        title: "One shared brain",
        desc: "Every lawyer's matters, briefs and notes in one indexed workspace. A new associate finds the 2023 brief in seconds, not by asking three people.",
      },
      {
        icon: "CalendarClock",
        title: "Deadline control for the whole firm",
        desc: "Centralized deadline calendar with per-lawyer views. Statutory computation per ZPO/BGB/ABGB — no more spreadsheet tracking.",
      },
      {
        icon: "ShieldAlert",
        title: "Conflict check in seconds",
        desc: "New client or opposing party screened against the entire case base before acceptance — automated, not manual.",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp copilot for every lawyer",
        desc: "Time booking, document filing, voice notes from the phone. The tool your lawyers actually use daily, not another system they avoid.",
      },
      {
        icon: "Calculator",
        title: "Time, invoices & DATEV",
        desc: "Firm-wide time tracking, invoicing and DATEV export. Admin work that used to eat Friday afternoons, done in minutes.",
      },
      {
        icon: "ShieldCheck",
        title: "EU-hosted or self-hosted",
        desc: "No US cloud, no US model provider. EU hosting with DPA, or self-host on your own hardware with your own keys.",
      },
    ],
    proofTitle: "The force multiplier your team needs",
    proof:
      "97.9% Recall@5 means your team finds what matters — every time. When a 15-lawyer firm finds the decisive precedent in seconds, it performs like a 50-lawyer firm.",
    faq: [
      {
        q: "How quickly can we roll this out?",
        a: "A pilot with 2-3 lawyers takes a day. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.",
      },
      {
        q: "What's the pricing for a mid-sized firm?",
        a: "Team plan at €1,290/seat/month from 5 seats. Annual billing saves 20%. Transparent overages — you see usage live, no surprise bills.",
      },
      {
        q: "Can we start small and scale?",
        a: "Absolutely. Start with Pro for one lawyer, upgrade to Team when ready. All data carries over — no migration, no downtime.",
      },
    ],
    ctaTitle: "Compete with the big firms.",
    ctaSub: "Start with one team as a pilot. See the impact in a week.",
    ctaButton: "Request a demo",
  },
};

export const SOLUTIONS: Record<Lang, Record<SolutionSlug, SolutionContent>> = {
  en: _enSolutions,
  de: _solutionsDe,
  at: applyReplacements(_solutionsDe, AT_REPLACEMENTS),
  ch: _solutionsDe,
  it: applyReplacements(JSON.parse(JSON.stringify(_enSolutions)), {
    "Subsumio for Law Firms — AI legal software with citations":
      "Subsumio per Studi Legali — software legale AI con citazioni",
    "Shared case brain, automated deadlines, AI analysis with citations, conflict checks, WhatsApp copilot — GDPR-ready, EU-hosted for DACH firms.":
      "Brain condiviso per pratiche, scadenze automatiche, analisi AI con citazioni, controllo conflitti, copilot WhatsApp — GDPR-ready, EU-hosted per studi DACH.",
    "For established law firms": "Per studi legali affermati",
    "Your firm's knowledge,": "La conoscenza del tuo studio,",
    "finally answerable.": "finalmente interrogabile.",
    "Subsumio turns decades of matters, briefs and deadlines into one queryable brain your whole team can ask — every answer cited, confidentiality by architecture.":
      "Subsumio trasforma decenni di pratiche, memorie e scadenze in un brain interrogabile che tutto il team può consultare — ogni risposta citata, riservatezza per architettura.",
    "What keeps managing partners up at night": "Cosa tiene svegli i managing partner di notte",
    "Knowledge silos": "Silos di conoscenza",
    "Deadline risk": "Rischio scadenze",
    "US clouds are a non-starter": "Cloud US sono esclusi",
    "For Solo Lawyers": "Per Avvocati Singoli",
    "For In-House": "Per In-House",
    "For Mid-Sized Firms": "Per Studi Medi",
    "Compete with the big firms.": "Competi con i grandi studi.",
    "Start with one team as a pilot. See the impact in a week.":
      "Inizia con un team come pilota. Vedi l'impatto in una settimana.",
    "Request a demo": "Richiedi una demo",
    // Law firms — pains descs
    "Each lawyer's case knowledge lives in their head and their inbox. When someone leaves, years of context walk out the door.":
      "La conoscenza delle pratiche di ogni avvocato vive nella sua testa e nella sua casella. Quando qualcuno se ne va, anni di contesto se ne vanno con lui.",
    "Statutory deadlines calculated by hand or spreadsheets. One missed Notfrist and the malpractice claim is real.":
      "Scadenze legali calcolate a mano o con fogli di calcolo. Una Notfrist mancata e la richiesta di risarcimento è reale.",
    "Client files in a US-hosted AI tool? Your duty of confidentiality says no — and so do your clients.":
      "Pratiche clienti in un tool AI US-hosted? Il tuo dovere di riservatezza dice no — e anche i tuoi clienti.",
    // Law firms — features
    "Built for firm-wide impact": "Costruito per impatto a livello di studio",
    "Shared institutional memory": "Memoria istituzionale condivisa",
    "Every matter, brief, email and deadline indexed and queryable — by every lawyer in the firm. New associates get up to speed in minutes, not months.":
      "Ogni pratica, memoria, email e scadenza indicizzata e interrogabile — da ogni avvocato dello studio. I nuovi associati si aggiornano in minuti, non mesi.",
    "Deadline control (ZPO & BGB)": "Controllo scadenze (ZPO & BGB)",
    "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.":
      "Scadenze legali e di appello calcolate con aritmetica mensile corretta e roll-forward nei weekend — con la norma di riferimento citata.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Controllo conflitti (§ 43a BRAO / § 10 RAO / BGFA)",
    "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Ogni nuovo cliente o controparte screeningato server-side contro l'intero database di pratiche prima che il mandato sia accettato. Copre § 43a BRAO (DE), § 10 RAO (AT) e BGFA (CH).",
    "Matter-level isolation": "Isolamento a livello di pratica",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Accesso scoped per pratica e per utente — fuzz-testato, zero leak tra pratiche o team.",
    "WhatsApp matter copilot": "Copilot WhatsApp per pratiche",
    "Lawyers book time, file documents, send voice notes from their phone. Everything lands in the right matter.":
      "Gli avvocati registrano tempo, archiviano documenti, inviano note vocali dal telefono. Tutto arriva nella pratica giusta.",
    "Time, expenses, invoices & DATEV": "Tempi, spese, fatture & DATEV",
    "Book minutes by lawyer/activity, create invoices from open work, export DATEV-ready accounting files.":
      "Registra minuti per avvocato/attività, crea fatture dal lavoro aperto, esporta file contabili DATEV-ready.",
    "Your server, your jurisdiction": "Il tuo server, la tua giurisdizione",
    "Self-host on firm hardware or choose EU cloud with DPA. Client data never leaves your control.":
      "Self-host su hardware dello studio o scegli cloud UE con DPA. I dati clienti non lasciano mai il tuo controllo.",
    "Every claim, sourced": "Ogni affermazione, citata",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Le risposte citano le pagine esatte da cui provengono. Verifica con un clic prima che qualcosa finisca in una memoria.",
    // Law firms — proof + faq
    "Engine-grade retrieval, not a chat wrapper": "Retrieval di grado engine, non un chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — running on infrastructure your IT governs end to end.":
      "Il core di retrieval raggiunge 97,9% Recall@5 con ricerca ibrida e knowledge graph — su infrastruttura che la tua IT governa end-to-end.",
    "How long does rollout take?": "Quanto tempo richiede il rollout?",
    "A pilot with one closed matter takes under an hour. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Un pilota con una pratica chiusa richiede meno di un'ora. Il rollout completo dello studio richiede tipicamente una settimana — il tuo team indicizza le pratiche esistenti al proprio ritmo.",
    "Can we run it on our own servers?": "Possiamo usarlo sui nostri server?",
    "Yes. The full engine self-hosts on firm hardware with local storage. Enterprise plans support on-prem with your own LLM gateway.":
      "Sì. Il motore completo si self-hosta su hardware dello studio con storage locale. I piani Enterprise supportano on-prem con il tuo gateway LLM.",
    "What about GDPR and bar obligations?": "E per GDPR e obblighi forensi?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. We speak your data protection officer's language.":
      "Self-hosted significa che i dati non lasciano mai la tua infrastruttura. I piani hosted vengono con hosting UE e DPA. Parliamo la lingua del tuo responsabile della protezione dei dati.",
    "How is this different from Harvey?": "In cosa differisce da Harvey?",
    "Harvey is excellent — and runs on someone else's cloud and model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control, with a WhatsApp copilot your lawyers use daily.":
      "Harvey è eccellente — e gira su cloud e modelli di altri. Subsumio ti dà la stessa qualità di sintesi su infrastruttura che TU controlli, con un copilot WhatsApp che i tuoi avvocati usano quotidianamente.",
    "Start with one closed matter as a pilot.": "Inizia con una pratica chiusa come pilota.",
    "No client data needs to leave your building. Three minutes to first answer.":
      "Nessun dato cliente deve lasciare il tuo studio. Tre minuti alla prima risposta.",
    "Try free": "Prova gratis",
    // Solo
    "Subsumio for Solo Lawyers — AI legal software, no IT required":
      "Subsumio per Avvocati Singoli — software legale AI, nessun IT richiesto",
    "AI legal software for solo practitioners: case brain, automated deadlines, cited AI answers, WhatsApp copilot. EU-hosted, no API keys, no IT overhead.":
      "Software legale AI per avvocati singoli: brain per pratiche, scadenze automatiche, risposte AI citate, copilot WhatsApp. EU-hosted, senza API key, nessun overhead IT.",
    "For solo practitioners": "Per avvocati singoli",
    "Your entire practice,": "L'intera tua pratica,",
    "one question away.": "a una domanda di distanza.",
    "Subsumio gives a solo lawyer what a big firm's knowledge team would: every document, deadline and note indexed and answerable — with citations you can verify.":
      "Subsumio dà a un avvocato singolo ciò che un grande studio avrebbe: ogni documento, scadenza e nota indicizzati e interrogabili — con citazioni che puoi verificare.",
    "The solo lawyer's daily reality": "La realtà quotidiana dell'avvocato singolo",
    "You are the knowledge team": "Sei tu il team della conoscenza",
    "No associates to delegate research, no IT department to manage infrastructure. Every minute saved on admin is a minute for clients.":
      "Nessun associato a cui delegare research, nessun dipartimento IT per gestire l'infrastruttura. Ogni minuto risparmiato sull'admin è un minuto per i clienti.",
    "Deadlines are existential": "Le scadenze sono esistenziali",
    "One missed Notfrist and you're looking at a malpractice claim. You need deadline computation that's correct by statute, not by guesswork.":
      "Una Notfrist mancata e sei di fronte a una richiesta di risarcimento. Ti serve calcolo delle scadenze corretto per norma, non per supposizione.",
    "Admin eats your day": "L'admin ti mangia la giornata",
    "Time booking, invoicing, document filing — the overhead of running a practice steals billable hours.":
      "Registrazione tempo, fatturazione, archiviazione documenti — l'overhead di gestire una pratica ruba ore fatturabili.",
    "Everything a solo practice needs": "Tutto ciò che serve a uno studio singolo",
    "Your case brain": "Il tuo brain per pratiche",
    "Upload matters, emails, PDFs, voice notes. Subsumio indexes everything and answers in plain language — with page-level citations.":
      "Carica pratiche, email, PDF, note vocali. Subsumio indicizza tutto e risponde in linguaggio semplice — con citazioni a livello di pagina.",
    "Deadlines, automatically": "Scadenze, automaticamente",
    "Statutory deadlines per ZPO/BGB/ABGB with correct arithmetic and weekend roll-forward. Daily email digest flags what's critical.":
      "Scadenze legali per ZPO/BGB/ABGB con aritmetica corretta e roll-forward nei weekend. Digest email giornaliero segnala ciò che è critico.",
    "WhatsApp copilot": "Copilot WhatsApp",
    "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — no app switch needed.":
      "Registra tempo, archivia documenti, invia note vocali dal telefono. Tutto arriva nella pratica giusta — senza cambiare app.",
    "Time & invoices": "Tempi & fatture",
    "Book minutes, create invoices from open work, export DATEV-ready files. Admin in seconds, not hours.":
      "Registra minuti, crea fatture dal lavoro aperto, esporta file DATEV-ready. Admin in secondi, non ore.",
    "No server, no IT": "Nessun server, nessun IT",
    "Sign up and your brain runs — fully managed, no API keys, no infrastructure. You focus on law, not sysadmin.":
      "Iscriviti e il tuo brain funziona — completamente gestito, senza API key, senza infrastruttura. Ti concentri sul diritto, non sul sysadmin.",
    "Confidentiality by design": "Riservatezza per design",
    "EU-hosted with encryption per customer. Your client data is never used to train shared models. Self-hosting available if you prefer.":
      "EU-hosted con cifratura per cliente. I tuoi dati clienti non sono mai usati per trainare modelli condivisi. Self-hosting disponibile se preferisci.",
    "Big-firm capability, solo-practitioner price":
      "Capacità da grande studio, prezzo da avvocato singolo",
    "The same retrieval engine that serves established firms — 97.9% Recall@5, hybrid search, knowledge graph — at a price a solo lawyer can justify on the first saved hour.":
      "Lo stesso engine di retrieval che serve studi affermati — 97,9% Recall@5, ricerca ibrida, knowledge graph — a un prezzo che un avvocato singolo può giustificare con la prima ora risparmiata.",
    "Do I need to be tech-savvy?": "Devo essere esperto di tecnologia?",
    "No. Sign up, upload documents, ask questions. If you can use WhatsApp and a browser, you can use Subsumio.":
      "No. Iscriviti, carica documenti, fai domande. Se sai usare WhatsApp e un browser, sai usare Subsumio.",
    "Can I afford this as a solo?": "Posso permettermelo come singolo?",
    "The Pro plan is €890/seat/month — less than two billable hours. The 14-day reverse trial means you see real value before you pay.":
      "Il piano Pro è €890/seat/mese — meno di due ore fatturabili. La reverse trial di 14 giorni significa che vedi il valore reale prima di pagare.",
    "What if I grow into a firm later?": "E se cresco e divento uno studio?",
    "Upgrade to Team at any time. Your brain and all indexed data carry over — no migration, no downtime.":
      "Upgrade a Team in qualsiasi momento. Il tuo brain e tutti i dati indicizzati si trasferiscono — nessuna migrazione, nessun downtime.",
    "Your practice. Your brain.": "La tua pratica. Il tuo brain.",
    "Three minutes to first cited answer. No credit card, no server, no IT.":
      "Tre minuti alla prima risposta citata. Nessuna carta di credito, nessun server, nessun IT.",
    // In-house
    "Subsumio for In-House Legal — legal ops with audit-ready memory":
      "Subsumio per In-House Legal — legal ops con memoria audit-ready",
    "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.":
      "Software legale AI per team in-house: analisi contratti, tracking compliance, knowledge management con citazioni. EU-hosted o self-hosted.",
    "For in-house legal teams": "Per team legali in-house",
    "Your legal department,": "Il tuo dipartimento legale,",
    "with a memory.": "con una memoria.",
    "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — cited answers in seconds, not days of document hunting.":
      "Subsumio dà ai consulenti in-house ciò che non hanno mai avuto: ogni contratto, documento di compliance e parere legale indicizzato, interrogabile e audit-ready — risposte citate in secondi, non giorni di caccia ai documenti.",
    "The in-house reality": "La realtà in-house",
    "Contract chaos": "Caos contratti",
    "Hundreds of contracts across business units, each with different renewal dates, liability caps and termination clauses. Finding the one that matters takes days.":
      "Centinaia di contratti tra business unit, ognuno con diverse date di rinnovo, limiti di responsabilità e clausole di recesso. Trovare quello che conta richiede giorni.",
    "Compliance pressure": "Pressione compliance",
    "AI Act, GDPR, sector-specific regulations — the compliance landscape shifts faster than any team can track manually.":
      "AI Act, GDPR, regolamenti di settore — il panorama compliance cambia più velocemente di quanto qualsiasi team possa tracciare manualmente.",
    "External counsel costs": "Costi consulenti esterni",
    "Every external legal question costs thousands. Your team needs to answer the routine ones internally before they become external bills.":
      "Ogni domanda legale esterna costa migliaia. Il tuo team deve rispondere a quelle di routine internamente prima che diventino fatture esterne.",
    "Built for legal operations": "Costruito per legal operations",
    "Contract intelligence": "Intelligenza contratti",
    "Bulk-analyze contracts: surface renewal dates, liability caps, termination clauses and anomalies across the entire portfolio.":
      "Analisi massiva di contratti: evidenzia date di rinnovo, limiti di responsabilità, clausole di recesso e anomalie nell'intero portafoglio.",
    "Compliance tracking": "Tracking compliance",
    "Map regulatory requirements to internal policies. Track gaps, flag deadlines, maintain an audit trail for supervisors and regulators.":
      "Mappa requisiti normativi a policy interne. Traccia gap, segnala scadenze, mantiene un audit trail per supervisori e regolatori.",
    "Institutional memory": "Memoria istituzionale",
    "Every legal opinion, memo and external counsel answer indexed and queryable. New team members get up to speed in minutes.":
      "Ogni parere legale, memo e risposta di consulente esterno indicizzata e interrogabile. I nuovi membri del team si aggiornano in minuti.",
    "Answer before you ask external": "Rispondi prima di chiedere esterno",
    "Ask Subsumio first — if the answer is in your documents, you save the external counsel fee. If not, you know exactly what's missing.":
      "Chiedi prima a Subsumio — se la risposta è nei tuoi documenti, risparmi la parcella del consulente esterno. Se no, sai esattamente cosa manca.",
    "Audit-ready by design": "Audit-ready per design",
    "Every query and answer is logged with sources. When the auditor asks 'how did you reach this conclusion?', the trail is there.":
      "Ogni query e risposta è loggata con fonti. Quando l'auditor chiede 'come sei arrivato a questa conclusione?', il trail è lì.",
    "From reactive to proactive legal ops": "Da legal ops reattiva a proattiva",
    "The retrieval core benchmarks at 97.9% Recall@5 — meaning when you ask 'which contracts have auto-renewal in Q3?', you get the complete answer, not a partial guess.":
      "Il core di retrieval raggiunge 97,9% Recall@5 — il che significa che quando chiedi 'quali contratti hanno auto-renewal in Q3?', ottieni la risposta completa, non una supposizione parziale.",
    "How does this integrate with our existing DMS?":
      "Come si integra con il nostro DMS esistente?",
    "Subsumio imports from shared drives, SharePoint, and via API. Document metadata (author, date, matter) is preserved during indexing.":
      "Subsumio importa da shared drive, SharePoint, e via API. I metadati dei documenti (autore, data, pratica) sono preservati durante l'indicizzazione.",
    "Can we control which team sees what?": "Possiamo controllare cosa vede ogni team?",
    "Yes. Access is scoped per matter and per user. HR legal can't see M&A legal's files, and vice versa — fuzz-tested, zero leaks.":
      "Sì. L'accesso è scoped per pratica e per utente. HR legal non può vedere i file di M&A legal, e viceversa — fuzz-testato, zero leak.",
    "What about the AI Act and internal AI governance?":
      "E per l'AI Act e la governance AI interna?",
    "Subsumio provides source citations on every answer, gap analysis for transparency, and full audit logs. This aligns with AI Act transparency requirements for internal tools.":
      "Subsumio fornisce citazioni delle fonti su ogni risposta, analisi dei gap per trasparenza, e audit log completi. Questo si allinea con i requisiti di trasparenza dell'AI Act per tool interni.",
    "Give your legal team an answer machine.":
      "Dai al tuo team legale una macchina delle risposte.",
    "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.":
      "Inizia con un portafoglio di contratti come pilota. Nessun dato deve lasciare la tua infrastruttura.",
    // Mid-sized
    "Subsumio for Mid-Sized Firms — lean team, outsized impact":
      "Subsumio per Studi Medi — team snello, impatto superiore",
    "AI legal software for mid-sized law firms: shared brain, deadline automation, WhatsApp copilot, conflict checks. EU-hosted or self-hosted.":
      "Software legale AI per studi legali medi: brain condiviso, automazione scadenze, copilot WhatsApp, controllo conflitti. EU-hosted o self-hosted.",
    "For mid-sized law firms": "Per studi legali medi",
    "Big-firm capability,": "Capacità da grande studio,",
    "mid-sized budget.": "budget da studio medio.",
    "Subsumio gives a 10-50 lawyer firm the knowledge infrastructure of a 200-lawyer firm — every matter, deadline and brief indexed and answerable, with confidentiality by architecture.":
      "Subsumio dà a uno studio di 10-50 avvocati l'infrastruttura di conoscenza di uno studio di 200 — ogni pratica, scadenza e memoria indicizzata e interrogabile, con riservatezza per architettura.",
    "The mid-sized firm's challenge": "La sfida dello studio medio",
    "Doing more with less": "Fare di più con meno",
    "You compete with big firms for the same clients but have a fraction of the headcount. Every efficiency gain is a competitive advantage.":
      "Competi con i grandi studi per gli stessi clienti ma hai una frazione del personale. Ogni guadagno di efficienza è un vantaggio competitivo.",
    "Knowledge is fragmented": "La conoscenza è frammentata",
    "Each lawyer maintains their own system — folders, notes, inbox rules. When someone's on vacation or leaves, their matters become black boxes.":
      "Ogni avvocato mantiene il proprio sistema — cartelle, note, regole di inbox. Quando qualcuno è in vacanza o se ne va, le sue pratiche diventano black box.",
    "IT is a constraint, not an enabler": "IT è un vincolo, non un abilitatore",
    "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-week implementation cycle.":
      "Nessun team IT dedicato al legal tech. Ti servono tool che funzionano out of the box, non progetti che richiedono sei settimane di implementazione.",
    "Outsized impact for lean teams": "Impatto superiore per team snelli",
    "One shared brain": "Un brain condiviso",
    "Every lawyer's matters, briefs and notes in one indexed workspace. A new associate finds the 2023 brief in seconds, not by asking three people.":
      "Pratiche, memorie e note di ogni avvocato in un workspace indicizzato. Un nuovo associato trova la memoria del 2023 in secondi, non chiedendo a tre persone.",
    "Deadline control for the whole firm": "Controllo scadenze per tutto lo studio",
    "Centralized deadline calendar with per-lawyer views. Statutory computation per ZPO/BGB/ABGB — no more spreadsheet tracking.":
      "Calendario scadenze centralizzato con viste per avvocato. Calcolo legale per ZPO/BGB/ABGB — basta tracking con fogli di calcolo.",
    "Conflict check in seconds": "Controllo conflitti in secondi",
    "New client or opposing party screened against the entire case base before acceptance — automated, not manual.":
      "Nuovo cliente o controparte screeningato contro l'intero database di pratiche prima dell'accettazione — automatico, non manuale.",
    "WhatsApp copilot for every lawyer": "Copilot WhatsApp per ogni avvocato",
    "Time booking, document filing, voice notes from the phone. The tool your lawyers actually use daily, not another system they avoid.":
      "Registrazione tempo, archiviazione documenti, note vocali dal telefono. Il tool che i tuoi avvocati usano davvero quotidianamente, non un altro sistema che evitano.",
    "Time, invoices & DATEV": "Tempi, fatture & DATEV",
    "Firm-wide time tracking, invoicing and DATEV export. Admin work that used to eat Friday afternoons, done in minutes.":
      "Tracking tempo a livello di studio, fatturazione ed export DATEV. Lavoro admin che mangiava i venerdì pomeriggio, fatto in minuti.",
    "EU-hosted or self-hosted": "EU-hosted o self-hosted",
    "No US cloud, no US model provider. EU hosting with DPA, or self-host on your own hardware with your own keys.":
      "Nessuna cloud US, nessun provider di modelli US. Hosting UE con DPA, o self-host sul tuo hardware con le tue chiavi.",
    "The force multiplier your team needs": "Il moltiplicatore di forza che il tuo team necesita",
    "97.9% Recall@5 means your team finds what matters — every time. When a 15-lawyer firm finds the decisive precedent in seconds, it performs like a 50-lawyer firm.":
      "97,9% Recall@5 significa che il tuo team trova ciò che conta — ogni volta. Quando uno studio di 15 avvocati trova il precedente decisivo in secondi, si comporta come uno studio di 50.",
    "How quickly can we roll this out?": "Quanto velocemente possiamo fare il rollout?",
    "A pilot with 2-3 lawyers takes a day. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Un pilota con 2-3 avvocati richiede un giorno. Il rollout completo dello studio richiede tipicamente una settimana — il tuo team indicizza le pratiche esistenti al proprio ritmo.",
    "What's the pricing for a mid-sized firm?": "Qual è il prezzo per uno studio medio?",
    "Team plan at €1,290/seat/month from 5 seats. Annual billing saves 20%. Transparent overages — you see usage live, no surprise bills.":
      "Piano Team a €1.290/seat/mese da 5 seat. Fatturazione annuale risparmia 20%. Overage trasparenti — vedi l'uso live, nessuna fattura a sorpresa.",
    "Can we start small and scale?": "Possiamo iniziare in piccolo e scalare?",
    "Absolutely. Start with Pro for one lawyer, upgrade to Team when ready. All data carries over — no migration, no downtime.":
      "Assolutamente. Inizia con Pro per un avvocato, upgrade a Team quando pronto. Tutti i dati si trasferiscono — nessuna migrazione, nessun downtime.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enSolutions)), {
    "Subsumio for Law Firms — AI legal software with citations":
      "Subsumio para Bufetes — software legal IA con citas",
    "Shared case brain, automated deadlines, AI analysis with citations, conflict checks, WhatsApp copilot — GDPR-ready, EU-hosted for DACH firms.":
      "Brain compartido para asuntos, plazos automáticos, análisis IA con citas, control de conflictos, copilot WhatsApp — GDPR-ready, EU-hosted para bufetes DACH.",
    "For established law firms": "Para bufetes consolidados",
    "Your firm's knowledge,": "El conocimiento de tu bufete,",
    "finally answerable.": "finalmente consultable.",
    "Subsumio turns decades of matters, briefs and deadlines into one queryable brain your whole team can ask — every answer cited, confidentiality by architecture.":
      "Subsumio transforma décadas de asuntos, escritos y plazos en un brain consultable que todo tu equipo puede preguntar — cada respuesta citada, confidencialidad por arquitectura.",
    "What keeps managing partners up at night":
      "Lo que mantiene despiertos a los socios gestores por la noche",
    "Knowledge silos": "Silos de conocimiento",
    "Deadline risk": "Riesgo de plazos",
    "US clouds are a non-starter": "Clouds de EE.UU. no son opción",
    "Compete with the big firms.": "Compite con los grandes bufetes.",
    "Start with one team as a pilot. See the impact in a week.":
      "Empieza con un equipo como piloto. Ve el impacto en una semana.",
    "Request a demo": "Solicitar una demo",
    // Law firms — pains descs
    "Each lawyer's case knowledge lives in their head and their inbox. When someone leaves, years of context walk out the door.":
      "El conocimiento de los asuntos de cada abogado vive en su cabeza y su bandeja. Cuando alguien se va, años de contexto se van con él.",
    "Statutory deadlines calculated by hand or spreadsheets. One missed Notfrist and the malpractice claim is real.":
      "Plazos legales calculados a mano o con hojas de cálculo. Un Notfrist perdido y la reclamación por negligencia es real.",
    "Client files in a US-hosted AI tool? Your duty of confidentiality says no — and so do your clients.":
      "¿Archivos de clientes en una herramienta AI US-hosted? Tu deber de confidencialidad dice no — y también tus clientes.",
    // Law firms — features
    "Built for firm-wide impact": "Construido para impacto a nivel de bufete",
    "Shared institutional memory": "Memoria institucional compartida",
    "Every matter, brief, email and deadline indexed and queryable — by every lawyer in the firm. New associates get up to speed in minutes, not months.":
      "Cada asunto, escrito, email y plazo indexado y consultable — por cada abogado del bufete. Los nuevos asociados se ponen al día en minutos, no meses.",
    "Deadline control (ZPO & BGB)": "Control de plazos (ZPO & BGB)",
    "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.":
      "Plazos legales y de apelación calculados con aritmética mensual correcta y roll-forward en fines de semana — con la norma aplicable citada.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Control de conflictos (§ 43a BRAO / § 10 RAO / BGFA)",
    "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Cada nuevo cliente o contraparte screeningado server-side contra toda la base de asuntos antes de aceptar el mandato. Cubre § 43a BRAO (DE), § 10 RAO (AT) y BGFA (CH).",
    "Matter-level isolation": "Aislamiento a nivel de asunto",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Acceso scoped por asunto y por usuario — fuzz-testeado, cero fugas entre asuntos o equipos.",
    "WhatsApp matter copilot": "Copilot WhatsApp para asuntos",
    "Lawyers book time, file documents, send voice notes from their phone. Everything lands in the right matter.":
      "Los abogados registran tiempo, archivan documentos, envían notas de voz desde el teléfono. Todo llega al asunto correcto.",
    "Time, expenses, invoices & DATEV": "Tiempos, gastos, facturas & DATEV",
    "Book minutes by lawyer/activity, create invoices from open work, export DATEV-ready accounting files.":
      "Registra minutos por abogado/actividad, crea facturas desde trabajo abierto, exporta ficheros contables DATEV-ready.",
    "Your server, your jurisdiction": "Tu servidor, tu jurisdicción",
    "Self-host on firm hardware or choose EU cloud with DPA. Client data never leaves your control.":
      "Self-host en hardware del bufete o elige cloud UE con DPA. Los datos de clientes nunca salen de tu control.",
    "Every claim, sourced": "Cada afirmación, citada",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Las respuestas citan las páginas exactas de donde provienen. Verifica con un clic antes de que algo vaya a un escrito.",
    // Law firms — proof + faq
    "Engine-grade retrieval, not a chat wrapper": "Retrieval de grado engine, no un chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — running on infrastructure your IT governs end to end.":
      "El core de retrieval alcanza 97,9% Recall@5 con búsqueda híbrida y knowledge graph — en infraestructura que tu IT gobierna end-to-end.",
    "How long does rollout take?": "¿Cuánto tiempo requiere el rollout?",
    "A pilot with one closed matter takes under an hour. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Un piloto con un asunto cerrado requiere menos de una hora. El rollout completo del bufete suele tomar una semana — tu equipo indexa los asuntos existentes a su ritmo.",
    "Can we run it on our own servers?": "¿Podemos ejecutarlo en nuestros propios servidores?",
    "Yes. The full engine self-hosts on firm hardware with local storage. Enterprise plans support on-prem with your own LLM gateway.":
      "Sí. El motor completo se self-hostea en hardware del bufete con almacenamiento local. Los planes Enterprise soportan on-prem con tu propio gateway LLM.",
    "What about GDPR and bar obligations?": "¿Y sobre GDPR y obligaciones del colegio?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. We speak your data protection officer's language.":
      "Self-hosted significa que los datos nunca salen de tu infraestructura. Los planes hosted vienen con hosting UE y DPA. Hablamos el idioma de tu delegado de protección de datos.",
    "How is this different from Harvey?": "¿En qué se diferencia de Harvey?",
    "Harvey is excellent — and runs on someone else's cloud and model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control, with a WhatsApp copilot your lawyers use daily.":
      "Harvey es excelente — y corre en la cloud y el modelo de otro. Subsumio te da la misma calidad de síntesis en infraestructura que TÚ controlas, con un copilot WhatsApp que tus abogados usan a diario.",
    "Start with one closed matter as a pilot.": "Empieza con un asunto cerrado como piloto.",
    "No client data needs to leave your building. Three minutes to first answer.":
      "Ningún dato de cliente necesita salir de tu despacho. Tres minutos para la primera respuesta.",
    "Try free": "Prueba gratis",
    // Solo
    "Subsumio for Solo Lawyers — AI legal software, no IT required":
      "Subsumio para Abogados Individuales — software legal IA, sin IT requerido",
    "AI legal software for solo practitioners: case brain, automated deadlines, cited AI answers, WhatsApp copilot. EU-hosted, no API keys, no IT overhead.":
      "Software legal IA para abogados individuales: brain de asuntos, plazos automáticos, respuestas IA citadas, copilot WhatsApp. EU-hosted, sin API keys, sin overhead IT.",
    "For solo practitioners": "Para abogados individuales",
    "Your entire practice,": "Toda tu práctica,",
    "one question away.": "a una pregunta de distancia.",
    "Subsumio gives a solo lawyer what a big firm's knowledge team would: every document, deadline and note indexed and answerable — with citations you can verify.":
      "Subsumio da a un abogado individual lo que un gran bufete tendría: cada documento, plazo y nota indexados y consultables — con citas que puedes verificar.",
    "The solo lawyer's daily reality": "La realidad diaria del abogado individual",
    "You are the knowledge team": "Eres tú el team de conocimiento",
    "No associates to delegate research, no IT department to manage infrastructure. Every minute saved on admin is a minute for clients.":
      "Sin asociados a quien delegar research, sin departamento IT para gestionar infraestructura. Cada minuto ahorrado en admin es un minuto para clientes.",
    "Deadlines are existential": "Los plazos son existenciales",
    "One missed Notfrist and you're looking at a malpractice claim. You need deadline computation that's correct by statute, not by guesswork.":
      "Un Notfrist perdido y te enfrentas a una reclamación por negligencia. Necesitas cálculo de plazos correcto por norma, no por suposición.",
    "Admin eats your day": "El admin te devora el día",
    "Time booking, invoicing, document filing — the overhead of running a practice steals billable hours.":
      "Registro de tiempo, facturación, archivo de documentos — el overhead de gestionar una práctica roba horas facturables.",
    "Everything a solo practice needs": "Todo lo que un despacho individual necesita",
    "Your case brain": "Tu brain de asuntos",
    "Upload matters, emails, PDFs, voice notes. Subsumio indexes everything and answers in plain language — with page-level citations.":
      "Sube asuntos, emails, PDFs, notas de voz. Subsumio indexa todo y responde en lenguaje claro — con citas a nivel de página.",
    "Deadlines, automatically": "Plazos, automáticamente",
    "Statutory deadlines per ZPO/BGB/ABGB with correct arithmetic and weekend roll-forward. Daily email digest flags what's critical.":
      "Plazos legales según ZPO/BGB/ABGB con aritmética correcta y roll-forward en fines de semana. Digest email diario señala lo crítico.",
    "WhatsApp copilot": "Copilot WhatsApp",
    "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — no app switch needed.":
      "Registra tiempo, archiva documentos, envía notas de voz desde el teléfono. Todo llega al asunto correcto — sin cambiar de app.",
    "Time & invoices": "Tiempos & facturas",
    "Book minutes, create invoices from open work, export DATEV-ready files. Admin in seconds, not hours.":
      "Registra minutos, crea facturas desde trabajo abierto, exporta ficheros DATEV-ready. Admin en segundos, no horas.",
    "No server, no IT": "Sin servidor, sin IT",
    "Sign up and your brain runs — fully managed, no API keys, no infrastructure. You focus on law, not sysadmin.":
      "Regístrate y tu brain funciona — completamente gestionado, sin API keys, sin infraestructura. Te centras en derecho, no en sysadmin.",
    "Confidentiality by design": "Confidencialidad por design",
    "EU-hosted with encryption per customer. Your client data is never used to train shared models. Self-hosting available if you prefer.":
      "EU-hosted con cifrado por cliente. Tus datos de clientes nunca se usan para entrenar modelos compartidos. Self-hosting disponible si lo prefieres.",
    "Big-firm capability, solo-practitioner price":
      "Capacidad de gran bufete, precio de abogado individual",
    "The same retrieval engine that serves established firms — 97.9% Recall@5, hybrid search, knowledge graph — at a price a solo lawyer can justify on the first saved hour.":
      "El mismo engine de retrieval que sirve a bufetes consolidados — 97,9% Recall@5, búsqueda híbrida, knowledge graph — a un precio que un abogado individual puede justificar con la primera hora ahorrada.",
    "Do I need to be tech-savvy?": "¿Necesito saber de tecnología?",
    "No. Sign up, upload documents, ask questions. If you can use WhatsApp and a browser, you can use Subsumio.":
      "No. Regístrate, sube documentos, haz preguntas. Si sabes usar WhatsApp y un navegador, sabes usar Subsumio.",
    "Can I afford this as a solo?": "¿Puedo permitírmelo como individual?",
    "The Pro plan is €890/seat/month — less than two billable hours. The 14-day reverse trial means you see real value before you pay.":
      "El plan Pro es €890/seat/mes — menos de dos horas facturables. La reverse trial de 14 días significa que ves el valor real antes de pagar.",
    "What if I grow into a firm later?": "¿Y si crezco y formo un bufete?",
    "Upgrade to Team at any time. Your brain and all indexed data carry over — no migration, no downtime.":
      "Upgrade a Team en cualquier momento. Tu brain y todos los datos indexados se transfieren — sin migración, sin downtime.",
    "Your practice. Your brain.": "Tu práctica. Tu brain.",
    "Three minutes to first cited answer. No credit card, no server, no IT.":
      "Tres minutos para la primera respuesta citada. Sin tarjeta de crédito, sin servidor, sin IT.",
    // In-house
    "Subsumio for In-House Legal — legal ops with audit-ready memory":
      "Subsumio para In-House Legal — legal ops con memoria audit-ready",
    "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.":
      "Software legal IA para equipos in-house: análisis de contratos, tracking compliance, knowledge management con citas. EU-hosted o self-hosted.",
    "For in-house legal teams": "Para equipos legales in-house",
    "Your legal department,": "Tu departamento legal,",
    "with a memory.": "con una memoria.",
    "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — cited answers in seconds, not days of document hunting.":
      "Subsumio da a los letrados in-house lo que nunca han tenido: cada contrato, documento de compliance y opinión legal indexados, consultables y audit-ready — respuestas citadas en segundos, no días de caza de documentos.",
    "The in-house reality": "La realidad in-house",
    "Contract chaos": "Caos de contratos",
    "Hundreds of contracts across business units, each with different renewal dates, liability caps and termination clauses. Finding the one that matters takes days.":
      "Cientos de contratos entre business units, cada uno con diferentes fechas de renovación, límites de responsabilidad y cláusulas de terminación. Encontrar el que importa lleva días.",
    "Compliance pressure": "Presión compliance",
    "AI Act, GDPR, sector-specific regulations — the compliance landscape shifts faster than any team can track manually.":
      "AI Act, GDPR, regulaciones específicas de sector — el panorama compliance cambia más rápido de lo que cualquier equipo puede seguir manualmente.",
    "External counsel costs": "Costes de asesores externos",
    "Every external legal question costs thousands. Your team needs to answer the routine ones internally before they become external bills.":
      "Cada pregunta legal externa cuesta miles. Tu equipo necesita responder las rutinarias internamente antes de que se conviertan en facturas externas.",
    "Built for legal operations": "Construido para legal operations",
    "Contract intelligence": "Inteligencia de contratos",
    "Bulk-analyze contracts: surface renewal dates, liability caps, termination clauses and anomalies across the entire portfolio.":
      "Analiza contratos en masa: saca a la luz fechas de renovación, límites de responsabilidad, cláusulas de terminación y anomalías en todo el portafolio.",
    "Compliance tracking": "Tracking compliance",
    "Map regulatory requirements to internal policies. Track gaps, flag deadlines, maintain an audit trail for supervisors and regulators.":
      "Mapea requisitos regulatorios a políticas internas. Rastrea gaps, señala plazos, mantiene un audit trail para supervisores y reguladores.",
    "Institutional memory": "Memoria institucional",
    "Every legal opinion, memo and external counsel answer indexed and queryable. New team members get up to speed in minutes.":
      "Cada opinión legal, memo y respuesta de asesor externo indexada y consultable. Los nuevos miembros del equipo se ponen al día en minutos.",
    "Answer before you ask external": "Responde antes de preguntar externo",
    "Ask Subsumio first — if the answer is in your documents, you save the external counsel fee. If not, you know exactly what's missing.":
      "Pregunta primero a Subsumio — si la respuesta está en tus documentos, ahorras la factura del asesor externo. Si no, sabes exactamente qué falta.",
    "Audit-ready by design": "Audit-ready por design",
    "Every query and answer is logged with sources. When the auditor asks 'how did you reach this conclusion?', the trail is there.":
      "Cada query y respuesta está logueada con fuentes. Cuando el auditor pregunta '¿cómo llegaste a esta conclusión?', el trail está ahí.",
    "From reactive to proactive legal ops": "De legal ops reactiva a proactiva",
    "The retrieval core benchmarks at 97.9% Recall@5 — meaning when you ask 'which contracts have auto-renewal in Q3?', you get the complete answer, not a partial guess.":
      "El core de retrieval alcanza 97,9% Recall@5 — lo que significa que cuando preguntas '¿qué contratos tienen auto-renovación en Q3?', obtienes la respuesta completa, no una suposición parcial.",
    "How does this integrate with our existing DMS?": "¿Cómo se integra con nuestro DMS existente?",
    "Subsumio imports from shared drives, SharePoint, and via API. Document metadata (author, date, matter) is preserved during indexing.":
      "Subsumio importa desde shared drives, SharePoint, y vía API. Los metadatos de los documentos (autor, fecha, asunto) se preservan durante la indexación.",
    "Can we control which team sees what?": "¿Podemos controlar qué ve cada equipo?",
    "Yes. Access is scoped per matter and per user. HR legal can't see M&A legal's files, and vice versa — fuzz-tested, zero leaks.":
      "Sí. El acceso está scoped por asunto y por usuario. HR legal no puede ver los ficheros de M&A legal, y viceversa — fuzz-testeado, cero fugas.",
    "What about the AI Act and internal AI governance?":
      "¿Y sobre el AI Act y la governance AI interna?",
    "Subsumio provides source citations on every answer, gap analysis for transparency, and full audit logs. This aligns with AI Act transparency requirements for internal tools.":
      "Subsumio proporciona citas de fuentes en cada respuesta, análisis de gaps para transparencia, y audit logs completos. Esto se alinea con los requisitos de transparencia del AI Act para herramientas internas.",
    "Give your legal team an answer machine.": "Da a tu equipo legal una máquina de respuestas.",
    "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.":
      "Empieza con un portafolio de contratos como piloto. Ningún dato necesita salir de tu infraestructura.",
    // Mid-sized
    "Subsumio for Mid-Sized Firms — lean team, outsized impact":
      "Subsumio para Bufetes Medianos — equipo lean, impacto superior",
    "AI legal software for mid-sized law firms: shared brain, deadline automation, WhatsApp copilot, conflict checks. EU-hosted or self-hosted.":
      "Software legal IA para bufetes medianos: brain compartido, automatización de plazos, copilot WhatsApp, control de conflictos. EU-hosted o self-hosted.",
    "For mid-sized law firms": "Para bufetes medianos",
    "Big-firm capability,": "Capacidad de gran bufete,",
    "mid-sized budget.": "budget de bufete mediano.",
    "Subsumio gives a 10-50 lawyer firm the knowledge infrastructure of a 200-lawyer firm — every matter, deadline and brief indexed and answerable, with confidentiality by architecture.":
      "Subsumio da a un bufete de 10-50 abogados la infraestructura de conocimiento de uno de 200 — cada asunto, plazo y escrito indexado y consultable, con confidencialidad por arquitectura.",
    "The mid-sized firm's challenge": "El reto del bufete mediano",
    "Doing more with less": "Hacer más con menos",
    "You compete with big firms for the same clients but have a fraction of the headcount. Every efficiency gain is a competitive advantage.":
      "Compite con grandes bufetes por los mismos clientes pero tienes una fracción del personal. Cada ganancia de eficiencia es una ventaja competitiva.",
    "Knowledge is fragmented": "El conocimiento está fragmentado",
    "Each lawyer maintains their own system — folders, notes, inbox rules. When someone's on vacation or leaves, their matters become black boxes.":
      "Cada abogado mantiene su propio sistema — carpetas, notas, reglas de bandeja. Cuando alguien está de vacaciones o se va, sus asuntos se vuelven black boxes.",
    "IT is a constraint, not an enabler": "IT es una restricción, no un habilitador",
    "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-week implementation cycle.":
      "Sin equipo IT dedicado al legal tech. Necesitas herramientas que funcionen out of the box, no proyectos que requieran seis semanas de implementación.",
    "Outsized impact for lean teams": "Impacto superior para equipos lean",
    "One shared brain": "Un brain compartido",
    "Every lawyer's matters, briefs and notes in one indexed workspace. A new associate finds the 2023 brief in seconds, not by asking three people.":
      "Asuntos, escritos y notas de cada abogado en un workspace indexado. Un nuevo asociado encuentra el escrito de 2023 en segundos, no preguntando a tres personas.",
    "Deadline control for the whole firm": "Control de plazos para todo el bufete",
    "Centralized deadline calendar with per-lawyer views. Statutory computation per ZPO/BGB/ABGB — no more spreadsheet tracking.":
      "Calendario de plazos centralizado con vistas por abogado. Cálculo legal según ZPO/BGB/ABGB — basta de tracking con hojas de cálculo.",
    "Conflict check in seconds": "Control de conflictos en segundos",
    "New client or opposing party screened against the entire case base before acceptance — automated, not manual.":
      "Nuevo cliente o contraparte screeningado contra toda la base de asuntos antes de la aceptación — automatizado, no manual.",
    "WhatsApp copilot for every lawyer": "Copilot WhatsApp para cada abogado",
    "Time booking, document filing, voice notes from the phone. The tool your lawyers actually use daily, not another system they avoid.":
      "Registro de tiempo, archivo de documentos, notas de voz desde el teléfono. La herramienta que tus abogados usan realmente a diario, no otro sistema que evitan.",
    "Time, invoices & DATEV": "Tiempos, facturas & DATEV",
    "Firm-wide time tracking, invoicing and DATEV export. Admin work that used to eat Friday afternoons, done in minutes.":
      "Tracking de tiempo a nivel de bufete, facturación y export DATEV. Trabajo admin que devoraba los viernes por la tarde, hecho en minutos.",
    "EU-hosted or self-hosted": "EU-hosted o self-hosted",
    "No US cloud, no US model provider. EU hosting with DPA, or self-host on your own hardware with your own keys.":
      "Sin cloud US, sin provider de modelos US. Hosting UE con DPA, o self-host en tu propio hardware con tus propias keys.",
    "The force multiplier your team needs": "El multiplicador de fuerza que tu equipo necesita",
    "97.9% Recall@5 means your team finds what matters — every time. When a 15-lawyer firm finds the decisive precedent in seconds, it performs like a 50-lawyer firm.":
      "97,9% Recall@5 significa que tu equipo encuentra lo que importa — cada vez. Cuando un bufete de 15 abogados encuentra el precedente decisivo en segundos, rinde como uno de 50.",
    "How quickly can we roll this out?": "¿Cuán rápido podemos hacer el rollout?",
    "A pilot with 2-3 lawyers takes a day. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Un piloto con 2-3 abogados toma un día. El rollout completo del bufete suele tomar una semana — tu equipo indexa los asuntos existentes a su ritmo.",
    "What's the pricing for a mid-sized firm?": "¿Cuál es el precio para un bufete mediano?",
    "Team plan at €1,290/seat/month from 5 seats. Annual billing saves 20%. Transparent overages — you see usage live, no surprise bills.":
      "Plan Team a €1.290/seat/mes desde 5 seats. Facturación anual ahorra 20%. Overages transparentes — ves el uso en vivo, sin facturas sorpresa.",
    "Can we start small and scale?": "¿Podemos empezar pequeño y escalar?",
    "Absolutely. Start with Pro for one lawyer, upgrade to Team when ready. All data carries over — no migration, no downtime.":
      "Absolutamente. Empieza con Pro para un abogado, upgrade a Team cuando estés listo. Todos los datos se transfieren — sin migración, sin downtime.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enSolutions)), {
    "Subsumio for Law Firms — AI legal software with citations":
      "Subsumio dla Kancelarii — oprogramowanie prawne AI z cytatami",
    "Shared case brain, automated deadlines, AI analysis with citations, conflict checks, WhatsApp copilot — GDPR-ready, EU-hosted for DACH firms.":
      "Współdzielony brain spraw, automatyczne terminy, analiza AI z cytatami, kontrola konfliktów, copilot WhatsApp — GDPR-ready, EU-hosted dla kancelarii DACH.",
    "For established law firms": "Dla ugruntowanych kancelarii",
    "Your firm's knowledge,": "Wiedza twojej kancelarii,",
    "finally answerable.": "wreszcie odpytywalna.",
    "Subsumio turns decades of matters, briefs and deadlines into one queryable brain your whole team can ask — every answer cited, confidentiality by architecture.":
      "Subsumio zamienia dekady spraw, pism i terminów w jeden odpytywalny brain, o który może zapytać cały zespół — każda odpowiedź z cytatem, poufność w architekturze.",
    "What keeps managing partners up at night": "Co nie daje spać partnerom zarządzającym",
    "Knowledge silos": "Silosy wiedzy",
    "Deadline risk": "Ryzyko terminów",
    "US clouds are a non-starter": "Chmury US nie wchodzą w grę",
    "Compete with the big firms.": "Konkuruj z dużymi kancelariami.",
    "Start with one team as a pilot. See the impact in a week.":
      "Zacznij z jednym zespołem jako pilot. Zobacz efekt w tydzień.",
    "Request a demo": "Zamów demo",
    // Law firms — pains descs
    "Each lawyer's case knowledge lives in their head and their inbox. When someone leaves, years of context walk out the door.":
      "Wiedza o sprawach każdego prawnika żyje w jego głowie i skrzynce. Kiedy ktoś odchodzi, lata kontekstu wychodzą z nim.",
    "Statutory deadlines calculated by hand or spreadsheets. One missed Notfrist and the malpractice claim is real.":
      "Terminy ustawowe liczone ręcznie lub w arkuszach. Jeden przegapiony Notfrist i roszczenie o błąd jest realne.",
    "Client files in a US-hosted AI tool? Your duty of confidentiality says no — and so do your clients.":
      "Akta klientów w narzędziu AI hostowanym w US? Twój obowiązek poufności mówi nie — i twoi klienci też.",
    // Law firms — features
    "Built for firm-wide impact": "Zbudowany dla wpływu na całą kancelarię",
    "Shared institutional memory": "Współdzielona pamięć instytucjonalna",
    "Every matter, brief, email and deadline indexed and queryable — by every lawyer in the firm. New associates get up to speed in minutes, not months.":
      "Każda sprawa, pismo, email i termin zindeksowane i odpytywalne — przez każdego prawnika w kancelarii. Nowi asocjaci wchodzą w temat w minuty, nie miesiące.",
    "Deadline control (ZPO & BGB)": "Kontrola terminów (ZPO & BGB)",
    "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.":
      "Terminy ustawowe i apelacyjne liczone z poprawną arytmetyką miesięczną i roll-forward w weekendy — z powołaniem na właściwą normę.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Kontrola konfliktów (§ 43a BRAO / § 10 RAO / BGFA)",
    "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Każdy nowy klient lub przeciwnik sprawdzany server-side przeciw całej bazie spraw przed przyjęciem mandatu. Pokrywa § 43a BRAO (DE), § 10 RAO (AT) i BGFA (CH).",
    "Matter-level isolation": "Izolacja na poziomie sprawy",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Dostęp scoped per-sprawa i per-użytkownik — fuzz-testowane, zero wycieków między sprawami lub zespołami.",
    "WhatsApp matter copilot": "Copilot WhatsApp dla spraw",
    "Lawyers book time, file documents, send voice notes from their phone. Everything lands in the right matter.":
      "Prawnicy rejestrują czas, archiwizują dokumenty, wysyłają notatki głosowe z telefonu. Wszystko trafia do właściwej sprawy.",
    "Time, expenses, invoices & DATEV": "Czas, koszty, faktury & DATEV",
    "Book minutes by lawyer/activity, create invoices from open work, export DATEV-ready accounting files.":
      "Rejestruj minuty per prawnik/aktywność, twórz faktury z otwartej pracy, eksportuj pliki księgowe DATEV-ready.",
    "Your server, your jurisdiction": "Twój serwer, twoja jurysdykcja",
    "Self-host on firm hardware or choose EU cloud with DPA. Client data never leaves your control.":
      "Self-host na hardware kancelarii lub wybierz chmurę UE z DPA. Dane klientów nigdy nie wychodzą spod twojej kontroli.",
    "Every claim, sourced": "Każda teza, z cytatem",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Odpowiedzi cytują dokładne strony, z których pochodzą. Zweryfikuj jednym kliknięciem, zanim coś trafi do pisma.",
    // Law firms — proof + faq
    "Engine-grade retrieval, not a chat wrapper": "Retrieval klasy engine, nie chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — running on infrastructure your IT governs end to end.":
      "Rdzeń retrieval osiąga 97,9% Recall@5 z wyszukiwaniem hybrydowym i knowledge graph — na infrastrukturze, którą twoja IT kontroluje end-to-end.",
    "How long does rollout take?": "Ile trwa rollout?",
    "A pilot with one closed matter takes under an hour. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Pilot z jedną zamkniętą sprawą trwa poniżej godziny. Pełny rollout kancelarii trwa zazwyczaj tydzień — twój zespół indeksuje istniejące sprawy we własnym tempie.",
    "Can we run it on our own servers?": "Czy możemy uruchomić to na własnych serwerach?",
    "Yes. The full engine self-hosts on firm hardware with local storage. Enterprise plans support on-prem with your own LLM gateway.":
      "Tak. Pełny engine self-hostuje na hardware kancelarii z lokalnym storage. Plany Enterprise wspierają on-prem z własnym gateway LLM.",
    "What about GDPR and bar obligations?": "A co z GDPR i obowiązkami adwokackimi?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. We speak your data protection officer's language.":
      "Self-hosted oznacza, że dane nigdy nie wychodzą z twojej infrastruktury. Plany hosted mają hosting UE i DPA. Mówimy językiem twojego inspektora ochrony danych.",
    "How is this different from Harvey?": "Czym to się różni od Harvey?",
    "Harvey is excellent — and runs on someone else's cloud and model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control, with a WhatsApp copilot your lawyers use daily.":
      "Harvey jest świetny — i działa na cudzej chmurze i modelu. Subsumio daje ci tę samą jakość syntezy na infrastrukturze, którą TY kontrolujesz, z copilot WhatsApp, którego twoi prawnicy używają codziennie.",
    "Start with one closed matter as a pilot.": "Zacznij z jedną zamkniętą sprawą jako pilot.",
    "No client data needs to leave your building. Three minutes to first answer.":
      "Żadne dane klienta nie muszą opuszczać twojego biura. Trzy minuty do pierwszej odpowiedzi.",
    "Try free": "Wypróbuj za darmo",
    // Solo
    "Subsumio for Solo Lawyers — AI legal software, no IT required":
      "Subsumio dla Samodzielnych Adwokatów — oprogramowanie prawne AI, bez IT",
    "AI legal software for solo practitioners: case brain, automated deadlines, cited AI answers, WhatsApp copilot. EU-hosted, no API keys, no IT overhead.":
      "Oprogramowanie prawne AI dla samodzielnych adwokatów: brain spraw, automatyczne terminy, odpowiedzi AI z cytatami, copilot WhatsApp. EU-hosted, bez API keys, bez overhead IT.",
    "For solo practitioners": "Dla samodzielnych adwokatów",
    "Your entire practice,": "Cała twoja praktyka,",
    "one question away.": "o jedno pytanie stąd.",
    "Subsumio gives a solo lawyer what a big firm's knowledge team would: every document, deadline and note indexed and answerable — with citations you can verify.":
      "Subsumio daje samodzielnemu adwokatowi to, co dużej kancelarii dałby team wiedzy: każdy dokument, termin i nuta zindeksowane i odpytywalne — z cytatami, które możesz zweryfikować.",
    "The solo lawyer's daily reality": "Codzienna rzeczywistość samodzielnego adwokata",
    "You are the knowledge team": "Jesteś teamem wiedzy",
    "No associates to delegate research, no IT department to manage infrastructure. Every minute saved on admin is a minute for clients.":
      "Bez asocjatów do delegowania research, bez działu IT do zarządzania infrastrukturą. Każda minuta zaoszczędzona na admin to minuta dla klientów.",
    "Deadlines are existential": "Terminy są egzystencjalne",
    "One missed Notfrist and you're looking at a malpractice claim. You need deadline computation that's correct by statute, not by guesswork.":
      "Jeden przegapiony Notfrist i patrzysz na roszczenie o błąd. Potrzebujesz obliczania terminów poprawnego prawnie, nie przez zgadywanie.",
    "Admin eats your day": "Admin pożera twój dzień",
    "Time booking, invoicing, document filing — the overhead of running a practice steals billable hours.":
      "Rejestrowanie czasu, fakturowanie, archiwizacja dokumentów — overhead prowadzenia praktyki kradnie godziny rachunkowe.",
    "Everything a solo practice needs": "Wszystko, czego potrzebuje samodzielna praktyka",
    "Your case brain": "Twój brain spraw",
    "Upload matters, emails, PDFs, voice notes. Subsumio indexes everything and answers in plain language — with page-level citations.":
      "Wgraj sprawy, emaile, PDFy, notatki głosowe. Subsumio indeksuje wszystko i odpowiada prostym językiem — z cytatami na poziomie strony.",
    "Deadlines, automatically": "Terminy, automatycznie",
    "Statutory deadlines per ZPO/BGB/ABGB with correct arithmetic and weekend roll-forward. Daily email digest flags what's critical.":
      "Terminy ustawowe per ZPO/BGB/ABGB z poprawną arytmetyką i roll-forward w weekendy. Codzienny digest email flaguje, co krytyczne.",
    "WhatsApp copilot": "Copilot WhatsApp",
    "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — no app switch needed.":
      "Rejestruj czas, archiwizuj dokumenty, wysyłaj notatki głosowe z telefonu. Wszystko trafia do właściwej sprawy — bez przełączania aplikacji.",
    "Time & invoices": "Czas & faktury",
    "Book minutes, create invoices from open work, export DATEV-ready files. Admin in seconds, not hours.":
      "Rejestruj minuty, twórz faktury z otwartej pracy, eksportuj pliki DATEV-ready. Admin w sekundach, nie godzinach.",
    "No server, no IT": "Bez serwera, bez IT",
    "Sign up and your brain runs — fully managed, no API keys, no infrastructure. You focus on law, not sysadmin.":
      "Zarejestruj się i twój brain działa — w pełni zarządzany, bez API keys, bez infrastruktury. Skupiasz się na prawie, nie na sysadmin.",
    "Confidentiality by design": "Poufność z założenia",
    "EU-hosted with encryption per customer. Your client data is never used to train shared models. Self-hosting available if you prefer.":
      "EU-hosted z szyfrowaniem per klient. Dane klientów nigdy nie służą do trenowania współdzielonych modeli. Self-hosting dostępny, jeśli wolisz.",
    "Big-firm capability, solo-practitioner price":
      "Możliwości dużej kancelarii, cena samodzielnego adwokata",
    "The same retrieval engine that serves established firms — 97.9% Recall@5, hybrid search, knowledge graph — at a price a solo lawyer can justify on the first saved hour.":
      "Ten sam engine retrieval, który obsługuje ugruntowane kancelarie — 97,9% Recall@5, wyszukiwanie hybrydowe, knowledge graph — w cenie, którą samodzielny adwokat może uzasadnić pierwszą zaoszczędzoną godziną.",
    "Do I need to be tech-savvy?": "Czy muszę być biegły w technologii?",
    "No. Sign up, upload documents, ask questions. If you can use WhatsApp and a browser, you can use Subsumio.":
      "Nie. Zarejestruj się, wgraj dokumenty, zadawaj pytania. Jeśli potrafisz używać WhatsApp i przeglądarki, potrafisz używać Subsumio.",
    "Can I afford this as a solo?": "Czy stać mnie na to jako samodzielnego?",
    "The Pro plan is €890/seat/month — less than two billable hours. The 14-day reverse trial means you see real value before you pay.":
      "Plan Pro to €890/seat/miesiąc — mniej niż dwie godziny rachunkowe. 14-dniowy reverse trial oznacza, że widzisz realną wartość, zanim zapłacisz.",
    "What if I grow into a firm later?": "A jeśli potem rozrosnę się w kancelarię?",
    "Upgrade to Team at any time. Your brain and all indexed data carry over — no migration, no downtime.":
      "Upgrade do Team w dowolnym momencie. Twój brain i wszystkie zindeksowane dane przechodzą — bez migracji, bez downtime.",
    "Your practice. Your brain.": "Twoja praktyka. Twój brain.",
    "Three minutes to first cited answer. No credit card, no server, no IT.":
      "Trzy minuty do pierwszej odpowiedzi z cytatem. Bez karty kredytowej, bez serwera, bez IT.",
    // In-house
    "Subsumio for In-House Legal — legal ops with audit-ready memory":
      "Subsumio dla In-House Legal — legal ops z pamięcią audit-ready",
    "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.":
      "Oprogramowanie prawne AI dla zespołów in-house: analiza kontraktów, tracking compliance, knowledge management z cytatami. EU-hosted lub self-hosted.",
    "For in-house legal teams": "Dla zespołów prawnych in-house",
    "Your legal department,": "Twój dział prawny,",
    "with a memory.": "z pamięcią.",
    "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — cited answers in seconds, not days of document hunting.":
      "Subsumio daje radcom in-house to, czego nigdy nie mieli: każdy kontrakt, dokument compliance i opinia prawna zindeksowane, odpytywalne i audit-ready — odpowiedzi z cytatami w sekundy, nie dni poszukiwań dokumentów.",
    "The in-house reality": "Rzeczywistość in-house",
    "Contract chaos": "Chaos kontraktów",
    "Hundreds of contracts across business units, each with different renewal dates, liability caps and termination clauses. Finding the one that matters takes days.":
      "Setki kontraktów w business unit, każdy z innymi datami odnowienia, limitami odpowiedzialności i klauzulami terminacji. Znalezienie tego, który się liczy, zajmuje dni.",
    "Compliance pressure": "Presja compliance",
    "AI Act, GDPR, sector-specific regulations — the compliance landscape shifts faster than any team can track manually.":
      "AI Act, GDPR, regulacje sektorowe — krajobraz compliance zmienia się szybciej, niż jakikolwiek zespół może śledzić ręcznie.",
    "External counsel costs": "Koszty doradców zewnętrznych",
    "Every external legal question costs thousands. Your team needs to answer the routine ones internally before they become external bills.":
      "Każde zewnętrzne pytanie prawne kosztuje tysiące. Twój zespół musi odpowiadać na rutynowe wewnętrznie, zanim staną się zewnętrznymi rachunkami.",
    "Built for legal operations": "Zbudowany dla legal operations",
    "Contract intelligence": "Inteligencja kontraktowa",
    "Bulk-analyze contracts: surface renewal dates, liability caps, termination clauses and anomalies across the entire portfolio.":
      "Analizuj kontrakty masowo: wydobywaj daty odnowienia, limity odpowiedzialności, klauzule terminacji i anomalie w całym portfelu.",
    "Compliance tracking": "Tracking compliance",
    "Map regulatory requirements to internal policies. Track gaps, flag deadlines, maintain an audit trail for supervisors and regulators.":
      "Mapuj wymagania regulacyjne na wewnętrzne polityki. Śledź luki, flaguj terminy, utrzymuj audit trail dla nadzorców i regulatorów.",
    "Institutional memory": "Pamięć instytucjonalna",
    "Every legal opinion, memo and external counsel answer indexed and queryable. New team members get up to speed in minutes.":
      "Każda opinia prawna, memo i odpowiedź doradcy zewnętrznego zindeksowana i odpytywalna. Nowi członkowie zespołu wchodzą w temat w minuty.",
    "Answer before you ask external": "Odpowiedz, zanim zapytasz zewnętrznie",
    "Ask Subsumio first — if the answer is in your documents, you save the external counsel fee. If not, you know exactly what's missing.":
      "Zapytaj najpierw Subsumio — jeśli odpowiedź jest w twoich dokumentach, oszczędzasz opłatę doradcy zewnętrznego. Jeśli nie, wiesz dokładnie, czego brakuje.",
    "Audit-ready by design": "Audit-ready z założenia",
    "Every query and answer is logged with sources. When the auditor asks 'how did you reach this conclusion?', the trail is there.":
      "Każde zapytanie i odpowiedź są logowane ze źródłami. Gdy auditor pyta 'jak doszedłeś do tej konkluzji?', trail jest tam.",
    "From reactive to proactive legal ops": "Od reaktywnego do proaktywnego legal ops",
    "The retrieval core benchmarks at 97.9% Recall@5 — meaning when you ask 'which contracts have auto-renewal in Q3?', you get the complete answer, not a partial guess.":
      "Rdzeń retrieval osiąga 97,9% Recall@5 — co oznacza, że gdy pytasz 'które kontrakty mają auto-renewal w Q3?', otrzymujesz pełną odpowiedź, nie częściowe zgadywanie.",
    "How does this integrate with our existing DMS?": "Jak integruje się z naszym DMS?",
    "Subsumio imports from shared drives, SharePoint, and via API. Document metadata (author, date, matter) is preserved during indexing.":
      "Subsumio importuje z shared drives, SharePoint i przez API. Metadane dokumentów (autor, data, sprawa) są zachowane podczas indeksowania.",
    "Can we control which team sees what?": "Czy możemy kontrolować, co widzi który zespół?",
    "Yes. Access is scoped per matter and per user. HR legal can't see M&A legal's files, and vice versa — fuzz-tested, zero leaks.":
      "Tak. Dostęp jest scoped per sprawa i per użytkownik. HR legal nie widzi plików M&A legal i odwrotnie — fuzz-testowane, zero wycieków.",
    "What about the AI Act and internal AI governance?":
      "A co z AI Act i wewnętrznym governance AI?",
    "Subsumio provides source citations on every answer, gap analysis for transparency, and full audit logs. This aligns with AI Act transparency requirements for internal tools.":
      "Subsumio dostarcza cytaty źródeł na każdą odpowiedź, analizę luk dla transparentności i pełne audit logi. To alignuje z wymogami transparentności AI Act dla narzędzi wewnętrznych.",
    "Give your legal team an answer machine.": "Daj swojemu zespołowi prawnemu maszynę odpowiedzi.",
    "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.":
      "Zacznij z jednym portfelem kontraktów jako pilot. Żadne dane nie muszą opuszczać twojej infrastruktury.",
    // Mid-sized
    "Subsumio for Mid-Sized Firms — lean team, outsized impact":
      "Subsumio dla Średnich Kancelarii — zespół lean, wpływ outsized",
    "AI legal software for mid-sized law firms: shared brain, deadline automation, WhatsApp copilot, conflict checks. EU-hosted or self-hosted.":
      "Oprogramowanie prawne AI dla średnich kancelarii: współdzielony brain, automatyzacja terminów, copilot WhatsApp, kontrola konfliktów. EU-hosted lub self-hosted.",
    "For mid-sized law firms": "Dla średnich kancelarii",
    "Big-firm capability,": "Możliwości dużej kancelarii,",
    "mid-sized budget.": "budget średniej kancelarii.",
    "Subsumio gives a 10-50 lawyer firm the knowledge infrastructure of a 200-lawyer firm — every matter, deadline and brief indexed and answerable, with confidentiality by architecture.":
      "Subsumio daje kancelarii 10-50 prawników infrastrukturę wiedzy kancelarii 200-prawników — każda sprawa, termin i pismo zindeksowane i odpytywalne, z poufnością w architekturze.",
    "The mid-sized firm's challenge": "Wyzwanie średniej kancelarii",
    "Doing more with less": "Więcej z mniejszym",
    "You compete with big firms for the same clients but have a fraction of the headcount. Every efficiency gain is a competitive advantage.":
      "Konkurujesz z dużymi kancelariami o tych samych klientów, ale masz ułamek personelu. Każdy zysk efektywności to przewaga konkurencyjna.",
    "Knowledge is fragmented": "Wiedza jest pofragmentowana",
    "Each lawyer maintains their own system — folders, notes, inbox rules. When someone's on vacation or leaves, their matters become black boxes.":
      "Każdy prawnik utrzymuje własny system — foldery, notatki, reguły inbox. Kiedy ktoś jest na urlopie lub odchodzi, jego sprawy stają się black boxami.",
    "IT is a constraint, not an enabler": "IT jest ograniczeniem, nie enablerem",
    "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-week implementation cycle.":
      "Brak dedykowanego zespołu IT dla legal tech. Potrzebujesz narzędzi, które działają out of the box, nie projektów wymagających sześciu tygodni wdrożenia.",
    "Outsized impact for lean teams": "Outsized wpływ dla lean zespołów",
    "One shared brain": "Jeden współdzielony brain",
    "Every lawyer's matters, briefs and notes in one indexed workspace. A new associate finds the 2023 brief in seconds, not by asking three people.":
      "Sprawy, pisma i notatki każdego prawnika w jednym zindeksowanym workspace. Nowy asocjat znajduje pismo z 2023 w sekundy, nie pytając trzech osób.",
    "Deadline control for the whole firm": "Kontrola terminów dla całej kancelarii",
    "Centralized deadline calendar with per-lawyer views. Statutory computation per ZPO/BGB/ABGB — no more spreadsheet tracking.":
      "Scentralizowany kalendarz terminów z widokami per prawnik. Obliczenia ustawowe per ZPO/BGB/ABGB — koniec z trackingiem w arkuszach.",
    "Conflict check in seconds": "Kontrola konfliktów w sekundy",
    "New client or opposing party screened against the entire case base before acceptance — automated, not manual.":
      "Nowy klient lub przeciwnik sprawdzany przeciw całej bazie spraw przed akceptacją — automatyczne, nie ręczne.",
    "WhatsApp copilot for every lawyer": "Copilot WhatsApp dla każdego prawnika",
    "Time booking, document filing, voice notes from the phone. The tool your lawyers actually use daily, not another system they avoid.":
      "Rejestrowanie czasu, archiwizacja dokumentów, notatki głosowe z telefonu. Narzędzie, którego twoi prawnicy naprawdę używają codziennie, nie kolejny system, którego unikają.",
    "Time, invoices & DATEV": "Czas, faktury & DATEV",
    "Firm-wide time tracking, invoicing and DATEV export. Admin work that used to eat Friday afternoons, done in minutes.":
      "Tracking czasu w całej kancelarii, fakturowanie i export DATEV. Praca admin, która pożerała piątkowe popołudnia, zrobiona w minuty.",
    "EU-hosted or self-hosted": "EU-hosted lub self-hosted",
    "No US cloud, no US model provider. EU hosting with DPA, or self-host on your own hardware with your own keys.":
      "Bez chmury US, bez provider modeli US. Hosting UE z DPA, lub self-host na własnym hardware z własnymi kluczami.",
    "The force multiplier your team needs": "Mnożnik siły, którego twój zespół potrzebuje",
    "97.9% Recall@5 means your team finds what matters — every time. When a 15-lawyer firm finds the decisive precedent in seconds, it performs like a 50-lawyer firm.":
      "97,9% Recall@5 oznacza, że twój zespół znajduje to, co ważne — za każdym razem. Gdy 15-osobowa kancelaria znajduje decydujący precedens w sekundy, funkcjonuje jak 50-osobowa.",
    "How quickly can we roll this out?": "Jak szybko możemy wdrożyć?",
    "A pilot with 2-3 lawyers takes a day. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Pilot z 2-3 prawnikami trwa dzień. Pełny rollout kancelarii trwa zazwyczaj tydzień — twój zespół indeksuje istniejące sprawy we własnym tempie.",
    "What's the pricing for a mid-sized firm?": "Jaka jest cena dla średniej kancelarii?",
    "Team plan at €1,290/seat/month from 5 seats. Annual billing saves 20%. Transparent overages — you see usage live, no surprise bills.":
      "Plan Team €1.290/seat/miesiąc od 5 seat. Fakturowanie roczne oszczędza 20%. Przejrzyste overages — widzisz zużycie live, bez niespodzianek.",
    "Can we start small and scale?": "Czy możemy zacząć mało i skalować?",
    "Absolutely. Start with Pro for one lawyer, upgrade to Team when ready. All data carries over — no migration, no downtime.":
      "Absolutnie. Zacznij z Pro dla jednego prawnika, upgrade do Team, gdy gotowy. Wszystkie dane przechodzą — bez migracji, bez downtime.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enSolutions)), {
    "Subsumio for Law Firms — AI legal software with citations":
      "Subsumio pour Cabinets — logiciel juridique IA avec citations",
    "Shared case brain, automated deadlines, AI analysis with citations, conflict checks, WhatsApp copilot — GDPR-ready, EU-hosted for DACH firms.":
      "Brain partagé pour dossiers, délais automatiques, analyse IA avec citations, contrôle des conflits, copilot WhatsApp — GDPR-ready, EU-hosted pour cabinets DACH.",
    "For established law firms": "Pour cabinets établis",
    "Your firm's knowledge,": "La connaissance de votre cabinet,",
    "finally answerable.": "enfin interrogeable.",
    "Subsumio turns decades of matters, briefs and deadlines into one queryable brain your whole team can ask — every answer cited, confidentiality by architecture.":
      "Subsumio transforme des décennies de dossiers, conclusions et délais en un brain interrogeable que toute votre équipe peut consulter — chaque réponse citée, confidentialité par architecture.",
    "What keeps managing partners up at night": "Ce qui empêche les associés de dormir la nuit",
    "Knowledge silos": "Silos de connaissances",
    "Deadline risk": "Risque de délais",
    "US clouds are a non-starter": "Clouds US exclus d'office",
    "Compete with the big firms.": "Faites concurrence aux grands cabinets.",
    "Start with one team as a pilot. See the impact in a week.":
      "Commencez avec une équipe pilote. Voyez l'impact en une semaine.",
    "Request a demo": "Demander une démo",
    // Law firms — pains descs
    "Each lawyer's case knowledge lives in their head and their inbox. When someone leaves, years of context walk out the door.":
      "La connaissance des dossiers de chaque avocat vit dans sa tête et sa boîte mail. Quand quelqu'un part, des années de contexte partent avec lui.",
    "Statutory deadlines calculated by hand or spreadsheets. One missed Notfrist and the malpractice claim is real.":
      "Délais légaux calculés à la main ou sur tableur. Un Notfrist manqué et la réclamation pour négligence est réelle.",
    "Client files in a US-hosted AI tool? Your duty of confidentiality says no — and so do your clients.":
      "Dossiers de clients dans un outil AI hébergé aux US? Votre devoir de confidentialité dit non — et vos clients aussi.",
    // Law firms — features
    "Built for firm-wide impact": "Construit pour un impact à l'échelle du cabinet",
    "Shared institutional memory": "Mémoire institutionnelle partagée",
    "Every matter, brief, email and deadline indexed and queryable — by every lawyer in the firm. New associates get up to speed in minutes, not months.":
      "Chaque dossier, conclusion, email et délai indexé et interrogeable — par chaque avocat du cabinet. Les nouveaux collaborateurs sont opérationnels en minutes, pas en mois.",
    "Deadline control (ZPO & BGB)": "Contrôle des délais (ZPO & BGB)",
    "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.":
      "Délais légaux et d'appel calculés avec arithmétique mensuelle correcte et report aux weekends — avec la norme applicable citée.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Contrôle des conflits (§ 43a BRAO / § 10 RAO / BGFA)",
    "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Chaque nouveau client ou partie adverse vérifié server-side contre toute la base de dossiers avant l'acceptation du mandat. Couvre § 43a BRAO (DE), § 10 RAO (AT) et BGFA (CH).",
    "Matter-level isolation": "Isolation au niveau du dossier",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Accès scoped par dossier et par utilisateur — fuzz-testé, zéro fuite entre dossiers ou équipes.",
    "WhatsApp matter copilot": "Copilot WhatsApp pour dossiers",
    "Lawyers book time, file documents, send voice notes from their phone. Everything lands in the right matter.":
      "Les avocats enregistrent le temps, classent les documents, envoient des notes vocales depuis leur téléphone. Tout arrive dans le bon dossier.",
    "Time, expenses, invoices & DATEV": "Temps, frais, factures & DATEV",
    "Book minutes by lawyer/activity, create invoices from open work, export DATEV-ready accounting files.":
      "Enregistrer les minutes par avocat/activité, créer des factures depuis le travail ouvert, exporter des fichiers comptables DATEV-ready.",
    "Your server, your jurisdiction": "Votre serveur, votre juridiction",
    "Self-host on firm hardware or choose EU cloud with DPA. Client data never leaves your control.":
      "Self-host sur le matériel du cabinet ou choisissez le cloud UE avec DPA. Les données clients ne quittent jamais votre contrôle.",
    "Every claim, sourced": "Chaque affirmation, citée",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Les réponses citent les pages exactes d'où elles proviennent. Vérifiez en un clic avant que quoi que ce soit n'aille dans une conclusion.",
    // Law firms — proof + faq
    "Engine-grade retrieval, not a chat wrapper": "Retrieval de grade engine, pas un chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — running on infrastructure your IT governs end to end.":
      "Le core de retrieval atteint 97,9% Recall@5 avec recherche hybride et knowledge graph — sur une infrastructure que votre IT maîtrise end-to-end.",
    "How long does rollout take?": "Combien de temps prend le rollout?",
    "A pilot with one closed matter takes under an hour. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Un pilote avec un dossier clôturé prend moins d'une heure. Le rollout complet du cabinet prend typiquement une semaine — votre équipe indexe les dossiers existants à son rythme.",
    "Can we run it on our own servers?": "Pouvons-nous l'exécuter sur nos propres serveurs?",
    "Yes. The full engine self-hosts on firm hardware with local storage. Enterprise plans support on-prem with your own LLM gateway.":
      "Oui. Le moteur complet se self-hoste sur le matériel du cabinet avec stockage local. Les plans Enterprise supportent l'on-prem avec votre propre gateway LLM.",
    "What about GDPR and bar obligations?": "Qu'en est-il du RGPD et des obligations du barreau?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. We speak your data protection officer's language.":
      "Self-hosted signifie que les données ne quittent jamais votre infrastructure. Les plans hosted viennent avec hosting UE et DPA. Nous parlons la langue de votre délégué à la protection des données.",
    "How is this different from Harvey?": "En quoi cela diffère-t-il de Harvey?",
    "Harvey is excellent — and runs on someone else's cloud and model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control, with a WhatsApp copilot your lawyers use daily.":
      "Harvey est excellent — et tourne sur la cloud et le modèle de quelqu'un d'autre. Subsumio vous donne la même qualité de synthèse sur une infrastructure que VOUS contrôlez, avec un copilot WhatsApp que vos avocats utilisent quotidiennement.",
    "Start with one closed matter as a pilot.": "Commencez avec un dossier clôturé comme pilote.",
    "No client data needs to leave your building. Three minutes to first answer.":
      "Aucune donnée client ne doit quitter votre cabinet. Trois minutes pour la première réponse.",
    "Try free": "Essayer gratuitement",
    // Solo
    "Subsumio for Solo Lawyers — AI legal software, no IT required":
      "Subsumio pour Avocats Indépendants — logiciel juridique AI, sans IT requis",
    "AI legal software for solo practitioners: case brain, automated deadlines, cited AI answers, WhatsApp copilot. EU-hosted, no API keys, no IT overhead.":
      "Logiciel juridique AI pour avocats indépendants: brain de dossiers, délais automatiques, réponses AI citées, copilot WhatsApp. EU-hosted, sans API keys, sans overhead IT.",
    "For solo practitioners": "Pour avocats indépendants",
    "Your entire practice,": "Toute votre pratique,",
    "one question away.": "à une question près.",
    "Subsumio gives a solo lawyer what a big firm's knowledge team would: every document, deadline and note indexed and answerable — with citations you can verify.":
      "Subsumio donne à un avocat indépendant ce qu'une grande cabinet aurait: chaque document, délai et note indexés et interrogeables — avec des citations que vous pouvez vérifier.",
    "The solo lawyer's daily reality": "La réalité quotidienne de l'avocat indépendant",
    "You are the knowledge team": "Vous êtes le team de connaissance",
    "No associates to delegate research, no IT department to manage infrastructure. Every minute saved on admin is a minute for clients.":
      "Pas de collaborateurs pour déléguer la research, pas de département IT pour gérer l'infrastructure. Chaque minute économisée sur l'admin est une minute pour les clients.",
    "Deadlines are existential": "Les délais sont existentiels",
    "One missed Notfrist and you're looking at a malpractice claim. You need deadline computation that's correct by statute, not by guesswork.":
      "Un Notfrist manqué et vous faites face à une réclamation pour négligence. Vous avez besoin d'un calcul des délais correct par la loi, pas par supposition.",
    "Admin eats your day": "L'admin dévore votre journée",
    "Time booking, invoicing, document filing — the overhead of running a practice steals billable hours.":
      "Enregistrement du temps, facturation, classement de documents — l'overhead de gérer une pratique vole des heures facturables.",
    "Everything a solo practice needs": "Tout ce dont une pratique indépendante a besoin",
    "Your case brain": "Votre brain de dossiers",
    "Upload matters, emails, PDFs, voice notes. Subsumio indexes everything and answers in plain language — with page-level citations.":
      "Téléchargez dossiers, emails, PDFs, notes vocales. Subsumio indexe tout et répond en langage clair — avec des citations au niveau de la page.",
    "Deadlines, automatically": "Délais, automatiquement",
    "Statutory deadlines per ZPO/BGB/ABGB with correct arithmetic and weekend roll-forward. Daily email digest flags what's critical.":
      "Délais légaux selon ZPO/BGB/ABGB avec arithmétique correcte et report aux weekends. Digest email quotidien signale ce qui est critique.",
    "WhatsApp copilot": "Copilot WhatsApp",
    "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — no app switch needed.":
      "Enregistrez le temps, classez les documents, envoyez des notes vocales depuis votre téléphone. Tout arrive dans le bon dossier — sans changer d'app.",
    "Time & invoices": "Temps & factures",
    "Book minutes, create invoices from open work, export DATEV-ready files. Admin in seconds, not hours.":
      "Enregistrez les minutes, créez des factures depuis le travail ouvert, exportez des fichiers DATEV-ready. Admin en secondes, pas en heures.",
    "No server, no IT": "Pas de serveur, pas d'IT",
    "Sign up and your brain runs — fully managed, no API keys, no infrastructure. You focus on law, not sysadmin.":
      "Inscrivez-vous et votre brain fonctionne — entièrement géré, sans API keys, sans infrastructure. Vous vous concentrez sur le droit, pas sur le sysadmin.",
    "Confidentiality by design": "Confidentialité par design",
    "EU-hosted with encryption per customer. Your client data is never used to train shared models. Self-hosting available if you prefer.":
      "EU-hosted avec chiffrement par client. Vos données clients ne sont jamais utilisées pour entraîner des modèles partagés. Self-hosting disponible si vous préférez.",
    "Big-firm capability, solo-practitioner price":
      "Capacité de grand cabinet, prix d'avocat indépendant",
    "The same retrieval engine that serves established firms — 97.9% Recall@5, hybrid search, knowledge graph — at a price a solo lawyer can justify on the first saved hour.":
      "Le même engine de retrieval qui sert les cabinets établis — 97,9% Recall@5, recherche hybride, knowledge graph — à un prix qu'un avocat indépendant peut justifier dès la première heure économisée.",
    "Do I need to be tech-savvy?": "Dois-je être à l'aise avec la tech?",
    "No. Sign up, upload documents, ask questions. If you can use WhatsApp and a browser, you can use Subsumio.":
      "Non. Inscrivez-vous, téléchargez des documents, posez des questions. Si vous savez utiliser WhatsApp et un navigateur, vous savez utiliser Subsumio.",
    "Can I afford this as a solo?": "Puis-je me le permettre en indépendant?",
    "The Pro plan is €890/seat/month — less than two billable hours. The 14-day reverse trial means you see real value before you pay.":
      "Le plan Pro est €890/seat/mois — moins de deux heures facturables. L'essai inversé de 14 jours signifie que vous voyez la vraie valeur avant de payer.",
    "What if I grow into a firm later?": "Et si je grandis et forme un cabinet?",
    "Upgrade to Team at any time. Your brain and all indexed data carry over — no migration, no downtime.":
      "Upgrade vers Team à tout moment. Votre brain et toutes les données indexées sont conservés — sans migration, sans downtime.",
    "Your practice. Your brain.": "Votre pratique. Votre brain.",
    "Three minutes to first cited answer. No credit card, no server, no IT.":
      "Trois minutes pour la première réponse citée. Pas de carte de crédit, pas de serveur, pas d'IT.",
    // In-house
    "Subsumio for In-House Legal — legal ops with audit-ready memory":
      "Subsumio pour In-House Legal — legal ops avec mémoire audit-ready",
    "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.":
      "Logiciel juridique AI pour équipes in-house: analyse de contrats, tracking compliance, knowledge management avec citations. EU-hosted ou self-hosted.",
    "For in-house legal teams": "Pour équipes juridiques in-house",
    "Your legal department,": "Votre département juridique,",
    "with a memory.": "avec une mémoire.",
    "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — cited answers in seconds, not days of document hunting.":
      "Subsumio donne aux juristes in-house ce qu'ils n'ont jamais eu: chaque contrat, document de compliance et avis juridique indexé, interrogeable et audit-ready — réponses citées en secondes, pas en jours de chasse aux documents.",
    "The in-house reality": "La réalité in-house",
    "Contract chaos": "Chaos de contrats",
    "Hundreds of contracts across business units, each with different renewal dates, liability caps and termination clauses. Finding the one that matters takes days.":
      "Des centaines de contrats entre business units, chacun avec différentes dates de renouvellement, plafonds de responsabilité et clauses de résiliation. Trouver celui qui compte prend des jours.",
    "Compliance pressure": "Pression compliance",
    "AI Act, GDPR, sector-specific regulations — the compliance landscape shifts faster than any team can track manually.":
      "AI Act, RGPD, réglementations sectorielles — le paysage compliance évolue plus vite que ce qu'une équipe peut suivre manuellement.",
    "External counsel costs": "Coûts de conseils externes",
    "Every external legal question costs thousands. Your team needs to answer the routine ones internally before they become external bills.":
      "Chaque question juridique externe coûte des milliers. Votre équipe doit répondre aux questions de routine en interne avant qu'elles ne deviennent des factures externes.",
    "Built for legal operations": "Construit pour les legal operations",
    "Contract intelligence": "Intelligence contractuelle",
    "Bulk-analyze contracts: surface renewal dates, liability caps, termination clauses and anomalies across the entire portfolio.":
      "Analysez les contrats en masse: faites ressortir les dates de renouvellement, plafonds de responsabilité, clauses de résiliation et anomalies dans tout le portefeuille.",
    "Compliance tracking": "Tracking compliance",
    "Map regulatory requirements to internal policies. Track gaps, flag deadlines, maintain an audit trail for supervisors and regulators.":
      "Mappez les exigences réglementaires sur les politiques internes. Suivez les écarts, signalez les délais, maintenez un audit trail pour les superviseurs et régulateurs.",
    "Institutional memory": "Mémoire institutionnelle",
    "Every legal opinion, memo and external counsel answer indexed and queryable. New team members get up to speed in minutes.":
      "Chaque avis juridique, memo et réponse de conseil externe indexé et interrogeable. Les nouveaux membres de l'équipe sont opérationnels en minutes.",
    "Answer before you ask external": "Répondez avant de demander à l'externe",
    "Ask Subsumio first — if the answer is in your documents, you save the external counsel fee. If not, you know exactly what's missing.":
      "Demandez d'abord à Subsumio — si la réponse est dans vos documents, vous économisez les honoraires du conseil externe. Sinon, vous savez exactement ce qui manque.",
    "Audit-ready by design": "Audit-ready par design",
    "Every query and answer is logged with sources. When the auditor asks 'how did you reach this conclusion?', the trail is there.":
      "Chaque query et réponse est loguée avec ses sources. Quand l'auditor demande 'comment êtes-vous arrivé à cette conclusion?', le trail est là.",
    "From reactive to proactive legal ops": "De legal ops réactif à proactif",
    "The retrieval core benchmarks at 97.9% Recall@5 — meaning when you ask 'which contracts have auto-renewal in Q3?', you get the complete answer, not a partial guess.":
      "Le core de retrieval atteint 97,9% Recall@5 — ce qui signifie que quand vous demandez 'quels contrats ont une auto-renouvellement en Q3?', vous obtenez la réponse complète, pas une supposition partielle.",
    "How does this integrate with our existing DMS?":
      "Comment cela s'intègre-t-il avec notre DMS existant?",
    "Subsumio imports from shared drives, SharePoint, and via API. Document metadata (author, date, matter) is preserved during indexing.":
      "Subsumio importe depuis les shared drives, SharePoint, et via API. Les métadonnées des documents (auteur, date, dossier) sont préservées lors de l'indexation.",
    "Can we control which team sees what?": "Pouvons-nous contrôler ce que chaque équipe voit?",
    "Yes. Access is scoped per matter and per user. HR legal can't see M&A legal's files, and vice versa — fuzz-tested, zero leaks.":
      "Oui. L'accès est scoped par dossier et par utilisateur. HR legal ne peut pas voir les fichiers de M&A legal, et vice versa — fuzz-testé, zéro fuite.",
    "What about the AI Act and internal AI governance?":
      "Qu'en est-il de l'AI Act et de la governance AI interne?",
    "Subsumio provides source citations on every answer, gap analysis for transparency, and full audit logs. This aligns with AI Act transparency requirements for internal tools.":
      "Subsumio fournit des citations de sources sur chaque réponse, analyse des écarts pour la transparence, et audit logs complets. Cela s'aligne avec les exigences de transparence de l'AI Act pour les outils internes.",
    "Give your legal team an answer machine.":
      "Donnez à votre équipe juridique une machine à réponses.",
    "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.":
      "Commencez avec un portefeuille de contrats comme pilote. Aucune donnée ne doit quitter votre infrastructure.",
    // Mid-sized
    "Subsumio for Mid-Sized Firms — lean team, outsized impact":
      "Subsumio pour Cabinets Moyens — équipe lean, impact supérieur",
    "AI legal software for mid-sized law firms: shared brain, deadline automation, WhatsApp copilot, conflict checks. EU-hosted or self-hosted.":
      "Logiciel juridique AI pour cabinets moyens: brain partagé, automatisation des délais, copilot WhatsApp, contrôle des conflits. EU-hosted ou self-hosted.",
    "For mid-sized law firms": "Pour cabinets juridiques moyens",
    "Big-firm capability,": "Capacité de grand cabinet,",
    "mid-sized budget.": "budget de cabinet moyen.",
    "Subsumio gives a 10-50 lawyer firm the knowledge infrastructure of a 200-lawyer firm — every matter, deadline and brief indexed and answerable, with confidentiality by architecture.":
      "Subsumio donne à un cabinet de 10-50 avocats l'infrastructure de connaissance d'un cabinet de 200 — chaque dossier, délai et conclusion indexé et interrogeable, avec confidentialité par architecture.",
    "The mid-sized firm's challenge": "Le défi du cabinet moyen",
    "Doing more with less": "Faire plus avec moins",
    "You compete with big firms for the same clients but have a fraction of the headcount. Every efficiency gain is a competitive advantage.":
      "Vous concurrensez les grands cabinets pour les mêmes clients mais avec une fraction du personnel. Chaque gain d'efficacité est un avantage concurrentiel.",
    "Knowledge is fragmented": "La connaissance est fragmentée",
    "Each lawyer maintains their own system — folders, notes, inbox rules. When someone's on vacation or leaves, their matters become black boxes.":
      "Chaque avocat maintient son propre système — dossiers, notes, règles de boîte mail. Quand quelqu'un est en vacances ou part, ses dossiers deviennent des black boxes.",
    "IT is a constraint, not an enabler": "IT est une contrainte, pas un enabler",
    "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-week implementation cycle.":
      "Pas d'équipe IT dédiée au legal tech. Vous avez besoin d'outils qui fonctionnent out of the box, pas de projets qui nécessitent six semaines d'implémentation.",
    "Outsized impact for lean teams": "Impact supérieur pour équipes lean",
    "One shared brain": "Un brain partagé",
    "Every lawyer's matters, briefs and notes in one indexed workspace. A new associate finds the 2023 brief in seconds, not by asking three people.":
      "Dossiers, conclusions et notes de chaque avocat dans un workspace indexé. Un nouveau collaborateur trouve la conclusion de 2023 en secondes, pas en demandant à trois personnes.",
    "Deadline control for the whole firm": "Contrôle des délais pour tout le cabinet",
    "Centralized deadline calendar with per-lawyer views. Statutory computation per ZPO/BGB/ABGB — no more spreadsheet tracking.":
      "Calendrier des délais centralisé avec vues par avocat. Calcul légal selon ZPO/BGB/ABGB — fini le tracking sur tableur.",
    "Conflict check in seconds": "Contrôle des conflits en secondes",
    "New client or opposing party screened against the entire case base before acceptance — automated, not manual.":
      "Nouveau client ou partie adverse vérifié contre toute la base de dossiers avant l'acceptation — automatisé, pas manuel.",
    "WhatsApp copilot for every lawyer": "Copilot WhatsApp pour chaque avocat",
    "Time booking, document filing, voice notes from the phone. The tool your lawyers actually use daily, not another system they avoid.":
      "Enregistrement du temps, classement de documents, notes vocales depuis le téléphone. L'outil que vos avocats utilisent vraiment quotidiennement, pas un autre système qu'ils évitent.",
    "Time, invoices & DATEV": "Temps, factures & DATEV",
    "Firm-wide time tracking, invoicing and DATEV export. Admin work that used to eat Friday afternoons, done in minutes.":
      "Tracking du temps à l'échelle du cabinet, facturation et export DATEV. Le travail admin qui mangeait les vendredis après-midi, fait en minutes.",
    "EU-hosted or self-hosted": "EU-hosted ou self-hosted",
    "No US cloud, no US model provider. EU hosting with DPA, or self-host on your own hardware with your own keys.":
      "Pas de cloud US, pas de provider de modèles US. Hosting UE avec DPA, ou self-host sur votre propre matériel avec vos propres clés.",
    "The force multiplier your team needs": "Le multiplicateur de force dont votre équipe a besoin",
    "97.9% Recall@5 means your team finds what matters — every time. When a 15-lawyer firm finds the decisive precedent in seconds, it performs like a 50-lawyer firm.":
      "97,9% Recall@5 signifie que votre équipe trouve ce qui compte — à chaque fois. Quand un cabinet de 15 avocats trouve le précédent décisif en secondes, il performe comme un cabinet de 50.",
    "How quickly can we roll this out?": "Combien rapidement pouvons-nous déployer?",
    "A pilot with 2-3 lawyers takes a day. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Un pilote avec 2-3 avocats prend un jour. Le rollout complet du cabinet prend typiquement une semaine — votre équipe indexe les dossiers existants à son rythme.",
    "What's the pricing for a mid-sized firm?": "Quel est le prix pour un cabinet moyen?",
    "Team plan at €1,290/seat/month from 5 seats. Annual billing saves 20%. Transparent overages — you see usage live, no surprise bills.":
      "Plan Team à €1.290/seat/mois dès 5 seats. Facturation annuelle économise 20%. Overages transparents — vous voyez l'usage en live, pas de factures surprises.",
    "Can we start small and scale?": "Pouvons-nous commencer petit et scaler?",
    "Absolutely. Start with Pro for one lawyer, upgrade to Team when ready. All data carries over — no migration, no downtime.":
      "Absolument. Commencez avec Pro pour un avocat, upgrade vers Team quand prêt. Toutes les données sont conservées — sans migration, sans downtime.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enSolutions)), {
    "Subsumio for Law Firms — AI legal software with citations":
      "Subsumio voor Advocatenkantoren — AI juridische software met citaten",
    "Shared case brain, automated deadlines, AI analysis with citations, conflict checks, WhatsApp copilot — GDPR-ready, EU-hosted for DACH firms.":
      "Gedeeld brain voor zaken, automatische termijnen, AI-analyse met citaten, conflictencontrole, WhatsApp copilot — GDPR-ready, EU-hosted voor DACH-kantoren.",
    "For established law firms": "Voor gevestigde advocatenkantoren",
    "Your firm's knowledge,": "De kennis van je kantoor,",
    "finally answerable.": "eindelijk bevraagbaar.",
    "Subsumio turns decades of matters, briefs and deadlines into one queryable brain your whole team can ask — every answer cited, confidentiality by architecture.":
      "Subsumio verandert decennia van zaken, pleidooien en termijnen in één bevraagbaar brain dat je hele team kan raadplegen — elk antwoord geciteerd, vertrouwelijkheid in de architectuur.",
    "What keeps managing partners up at night": "Wat managing partners wakker houdt 's nachts",
    "Knowledge silos": "Kennis-silo's",
    "Deadline risk": "Termijnrisico",
    "US clouds are a non-starter": "US-clouds zijn geen optie",
    "Compete with the big firms.": "Concureer met de grote kantoren.",
    "Start with one team as a pilot. See the impact in a week.":
      "Begin met één team als pilot. Zie de impact in een week.",
    "Request a demo": "Vraag een demo aan",
    // Law firms — pains descs
    "Each lawyer's case knowledge lives in their head and their inbox. When someone leaves, years of context walk out the door.":
      "De zaakkennis van elke advocaat leeft in zijn hoofd en zijn inbox. Als iemand vertrekt, gaan jaren van context met hem mee.",
    "Statutory deadlines calculated by hand or spreadsheets. One missed Notfrist and the malpractice claim is real.":
      "Wettelijke termijnen berekend met de hand of spreadsheets. Eén gemiste Notfrist en de aanspraak wegens beroepsfout is realiteit.",
    "Client files in a US-hosted AI tool? Your duty of confidentiality says no — and so do your clients.":
      "Klantdossiers in een AI-tool gehost in de US? Jouw geheimhoudingsplicht zegt nee — en jouw klanten ook.",
    // Law firms — features
    "Built for firm-wide impact": "Gebouwd voor kantoorbrede impact",
    "Shared institutional memory": "Gedeelde institutionele geheugen",
    "Every matter, brief, email and deadline indexed and queryable — by every lawyer in the firm. New associates get up to speed in minutes, not months.":
      "Elke zaak, pleidooi, email en termijn geïndexeerd en bevraagbaar — door elke advocaat in het kantoor. Nieuwe medewerkers zijn snel in minuten, niet maanden.",
    "Deadline control (ZPO & BGB)": "Termijncontrole (ZPO & BGB)",
    "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.":
      "Wettelijke en hoger-beroep termijnen berekend met correcte maand-arithmetiek en weekend roll-forward — met de relevante norm geciteerd.",
    "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)":
      "Conflictencontrole (§ 43a BRAO / § 10 RAO / BGFA)",
    "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).":
      "Elke nieuwe cliënt of tegenpartij server-side gescreend tegen de hele zaakbasis voordat de opdracht wordt aangenomen. Dekt § 43a BRAO (DE), § 10 RAO (AT) en BGFA (CH).",
    "Matter-level isolation": "Isolatie op zaakniveau",
    "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams.":
      "Toegang scoped per zaak en per gebruiker — fuzz-getest, zero lekken tussen zaken of teams.",
    "WhatsApp matter copilot": "WhatsApp copilot voor zaken",
    "Lawyers book time, file documents, send voice notes from their phone. Everything lands in the right matter.":
      "Advocaten registreren tijd, archiveren documenten, sturen spraaknotities vanaf hun telefoon. Alles belandt in de juiste zaak.",
    "Time, expenses, invoices & DATEV": "Tijd, kosten, facturen & DATEV",
    "Book minutes by lawyer/activity, create invoices from open work, export DATEV-ready accounting files.":
      "Registreer minuten per advocaat/activiteit, maak facturen uit open werk, exporteer DATEV-ready boekhoudbestanden.",
    "Your server, your jurisdiction": "Jouw server, jouw jurisdictie",
    "Self-host on firm hardware or choose EU cloud with DPA. Client data never leaves your control.":
      "Self-host op kantoor-hardware of kies EU-cloud met DPA. Klantdata verlaat nooit jouw controle.",
    "Every claim, sourced": "Elke bewering, geciteerd",
    "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief.":
      "Antwoorden citeren de exacte pagina's waar ze vandaan komen. Verifieer met één klik voordat iets in een pleidooi gaat.",
    // Law firms — proof + faq
    "Engine-grade retrieval, not a chat wrapper":
      "Retrieval van engine-kwaliteit, geen chat wrapper",
    "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — running on infrastructure your IT governs end to end.":
      "De retrieval-kern bereikt 97,9% Recall@5 met hybride zoek en een knowledge graph — op infrastructuur die jouw IT end-to-end beheert.",
    "How long does rollout take?": "Hoe lang duurt de rollout?",
    "A pilot with one closed matter takes under an hour. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Een pilot met één gesloten zaak duurt minder dan een uur. Volledige kantoor-rollout duurt doorgaans een week — jouw team indexeert bestaande zaken in eigen tempo.",
    "Can we run it on our own servers?": "Kunnen we het op onze eigen servers draaien?",
    "Yes. The full engine self-hosts on firm hardware with local storage. Enterprise plans support on-prem with your own LLM gateway.":
      "Ja. De volledige engine self-host op kantoor-hardware met lokale opslag. Enterprise plannen ondersteunen on-prem met je eigen LLM-gateway.",
    "What about GDPR and bar obligations?": "Wat about GDPR en balieplichten?",
    "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. We speak your data protection officer's language.":
      "Self-hosted betekent dat data nooit je infrastructuur verlaat. Hosted plannen komen met EU-hosting en een DPA. We spreken de taal van je functionaris voor gegevensbescherming.",
    "How is this different from Harvey?": "Hoe verschilt dit van Harvey?",
    "Harvey is excellent — and runs on someone else's cloud and model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control, with a WhatsApp copilot your lawyers use daily.":
      "Harvey is uitstekend — en draait op iemand anders' cloud en model. Subsumio geeft je dezelfde kwaliteit synthese op infrastructuur die JIJ controleert, met een WhatsApp copilot die je advocaten dagelijks gebruiken.",
    "Start with one closed matter as a pilot.": "Begin met één gesloten zaak als pilot.",
    "No client data needs to leave your building. Three minutes to first answer.":
      "Geen klantdata hoeft je kantoor te verlaten. Drie minuten tot het eerste antwoord.",
    "Try free": "Probeer gratis",
    // Solo
    "Subsumio for Solo Lawyers — AI legal software, no IT required":
      "Subsumio voor Zelfstandige Advocaten — AI juridische software, geen IT vereist",
    "AI legal software for solo practitioners: case brain, automated deadlines, cited AI answers, WhatsApp copilot. EU-hosted, no API keys, no IT overhead.":
      "AI juridische software voor zelfstandige advocaten: zaak-brain, automatische termijnen, AI-antwoorden met citaten, WhatsApp copilot. EU-hosted, geen API keys, geen IT-overhead.",
    "For solo practitioners": "Voor zelfstandige advocaten",
    "Your entire practice,": "Je hele praktijk,",
    "one question away.": "op één vraag afstand.",
    "Subsumio gives a solo lawyer what a big firm's knowledge team would: every document, deadline and note indexed and answerable — with citations you can verify.":
      "Subsumio geeft een zelfstandige advocaat wat een groot kantoor's kennis-team zou geven: elk document, termijn en notitie geïndexeerd en bevraagbaar — met citaten die je kunt verifiëren.",
    "The solo lawyer's daily reality": "De dagelijkse realiteit van de zelfstandige advocaat",
    "You are the knowledge team": "Jij bent het kennis-team",
    "No associates to delegate research, no IT department to manage infrastructure. Every minute saved on admin is a minute for clients.":
      "Geen medewerkers om research te delegeren, geen IT-afdeling om infrastructuur te beheren. Elke minuut bespaard op admin is een minuut voor klanten.",
    "Deadlines are existential": "Termijnen zijn existentieel",
    "One missed Notfrist and you're looking at a malpractice claim. You need deadline computation that's correct by statute, not by guesswork.":
      "Eén gemiste Notfrist en je kijkt naar een aanspraak wegens beroepsfout. Je hebt termijnberekening nodig die correct is bij wet, niet bij giswerk.",
    "Admin eats your day": "Admin vreet je dag",
    "Time booking, invoicing, document filing — the overhead of running a practice steals billable hours.":
      "Tijdregistratie, facturatie, documentarchivering — de overhead van een praktijk runnen stealt factureerbare uren.",
    "Everything a solo practice needs": "Alles wat een solo-praktijk nodig heeft",
    "Your case brain": "Jouw zaak-brain",
    "Upload matters, emails, PDFs, voice notes. Subsumio indexes everything and answers in plain language — with page-level citations.":
      "Upload zaken, emails, PDFs, spraaknotities. Subsumio indexeert alles en antwoordt in gewone taal — met paginaniveau-citaten.",
    "Deadlines, automatically": "Termijnen, automatisch",
    "Statutory deadlines per ZPO/BGB/ABGB with correct arithmetic and weekend roll-forward. Daily email digest flags what's critical.":
      "Wettelijke termijnen per ZPO/BGB/ABGB met correcte arithmetiek en weekend roll-forward. Dagelijkse email-digest markeert wat kritisch is.",
    "WhatsApp copilot": "WhatsApp copilot",
    "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — no app switch needed.":
      "Registreer tijd, archief documenten, stuur spraaknotities vanaf je telefoon. Alles belandt in de juiste zaak — zonder app-switch.",
    "Time & invoices": "Tijd & facturen",
    "Book minutes, create invoices from open work, export DATEV-ready files. Admin in seconds, not hours.":
      "Registreer minuten, maak facturen uit open werk, exporteer DATEV-ready bestanden. Admin in seconden, niet uren.",
    "No server, no IT": "Geen server, geen IT",
    "Sign up and your brain runs — fully managed, no API keys, no infrastructure. You focus on law, not sysadmin.":
      "Meld je aan en je brain draait — volledig beheerd, geen API keys, geen infrastructuur. Jij richt je op recht, niet op sysadmin.",
    "Confidentiality by design": "Vertrouwelijkheid by design",
    "EU-hosted with encryption per customer. Your client data is never used to train shared models. Self-hosting available if you prefer.":
      "EU-hosted met encryptie per klant. Je klantdata wordt nooit gebruikt om gedeelde modellen te trainen. Self-hosting beschikbaar als je dat prefereert.",
    "Big-firm capability, solo-practitioner price": "Groot-kantoor capaciteit, solo-advocaat prijs",
    "The same retrieval engine that serves established firms — 97.9% Recall@5, hybrid search, knowledge graph — at a price a solo lawyer can justify on the first saved hour.":
      "Dezelfde retrieval-engine die gevestigde kantoren bedient — 97,9% Recall@5, hybride zoek, knowledge graph — voor een prijs die een solo-advocaat kan rechtvaardigen met het eerste bespaarde uur.",
    "Do I need to be tech-savvy?": "Moet ik tech-savvy zijn?",
    "No. Sign up, upload documents, ask questions. If you can use WhatsApp and a browser, you can use Subsumio.":
      "Nee. Meld je aan, upload documenten, stel vragen. Als je WhatsApp en een browser kunt gebruiken, kun je Subsumio gebruiken.",
    "Can I afford this as a solo?": "Kan ik dit betalen als solo?",
    "The Pro plan is €890/seat/month — less than two billable hours. The 14-day reverse trial means you see real value before you pay.":
      "Het Pro plan is €890/seat/maand — minder dan twee factureerbare uren. De 14-daagse reverse trial betekent dat je echte waarde ziet voordat je betaalt.",
    "What if I grow into a firm later?": "Wat als ik later uitgroeit tot een kantoor?",
    "Upgrade to Team at any time. Your brain and all indexed data carry over — no migration, no downtime.":
      "Upgrade naar Team op elk moment. Je brain en alle geïndexeerde data gaan mee — geen migratie, geen downtime.",
    "Your practice. Your brain.": "Jouw praktijk. Jouw brain.",
    "Three minutes to first cited answer. No credit card, no server, no IT.":
      "Drie minuten tot het eerste geciteerde antwoord. Geen creditcard, geen server, geen IT.",
    // In-house
    "Subsumio for In-House Legal — legal ops with audit-ready memory":
      "Subsumio voor In-House Legal — legal ops met audit-ready geheugen",
    "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.":
      "AI juridische software voor in-house teams: contractanalyse, compliance-tracking, knowledge management met citaten. EU-hosted of self-hosted.",
    "For in-house legal teams": "Voor in-house juridische teams",
    "Your legal department,": "Jouw juridische afdeling,",
    "with a memory.": "met een geheugen.",
    "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — cited answers in seconds, not days of document hunting.":
      "Subsumio geeft in-house juristen wat ze nooit hebben gehad: elk contract, compliance-document en juridisch advies geïndexeerd, bevraagbaar en audit-ready — geciteerde antwoorden in seconden, niet dagen documentenjacht.",
    "The in-house reality": "De in-house realiteit",
    "Contract chaos": "Contractchaos",
    "Hundreds of contracts across business units, each with different renewal dates, liability caps and termination clauses. Finding the one that matters takes days.":
      "Honderden contracten door business units, elk met verschillende vernouwingsdata, aansprakelijkheidsplafonds en opzegclausules. Degene vinden die ertoe doet kost dagen.",
    "Compliance pressure": "Compliance-druk",
    "AI Act, GDPR, sector-specific regulations — the compliance landscape shifts faster than any team can track manually.":
      "AI Act, GDPR, sectorspecifieke regelingen — het compliance-landschap verandert sneller dan welk team dan ook handmatig kan bijhouden.",
    "External counsel costs": "Kosten externe advocaten",
    "Every external legal question costs thousands. Your team needs to answer the routine ones internally before they become external bills.":
      "Elke externe juridische vraag kost duizenden. Jouw team moet de routine-vragen intern beantwoorden voordat ze externe rekeningen worden.",
    "Built for legal operations": "Gebouwd voor legal operations",
    "Contract intelligence": "Contract-intelligentie",
    "Bulk-analyze contracts: surface renewal dates, liability caps, termination clauses and anomalies across the entire portfolio.":
      "Bulk-analyseer contracten: haal vernouwingsdata, aansprakelijkheidsplafonds, opzegclausules en anomalieën naar boven in het hele portfolio.",
    "Compliance tracking": "Compliance-tracking",
    "Map regulatory requirements to internal policies. Track gaps, flag deadlines, maintain an audit trail for supervisors and regulators.":
      "Map regelgevingsvereisten naar interne policies. Track gaten, markeer termijnen, onderhoud een audit trail voor toezichthouders en regulatoren.",
    "Institutional memory": "Institutioneel geheugen",
    "Every legal opinion, memo and external counsel answer indexed and queryable. New team members get up to speed in minutes.":
      "Elk juridisch advies, memo en antwoord van externe advocaat geïndexeerd en bevraagbaar. Nieuwe teamleden zijn snel in minuten.",
    "Answer before you ask external": "Antwoord voordat je extern vraagt",
    "Ask Subsumio first — if the answer is in your documents, you save the external counsel fee. If not, you know exactly what's missing.":
      "Vraag eerst Subsumio — als het antwoord in je documenten staat, bespaar je de externe advocaat-kost. Zo niet, dan weet je precies wat ontbreekt.",
    "Audit-ready by design": "Audit-ready by design",
    "Every query and answer is logged with sources. When the auditor asks 'how did you reach this conclusion?', the trail is there.":
      "Elke query en antwoord wordt gelogd met bronnen. Als de auditor vraagt 'hoe kwam je tot deze conclusie?', de trail is er.",
    "From reactive to proactive legal ops": "Van reactief naar proactief legal ops",
    "The retrieval core benchmarks at 97.9% Recall@5 — meaning when you ask 'which contracts have auto-renewal in Q3?', you get the complete answer, not a partial guess.":
      "De retrieval-kern bereikt 97,9% Recall@5 — wat betekent dat als je vraagt 'welke contracten hebben auto-renewal in Q3?', je het volledige antwoord krijgt, niet een gedeeltelijke gok.",
    "How does this integrate with our existing DMS?": "Hoe integreert dit met onze bestaande DMS?",
    "Subsumio imports from shared drives, SharePoint, and via API. Document metadata (author, date, matter) is preserved during indexing.":
      "Subsumio importeert vanuit shared drives, SharePoint, en via API. Document-metadata (auteur, datum, zaak) blijft behouden tijdens indexering.",
    "Can we control which team sees what?": "Kunnen we controleren wat elk team ziet?",
    "Yes. Access is scoped per matter and per user. HR legal can't see M&A legal's files, and vice versa — fuzz-tested, zero leaks.":
      "Ja. Toegang is scoped per zaak en per gebruiker. HR legal kan M&A legal's bestanden niet zien, en vice versa — fuzz-getest, zero lekken.",
    "What about the AI Act and internal AI governance?":
      "Wat about de AI Act en interne AI-governance?",
    "Subsumio provides source citations on every answer, gap analysis for transparency, and full audit logs. This aligns with AI Act transparency requirements for internal tools.":
      "Subsumio biedt broncitaten op elk antwoord, gap-analyse voor transparantie, en volledige audit logs. Dit aligneert met AI Act transparantievereisten voor interne tools.",
    "Give your legal team an answer machine.": "Geef je juridische team een antwoordmachine.",
    "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.":
      "Begin met één contractportfolio als pilot. Geen data hoeft je infrastructuur te verlaten.",
    // Mid-sized
    "Subsumio for Mid-Sized Firms — lean team, outsized impact":
      "Subsumio voor Mid-Sized Kantoren — lean team, bovenmatige impact",
    "AI legal software for mid-sized law firms: shared brain, deadline automation, WhatsApp copilot, conflict checks. EU-hosted or self-hosted.":
      "AI juridische software voor mid-sized advocatenkantoren: gedeeld brain, termijnautomatisering, WhatsApp copilot, conflictencontrole. EU-hosted of self-hosted.",
    "For mid-sized law firms": "Voor mid-sized advocatenkantoren",
    "Big-firm capability,": "Groot-kantoor capaciteit,",
    "mid-sized budget.": "mid-sized budget.",
    "Subsumio gives a 10-50 lawyer firm the knowledge infrastructure of a 200-lawyer firm — every matter, deadline and brief indexed and answerable, with confidentiality by architecture.":
      "Subsumio geeft een kantoor van 10-50 advocaten de kennis-infrastructuur van een 200-advocaten kantoor — elke zaak, termijn en pleidooi geïndexeerd en bevraagbaar, met vertrouwelijkheid in de architectuur.",
    "The mid-sized firm's challenge": "De uitdaging van het mid-sized kantoor",
    "Doing more with less": "Meer doen met minder",
    "You compete with big firms for the same clients but have a fraction of the headcount. Every efficiency gain is a competitive advantage.":
      "Je concurreert met grote kantoren om dezelfde klanten maar hebt een fractie van het personeel. Elke efficiëntiewinst is een concurrentievoordeel.",
    "Knowledge is fragmented": "Kennis is gefragmenteerd",
    "Each lawyer maintains their own system — folders, notes, inbox rules. When someone's on vacation or leaves, their matters become black boxes.":
      "Elke advocaat onderhoudt zijn eigen systeem — mappen, notities, inbox-regels. Als iemand op vakantie is of vertrekt, worden zijn zaken black boxes.",
    "IT is a constraint, not an enabler": "IT is een beperking, geen enabler",
    "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-week implementation cycle.":
      "Geen toegewijd IT-team voor legal tech. Je hebt tools nodig die out of the box werken, niet projecten die een implementatiecyclus van zes weken vereisen.",
    "Outsized impact for lean teams": "Bovenmatige impact voor lean teams",
    "One shared brain": "Eén gedeeld brain",
    "Every lawyer's matters, briefs and notes in one indexed workspace. A new associate finds the 2023 brief in seconds, not by asking three people.":
      "Zaken, pleidooien en notities van elke advocaat in één geïndexeerde workspace. Een nieuwe medewerker vindt het pleidooi uit 2023 in seconden, niet door drie mensen te vragen.",
    "Deadline control for the whole firm": "Termijncontrole voor het hele kantoor",
    "Centralized deadline calendar with per-lawyer views. Statutory computation per ZPO/BGB/ABGB — no more spreadsheet tracking.":
      "Gecentraliseerde termijnkalender met weergaven per advocaat. Wettelijke berekening per ZPO/BGB/ABGB — geen spreadsheet-tracking meer.",
    "Conflict check in seconds": "Conflictencontrole in seconden",
    "New client or opposing party screened against the entire case base before acceptance — automated, not manual.":
      "Nieuwe cliënt of tegenpartij gescreend tegen de hele zaakbasis voor acceptatie — geautomatiseerd, niet handmatig.",
    "WhatsApp copilot for every lawyer": "WhatsApp copilot voor elke advocaat",
    "Time booking, document filing, voice notes from the phone. The tool your lawyers actually use daily, not another system they avoid.":
      "Tijdregistratie, documentarchivering, spraaknotities vanaf de telefoon. De tool die je advocaten echt dagelijks gebruiken, niet weer een systeem dat ze vermijden.",
    "Time, invoices & DATEV": "Tijd, facturen & DATEV",
    "Firm-wide time tracking, invoicing and DATEV export. Admin work that used to eat Friday afternoons, done in minutes.":
      "Kantoorbrede tijd-tracking, facturatie en DATEV-export. Admin-werk dat vroeger vrijdagmiddagen opslokte, in minuten gedaan.",
    "EU-hosted or self-hosted": "EU-hosted of self-hosted",
    "No US cloud, no US model provider. EU hosting with DPA, or self-host on your own hardware with your own keys.":
      "Geen US-cloud, geen US-model-provider. EU-hosting met DPA, of self-host op je eigen hardware met je eigen keys.",
    "The force multiplier your team needs": "De krachtvermenigvuldiger die je team nodig heeft",
    "97.9% Recall@5 means your team finds what matters — every time. When a 15-lawyer firm finds the decisive precedent in seconds, it performs like a 50-lawyer firm.":
      "97,9% Recall@5 betekent dat je team vindt wat ertoe doet — elke keer. Als een 15-advocaten kantoor het beslissende precedent in seconden vindt, presteert het als een 50-advocaten kantoor.",
    "How quickly can we roll this out?": "Hoe snel kunnen we dit uitrollen?",
    "A pilot with 2-3 lawyers takes a day. Full firm rollout typically takes a week — your team indexes existing matters at their own pace.":
      "Een pilot met 2-3 advocaten duurt een dag. Volledige kantoor-rollout duurt doorgaans een week — jouw team indexeert bestaande zaken in eigen tempo.",
    "What's the pricing for a mid-sized firm?": "Wat is de prijs voor een mid-sized kantoor?",
    "Team plan at €1,290/seat/month from 5 seats. Annual billing saves 20%. Transparent overages — you see usage live, no surprise bills.":
      "Team plan op €1.290/seat/maand vanaf 5 seats. Jaarlijkse facturering bespaart 20%. Transparante overages — je ziet usage live, geen verrassingsrekeningen.",
    "Can we start small and scale?": "Kunnen we klein beginnen en schalen?",
    "Absolutely. Start with Pro for one lawyer, upgrade to Team when ready. All data carries over — no migration, no downtime.":
      "Absoluut. Begin met Pro voor één advocaat, upgrade naar Team als je klaar bent. Alle data gaat mee — geen migratie, geen downtime.",
  }),
};
