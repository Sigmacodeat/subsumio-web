// Taxumio — dedicated landing page content for tax & accounting firms (EN + DE).
// Distinct from the generic vertical funnel: this page sells the *daily firm
// workflow* (Kanzleialltag) and links to the real dashboard tools that ship
// today (deadlines + digest, GoBD invoicing, DATEV export, Verfahrensdoku,
// brain Q&A, Kanzlei-import). Honest: building blocks, no "audit-proof" claim.

import type { Lang } from "./site";

export interface TaxumioStep {
  time: string;
  icon: string;
  title: string;
  desc: string;
}

export interface TaxumioTool {
  icon: string;
  title: string;
  desc: string;
  href: string; // dashboard deep-link (redirects to login when signed out)
}

export interface TaxumioContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  ctaPrimary: string;
  ctaSecondary: string;
  // animated cockpit mockup labels
  cockpit: {
    title: string;
    digestLabel: string;
    digestItems: string[];
    invoiceLabel: string;
    invoiceValue: string;
    datevLabel: string;
    aiBadge: string;
  };
  demo: { windowTitle: string; you: string; q: string; a: string; sourcesLabel: string; sources: string[] };
  dayTitle: string;
  daySub: string;
  steps: TaxumioStep[];
  toolsTitle: string;
  toolsSub: string;
  tools: TaxumioTool[];
  trustTitle: string;
  trust: { icon: string; title: string; desc: string }[];
  honesty: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

/** Shared shape for every product-brand vertical page (Taxumio, Compliumio, …). */
export type BrandedVerticalContent = TaxumioContent;

