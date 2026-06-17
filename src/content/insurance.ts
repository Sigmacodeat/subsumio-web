// Versumio — dedicated landing page content for insurance brokers & agencies
// (Versicherungsmakler / -agenturen), NOT carriers. Reuses BrandedVerticalContent.
// The wedge is the agency knowledge-assistant: policy details, claims history,
// coverage, client context and renewal prep — confidentiality-first. Honest:
// we are the agency's memory, not an underwriting engine.

import type { Lang } from "./site";
import type { BrandedVerticalContent } from "./taxumio";

export const INSURANCE: Record<Lang, BrandedVerticalContent> = {
  en: {
    metaTitle: "Versumio — the insurance broker's memory (policies, claims, renewals)",
    metaDesc:
      "Policy details, claims history, coverage context and renewal prep — one brain that answers “what is this client actually covered for, and what's open?” Versumio is Sigmabrain tuned for insurance brokers & agencies. Self-hosted or EU cloud.",
    badge: "Versumio — the broker's client memory",
    h1a: "Your management system stores the policies.",
    h1b: "Versumio knows the client.",
    sub: "Coverage, claims history, advice given, renewal dates and the promises in old emails — one brain that answers “what is this client covered for, and what's still open?” before the renewal call.",
    ctaPrimary: "Start your agency brain",
    ctaSecondary: "Compare honestly",
    cockpit: {
      title: "versumio — agency cockpit",
      digestLabel: "Today's renewals & deadlines",
      digestItems: [
        "Renewal — widget-co liability (due in 5 days)",
        "Claim follow-up — acme-example (today!)",
        "Coverage review — 4 clients this week",
      ],
      invoiceLabel: "Claim #2026-0834 · coverage confirmed",
      invoiceValue: "€42,500",
      datevLabel: "Renewal summary exported",
      aiBadge: "AI-generated · review required",
    },
    demo: {
      windowTitle: "versumio — agency brain",
      you: "You",
      q: "Before the renewal call with widget-co — what are they covered for, what changed, and what did we promise?",
      a: `widget-co — 3 active policies:

1. **General liability** — €5m, renews in 5 days; premium +8% flagged by carrier.
2. **Cyber** — added Mar '25 after the breach scare; sub-limit on ransomware noted.
3. **Fleet** — 2 vehicles added in Aug, not yet endorsed.

We promised a flood-cover quote in the Apr email — never sent.

⚠️ Gap: no record of business-interruption cover despite their warehouse move.`,
      sourcesLabel: "Sources:",
      sources: ["clients/widget-co", "policies/widget-co-liability", "emails/2026-04-flood-quote"],
    },
    dayTitle: "A day at the agency, with Versumio",
    daySub: "Not another management-system tab — the brain sits in the client workflow your team already runs.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "The renewals digest is already in your inbox", desc: "Renewal and claim deadlines per client, computed with weekend roll-forward — overdue and critical first. Nothing lapses unnoticed." },
      { time: "09:30", icon: "Brain", title: "A client calls about a claim — you answer from the agency's memory", desc: "Coverage, sub-limits, claims history and what was advised — synthesized from policies, emails and notes, with sources and a source-coverage badge." },
      { time: "11:00", icon: "FileText", title: "Draft the renewal advice — labeled as AI", desc: "A first draft from the client's coverage context, every AI output marked “AI-generated · review required” per EU AI Act Art. 50. You review, you send." },
      { time: "14:00", icon: "Layers", title: "Spot the coverage gap before the client does", desc: "The brain flags what's NOT covered given what changed (a move, new vehicles, headcount) — the cross-sell and the duty-of-care in one." },
      { time: "16:00", icon: "Shield", title: "Hand off cleanly — knowledge stays when staff go", desc: "Every client's history is queryable, so a colleague (or a new hire) picks up the relationship without re-reading ten years of email." },
    ],
    toolsTitle: "The agency tools that ship today",
    toolsSub: "Every tile below is a live page in the dashboard — not a roadmap.",
    tools: [
      { icon: "Brain", title: "Client Q&A from your files", desc: "Coverage, claims and advice synthesized with citations and a hallucination-caution badge.", href: "/dashboard/query" },
      { icon: "FileText", title: "Policy & contract memory", desc: "Policies, endorsements and wordings indexed and answerable in plain language.", href: "/dashboard/contracts" },
      { icon: "CalendarClock", title: "Renewal & claim deadlines + digest", desc: "Per-client deadlines, weekend roll-forward, daily digest mail.", href: "/dashboard/deadlines" },
      { icon: "Users", title: "Client context & relationships", desc: "People, companies and who-knows-whom — a typed graph from your notes.", href: "/dashboard/contacts" },
      { icon: "Database", title: "Secure document vault", desc: "Policies, claims files and correspondence — confidential, searchable.", href: "/dashboard/vault" },
      { icon: "Shield", title: "Client portal (preview)", desc: "A scoped slice a client can see — their cover, never your book.", href: "/dashboard/client-portal" },
    ],
    trustTitle: "Built for client confidentiality",
    trust: [
      { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on agency hardware — client data never reaches a third party. Or EU cloud with a DPA." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Every AI output is labeled as AI-generated, machine-readable and visible — the first question your compliance lead asks." },
      { icon: "Layers", title: "The unstructured layer", desc: "Your management system keeps policies and figures. Versumio holds the rest: emails, advice, claims notes, the why." },
      { icon: "Database", title: "Your data, your export", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in, ever." },
    ],
    honesty:
      "Honest scope: Versumio is the broker's memory — coverage, claims history, advice and renewals across your own files. It sits next to your management system and is NOT an underwriting or rating engine, nor a carrier policy-admin system, and it never replaces a licensed broker's advice.",
    faqTitle: "Fair questions",
    faq: [
      { q: "Does it replace our agency management system (AMS)?", a: "No. Your AMS keeps the structured world — policies, premiums, commissions. Versumio holds the unstructured layer next to it — emails, advice, claims notes, the why — and answers across both. Bulk import brings the history in." },
      { q: "Is this an underwriting or rating engine?", a: "No, and deliberately so. The underwriting/rating money is a crowded carrier-tech space we don't compete in. Versumio is the broker-side memory and client-advice assistant — the part those engines don't touch." },
      { q: "How do we stay confidential with client data?", a: "Self-hosted means client data never leaves your infrastructure. Hosted plans run in the EU with a DPA. Every AI output is labeled per the EU AI Act." },
      { q: "What happens when a senior broker leaves?", a: "Their client knowledge stays in the brain — coverage rationale, claims history, promises made — so the relationship survives the handover instead of walking out the door." },
    ],
    ctaTitle: "The next renewal is won by what your agency already knows.",
    ctaSub: "Start with one client book as a pilot. No client data needs to leave your building.",
    ctaButton: "Start your agency brain",
  },
  de: {
    metaTitle: "Versumio — das Gedächtnis für Versicherungsmakler (Policen, Schäden, Verlängerungen)",
    metaDesc:
      "Deckungsdetails, Schadenhistorie, Beratungskontext und Verlängerungs-Vorbereitung — ein Gehirn, das beantwortet „wofür ist dieser Kunde gedeckt, und was ist offen?“ Versumio ist Sigmabrain für Versicherungsmakler & -agenturen.",
    badge: "Versumio — das Kunden-Gedächtnis des Maklers",
    h1a: "Euer Maklerverwaltungsprogramm speichert die Policen.",
    h1b: "Versumio kennt den Kunden.",
    sub: "Deckung, Schadenhistorie, erteilte Beratung, Verlängerungstermine und die Zusagen in alten Mails — ein Gehirn, das beantwortet „wofür ist dieser Kunde gedeckt, und was ist noch offen?“ vor dem Verlängerungsgespräch. ",
    ctaPrimary: "Makler-Gehirn starten",
    ctaSecondary: "Ehrlich vergleichen",
    cockpit: {
      title: "versumio — makler-cockpit",
      digestLabel: "Verlängerungen & Fristen heute",
      digestItems: [
        "Verlängerung — widget-co Haftpflicht (in 5 Tagen)",
        "Schaden-Wiedervorlage — acme-example (heute!)",
        "Deckungs-Review — 4 Kunden diese Woche",
      ],
      invoiceLabel: "Schaden #2026-0834 · Deckung bestätigt",
      invoiceValue: "42.500 €",
      datevLabel: "Verlängerungs-Zusammenfassung exportiert",
      aiBadge: "KI-generiert · zu prüfen",
    },
    demo: {
      windowTitle: "versumio — makler-gehirn",
      you: "Du",
      q: "Vor dem Verlängerungsgespräch mit widget-co — wofür sind sie gedeckt, was hat sich geändert, und was haben wir zugesagt?",
      a: `widget-co — 3 aktive Policen:

1. **Betriebshaftpflicht** — 5 Mio. €, Verlängerung in 5 Tagen; Prämie +8% vom Versicherer angekündigt.
2. **Cyber** — im März '25 nach dem Beinahe-Vorfall ergänzt; Sublimit bei Ransomware vermerkt.
3. **Fuhrpark** — 2 Fahrzeuge im August ergänzt, noch nicht policiert.

Wir haben in der April-Mail ein Hochwasser-Angebot zugesagt — nie versandt.

⚠️ Lücke: keine Betriebsunterbrechungs-Deckung trotz Lagerumzug.`,
      sourcesLabel: "Quellen:",
      sources: ["kunden/widget-co", "policen/widget-co-haftpflicht", "mails/2026-04-hochwasser"],
    },
    dayTitle: "Ein Maklertag mit Versumio",
    daySub: "Kein weiterer Verwaltungsprogramm-Tab — das Gehirn sitzt im Kunden-Ablauf, den euer Team ohnehin fährt.",
    steps: [
      { time: "08:30", icon: "CalendarClock", title: "Der Verlängerungs-Digest liegt schon im Postfach", desc: "Verlängerungs- und Schadenfristen pro Kunde, mit Wochenend-Vorverlegung berechnet — überfällig & kritisch zuerst. Nichts läuft unbemerkt aus." },
      { time: "09:30", icon: "Brain", title: "Ein Kunde ruft wegen eines Schadens an — ihr antwortet aus dem Makler-Gedächtnis", desc: "Deckung, Sublimits, Schadenhistorie und was beraten wurde — synthetisiert aus Policen, Mails und Notizen, mit Quellen und Quellendeckungs-Badge." },
      { time: "11:00", icon: "FileText", title: "Verlängerungs-Empfehlung entwerfen — als KI gekennzeichnet", desc: "Ein erster Entwurf aus dem Deckungskontext, jeder KI-Output trägt „KI-generiert · zu prüfen“ nach EU-AI-Act Art. 50. Ihr prüft, ihr sendet." },
      { time: "14:00", icon: "Layers", title: "Die Deckungslücke vor dem Kunden erkennen", desc: "Das Gehirn markiert, was angesichts der Änderungen (Umzug, neue Fahrzeuge, Personal) NICHT gedeckt ist — Cross-Sell und Sorgfaltspflicht in einem." },
      { time: "16:00", icon: "Shield", title: "Sauber übergeben — Wissen bleibt, wenn Personal geht", desc: "Jede Kundenhistorie ist abfragbar, sodass ein Kollege (oder ein neuer Mitarbeiter) die Beziehung übernimmt, ohne zehn Jahre Mails zu lesen." },
    ],
    toolsTitle: "Die Makler-Tools, die heute da sind",
    toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap.",
    tools: [
      { icon: "Brain", title: "Kunden-Q&A aus euren Akten", desc: "Deckung, Schäden und Beratung synthetisiert, mit Zitaten und Halluzinations-Vorsicht-Badge.", href: "/dashboard/query" },
      { icon: "FileText", title: "Policen- & Vertrags-Gedächtnis", desc: "Policen, Nachträge und Bedingungen indexiert und in Klartext beantwortbar.", href: "/dashboard/contracts" },
      { icon: "CalendarClock", title: "Verlängerungs- & Schadenfristen + Digest", desc: "Fristen pro Kunde, Wochenend-Vorverlegung, täglicher Digest.", href: "/dashboard/deadlines" },
      { icon: "Users", title: "Kundenkontext & Beziehungen", desc: "Personen, Firmen und wer-kennt-wen — ein typisierter Graph aus euren Notizen.", href: "/dashboard/contacts" },
      { icon: "Database", title: "Sicherer Dokument-Vault", desc: "Policen, Schadenakten und Korrespondenz — vertraulich, durchsuchbar.", href: "/dashboard/vault" },
      { icon: "Shield", title: "Kundenportal (Vorschau)", desc: "Ein gescopter Ausschnitt für den Kunden — seine Deckung, nie euer Bestand.", href: "/dashboard/client-portal" },
    ],
    trustTitle: "Gebaut für Kundenvertraulichkeit",
    trust: [
      { icon: "Shield", title: "Vertraulichkeit per Architektur", desc: "Self-hosted auf Makler-Hardware — Kundendaten erreichen keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "ShieldAlert", title: "EU AI Act Art. 50", desc: "Jeder KI-Output ist als KI-generiert gekennzeichnet, maschinenlesbar und sichtbar — die erste Frage eurer Compliance." },
      { icon: "Layers", title: "Die unstrukturierte Schicht", desc: "Euer Verwaltungsprogramm behält Policen und Zahlen. Versumio hält den Rest: Mails, Beratung, Schadennotizen, das Warum." },
      { icon: "Database", title: "Eure Daten, euer Export", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in, nie." },
    ],
    honesty:
      "Ehrlicher Rahmen: Versumio ist das Makler-Gedächtnis — Deckung, Schadenhistorie, Beratung und Verlängerungen über eure eigenen Akten. Es sitzt neben eurem Verwaltungsprogramm und ist KEINE Underwriting-/Tarifierungs-Engine und kein Versicherer-Bestandssystem; es ersetzt nie die Beratung eines zugelassenen Maklers.",
    faqTitle: "Faire Fragen",
    faq: [
      { q: "Ersetzt es unser Maklerverwaltungsprogramm (MVP)?", a: "Nein. Euer MVP behält die strukturierte Welt — Policen, Prämien, Courtagen. Versumio hält die unstrukturierte Schicht daneben — Mails, Beratung, Schadennotizen, das Warum — und beantwortet über beide hinweg. Bulk-Import bringt die Historie rein." },
      { q: "Ist das eine Underwriting-/Tarifierungs-Engine?", a: "Nein, bewusst nicht. Das Underwriting-/Tarif-Geld ist ein überfüllter Versicherer-Tech-Markt, in dem wir nicht antreten. Versumio ist das Makler-Gedächtnis und der Kunden-Beratungsassistent — der Teil, den diese Engines nicht berühren." },
      { q: "Wie bleiben wir mit Kundendaten vertraulich?", a: "Self-hosted heißt: Kundendaten verlassen eure Infrastruktur nie. Hosted läuft in der EU mit AVV. Jeder KI-Output ist nach EU-AI-Act gekennzeichnet." },
      { q: "Was passiert, wenn ein erfahrener Makler geht?", a: "Sein Kundenwissen bleibt im Gehirn — Deckungs-Begründung, Schadenhistorie, gemachte Zusagen — sodass die Beziehung die Übergabe übersteht, statt aus der Tür zu gehen." },
    ],
    ctaTitle: "Die nächste Verlängerung gewinnt, was eure Agentur schon weiß.",
    ctaSub: "Startet mit einem Kundenbestand als Pilot. Keine Kundendaten müssen euer Haus verlassen.",
    ctaButton: "Makler-Gehirn starten",
  },
};
