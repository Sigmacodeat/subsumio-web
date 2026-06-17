// Compliumio — dedicated landing page content for compliance / GRC officers
// (Datenschutzbeauftragte, GwG-/AML-Beauftragte, ISO/Auditoren) in regulated
// DACH SMBs. Reuses the BrandedVerticalContent shape. Rides the EU AI Act full
// enforcement wave (Aug 2026). Links to the real compliance dashboard tools.
// Honest: supports the human compliance officer; not a certified GRC suite.

import type { Lang } from "./site";
import type { BrandedVerticalContent } from "./taxumio";

export const COMPLIANCE: Record<Lang, BrandedVerticalContent> = {
  en: {
    metaTitle: "Compliumio — the compliance officer's brain (GRC, GDPR, AML, EU AI Act)",
    metaDesc:
      "Regulatory obligations with deadline digest, policy Q&A from your own controls, AML/KYC screening, EU AI Act inventory and an exportable audit trail — Compliumio is Sigmabrain tuned for compliance & GRC teams.",
    badge: "Compliumio — compliance memory, queryable",
    h1a: "Regulators now test effectiveness, not checklists.",
    h1b: "Compliumio is the proof.",
    sub: "Obligations, controls, policies, AML screening and the EU AI Act inventory — one brain that answers “are we compliant, where is the gap, and can we prove it?” and keeps the evidence trail.",
    ctaPrimary: "Start your compliance brain",
    ctaSecondary: "Compare honestly",
    cockpit: {
      title: "compliumio — GRC cockpit",
      digestLabel: "Open obligations today",
      digestItems: [
        "EU AI Act Art. 50 labeling — evidence due (overdue!)",
        "DPA review — 2 processors this week",
        "AML periodic review — 3 clients pending",
      ],
      invoiceLabel: "Control K-12 · effectiveness verified",
      invoiceValue: "98%",
      datevLabel: "Audit trail exported (CSV)",
      aiBadge: "AI-generated · review required",
    },
    demo: {
      windowTitle: "compliumio — GRC brain",
      you: "You",
      q: "Which of our AI systems fall under the EU AI Act, and what evidence is still missing before 2 Aug 2026?",
      a: `7 AI systems in the inventory, 2 in scope:

1. **Drafting assistant** — Art. 50 transparency: labeling LIVE; **missing**: logged human-oversight record.
2. **Deadline detector** — limited-risk; Art. 50 notice present. OK.
3. + 5 internal tools classified minimal-risk.

⚠️ Gap: no documented Annex-III classification memo for the drafting assistant — needed before the 2 Aug 2026 deadline.`,
      sourcesLabel: "Sources:",
      sources: ["controls/ai-act-inventory", "policies/human-oversight", "deadlines/ai-act-2026"],
    },
    dayTitle: "A day in compliance, with Compliumio",
    daySub: "Not another GRC spreadsheet — the brain sits in the obligations workflow your team already runs.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "The obligations digest is already in your inbox", desc: "Regulatory deadlines per framework (GDPR, AML, EU AI Act, ISO), computed with weekend roll-forward — overdue and critical first." },
      { time: "09:30", icon: "Brain", title: "A new regulation drops — you answer from your own controls", desc: "“What does this require of us, and which controls already cover it?” Synthesized from your policies, controls and prior assessments, with sources and a source-coverage badge." },
      { time: "11:00", icon: "FileText", title: "Draft or update the policy — labeled as AI", desc: "A first draft mapped to the obligation, every AI output marked “AI-generated · review required” per EU AI Act Art. 50. You review, you approve." },
      { time: "14:00", icon: "ShieldAlert", title: "Screen a new counterparty — AML/KYC", desc: "Sanctions, PEP and beneficial-ownership check per GwG/AMLD6 against your indexed lists, with a risk rating and the required due-diligence steps." },
      { time: "16:00", icon: "Shield", title: "Review control effectiveness, four-eyes sign-off, export the trail", desc: "A second person approves with a documented reason; the tamper-evident audit log exports to CSV — the evidence regulators now demand." },
    ],
    toolsTitle: "The compliance tools that ship today",
    toolsSub: "Every tile below is a live page in the dashboard — not a roadmap.",
    tools: [
      { icon: "Shield", title: "GDPR / DSGVO compliance check", desc: "Legal bases, data-subject rights, documentation duties, breach notification — checklist + gap report.", href: "/dashboard/compliance" },
      { icon: "ShieldAlert", title: "AML / KYC screening", desc: "Sanctions, PEP and beneficial-ownership checks per GwG/AMLD6 with risk rating and CDD/EDD steps.", href: "/dashboard/compliance" },
      { icon: "Brain", title: "Regulatory Q&A from your controls", desc: "Synthesized answers with citations and a hallucination-caution badge.", href: "/dashboard/query" },
      { icon: "CalendarClock", title: "Obligation deadlines + digest", desc: "Per-framework deadlines, weekend roll-forward, daily digest mail.", href: "/dashboard/deadlines" },
      { icon: "Check", title: "Four-eyes approval queue", desc: "A second person signs off agent and policy actions with a documented reason.", href: "/dashboard/approvals" },
      { icon: "Database", title: "Retention + audit trail export", desc: "Retention stamps and a tamper-evident, exportable audit trail — the evidence regulators want.", href: "/dashboard/compliance/retention" },
    ],
    trustTitle: "Built for the data-protection officer",
    trust: [
      { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on your hardware — regulated data never reaches a third party. Or EU cloud with a DPA." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Every AI output is labeled as AI-generated, machine-readable and visible — and the inventory tracks your own systems." },
      { icon: "Check", title: "Effectiveness, not checkboxes", desc: "Four-eyes approval + a tamper-evident, exportable audit trail produce the demonstrable effectiveness 2026 regulators require." },
      { icon: "Database", title: "Your data, your export", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in, ever." },
    ],
    honesty:
      "Honest scope: Compliumio is the compliance officer's knowledge-and-evidence brain — obligations, controls, policies, AML screening, the EU AI Act inventory and an audit trail. It supports, and never replaces, the responsible compliance officer's judgment, and it is not a certified GRC suite or a legal-advice service. AI Act classification is per-system; full conformance needs your sign-off.",
    faqTitle: "Fair questions",
    faq: [
      { q: "Is this a replacement for our GRC suite?", a: "No. If you run a heavyweight GRC platform, Compliumio is the queryable memory + evidence layer next to it: it answers across your policies, controls and assessments and produces the audit trail. Many teams start with Compliumio precisely because a full GRC suite is overkill for their size." },
      { q: "How does it help with the EU AI Act deadline?", a: "It keeps an inventory of your AI systems, labels AI output per Art. 50, surfaces the 2 Aug 2026 obligations as deadlines, and flags missing evidence (e.g. a human-oversight record). It does not certify your classification — that needs your sign-off." },
      { q: "How do we stay confidential with regulated data?", a: "Self-hosted means data never leaves your infrastructure. Hosted plans run in the EU with a DPA. Every AI output is labeled. Bring your DPO — we speak their language." },
      { q: "Does it do AML/KYC?", a: "Yes — sanctions, PEP and beneficial-ownership screening per GwG/AMLD6 against your indexed lists, with a risk rating and the required CDD/EDD steps. It supports, not replaces, the AML officer's decision." },
    ],
    ctaTitle: "Demonstrable compliance starts with what you can prove.",
    ctaSub: "Start with one framework — GDPR or the EU AI Act inventory — as a pilot. No regulated data needs to leave your building.",
    ctaButton: "Start your compliance brain",
  },
  de: {
    metaTitle: "Compliumio — das Gehirn für Compliance-Officer (GRC, DSGVO, GwG, EU AI Act)",
    metaDesc:
      "Pflichten mit Fristen-Digest, Richtlinien-Q&A aus den eigenen Kontrollen, AML/KYC-Screening, EU-AI-Act-Inventar und exportierbarer Audit-Trail — Compliumio ist Sigmabrain für Compliance- & GRC-Teams.",
    badge: "Compliumio — das Compliance-Gedächtnis, abfragbar",
    h1a: "Aufsichten prüfen jetzt Wirksamkeit, keine Häkchen.",
    h1b: "Compliumio ist der Nachweis.",
    sub: "Pflichten, Kontrollen, Richtlinien, AML-Screening und das EU-AI-Act-Inventar — ein Gehirn, das beantwortet „sind wir konform, wo ist die Lücke, und können wir es beweisen?“ und die Nachweis-Spur führt.",
    ctaPrimary: "Compliance-Gehirn starten",
    ctaSecondary: "Ehrlich vergleichen",
    cockpit: {
      title: "compliumio — GRC-cockpit",
      digestLabel: "Offene Pflichten heute",
      digestItems: [
        "EU-AI-Act Art. 50 Kennzeichnung — Nachweis fällig (überfällig!)",
        "AVV-Prüfung — 2 Auftragsverarbeiter diese Woche",
        "AML-Regelprüfung — 3 Mandanten offen",
      ],
      invoiceLabel: "Kontrolle K-12 · Wirksamkeit geprüft",
      invoiceValue: "98%",
      datevLabel: "Audit-Trail exportiert (CSV)",
      aiBadge: "KI-generiert · zu prüfen",
    },
    demo: {
      windowTitle: "compliumio — GRC-gehirn",
      you: "Du",
      q: "Welche unserer KI-Systeme fallen unter den EU AI Act, und welcher Nachweis fehlt noch vor dem 2. August 2026?",
      a: `7 KI-Systeme im Inventar, 2 betroffen:

1. **Schriftsatz-Assistent** — Art. 50 Transparenz: Kennzeichnung LIVE; **fehlt**: protokollierter Nachweis menschlicher Aufsicht.
2. **Fristen-Detektor** — begrenztes Risiko; Art.-50-Hinweis vorhanden. OK.
3. + 5 interne Tools als minimales Risiko eingestuft.

⚠️ Lücke: kein dokumentiertes Annex-III-Einstufungs-Memo für den Schriftsatz-Assistenten — bis 2. August 2026 erforderlich.`,
      sourcesLabel: "Quellen:",
      sources: ["kontrollen/ai-act-inventar", "richtlinien/menschliche-aufsicht", "fristen/ai-act-2026"],
    },
    dayTitle: "Ein Compliance-Tag mit Compliumio",
    daySub: "Keine weitere GRC-Tabelle — das Gehirn sitzt im Pflichten-Ablauf, den euer Team ohnehin fährt.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "Der Pflichten-Digest liegt schon im Postfach", desc: "Regulatorische Fristen je Rahmenwerk (DSGVO, GwG, EU AI Act, ISO), mit Wochenend-Vorverlegung berechnet — überfällig & kritisch zuerst." },
      { time: "09:30", icon: "Brain", title: "Eine neue Vorschrift kommt — ihr antwortet aus euren Kontrollen", desc: "„Was verlangt das von uns, und welche Kontrollen decken es schon ab?“ Synthetisiert aus euren Richtlinien, Kontrollen und früheren Bewertungen, mit Quellen und Quellendeckungs-Badge." },
      { time: "11:00", icon: "FileText", title: "Richtlinie entwerfen/aktualisieren — als KI gekennzeichnet", desc: "Ein erster Entwurf, der Pflicht zugeordnet; jeder KI-Output trägt „KI-generiert · zu prüfen“ nach EU-AI-Act Art. 50. Ihr prüft, ihr gebt frei." },
      { time: "14:00", icon: "ShieldAlert", title: "Neuen Geschäftspartner screenen — AML/KYC", desc: "Sanktions-, PEP- und wirtschaftlich-Berechtigten-Prüfung nach GwG/AMLD6 gegen eure indexierten Listen, mit Risiko-Rating und nötigen Sorgfaltspflichten." },
      { time: "16:00", icon: "Shield", title: "Kontroll-Wirksamkeit prüfen, Vier-Augen-Freigabe, Trail exportieren", desc: "Eine zweite Person gibt mit dokumentiertem Grund frei; das manipulations-sichere Audit-Log geht als CSV raus — der Nachweis, den Aufsichten jetzt verlangen." },
    ],
    toolsTitle: "Die Compliance-Tools, die heute da sind",
    toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap.",
    tools: [
      { icon: "Shield", title: "DSGVO-Compliance-Check", desc: "Rechtsgrundlagen, Betroffenenrechte, Dokumentationspflichten, Meldepflicht — Checkliste + Gap-Report.", href: "/dashboard/compliance" },
      { icon: "ShieldAlert", title: "AML / KYC-Screening", desc: "Sanktions-, PEP- und wB-Prüfung nach GwG/AMLD6 mit Risiko-Rating und CDD/EDD-Schritten.", href: "/dashboard/compliance" },
      { icon: "Brain", title: "Regulatorik-Q&A aus euren Kontrollen", desc: "Synthetisierte Antworten mit Zitaten und Halluzinations-Vorsicht-Badge.", href: "/dashboard/query" },
      { icon: "CalendarClock", title: "Pflichten-Fristen + Digest", desc: "Fristen je Rahmenwerk, Wochenend-Vorverlegung, täglicher Digest.", href: "/dashboard/deadlines" },
      { icon: "Check", title: "Vier-Augen-Freigabe-Queue", desc: "Eine zweite Person gibt Agenten- und Richtlinien-Aktionen mit dokumentiertem Grund frei.", href: "/dashboard/approvals" },
      { icon: "Database", title: "Aufbewahrung + Audit-Trail-Export", desc: "Aufbewahrungsstempel und ein manipulations-sicherer, exportierbarer Audit-Trail.", href: "/dashboard/compliance/retention" },
    ],
    trustTitle: "Gebaut für den Datenschutzbeauftragten",
    trust: [
      { icon: "Shield", title: "Vertraulichkeit per Architektur", desc: "Self-hosted auf eurer Hardware — regulierte Daten erreichen keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Jeder KI-Output ist als KI-generiert gekennzeichnet, maschinenlesbar und sichtbar — und das Inventar führt eure eigenen Systeme." },
      { icon: "Check", title: "Wirksamkeit statt Häkchen", desc: "Vier-Augen-Freigabe + manipulations-sicherer, exportierbarer Audit-Trail liefern die nachweisbare Wirksamkeit, die Aufsichten 2026 verlangen." },
      { icon: "Database", title: "Eure Daten, euer Export", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in, nie." },
    ],
    honesty:
      "Ehrlicher Rahmen: Compliumio ist das Wissens- und Nachweis-Gehirn des Compliance-Officers — Pflichten, Kontrollen, Richtlinien, AML-Screening, EU-AI-Act-Inventar und Audit-Trail. Es unterstützt die Beurteilung des verantwortlichen Compliance-Officers und ersetzt sie nie; es ist keine zertifizierte GRC-Suite und keine Rechtsberatung. Die AI-Act-Einstufung ist je System zu treffen; volle Konformität braucht eure Freigabe.",
    faqTitle: "Faire Fragen",
    faq: [
      { q: "Ersetzt das unsere GRC-Suite?", a: "Nein. Wenn ihr eine schwergewichtige GRC-Plattform fahrt, ist Compliumio die abfragbare Gedächtnis- + Nachweis-Schicht daneben: es beantwortet über eure Richtlinien, Kontrollen und Bewertungen hinweg und erzeugt den Audit-Trail. Viele Teams starten mit Compliumio gerade, weil eine volle GRC-Suite für ihre Größe überdimensioniert ist." },
      { q: "Wie hilft es beim EU-AI-Act-Stichtag?", a: "Es führt ein Inventar eurer KI-Systeme, kennzeichnet KI-Output nach Art. 50, zeigt die Pflichten zum 2. August 2026 als Fristen und markiert fehlende Nachweise (z.B. ein Aufsichts-Protokoll). Es zertifiziert die Einstufung nicht — das braucht eure Freigabe." },
      { q: "Wie bleiben wir mit regulierten Daten vertraulich?", a: "Self-hosted heißt: Daten verlassen eure Infrastruktur nie. Hosted läuft in der EU mit AVV. Jeder KI-Output ist gekennzeichnet. Bringt euren DSB mit — wir sprechen seine Sprache." },
      { q: "Macht es AML/KYC?", a: "Ja — Sanktions-, PEP- und wB-Screening nach GwG/AMLD6 gegen eure indexierten Listen, mit Risiko-Rating und nötigen CDD/EDD-Schritten. Es unterstützt die Entscheidung des Geldwäsche-Beauftragten, ersetzt sie nicht." },
    ],
    ctaTitle: "Nachweisbare Compliance beginnt mit dem, was ihr beweisen könnt.",
    ctaSub: "Startet mit einem Rahmenwerk — DSGVO oder dem EU-AI-Act-Inventar — als Pilot. Keine regulierten Daten müssen euer Haus verlassen.",
    ctaButton: "Compliance-Gehirn starten",
  },
};
