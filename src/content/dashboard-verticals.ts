// Per-vertical dashboard workspaces — the brain-connected "home" for the
// verticals that don't have legal's bespoke tooling (cases/beA/…). Each surfaces
// the vertical's tuned brain prompts (deep-link to /dashboard/query?q=) and the
// generic dashboard tools that serve it. The vertical's agent skills are listed
// for orientation (invoked by the assistant/agents, not a button here).

export interface DashboardVertical {
  slug: string; // /dashboard/<slug>
  brand: string;
  title: string;
  intro: string;
  prompts: string[]; // → /dashboard/query?q=
  tools: { label: string; href: string; desc: string }[];
  skills: string[]; // agent skills available for this vertical
}

export const DASHBOARD_VERTICALS: Record<string, DashboardVertical> = {
  tax: {
    slug: "tax",
    brand: "Taxumio",
    title: "Steuerkanzlei-Arbeitsplatz",
    intro: "Das Mandanten-Gedächtnis: Beratungshistorie, Fristen, Bescheide, DATEV-Kontext — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Welche offenen Punkte gibt es vor dem Jahresgespräch mit Mandant X?",
      "Warum haben wir die Holding-Struktur von Mandant Y so aufgesetzt?",
      "Welche Bescheide oder Fristen sind diese Woche kritisch?",
      "Welche Mandanten betrifft die E-Rechnungs-Pflicht — und was haben wir kommuniziert?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Mandantenkontext, Bescheide, Notizen — mit Quellen" },
      { label: "DATEV-Export", href: "/dashboard/datev-export", desc: "Übergaben und strukturierte Exporte" },
      { label: "Fristen", href: "/dashboard/deadlines", desc: "Bescheide, Einsprüche, Abgaben" },
      { label: "Kontakte", href: "/dashboard/contacts", desc: "Mandanten, Ansprechpartner, Beziehungen" },
      { label: "Dokumenten-Vault", href: "/dashboard/vault", desc: "Bescheide, Verträge, Korrespondenz" },
      { label: "Verfahrensdoku", href: "/dashboard/verfahrensdoku", desc: "GoBD-Dokumentation aus Stammdaten" },
    ],
    skills: ["tax-context", "deadline-review", "advisory-history"],
  },
  insurance: {
    slug: "insurance",
    brand: "Versumio",
    title: "Versicherungsmakler-Arbeitsplatz",
    intro: "Das Makler-Gedächtnis: Deckung, Schäden, Verlängerungen — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Welche Renewals stehen in den nächsten 60 Tagen an?",
      "Was wissen wir über die Schadenhistorie von Kunde X?",
      "Wofür ist Kunde Y gedeckt — und wo ist eine Lücke?",
      "Welche Zusagen haben wir Kunde Z im letzten Gespräch gemacht?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Deckung, Schäden, Beratung — mit Quellen" },
      { label: "Policen & Verträge", href: "/dashboard/contracts", desc: "Policen und Bedingungen abfragbar" },
      { label: "Fristen", href: "/dashboard/deadlines", desc: "Verlängerungs- & Schadenfristen" },
      { label: "Kunden & Kontakte", href: "/dashboard/contacts", desc: "Kundenkontext & Beziehungen" },
      { label: "Dokumenten-Vault", href: "/dashboard/vault", desc: "Policen, Schadenakten, Korrespondenz" },
      { label: "Graph", href: "/dashboard/graph", desc: "Kunde → Police → Schaden → Versicherer" },
    ],
    skills: ["policy-review", "claims-assist", "coverage-gap-finder"],
  },
  realestate: {
    slug: "realestate",
    brand: "Immumio",
    title: "Immobilien-Arbeitsplatz",
    intro: "Das Objekt-Gedächtnis: Mietverträge, Mieter, Verlängerungen, Due Diligence — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Welche Mietverträge laufen in den nächsten 90 Tagen aus oder haben Break-Optionen?",
      "Was steht im Mietvertrag von Einheit X — Laufzeit, Staffel, offene Punkte?",
      "Wie ist Vermietungsstand und WALT im Objekt Y?",
      "Was fehlt für die Ankaufsprüfung des Objekts an der Hauptstraße?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Mietverträge, Mieter, Pflichten — mit Quellen" },
      { label: "Miet- & Verträge", href: "/dashboard/contracts", desc: "Mietverträge und Nachträge abfragbar" },
      { label: "Fristen", href: "/dashboard/deadlines", desc: "Kündigungs-, Break-, Anpassungsfristen" },
      { label: "Mieter & Eigentümer", href: "/dashboard/contacts", desc: "Kontext & Beziehungen" },
      { label: "Dokumenten-Vault", href: "/dashboard/vault", desc: "Verträge, Grundbuch, Transaktionen" },
      { label: "Portfolio-Graph", href: "/dashboard/graph", desc: "Objekt → Einheit → Mietvertrag → Mieter" },
    ],
    skills: ["lease-review", "rent-roll-analysis", "property-due-diligence"],
  },
  vc: {
    slug: "vc",
    brand: "Investumio",
    title: "VC / Fonds-Arbeitsplatz",
    intro: "Das Fonds-Gedächtnis: Deals, Founder, Beziehungsgraph — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Was ist mit den Foundern dieser Woche noch offen?",
      "Wer verbindet uns mit Company X — warmes Intro?",
      "Welche Companies brauchen vor dem LP-Update Aufmerksamkeit?",
      "Bei welchen Deals haben wir gepasst, die danach geraised haben?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Calls, Memos, Notizen — mit Quellen" },
      { label: "Beziehungsgraph", href: "/dashboard/graph", desc: "Wer-kennt-wen, invested_in, works_at" },
      { label: "Founder & Investoren", href: "/dashboard/contacts", desc: "Personen mit jedem Touchpoint" },
      { label: "Memo-Entwurf", href: "/dashboard/drafting", desc: "Strukturierte IC-Memos, zitiert" },
      { label: "Fristen", href: "/dashboard/deadlines", desc: "Intros, Term-Sheets, geschuldete Punkte" },
      { label: "Deal-Vault", href: "/dashboard/vault", desc: "Decks, Memos, LP-Material" },
    ],
    skills: ["deal-memo", "founder-tracker", "portfolio-review"],
  },
  consulting: {
    slug: "consulting",
    brand: "Consultumio",
    title: "Beratungs-Arbeitsplatz",
    intro: "Das Institutional Memory: Vorarbeit, Learnings, Reuse — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Haben wir so ein Projekt schon mal gemacht? Was haben wir gelernt?",
      "Welche wiederverwendbaren Assets gibt es zu diesem Thema?",
      "Was lief im letzten Projekt mit Kunde X — inkl. Post-Mortem?",
      "Was muss ein neuer Kollege über Kunde Y wissen?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Projekt-Learnings & Assets — mit Quellen" },
      { label: "Reuse-Suche", href: "/dashboard/research", desc: "„Haben wir das schon gemacht?“" },
      { label: "Scope-Entwurf", href: "/dashboard/drafting", desc: "Engagement-Scopes aus Vorarbeit" },
      { label: "Beziehungsgraph", href: "/dashboard/graph", desc: "Wer kennt wen bei welchem Kunden" },
      { label: "Pro-Mandant-Teams", href: "/dashboard/team", desc: "Mandantensichere Trennung" },
      { label: "Wissens-Vault", href: "/dashboard/vault", desc: "Decks, Projektdokumente, Learnings" },
    ],
    skills: ["proposal-finder", "project-retro", "engagement-scoping"],
  },
  recruiting: {
    slug: "recruiting",
    brand: "Talentumio",
    title: "Executive-Search-Arbeitsplatz",
    intro: "Der Talent-Graph: Kandidaten, Pipeline, wer-kennt-wen — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Wer in unserem Netzwerk passt auf ein CFO-Mandat im Fintech?",
      "Welche Kandidaten sagten, dass sie wechselbereit sind?",
      "Welche Suchen sind auf Time-to-Fill in Gefahr?",
      "Wer kann uns bei Kandidatin X vorstellen?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Kandidaten, Interaktionen — mit Quellen" },
      { label: "Talent-Graph", href: "/dashboard/graph", desc: "Wer-kennt-wen, worked_at, advises" },
      { label: "Shortlist / Match", href: "/dashboard/research", desc: "Gerankter Fit für eine Rolle" },
      { label: "Dossier-Entwurf", href: "/dashboard/drafting", desc: "Einreichfertige Profile, einwilligungs-markiert" },
      { label: "Fristen", href: "/dashboard/deadlines", desc: "Pipeline, Mandanten-Updates" },
      { label: "Kandidaten-Vault", href: "/dashboard/vault", desc: "Profile, Referenzen, Such-Akten" },
    ],
    skills: ["candidate-match", "pipeline-review", "candidate-dossier"],
  },
  medical: {
    slug: "medical",
    brand: "Medumio",
    title: "Medizinischer Arbeitsplatz",
    intro: "Das vertrauliche Praxis-Gedächtnis: Befunde, Wiedervorlagen, Behandlungskontext und Dokumente — frag das Brain oder öffne ein Tool.",
    prompts: [
      "Welche Wiedervorlagen sind diese Woche fällig?",
      "Was steht in den letzten Notizen zu diesem Behandlungsfall?",
      "Welche Besonderheiten sind bei Patient X dokumentiert?",
      "Welche offenen Punkte gibt es mit dem Labor oder Facharzt?",
    ],
    tools: [
      { label: "Brain fragen", href: "/dashboard/query", desc: "Befunde, Notizen, Wiedervorlagen — mit Quellen" },
      { label: "Dokumenten-Vault", href: "/dashboard/vault", desc: "Befunde, Briefe, Einwilligungen" },
      { label: "Fristen", href: "/dashboard/deadlines", desc: "Wiedervorlagen und Rückfragen" },
      { label: "Kontakte", href: "/dashboard/contacts", desc: "Patienten, Praxen, Labore" },
      { label: "Graph", href: "/dashboard/graph", desc: "Fall → Dokument → Behandlung → Kontakt" },
      { label: "Anonymisierung", href: "/dashboard/anonymize", desc: "Datenschutzbewusste Weitergabe" },
    ],
    skills: ["clinical-context", "follow-up-review", "record-summary"],
  },
};
