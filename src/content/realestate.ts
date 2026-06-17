// Immumio — dedicated landing page content for real estate / property firms
// (property managers, agencies, asset managers). Reuses BrandedVerticalContent.
// The wedge is the property memory: leases, tenant history, obligations,
// renewals, transactions — next to the management system. Honest: not a CRM/ERP.

import type { Lang } from "./site";
import type { BrandedVerticalContent } from "./taxumio";

export const REALESTATE: Record<Lang, BrandedVerticalContent> = {
  en: {
    metaTitle: "Immumio — the property firm's memory (leases, tenants, renewals)",
    metaDesc:
      "Leases, tenant history, obligations, renewal and notice dates, transactions — one brain that answers “what does this lease say, and what's due?” Immumio is Sigmabrain tuned for property managers and real-estate firms.",
    badge: "Immumio — the property lease memory",
    h1a: "Your management system holds the units.",
    h1b: "Immumio knows the leases.",
    sub: "Lease terms, tenant history, repair obligations, renewal and notice dates, transaction files — one brain that answers “what does this lease actually say, and what's due next?” before the renewal or the deal.",
    ctaPrimary: "Start your property brain",
    ctaSecondary: "Compare honestly",
    cockpit: {
      title: "immumio — portfolio cockpit",
      digestLabel: "Today's lease deadlines",
      digestItems: [
        "Notice period — Unit 4B widget-co (expires in 3 days)",
        "Rent review — acme-example HQ (overdue!)",
        "Lease expiries — 5 units this quarter",
      ],
      invoiceLabel: "DD checklist · Grundbuch verified",
      invoiceValue: "92%",
      datevLabel: "Rent roll exported",
      aiBadge: "AI-generated · review required",
    },
    demo: {
      windowTitle: "immumio — portfolio brain",
      you: "You",
      q: "Before the renewal with widget-co — what's the lease term, the escalation, and what's still open?",
      a: `widget-co — Unit 4B, commercial lease:

1. **Term** — 5y, expires in 3 days; break option was not exercised.
2. **Rent** — index-linked (VPI); last review 2024, a review is overdue.
3. **Repairs** — Schönheitsreparaturen clause flagged as likely unenforceable.

We promised a fit-out contribution in the Feb email — not documented in the lease.

⚠️ Gap: no record of the deposit (Kaution) being returned/rolled.`,
      sourcesLabel: "Sources:",
      sources: ["leases/widget-co-4b", "properties/hauptstrasse-12", "emails/2026-02-fitout"],
    },
    dayTitle: "A day in property management, with Immumio",
    daySub: "Not another management-system tab — the brain sits in the lease workflow your team already runs.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "The lease-deadline digest is already in your inbox", desc: "Notice periods, break options, rent reviews and expiries per unit, computed with weekend roll-forward — overdue and critical first. Nothing lapses." },
      { time: "09:30", icon: "Brain", title: "A tenant calls — you answer from the property's memory", desc: "Lease term, rent, repair obligations and what was agreed — synthesized from the lease, emails and notes, with sources and a source-coverage badge." },
      { time: "11:00", icon: "FileText", title: "Review a lease — labeled as AI", desc: "Term, escalation, options, repair clauses and risks extracted with clause locations; every AI output marked “AI-generated · review required” per EU AI Act Art. 50." },
      { time: "14:00", icon: "Network", title: "Size up the portfolio before the owner call", desc: "Occupancy, WALT, the expiry timeline and tenant-concentration risk — the rent-roll picture, not a spreadsheet hunt." },
      { time: "16:00", icon: "Layers", title: "Run acquisition due diligence", desc: "The document checklist (Grundbuch, leases, encumbrances, permits), red flags cited to source, and the closing deadlines — for the next deal." },
    ],
    toolsTitle: "The property tools that ship today",
    toolsSub: "Every tile below is a live page in the dashboard — not a roadmap.",
    tools: [
      { icon: "Brain", title: "Property & lease Q&A", desc: "Leases, tenants and obligations synthesized with citations and a hallucination-caution badge.", href: "/dashboard/query" },
      { icon: "FileText", title: "Lease & contract memory", desc: "Leases, addenda and wordings indexed and answerable in plain language.", href: "/dashboard/contracts" },
      { icon: "CalendarClock", title: "Lease deadlines + digest", desc: "Notice periods, break options, rent reviews, expiries — daily digest mail.", href: "/dashboard/deadlines" },
      { icon: "Users", title: "Tenant & owner context", desc: "People, companies and who-owns-what — a typed graph from your notes.", href: "/dashboard/contacts" },
      { icon: "Database", title: "Secure document vault", desc: "Leases, Grundbuch extracts, transaction files — confidential, searchable.", href: "/dashboard/vault" },
      { icon: "Network", title: "Portfolio graph", desc: "Property → unit → lease → tenant, queryable in plain language.", href: "/dashboard/graph" },
    ],
    trustTitle: "Built for tenant-data confidentiality",
    trust: [
      { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on firm hardware — tenant and deal data never reaches a third party. Or EU cloud with a DPA." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Every AI output is labeled as AI-generated, machine-readable and visible — the first question your DPO asks." },
      { icon: "Layers", title: "The unstructured layer", desc: "Your management system keeps units and ledgers. Immumio holds the rest: leases, emails, agreements, the why." },
      { icon: "Database", title: "Your data, your export", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in, ever." },
    ],
    honesty:
      "Honest scope: Immumio is the property firm's memory — leases, tenant history, obligations, renewals and transaction files across your own documents. It sits next to your property-management system and is NOT a CRM, an accounting/ERP, or a valuation engine, and it never replaces legal, tax or valuation advice.",
    faqTitle: "Fair questions",
    faq: [
      { q: "Does it replace our property-management system?", a: "No. Your PM system keeps units, ledgers and payments. Immumio holds the unstructured layer next to it — leases, emails, agreements, the why — and answers across both. Bulk import brings the lease history in." },
      { q: "Is this a CRM or a valuation tool?", a: "No. It's the property memory and lease-analysis assistant. CRM and valuation are separate tools; Immumio is the part they don't cover — the queryable knowledge across your documents." },
      { q: "How do we stay confidential with tenant data?", a: "Self-hosted means tenant and deal data never leaves your infrastructure. Hosted plans run in the EU with a DPA. Every AI output is labeled per the EU AI Act." },
      { q: "How does years of lease history get in?", a: "Bulk import handles document folders, mailbox exports and notes. Most firms start with one property's folder and see a useful answer the same day." },
    ],
    ctaTitle: "The next renewal is won by what your firm already knows.",
    ctaSub: "Start with one property's folder as a pilot. No tenant data needs to leave your building.",
    ctaButton: "Start your property brain",
  },
  de: {
    metaTitle: "Immumio — das Gedächtnis der Immobilienfirma (Mietverträge, Mieter, Verlängerungen)",
    metaDesc:
      "Mietverträge, Mieterhistorie, Pflichten, Verlängerungs- und Kündigungsfristen, Transaktionen — ein Gehirn, das beantwortet „was steht im Mietvertrag, und was ist fällig?“ Immumio ist Sigmabrain für Hausverwaltungen und Immobilienfirmen.",
    badge: "Immumio — das Mietvertrags-Gedächtnis der Immobilie",
    h1a: "Euer Verwaltungsprogramm hält die Einheiten.",
    h1b: "Immumio kennt die Mietverträge.",
    sub: "Mietkonditionen, Mieterhistorie, Instandhaltungspflichten, Verlängerungs- und Kündigungsfristen, Transaktionsakten — ein Gehirn, das beantwortet „was steht wirklich im Mietvertrag, und was ist als Nächstes fällig?“ vor der Verlängerung oder dem Deal.",
    ctaPrimary: "Immobilien-Gehirn starten",
    ctaSecondary: "Ehrlich vergleichen",
    cockpit: {
      title: "immumio — portfolio-cockpit",
      digestLabel: "Miet-Fristen heute",
      digestItems: [
        "Kündigungsfrist — Einheit 4B widget-co (in 3 Tagen)",
        "Mietanpassung — acme-example HQ (überfällig!)",
        "Vertragsabläufe — 5 Einheiten dieses Quartal",
      ],
      invoiceLabel: "DD-Checkliste · Grundbuch geprüft",
      invoiceValue: "92%",
      datevLabel: "Rent Roll exportiert",
      aiBadge: "KI-generiert · zu prüfen",
    },
    demo: {
      windowTitle: "immumio — portfolio-gehirn",
      you: "Du",
      q: "Vor der Verlängerung mit widget-co — wie ist die Laufzeit, die Staffel, und was ist noch offen?",
      a: `widget-co — Einheit 4B, Gewerbemietvertrag:

1. **Laufzeit** — 5 Jahre, läuft in 3 Tagen aus; Break-Option nicht gezogen.
2. **Miete** — indexiert (VPI); letzte Anpassung 2024, eine Anpassung ist überfällig.
3. **Reparaturen** — Schönheitsreparaturen-Klausel als wahrscheinlich unwirksam markiert.

Wir haben in der Februar-Mail einen Ausbaukosten-Zuschuss zugesagt — nicht im Vertrag dokumentiert.

⚠️ Lücke: kein Vermerk zur Kaution (Rückgabe/Übertrag).`,
      sourcesLabel: "Quellen:",
      sources: ["mietvertraege/widget-co-4b", "objekte/hauptstrasse-12", "mails/2026-02-ausbau"],
    },
    dayTitle: "Ein Verwaltungstag mit Immumio",
    daySub: "Kein weiterer Verwaltungsprogramm-Tab — das Gehirn sitzt im Miet-Ablauf, den euer Team ohnehin fährt.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "Der Miet-Fristen-Digest liegt schon im Postfach", desc: "Kündigungsfristen, Break-Optionen, Mietanpassungen und Abläufe pro Einheit, mit Wochenend-Vorverlegung — überfällig & kritisch zuerst. Nichts läuft aus." },
      { time: "09:30", icon: "Brain", title: "Ein Mieter ruft an — ihr antwortet aus dem Objekt-Gedächtnis", desc: "Laufzeit, Miete, Instandhaltungspflichten und was vereinbart wurde — synthetisiert aus Vertrag, Mails und Notizen, mit Quellen und Quellendeckungs-Badge." },
      { time: "11:00", icon: "FileText", title: "Mietvertrag prüfen — als KI gekennzeichnet", desc: "Laufzeit, Staffel, Optionen, Reparaturklauseln und Risiken mit Fundstellen extrahiert; jeder KI-Output trägt „KI-generiert · zu prüfen“ nach EU-AI-Act Art. 50." },
      { time: "14:00", icon: "Network", title: "Portfolio einschätzen vor dem Eigentümer-Call", desc: "Vermietungsstand, WALT, Ablauf-Timeline und Mieterkonzentration — das Rent-Roll-Bild, keine Tabellen-Suche." },
      { time: "16:00", icon: "Layers", title: "Ankaufs-Due-Diligence fahren", desc: "Die Unterlagen-Checkliste (Grundbuch, Mietverträge, Lasten, Genehmigungen), Red Flags mit Quelle, und die Closing-Fristen — für den nächsten Deal." },
    ],
    toolsTitle: "Die Immobilien-Tools, die heute da sind",
    toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap.",
    tools: [
      { icon: "Brain", title: "Objekt- & Miet-Q&A", desc: "Mietverträge, Mieter und Pflichten synthetisiert, mit Zitaten und Halluzinations-Vorsicht-Badge.", href: "/dashboard/query" },
      { icon: "FileText", title: "Miet- & Vertrags-Gedächtnis", desc: "Mietverträge, Nachträge und Bedingungen indexiert und in Klartext beantwortbar.", href: "/dashboard/contracts" },
      { icon: "CalendarClock", title: "Miet-Fristen + Digest", desc: "Kündigungsfristen, Break-Optionen, Mietanpassungen, Abläufe — täglicher Digest.", href: "/dashboard/deadlines" },
      { icon: "Users", title: "Mieter- & Eigentümer-Kontext", desc: "Personen, Firmen und wer-besitzt-was — ein typisierter Graph aus euren Notizen.", href: "/dashboard/contacts" },
      { icon: "Database", title: "Sicherer Dokument-Vault", desc: "Mietverträge, Grundbuchauszüge, Transaktionsakten — vertraulich, durchsuchbar.", href: "/dashboard/vault" },
      { icon: "Network", title: "Portfolio-Graph", desc: "Objekt → Einheit → Mietvertrag → Mieter, in Klartext abfragbar.", href: "/dashboard/graph" },
    ],
    trustTitle: "Gebaut für Mieterdaten-Vertraulichkeit",
    trust: [
      { icon: "Shield", title: "Vertraulichkeit per Architektur", desc: "Self-hosted auf Firmen-Hardware — Mieter- und Deal-Daten erreichen keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Jeder KI-Output ist als KI-generiert gekennzeichnet, maschinenlesbar und sichtbar — die erste Frage eures DSB." },
      { icon: "Layers", title: "Die unstrukturierte Schicht", desc: "Euer Verwaltungsprogramm behält Einheiten und Konten. Immumio hält den Rest: Mietverträge, Mails, Absprachen, das Warum." },
      { icon: "Database", title: "Eure Daten, euer Export", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in, nie." },
    ],
    honesty:
      "Ehrlicher Rahmen: Immumio ist das Gedächtnis der Immobilienfirma — Mietverträge, Mieterhistorie, Pflichten, Verlängerungen und Transaktionsakten über eure eigenen Dokumente. Es sitzt neben eurem Verwaltungsprogramm und ist KEIN CRM, keine Buchhaltung/ERP und keine Bewertungs-Engine; es ersetzt nie Rechts-, Steuer- oder Bewertungsberatung.",
    faqTitle: "Faire Fragen",
    faq: [
      { q: "Ersetzt es unser Verwaltungsprogramm?", a: "Nein. Euer Programm behält Einheiten, Konten und Zahlungen. Immumio hält die unstrukturierte Schicht daneben — Mietverträge, Mails, Absprachen, das Warum — und beantwortet über beide hinweg. Bulk-Import bringt die Vertragshistorie rein." },
      { q: "Ist das ein CRM oder Bewertungstool?", a: "Nein. Es ist das Objekt-Gedächtnis und der Mietvertrags-Analyse-Assistent. CRM und Bewertung sind separate Tools; Immumio ist der Teil, den sie nicht abdecken — das abfragbare Wissen über eure Dokumente." },
      { q: "Wie bleiben wir mit Mieterdaten vertraulich?", a: "Self-hosted heißt: Mieter- und Deal-Daten verlassen eure Infrastruktur nie. Hosted läuft in der EU mit AVV. Jeder KI-Output ist nach EU-AI-Act gekennzeichnet." },
      { q: "Wie kommen Jahre an Vertragshistorie rein?", a: "Bulk-Import verarbeitet Dokumentordner, Postfach-Exporte und Notizen. Die meisten Firmen starten mit dem Ordner eines Objekts und sehen am selben Tag eine nützliche Antwort." },
    ],
    ctaTitle: "Die nächste Verlängerung gewinnt, was eure Firma schon weiß.",
    ctaSub: "Startet mit dem Ordner eines Objekts als Pilot. Keine Mieterdaten müssen euer Haus verlassen.",
    ctaButton: "Immobilien-Gehirn starten",
  },
};
