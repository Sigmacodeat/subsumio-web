// Investumio — dedicated landing page for VC / PE / angel investors.
// Reuses BrandedVerticalContent. The wedge: the fund's deal memory + portfolio
// graph. Honest: not a CRM/fund-admin tool.

import type { Lang } from "./site";
import type { BrandedVerticalContent } from "./taxumio";

export const VC: Record<Lang, BrandedVerticalContent> = {
  en: {
    metaTitle: "Investumio — your fund's deal memory, always in the room",
    metaDesc:
      "Founder calls, deal memos, LP updates and intros — one brain that answers 'what's open with this founder?' and 'who invested in X?' before you walk in. Investumio is Sigmabrain for VC, PE and angels.",
    badge: "Investumio — the fund's deal memory",
    h1a: "Your fund's memory,",
    h1b: "always in the room.",
    sub: "Every founder call, deal memo, LP update and intro — one brain that answers “what's still open with this founder?” and “who do we know at X?” before the meeting. Self-hosted or EU cloud; your dealflow never trains anyone's model.",
    ctaPrimary: "Start your fund brain",
    ctaSecondary: "Compare honestly",
    cockpit: {
      title: "investumio — deal cockpit",
      digestLabel: "Today's follow-ups",
      digestItems: [
        "Intro promised — fund-a partner to widget-co (overdue!)",
        "Term sheet feedback — acme-example (due Fri)",
        "Portfolio: 2 companies flagged on runway",
      ],
      invoiceLabel: "IC memo drafted · acme-example",
      invoiceValue: "Seed",
      datevLabel: "Portfolio review exported",
      aiBadge: "AI-generated · review required",
    },
    demo: {
      windowTitle: "investumio — fund brain",
      you: "You",
      q: "What's still open with the founders I met this week — and who connects us to widget-co?",
      a: `3 open commitments across 4 meetings:

1. **Intro to fund-a partner** — promised Tue, not sent.
2. **Term-sheet feedback for acme-example** — due Fri.
3. **Follow-up deck from widget-co** — they owe YOU.

Path to widget-co: alice-example —worked_at→ acme-example ←advises— your partner.

⚠️ Gap: no notes filed for Thursday's 2pm meeting.`,
      sourcesLabel: "Sources:",
      sources: ["meetings/2026-03", "deals/acme-example", "people/alice-example"],
    },
    dayTitle: "A day at the fund, with Investumio",
    daySub: "Not a CRM you have to feed — the brain reads your calls, memos and notes and answers.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "The follow-up digest is already in your inbox", desc: "Promised intros, term-sheet deadlines, owed decks — surfaced from your notes, overdue first. Nothing slips between meetings." },
      { time: "09:30", icon: "Brain", title: "A founder calls — you answer from the fund's memory", desc: "Last contact, open items, what changed, the prior partner view — synthesized with sources before you pick up." },
      { time: "11:00", icon: "FileText", title: "Draft the IC memo — labeled as AI", desc: "Company, team, market, traction, terms, risks and gaps from the deck + calls; every AI output marked “AI-generated · review required”." },
      { time: "14:00", icon: "Network", title: "Find the warm intro", desc: "“Who do we know at X?” walks the relationship graph — works_at, advises, invested_in — extracted from your notes." },
      { time: "16:00", icon: "Search", title: "Review the portfolio before the LP update", desc: "Each company's status, runway flags and follow-on signals — the picture, not a folder hunt." },
    ],
    toolsTitle: "The fund tools that ship today",
    toolsSub: "Every tile below is a live page in the dashboard — not a roadmap.",
    tools: [
      { icon: "Brain", title: "Deal & founder Q&A", desc: "Calls, memos and notes synthesized with citations and a hallucination-caution badge.", href: "/dashboard/query" },
      { icon: "Network", title: "Relationship graph", desc: "Who-knows-whom, invested_in, works_at — a typed graph for warm intros.", href: "/dashboard/graph" },
      { icon: "Users", title: "Founder & investor context", desc: "People and companies with every prior touchpoint, queryable.", href: "/dashboard/contacts" },
      { icon: "FileText", title: "Deal-memo drafting", desc: "Structured IC memos from the brain's context, cited and gap-flagged.", href: "/dashboard/drafting" },
      { icon: "CalendarClock", title: "Follow-up deadlines + digest", desc: "Promised intros, term-sheet dates, owed items — daily digest mail.", href: "/dashboard/deadlines" },
      { icon: "Database", title: "Secure deal vault", desc: "Decks, memos, LP material — confidential, searchable.", href: "/dashboard/vault" },
    ],
    trustTitle: "Built for dealflow confidentiality",
    trust: [
      { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on fund hardware — dealflow and LP data never reach a third party. Or EU cloud with a DPA." },
      { icon: "ShieldAlert", title: "Your data trains no one", desc: "Your dealflow and network never train anyone's model. Ever." },
      { icon: "Network", title: "The relationship graph", desc: "Warm intros from who-knows-whom — extracted automatically from your notes." },
      { icon: "Database", title: "Your data, your export", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in." },
    ],
    honesty:
      "Honest scope: Investumio is the fund's memory — calls, memos, LP updates, the relationship graph, queryable with citations. It sits next to your CRM/fund-admin tools and is NOT a CRM, a fund accounting system, or investment advice; you make the calls.",
    faqTitle: "Fair questions",
    faq: [
      { q: "Does it replace our CRM (Affinity/etc.)?", a: "No. Your CRM keeps the structured pipeline. Investumio holds the unstructured layer — calls, memos, notes — and answers across both, plus the relationship graph for warm intros." },
      { q: "Does our dealflow train your models?", a: "Never. Self-hosted, your data never leaves your infrastructure; hosted runs in the EU with a DPA. Your dealflow and network are yours." },
      { q: "How does our history get in?", a: "Bulk import handles call notes, memos, decks and email exports. Most funds start with one quarter's meetings and see a useful answer the same day." },
      { q: "Is it investment advice?", a: "No. It synthesizes what your fund knows, with sources and gaps. The investment decision is yours." },
    ],
    ctaTitle: "The next deal is won by who your fund already knows.",
    ctaSub: "Import one quarter of meetings as a pilot. No dealflow needs to leave your building.",
    ctaButton: "Start your fund brain",
  },
  de: {
    metaTitle: "Investumio — das Deal-Gedächtnis eures Fonds, immer im Raum",
    metaDesc:
      "Founder-Calls, Deal-Memos, LP-Updates und Intros — ein Gehirn, das beantwortet „was ist mit diesem Founder offen?“ und „wer kennt X?“ bevor ihr reingeht. Investumio ist Sigmabrain für VC, PE und Angels.",
    badge: "Investumio — das Deal-Gedächtnis des Fonds",
    h1a: "Das Gedächtnis eures Fonds,",
    h1b: "immer im Raum.",
    sub: "Jeder Founder-Call, jedes Deal-Memo, LP-Update und Intro — ein Gehirn, das beantwortet „was ist mit diesem Founder noch offen?“ und „wen kennen wir bei X?“ vor dem Meeting. Self-hosted oder EU-Cloud; euer Dealflow trainiert nie fremde Modelle.",
    ctaPrimary: "Fonds-Gehirn starten",
    ctaSecondary: "Ehrlich vergleichen",
    cockpit: {
      title: "investumio — deal-cockpit",
      digestLabel: "Follow-ups heute",
      digestItems: [
        "Intro zugesagt — fund-a-Partner an widget-co (überfällig!)",
        "Term-Sheet-Feedback — acme-example (bis Fr)",
        "Portfolio: 2 Companies auf Runway markiert",
      ],
      invoiceLabel: "IC-Memo entworfen · acme-example",
      invoiceValue: "Seed",
      datevLabel: "Portfolio-Review exportiert",
      aiBadge: "KI-generiert · zu prüfen",
    },
    demo: {
      windowTitle: "investumio — fonds-gehirn",
      you: "Du",
      q: "Was ist mit den Foundern dieser Woche noch offen — und wer verbindet uns mit widget-co?",
      a: `3 offene Zusagen in 4 Meetings:

1. **Intro zum fund-a-Partner** — Di versprochen, nicht gesendet.
2. **Term-Sheet-Feedback für acme-example** — bis Fr.
3. **Follow-up-Deck von widget-co** — DIR geschuldet.

Pfad zu widget-co: alice-example —worked_at→ acme-example ←advises— euer Partner.

⚠️ Lücke: keine Notizen zum Meeting Do 14 Uhr.`,
      sourcesLabel: "Quellen:",
      sources: ["meetings/2026-03", "deals/acme-example", "people/alice-example"],
    },
    dayTitle: "Ein Fonds-Tag mit Investumio",
    daySub: "Kein CRM, das ihr füttern müsst — das Gehirn liest eure Calls, Memos und Notizen und antwortet.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "Der Follow-up-Digest liegt schon im Postfach", desc: "Versprochene Intros, Term-Sheet-Fristen, geschuldete Decks — aus euren Notizen, überfällig zuerst. Nichts geht zwischen Meetings verloren." },
      { time: "09:30", icon: "Brain", title: "Ein Founder ruft an — ihr antwortet aus dem Fonds-Gedächtnis", desc: "Letzter Kontakt, offene Punkte, was sich änderte, die frühere Partner-Sicht — synthetisiert mit Quellen, bevor ihr abhebt." },
      { time: "11:00", icon: "FileText", title: "IC-Memo entwerfen — als KI gekennzeichnet", desc: "Company, Team, Markt, Traction, Terms, Risiken und Lücken aus Deck + Calls; jeder KI-Output trägt „KI-generiert · zu prüfen“." },
      { time: "14:00", icon: "Network", title: "Das warme Intro finden", desc: "„Wen kennen wir bei X?“ läuft den Beziehungsgraphen — works_at, advises, invested_in — aus euren Notizen extrahiert." },
      { time: "16:00", icon: "Search", title: "Portfolio prüfen vor dem LP-Update", desc: "Status, Runway-Flags und Follow-on-Signale je Company — das Bild, keine Ordner-Suche." },
    ],
    toolsTitle: "Die Fonds-Tools, die heute da sind",
    toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap.",
    tools: [
      { icon: "Brain", title: "Deal- & Founder-Q&A", desc: "Calls, Memos und Notizen synthetisiert, mit Zitaten und Halluzinations-Vorsicht-Badge.", href: "/dashboard/query" },
      { icon: "Network", title: "Beziehungsgraph", desc: "Wer-kennt-wen, invested_in, works_at — typisierter Graph für warme Intros.", href: "/dashboard/graph" },
      { icon: "Users", title: "Founder- & Investor-Kontext", desc: "Personen und Firmen mit jedem früheren Touchpoint, abfragbar.", href: "/dashboard/contacts" },
      { icon: "FileText", title: "Deal-Memo-Entwurf", desc: "Strukturierte IC-Memos aus dem Brain-Kontext, zitiert und lückenmarkiert.", href: "/dashboard/drafting" },
      { icon: "CalendarClock", title: "Follow-up-Fristen + Digest", desc: "Versprochene Intros, Term-Sheet-Daten, geschuldete Punkte — täglicher Digest.", href: "/dashboard/deadlines" },
      { icon: "Database", title: "Sicherer Deal-Vault", desc: "Decks, Memos, LP-Material — vertraulich, durchsuchbar.", href: "/dashboard/vault" },
    ],
    trustTitle: "Gebaut für Dealflow-Vertraulichkeit",
    trust: [
      { icon: "Shield", title: "Vertraulichkeit per Architektur", desc: "Self-hosted auf Fonds-Hardware — Dealflow und LP-Daten erreichen keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "ShieldAlert", title: "Eure Daten trainieren niemanden", desc: "Euer Dealflow und Netzwerk trainieren nie fremde Modelle. Nie." },
      { icon: "Network", title: "Der Beziehungsgraph", desc: "Warme Intros aus wer-kennt-wen — automatisch aus euren Notizen extrahiert." },
      { icon: "Database", title: "Eure Daten, euer Export", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in." },
    ],
    honesty:
      "Ehrlicher Rahmen: Investumio ist das Gedächtnis des Fonds — Calls, Memos, LP-Updates, der Beziehungsgraph, abfragbar mit Quellen. Es sitzt neben euren CRM-/Fund-Admin-Tools und ist KEIN CRM, kein Fonds-Buchhaltungssystem und keine Anlageberatung; die Entscheidungen trefft ihr.",
    faqTitle: "Faire Fragen",
    faq: [
      { q: "Ersetzt es unser CRM (Affinity/etc.)?", a: "Nein. Euer CRM behält die strukturierte Pipeline. Investumio hält die unstrukturierte Schicht — Calls, Memos, Notizen — und beantwortet über beide hinweg, plus den Beziehungsgraphen für warme Intros." },
      { q: "Trainiert unser Dealflow eure Modelle?", a: "Nie. Self-hosted verlassen eure Daten die Infrastruktur nie; hosted läuft in der EU mit AVV. Euer Dealflow und Netzwerk gehören euch." },
      { q: "Wie kommt unsere Historie rein?", a: "Bulk-Import verarbeitet Call-Notizen, Memos, Decks und E-Mail-Exporte. Die meisten Fonds starten mit einem Quartal Meetings und sehen am selben Tag eine nützliche Antwort." },
      { q: "Ist es Anlageberatung?", a: "Nein. Es synthetisiert, was euer Fonds weiß, mit Quellen und Lücken. Die Investmententscheidung trefft ihr." },
    ],
    ctaTitle: "Der nächste Deal gewinnt, wen euer Fonds schon kennt.",
    ctaSub: "Importiert ein Quartal Meetings als Pilot. Kein Dealflow muss euer Haus verlassen.",
    ctaButton: "Fonds-Gehirn starten",
  },
};
