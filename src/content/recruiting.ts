// Talentumio — dedicated landing page for executive search & recruiting.
// Reuses BrandedVerticalContent. The wedge: the proprietary talent graph +
// memory that stays when staff leave. Honest: not an ATS.

import type { Lang } from "./site";
import type { BrandedVerticalContent } from "./taxumio";

export const RECRUITING: Record<Lang, BrandedVerticalContent> = {
  en: {
    metaTitle: "Talentumio — your proprietary talent graph, queryable",
    metaDesc:
      "Candidates, who-knows-whom, every interaction in one brain that answers 'who fits this role?' and keeps the knowledge when a consultant leaves. Talentumio is Sigmabrain for executive search & recruiting.",
    badge: "Talentumio — your proprietary talent graph",
    h1a: "Your talent graph is your edge.",
    h1b: "Talentumio makes it queryable.",
    sub: "Every candidate, interaction and intro becomes one brain that answers “who fits this role, and who can warm-intro them?” — and the knowledge stays when a consultant leaves. Self-hosted or EU cloud; candidate data stays confidential and consent-aware.",
    ctaPrimary: "Start your search brain",
    ctaSecondary: "Compare honestly",
    cockpit: {
      title: "talentumio — search cockpit",
      digestLabel: "Today's pipeline signals",
      digestItems: [
        "Stalled — 3 candidates no movement 2 weeks (acme-example search)",
        "Client update due — widget-co CFO search (overdue!)",
        "Shortlist ready — 6 matches for the COO role",
      ],
      invoiceLabel: "Dossier drafted · candidate validated",
      invoiceValue: "6 fit",
      datevLabel: "Pipeline review exported",
      aiBadge: "AI-generated · review required",
    },
    demo: {
      windowTitle: "talentumio — search brain",
      you: "You",
      q: "Who fits the widget-co COO role — and who can warm-intro them?",
      a: `6 candidates ranked by fit:

1. **alice-example** — 3 COO roles in B2B SaaS, available; warm intro via your partner (advised her board).
2. **bob-example** — strong ops, off-limits (placed at a client 9mo ago — flagged).
3. + 4 more with rationale.

⚠️ Consent: 2 candidates have no recent consent on file — internal only until checked.`,
      sourcesLabel: "Sources:",
      sources: ["roles/widget-co-coo", "candidates/alice-example", "searches/2026-q2"],
    },
    dayTitle: "A day at the search firm, with Talentumio",
    daySub: "Not an ATS to maintain — the brain reads your interactions and answers across the talent graph.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "The pipeline digest is already in your inbox", desc: "Stalled candidates, client updates due, searches at risk on time-to-fill — surfaced from the brain, at-risk first." },
      { time: "09:30", icon: "Users", title: "A new role opens — you build the shortlist", desc: "Candidates ranked by fit with a one-line rationale and the warm-intro path, plus off-limits/conflict flags — from the talent graph." },
      { time: "11:00", icon: "Network", title: "Find the warm intro", desc: "“Who can introduce us to X?” walks who-knows-whom — extracted from your notes and interactions." },
      { time: "14:00", icon: "FileText", title: "Draft the candidate dossier — labeled as AI", desc: "Career history, strengths, motivations, comp and references from your interactions; consent flagged; internal until validated." },
      { time: "16:00", icon: "Brain", title: "The knowledge stays when a consultant leaves", desc: "Their candidate relationships and history live in the brain — the next consultant picks up without losing the network." },
    ],
    toolsTitle: "The search tools that ship today",
    toolsSub: "Every tile below is a live page in the dashboard — not a roadmap.",
    tools: [
      { icon: "Users", title: "Candidate & role Q&A", desc: "Candidates, interactions and roles synthesized with citations and a caution badge.", href: "/dashboard/query" },
      { icon: "Network", title: "Talent graph", desc: "Who-knows-whom, worked_at, advises — for warm intros and mapping.", href: "/dashboard/graph" },
      { icon: "Search", title: "Shortlist / candidate match", desc: "Ranked fit for a role with rationale and conflict flags.", href: "/dashboard/research" },
      { icon: "FileText", title: "Dossier drafting", desc: "Submission-ready candidate profiles, consent-flagged, from your notes.", href: "/dashboard/drafting" },
      { icon: "CalendarClock", title: "Pipeline deadlines + digest", desc: "Stalled candidates, client updates, time-to-fill — daily digest mail.", href: "/dashboard/deadlines" },
      { icon: "Database", title: "Secure candidate vault", desc: "Profiles, references, search files — confidential, consent-aware.", href: "/dashboard/vault" },
    ],
    trustTitle: "Built for candidate-data confidentiality",
    trust: [
      { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on firm hardware — candidate data never reaches a third party. Or EU cloud with a DPA." },
      { icon: "ShieldAlert", title: "Consent-aware by design", desc: "Candidate data is personal data; consent and off-limits status are surfaced, not buried." },
      { icon: "Network", title: "The talent graph stays", desc: "Relationships and history live in the brain when a consultant leaves — the network survives." },
      { icon: "Database", title: "Your data, your export", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in." },
    ],
    honesty:
      "Honest scope: Talentumio is the firm's talent memory and graph — candidates, interactions, who-knows-whom, queryable with citations. It sits next to your ATS and is NOT an ATS, a job board, or a sourcing scraper, and it never replaces the consultant's judgment. Candidate data is personal data: consent and off-limits rules apply.",
    faqTitle: "Fair questions",
    faq: [
      { q: "Does it replace our ATS?", a: "No. Your ATS runs the process/pipeline of record. Talentumio holds the unstructured layer — interactions, notes, relationships — and answers across both, plus the talent graph for warm intros." },
      { q: "How do you handle candidate consent / GDPR?", a: "Candidate data is personal data. Self-hosted, it never leaves your infrastructure; hosted runs in the EU with a DPA. Consent and off-limits status are surfaced on every candidate." },
      { q: "What happens when a consultant leaves?", a: "Their candidate relationships, history and notes stay in the brain — so the network and the placements-in-progress survive the handover." },
      { q: "How does our history get in?", a: "Bulk import handles candidate notes, profiles, email exports and search files. Most firms start with one practice and see a useful answer the same day." },
    ],
    ctaTitle: "The next placement is won by who your firm already knows.",
    ctaSub: "Import one practice's candidates as a pilot. No candidate data needs to leave your building.",
    ctaButton: "Start your search brain",
  },
  de: {
    metaTitle: "Talentumio — euer proprietärer Talent-Graph, abfragbar",
    metaDesc:
      "Kandidaten, wer-kennt-wen, jede Interaktion in einem Gehirn, das beantwortet „wer passt auf diese Rolle?“ und das Wissen behält, wenn ein Berater geht. Talentumio ist Sigmabrain für Executive Search & Recruiting.",
    badge: "Talentumio — euer proprietärer Talent-Graph",
    h1a: "Euer Talent-Graph ist euer Vorsprung.",
    h1b: "Talentumio macht ihn abfragbar.",
    sub: "Jeder Kandidat, jede Interaktion und jedes Intro wird ein Gehirn, das beantwortet „wer passt auf diese Rolle, und wer kann warm vorstellen?“ — und das Wissen bleibt, wenn ein Berater geht. Self-hosted oder EU-Cloud; Kandidatendaten bleiben vertraulich und einwilligungs-bewusst.",
    ctaPrimary: "Search-Gehirn starten",
    ctaSecondary: "Ehrlich vergleichen",
    cockpit: {
      title: "talentumio — search-cockpit",
      digestLabel: "Pipeline-Signale heute",
      digestItems: [
        "Stehengeblieben — 3 Kandidaten 2 Wochen ohne Bewegung (acme-example)",
        "Mandanten-Update fällig — widget-co CFO-Suche (überfällig!)",
        "Shortlist bereit — 6 Treffer für die COO-Rolle",
      ],
      invoiceLabel: "Dossier entworfen · Kandidat validiert",
      invoiceValue: "6 Fit",
      datevLabel: "Pipeline-Review exportiert",
      aiBadge: "KI-generiert · zu prüfen",
    },
    demo: {
      windowTitle: "talentumio — search-gehirn",
      you: "Du",
      q: "Wer passt auf die widget-co COO-Rolle — und wer kann warm vorstellen?",
      a: `6 Kandidaten nach Fit gerankt:

1. **alice-example** — 3 COO-Rollen in B2B-SaaS, verfügbar; warmes Intro über euren Partner (beriet ihr Board).
2. **bob-example** — starke Ops, off-limits (vor 9 Monaten bei einem Mandanten platziert — markiert).
3. + 4 weitere mit Begründung.

⚠️ Einwilligung: 2 Kandidaten ohne aktuelle Einwilligung — nur intern, bis geprüft.`,
      sourcesLabel: "Quellen:",
      sources: ["roles/widget-co-coo", "candidates/alice-example", "searches/2026-q2"],
    },
    dayTitle: "Ein Search-Tag mit Talentumio",
    daySub: "Kein ATS zum Pflegen — das Gehirn liest eure Interaktionen und antwortet über den Talent-Graphen.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "Der Pipeline-Digest liegt schon im Postfach", desc: "Stehengebliebene Kandidaten, fällige Mandanten-Updates, Suchen mit Time-to-Fill-Risiko — aus dem Brain, Risiko zuerst." },
      { time: "09:30", icon: "Users", title: "Eine neue Rolle öffnet — ihr baut die Shortlist", desc: "Kandidaten nach Fit gerankt mit Ein-Zeilen-Begründung und Warm-Intro-Pfad, plus Off-limits-/Konflikt-Flags — aus dem Talent-Graphen." },
      { time: "11:00", icon: "Network", title: "Das warme Intro finden", desc: "„Wer kann uns bei X vorstellen?“ läuft wer-kennt-wen — aus euren Notizen und Interaktionen extrahiert." },
      { time: "14:00", icon: "FileText", title: "Kandidaten-Dossier entwerfen — als KI gekennzeichnet", desc: "Karrierehistorie, Stärken, Motivationen, Comp und Referenzen aus euren Interaktionen; Einwilligung markiert; intern bis validiert." },
      { time: "16:00", icon: "Brain", title: "Das Wissen bleibt, wenn ein Berater geht", desc: "Seine Kandidatenbeziehungen und Historie leben im Brain — der nächste Berater übernimmt, ohne das Netzwerk zu verlieren." },
    ],
    toolsTitle: "Die Search-Tools, die heute da sind",
    toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap.",
    tools: [
      { icon: "Users", title: "Kandidaten- & Rollen-Q&A", desc: "Kandidaten, Interaktionen und Rollen synthetisiert, mit Zitaten und Vorsicht-Badge.", href: "/dashboard/query" },
      { icon: "Network", title: "Talent-Graph", desc: "Wer-kennt-wen, worked_at, advises — für warme Intros und Mapping.", href: "/dashboard/graph" },
      { icon: "Search", title: "Shortlist / Kandidaten-Match", desc: "Gerankter Fit für eine Rolle mit Begründung und Konflikt-Flags.", href: "/dashboard/research" },
      { icon: "FileText", title: "Dossier-Entwurf", desc: "Einreichfertige Kandidatenprofile, einwilligungs-markiert, aus euren Notizen.", href: "/dashboard/drafting" },
      { icon: "CalendarClock", title: "Pipeline-Fristen + Digest", desc: "Stehengebliebene Kandidaten, Mandanten-Updates, Time-to-Fill — täglicher Digest.", href: "/dashboard/deadlines" },
      { icon: "Database", title: "Sicherer Kandidaten-Vault", desc: "Profile, Referenzen, Such-Akten — vertraulich, einwilligungs-bewusst.", href: "/dashboard/vault" },
    ],
    trustTitle: "Gebaut für Kandidatendaten-Vertraulichkeit",
    trust: [
      { icon: "Shield", title: "Vertraulichkeit per Architektur", desc: "Self-hosted auf Firmen-Hardware — Kandidatendaten erreichen keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "ShieldAlert", title: "Einwilligungs-bewusst per Design", desc: "Kandidatendaten sind personenbezogen; Einwilligung und Off-limits-Status werden gezeigt, nicht versteckt." },
      { icon: "Network", title: "Der Talent-Graph bleibt", desc: "Beziehungen und Historie leben im Brain, wenn ein Berater geht — das Netzwerk überlebt." },
      { icon: "Database", title: "Eure Daten, euer Export", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in." },
    ],
    honesty:
      "Ehrlicher Rahmen: Talentumio ist das Talent-Gedächtnis und der Graph der Firma — Kandidaten, Interaktionen, wer-kennt-wen, abfragbar mit Quellen. Es sitzt neben eurem ATS und ist KEIN ATS, kein Job-Board und kein Sourcing-Scraper und ersetzt nie die Beurteilung des Beraters. Kandidatendaten sind personenbezogen: Einwilligung und Off-limits-Regeln gelten.",
    faqTitle: "Faire Fragen",
    faq: [
      { q: "Ersetzt es unser ATS?", a: "Nein. Euer ATS führt den Prozess/die Pipeline of Record. Talentumio hält die unstrukturierte Schicht — Interaktionen, Notizen, Beziehungen — und beantwortet über beide hinweg, plus den Talent-Graphen für warme Intros." },
      { q: "Wie haltet ihr Einwilligung / DSGVO?", a: "Kandidatendaten sind personenbezogen. Self-hosted verlassen sie eure Infrastruktur nie; hosted läuft in der EU mit AVV. Einwilligung und Off-limits werden je Kandidat gezeigt." },
      { q: "Was passiert, wenn ein Berater geht?", a: "Seine Kandidatenbeziehungen, Historie und Notizen bleiben im Brain — sodass Netzwerk und laufende Platzierungen die Übergabe überstehen." },
      { q: "Wie kommt unsere Historie rein?", a: "Bulk-Import verarbeitet Kandidatennotizen, Profile, E-Mail-Exporte und Such-Akten. Die meisten Firmen starten mit einem Bereich und sehen am selben Tag eine nützliche Antwort." },
    ],
    ctaTitle: "Die nächste Platzierung gewinnt, wen eure Firma schon kennt.",
    ctaSub: "Importiert die Kandidaten eines Bereichs als Pilot. Keine Kandidatendaten müssen euer Haus verlassen.",
    ctaButton: "Search-Gehirn starten",
  },
};
