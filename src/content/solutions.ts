import type { Lang } from "./site";

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

export const SOLUTIONS: Record<Lang, Record<SolutionSlug, SolutionContent>> = {
  en: {
    "law-firms": {
      slug: "law-firms",
      metaTitle: "Subsumio for Law Firms — AI legal software for established practices",
      metaDesc:
        "Give your firm a shared brain: case files, deadlines, AI analysis with citations, conflict checks, and WhatsApp copilot. EU-hosted or self-hosted.",
      badge: "For established law firms",
      h1a: "Your firm's knowledge,",
      h1b: "finally answerable.",
      sub: "Subsumio turns decades of matters, briefs and deadlines into one cited workspace your whole team can query — with confidentiality by architecture.",
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
          desc: "Every matter, brief, email and deadline indexed and queryable. New associates get up to speed in minutes, not months.",
        },
        {
          icon: "CalendarClock",
          title: "Deadline control (ZPO & BGB)",
          desc: "Statutory and appeal deadlines computed with correct month arithmetic and weekend roll-forward — with the governing statute cited.",
        },
        {
          icon: "ShieldAlert",
          title: "Conflict check (§ 43a BRAO)",
          desc: "Every new client or opposing party screened server-side against the entire case base before the mandate is accepted.",
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
      metaTitle: "Subsumio for Solo Lawyers — one seat, one brain, zero overhead",
      metaDesc:
        "AI legal software for solo practitioners: case files, deadlines, AI analysis with citations, WhatsApp copilot. EU-hosted, no server needed.",
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
      ctaTitle: "Your brain is waiting.",
      ctaSub: "Three minutes to first answer. No credit card, no server, no IT.",
      ctaButton: "Get started",
    },
    "in-house": {
      slug: "in-house",
      metaTitle: "Subsumio for In-House Legal — legal ops with audit-ready memory",
      metaDesc:
        "AI legal software for in-house teams: contract analysis, compliance tracking, knowledge management with citations. EU-hosted or self-hosted.",
      badge: "For in-house legal teams",
      h1a: "Your legal department,",
      h1b: "with a memory.",
      sub: "Subsumio gives in-house counsel what they've never had: every contract, compliance document and legal opinion indexed, answerable and audit-ready — with page-level citations.",
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
      ctaTitle: "Give your legal team a brain.",
      ctaSub:
        "Start with one contract portfolio as a pilot. No data needs to leave your infrastructure.",
      ctaButton: "Talk to us",
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
          desc: "No dedicated IT team for legal tech. You need tools that work out of the box, not projects that need a six-month implementation cycle.",
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
      ctaButton: "Get started",
    },
  },
  de: {
    "law-firms": {
      slug: "law-firms",
      metaTitle: "Subsumio für Kanzleien — KI-Kanzleisoftware für etablierte Praxen",
      metaDesc:
        "Gib deiner Kanzlei ein gemeinsames Brain: Akten, Fristen, KI-Analysen mit Zitaten, Kollisionsprüfung und WhatsApp-Copilot. EU-gehostet oder self-hosted.",
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
          title: "Geteiltes Firmen-Gedächtnis",
          desc: "Jede Akte, jeder Schriftsatz, jede Mail und Frist indiziert und abfragbar. Neue Associates sind in Minuten statt Monaten up to speed.",
        },
        {
          icon: "CalendarClock",
          title: "Fristenkontrolle nach ZPO & BGB",
          desc: "Notfristen und Berufungsfristen mit korrekter Monatsarithmetik und Wochenend-Verschiebung — inkl. Normzitat.",
        },
        {
          icon: "ShieldAlert",
          title: "Kollisionsprüfung (§ 43a BRAO)",
          desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft, bevor das Mandat angenommen wird.",
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
          a: "Ein Pilot mit einer abgeschlossenen Akte dauert unter einer Stunde. Die volle Kanzlei-Rollout dauert typischerweise eine Woche — dein Team indiziert bestehende Akten im eigenen Tempo.",
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
      ctaSub:
        "Keine Mandantendaten müssen das Haus verlassen. Drei Minuten bis zur ersten Antwort.",
      ctaButton: "Kostenlos testen",
    },
    solo: {
      slug: "solo",
      metaTitle: "Subsumio für Einzelanwälte — ein Seat, ein Brain, null Overhead",
      metaDesc:
        "KI-Kanzleisoftware für Einzelanwälte: Akten, Fristen, KI-Analysen mit Zitaten, WhatsApp-Copilot. EU-gehostet, kein Server nötig.",
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
          a: "Der Pro-Plan kostet 890 €/Seat/Monat — weniger als zwei abrechenbare Stunden. Der 14-Tage-Reverse-Trial bedeutet: du siehst den echten Wert, bevor du zahlst.",
        },
        {
          q: "Was, wenn ich später wachse?",
          a: "Upgraden auf Team jederzeit möglich. Dein Brain und alle indizierten Daten bleiben — keine Migration, kein Downtime.",
        },
      ],
      ctaTitle: "Dein Brain wartet.",
      ctaSub: "Drei Minuten bis zur ersten Antwort. Keine Kreditkarte, kein Server, keine IT.",
      ctaButton: "Jetzt starten",
    },
    "in-house": {
      slug: "in-house",
      metaTitle: "Subsumio für Justiziariate — Legal Ops mit audit-ready Gedächtnis",
      metaDesc:
        "KI-Kanzleisoftware für Justiziariate: Vertragsanalyse, Compliance-Tracking, Wissensmanagement mit Zitaten. EU-gehostet oder self-hosted.",
      badge: "Für Justiziariate und Rechtsabteilungen",
      h1a: "Deine Rechtsabteilung,",
      h1b: "mit Gedächtnis.",
      sub: "Subsumio gibt Justiziariaten, was sie nie hatten: jeden Vertrag, jedes Compliance-Dokument und jede Rechtsmeinung indiziert, abfragbar und audit-ready — mit seitengenauen Zitaten.",
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
          desc: "Jede Anfrage und Antwort mit Quellen protokolliert. Wenn der Auditor fragt: 'Wie sind Sie zu diesem Schluss gekommen?', ist die Spur da.",
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
      ctaTitle: "Gib deinem Rechts-Team ein Brain.",
      ctaSub:
        "Starte mit einem Vertragsportfolio als Pilot. Keine Daten müssen deine Infrastruktur verlassen.",
      ctaButton: "Sprich mit uns",
    },
    "mid-sized": {
      slug: "mid-sized",
      metaTitle: "Subsumio für Mittelständische Kanzleien — schlanke Teams, outsized Wirkung",
      metaDesc:
        "KI-Kanzleisoftware für mittelständische Kanzleien: gemeinsames Brain, Fristenautomatisierung, WhatsApp-Copilot, Kollisionsprüfung. EU-gehostet oder self-hosted.",
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
        "97,9 % Recall@5 bedeutet: dein Team findet, was zählt — jedes Mal. Wenn eine 15-Anwalt-Kanzlei das entscheidende Präjudiz in Sekunden findet, performt sie wie eine 50-Anwalt-Kanzlei.",
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
          a: "Absolut. Starte mit Pro für einen Anwalt, upgraden auf Team, wenn bereit. Alle Daten bleiben — keine Migration, kein Downtime.",
        },
      ],
      ctaTitle: "Konkurriere mit den Großkanzleien.",
      ctaSub: "Starte mit einem Team als Pilot. Sieh die Wirkung in einer Woche.",
      ctaButton: "Jetzt starten",
    },
  },
};