export const TAXUMIO: Record<Lang, TaxumioContent> = {
  en: {
    metaTitle: "Taxumio — the brain for your tax & accounting firm's daily work",
    metaDesc:
      "Deadlines with email digest, client Q&A from your own files, GoBD-stamped invoicing, DATEV export and a Verfahrensdokumentation generator — Taxumio is Sigmabrain tuned for tax advisors and accountants.",
    badge: "Taxumio — the practice memory for tax & accounting",
    h1a: "Your practice software knows the numbers.",
    h1b: "Taxumio runs the firm's day.",
    sub: "Deadlines, client context, advisory rationale, GoBD-stamped invoicing and DATEV export — one brain that answers “what did we tell this client, and why?” and keeps the daily firm work moving.",
    ctaPrimary: "Start your practice brain",
    ctaSecondary: "See how we compare",
    cockpit: {
      title: "taxumio — firm cockpit",
      digestLabel: "Today's deadlines",
      digestItems: [
        "VAT advance return — widget-co (due in 2 days)",
        "Objection deadline — acme-example (today!)",
        "Annual accounts — 3 clients this week",
      ],
      invoiceLabel: "Invoice #2026-0412 · GoBD stamped",
      invoiceValue: "€1,904.00",
      datevLabel: "DATEV booking batch exported",
      aiBadge: "AI-generated · accountant review required",
    },
    demo: {
      windowTitle: "taxumio — practice brain",
      you: "You",
      q: "Which of our clients are affected by the new e-invoicing mandate — and what have we already told them?",
      a: `12 affected clients found:

1. **widget-co LLC** — B2B revenue, not yet switched. Info letter sent Nov '25, no reply. No follow-up scheduled.
2. **acme-example KG** — migration in progress per meeting note of March 14; their ERP question to us is still open.
3. + 10 more with sources.

⚠️ Gap: for 4 clients the B2B share is unclear — master data incomplete.`,
      sourcesLabel: "Sources:",
      sources: ["clients/widget-co", "letters/2025-11-einvoicing", "meetings/2026-03-acme"],
    },
    dayTitle: "A day in the firm, with Taxumio",
    daySub: "Not a chatbot bolted on — the brain sits in the workflow your team already runs.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "The deadline digest is already in your inbox", desc: "Filing and objection deadlines per client, computed with weekend roll-forward — overdue and critical first. Nobody hunts through the calendar." },
      { time: "09:15", icon: "Brain", title: "A client calls — you answer from the firm's memory", desc: "“Why did we structure it this way in 2022, and what's still open?” Synthesized from emails, memos and meeting notes, with sources and a source-coverage badge." },
      { time: "11:00", icon: "FileText", title: "Draft the advisory memo — labeled as AI", desc: "A first draft from the brain's context, every AI output marked “AI-generated · review required” per EU AI Act Art. 50. You review, you sign." },
      { time: "14:00", icon: "Calculator", title: "Issue the invoice — GoBD building blocks built in", desc: "A 10-year retention stamp and a SHA-256 tamper-evidence hash are written on creation. Re-verify any invoice later: unchanged or altered." },
      { time: "16:30", icon: "Database", title: "Export to DATEV, file the Verfahrensdokumentation", desc: "A DATEV booking batch (Format 700) leaves cleanly; the Verfahrensdoku generator turns firm settings into a GoBD process document — as a reviewable draft." },
    ],
    toolsTitle: "The daily-work tools that ship today",
    toolsSub: "Live pages in the Taxumio dashboard — no slides, no promises.",
    tools: [
      { icon: "CalendarClock", title: "Deadlines + email digest", desc: "Per-client filing & objection deadlines, weekend roll-forward, daily digest mail.", href: "/dashboard/deadlines" },
      { icon: "Brain", title: "Client Q&A from your files", desc: "Synthesized answers with citations and a hallucination-caution badge.", href: "/dashboard/query" },
      { icon: "Calculator", title: "GoBD-stamped invoicing", desc: "Retention stamp + tamper-evidence hash on every invoice, re-verifiable.", href: "/dashboard/invoicing" },
      { icon: "Database", title: "DATEV export", desc: "Booking batch & master data export (Format 700) for your accounting flow.", href: "/dashboard/datev-export" },
      { icon: "FileText", title: "Verfahrensdoku generator", desc: "GoBD process documentation from firm settings — print/Word, reviewable draft.", href: "/dashboard/verfahrensdoku" },
      { icon: "Layers", title: "Firm import (RA-MICRO / Advoware / DATEV)", desc: "CSV master-data import with auto column mapping and preview.", href: "/dashboard/import-kanzlei" },
    ],
    trustTitle: "Built for the duty of professional secrecy",
    trust: [
      { icon: "Shield", title: "Silence by design", desc: "Self-host on firm hardware — client data never reaches a third party. Or EU cloud with a DPA." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Every AI output is labeled as AI-generated, machine-readable and visible — the first question your data-protection officer asks." },
      { icon: "Calculator", title: "GoBD building blocks", desc: "Retention stamps, tamper-evidence and a Verfahrensdoku generator. Honest: building blocks, not a certified “audit-proof” claim." },
      { icon: "Database", title: "Full export, any time", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in, ever." },
    ],
    honesty:
      "Honest scope: Taxumio holds the unstructured layer next to your practice software — client context, advisory rationale, emails, deadlines, invoicing and DATEV export. It is not a tax-research database (no UStG commentary or BMF-circular corpus yet) and never replaces your professional judgment. The roadmap adds a tax-law connector and a tax-subsumption skill.",
    faqTitle: "Questions from the practice",
    faq: [
      { q: "Does it replace DATEV / our practice software?", a: "No. Your practice management keeps the structured world — filings, bookkeeping, deadlines. Taxumio holds the unstructured layer next to it and answers across both. DATEV export bridges the booking flow." },
      { q: "Is this GoBD-compliant / audit-proof?", a: "We ship the building blocks — 10-year retention stamps, SHA-256 tamper-evidence and a Verfahrensdokumentation generator. Full GoBD conformance still needs your process documentation and an auditor's sign-off; we don't claim a finished “audit-proof” seal." },
      { q: "How do we stay compliant with professional secrecy?", a: "Self-hosted means client data never leaves your infrastructure. Hosted plans run in the EU with a DPA. Every AI output is labeled per the EU AI Act. Bring your data-protection officer — we speak their language." },
      { q: "How does ten years of client history get in?", a: "Bulk import handles mailbox exports, document folders and meeting notes; the firm import reads RA-MICRO / Advoware / DATEV master-data CSVs. Most firms start with one client folder and see a useful answer the same day." },
    ],
    ctaTitle: "The next client call is won by what your firm already knows.",
    ctaSub: "Start with one client's folder as a pilot. No client data needs to leave your building.",
    ctaButton: "Start your practice brain",
  },
  de: {
    metaTitle: "Taxumio — das Gehirn für den Kanzleialltag von Steuerberatern & Buchhaltern",
    metaDesc:
      "Fristen mit E-Mail-Digest, Mandanten-Q&A aus den eigenen Akten, GoBD-gestempelte Rechnungen, DATEV-Export und ein Verfahrensdoku-Generator — Taxumio ist Sigmabrain für Steuerkanzleien.",
    badge: "Taxumio — das Kanzleigedächtnis für Steuerberater & WP",
    h1a: "Eure Kanzleisoftware kennt die Zahlen.",
    h1b: "Taxumio führt durch den Kanzleialltag.",
    sub: "Fristen, Mandantenkontext, Gestaltungs-Begründung, GoBD-gestempelte Rechnungen und DATEV-Export — ein Gehirn, das beantwortet \"was haben wir diesem Mandanten gesagt, und warum?\" und den Kanzleialltag am Laufen hält.",
    ctaPrimary: "Kanzlei-Gehirn starten",
    ctaSecondary: "Vergleich ansehen",
    cockpit: {
      title: "taxumio — kanzlei-cockpit",
      digestLabel: "Fristen heute",
      digestItems: [
        "USt-Voranmeldung — widget-co (in 2 Tagen)",
        "Einspruchsfrist — acme-example (heute!)",
        "Jahresabschluss — 3 Mandanten diese Woche",
      ],
      invoiceLabel: "Rechnung #2026-0412 · GoBD-gestempelt",
      invoiceValue: "1.904,00 €",
      datevLabel: "DATEV-Buchungsstapel exportiert",
      aiBadge: "KI-generiert · Steuerberater prüft"
    },
    demo: {
      windowTitle: "taxumio — kanzlei-gehirn",
      you: "Du",
      q: "Welche unserer Mandanten sind von der E-Rechnungs-Pflicht betroffen — und was haben wir ihnen schon gesagt?",
      a: `12 betroffene Mandanten gefunden:

1. **widget-co GmbH** — B2B-Umsatz, noch nicht umgestellt. Infoschreiben Nov '25 versandt, keine Antwort. Keine Wiedervorlage.
2. **acme-example KG** — Migration läuft laut Besprechungsnotiz vom 14. März; ihre ERP-Frage an uns ist noch offen.
3. + 10 weitere mit Quellen.

⚠️ Lücke: bei 4 Mandanten ist der B2B-Anteil unklar — Stammdaten unvollständig.`,
      sourcesLabel: "Quellen:",
      sources: ["mandanten/widget-co", "schreiben/2025-11-erechnung", "meetings/2026-03-acme"],
    },
    dayTitle: "Ein Kanzleitag mit Taxumio",
    daySub: "Kein angeflanschter Chatbot — das Gehirn sitzt im Ablauf, den euer Team ohnehin fährt.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "Der Fristen-Digest liegt schon im Postfach", desc: "Erklärungs- und Einspruchsfristen pro Mandant, mit Wochenend-Vorverlegung berechnet — überfällig & kritisch zuerst. Niemand durchsucht den Kalender." },
      { time: "09:15", icon: "Brain", title: "Ein Mandant ruft an — ihr antwortet aus dem Kanzleigedächtnis", desc: "„Warum haben wir das 2022 so gestaltet, und was ist noch offen?“ Synthetisiert aus Mails, Memos und Notizen, mit Quellen und Quellendeckungs-Badge." },
      { time: "11:00", icon: "FileText", title: "Gestaltungs-Memo entwerfen — als KI gekennzeichnet", desc: "Ein erster Entwurf aus dem Kanzleikontext, jeder KI-Output trägt „KI-generiert · zu prüfen“ nach EU-AI-Act Art. 50. Ihr prüft, ihr zeichnet." },
      { time: "14:00", icon: "Calculator", title: "Rechnung stellen — GoBD-Bausteine eingebaut", desc: "10-Jahre-Aufbewahrungsstempel + SHA-256-Manipulations-Evidenz beim Anlegen. Jede Rechnung später neu verifizieren: unverändert oder verändert." },
      { time: "16:30", icon: "Database", title: "Nach DATEV exportieren, Verfahrensdoku ablegen", desc: "Ein DATEV-Buchungsstapel (Format 700) geht sauber raus; der Verfahrensdoku-Generator macht aus Kanzlei-Settings ein GoBD-Dokument — als prüfbaren Entwurf." },
    ],
    toolsTitle: "Die Kanzleialltag-Tools, die heute da sind",
    toolsSub: "Live-Seiten im Taxumio-Dashboard — keine Folien, keine Versprechungen.",
    tools: [
      { icon: "CalendarClock", title: "Fristen + E-Mail-Digest", desc: "Erklärungs-/Einspruchsfristen pro Mandant, Wochenend-Vorverlegung, täglicher Digest.", href: "/dashboard/deadlines" },
      { icon: "Brain", title: "Mandanten-Q&A aus euren Akten", desc: "Synthetisierte Antworten mit Zitaten und Halluzinations-Vorsicht-Badge.", href: "/dashboard/query" },
      { icon: "Calculator", title: "GoBD-gestempelte Rechnungen", desc: "Aufbewahrungsstempel + Manipulations-Hash je Rechnung, neu verifizierbar.", href: "/dashboard/invoicing" },
      { icon: "Database", title: "DATEV-Export", desc: "Buchungsstapel & Stammdaten-Export (Format 700) für euren Buchhaltungs-Flow.", href: "/dashboard/datev-export" },
      { icon: "FileText", title: "Verfahrensdoku-Generator", desc: "GoBD-Verfahrensdoku aus Kanzlei-Settings — Druck/Word, prüfbarer Entwurf.", href: "/dashboard/verfahrensdoku" },
      { icon: "Layers", title: "Kanzlei-Import (RA-MICRO / Advoware / DATEV)", desc: "CSV-Stammdaten-Import mit Auto-Spalten-Mapping und Vorschau.", href: "/dashboard/import-kanzlei" },
    ],
    trustTitle: "Gebaut für die Stillschweigenpflicht",
    trust: [
      { icon: "Shield", title: "Verschwiegenheit per Architektur", desc: "Self-hosted auf Kanzlei-Hardware — Mandantendaten erreichen keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Jeder KI-Output ist als KI-generiert gekennzeichnet, maschinenlesbar und sichtbar — die erste Frage jedes Datenschutzbeauftragten." },
      { icon: "Calculator", title: "GoBD-Bausteine", desc: "Aufbewahrungsstempel, Manipulations-Evidenz und Verfahrensdoku-Generator. Ehrlich: Bausteine, kein zertifizierter „revisionssicher“-Claim." },
      { icon: "Database", title: "Vollständiger Export, jederzeit", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in, nie." },
    ],
    honesty:
      "Ehrlicher Rahmen: Taxumio hält die unstrukturierte Schicht neben eurer Kanzleisoftware — Mandantenkontext, Gestaltungs-Begründung, Mails, Fristen, Rechnungen und DATEV-Export. Es ist KEINE Steuerrecht-Datenbank (noch kein UStG-Kommentar / BMF-Schreiben-Korpus) und ersetzt nie eure fachliche Beurteilung. Auf der Roadmap: ein Steuerrecht-Connector und ein Steuer-Subsumtions-Skill.",
    faqTitle: "Fragen aus der Kanzlei",
    faq: [
      { q: "Ersetzt es DATEV / unsere Kanzleisoftware?", a: "Nein. Eure Kanzleisoftware behält die strukturierte Welt — Erklärungen, Buchhaltung, Fristen. Taxumio hält die unstrukturierte Schicht daneben und beantwortet über beide hinweg. Der DATEV-Export überbrückt den Buchungs-Flow." },
      { q: "Ist das GoBD-konform / revisionssicher?", a: "Wir liefern die Bausteine — 10-Jahre-Aufbewahrungsstempel, SHA-256-Manipulations-Evidenz und einen Verfahrensdoku-Generator. Volle GoBD-Konformität braucht weiterhin eure Verfahrensdoku + Prüfer-Abnahme; wir behaupten kein fertiges „revisionssicher“-Siegel." },
      { q: "Wie bleiben wir mit der Verschwiegenheit konform?", a: "Self-hosted heißt: Mandantendaten verlassen eure Infrastruktur nie. Hosted läuft in der EU mit AVV. Jeder KI-Output ist nach EU-AI-Act gekennzeichnet. Bringt euren Datenschutzbeauftragten mit — wir sprechen seine Sprache." },
      { q: "Wie kommen zehn Jahre Mandanten-Historie rein?", a: "Bulk-Import verarbeitet Postfach-Exporte, Dokumentordner und Notizen; der Kanzlei-Import liest RA-MICRO / Advoware / DATEV-Stammdaten-CSVs. Die meisten Kanzleien starten mit einem Mandantenordner und sehen am selben Tag eine nützliche Antwort." },
    ],
    ctaTitle: "Das nächste Mandantengespräch gewinnt, was eure Kanzlei schon weiß.",
    ctaSub: "Startet mit dem Ordner eines Mandanten als Pilot. Keine Mandantendaten müssen euer Haus verlassen.",
    ctaButton: "Kanzlei-Gehirn starten",
  },
};
