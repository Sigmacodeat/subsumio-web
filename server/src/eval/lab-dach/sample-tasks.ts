/**
 * LAB-DACH v3 — Sample Tasks
 *
 * Three sample tasks (one per workflow) for the first E2E run.
 * Each task has ≥8 criteria, ≥1 automated, ≥3 llm_judge, ≥2 critical.
 */

import type { Task } from "./types.ts";

// ── Workflow 1: Rechtsfrage → Kurzmemorandum (DE) ─────────────────────

export const SAMPLE_TASK_1_DE: Task = {
  id: "lab-dach-de-001",
  title: "Gewährleistung beim Kaufvertrag — Mangel am gekauften Auto",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "dev",
  prompt:
    "Käufer K kauft von Verkäufer V einen gebrauchten Pkw für 8.000 €. Zwei Wochen nach Übergabe stellt K fest, dass die Bremsen defekt sind. Die Reparatur kostet 600 €. K möchte wissen, welche Gewährleistungsansprüche er gegen V hat.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Gewährleistungsfrage",
      min_length: 500,
      required_sections: ["Sachverhalt", "Rechtsfrage", "Rechtliche Würdigung", "Ergebnis"],
    },
  ],
  criteria: [
    {
      id: "crit-001",
      description: "Alle §-Zitate sind im Kontext begründet (Guardrail v2)",
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination (keine AT/CH-Gesetze)",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty (kein vages Hedging ohne Begründung)",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
    },
    {
      id: "crit-007",
      description: "Werden die Gewährleistungsansprüche aus § 437 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Werden die Ansprüche aus § 437 BGB (Nacherfüllung, Rücktritt, Minderung, Schadensersatz) korrekt und vollständig genannt?",
      critical: true,
    },
    {
      id: "crit-008",
      description: "Wird die Verjährungsfrist für Gewährleistungsansprüche korrekt angegeben?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Verjährungsfrist nach § 438 BGB (regelmäßig 2 Jahre bei Gebrauchtwagen) korrekt genannt?",
      critical: false,
    },
    {
      id: "crit-009",
      description: "Ist das Memorandum rechtlich gut strukturiert?",
      check_type: "llm_judge",
      judge_question:
        "Hat das Memorandum eine klare juristische Struktur (Sachverhalt, Rechtsfrage, Würdigung, Ergebnis)?",
      critical: false,
    },
    {
      id: "crit-010",
      description: "Wird der Sachverhalt korrekt subsumiert?",
      check_type: "llm_judge",
      judge_question:
        "Werden die Sachverhaltsfakten (gebrauchter Pkw, Bremsendefekt, 600€ Reparatur) korrekt auf die rechtlichen Normen subsumiert?",
      critical: false,
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["437", "438", "434"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-14T00:00:00Z",
};

// ── Workflow 2: Gerichtsakt → Fristen/Risiken (AT) ────────────────────

export const SAMPLE_TASK_2_AT: Task = {
  id: "lab-dach-at-001",
  title: "Berufung gegen Urteil — Fristen und Verfahrensrisiken",
  jurisdiction: "AT",
  legal_area: "litigation",
  workflow: "gerichtsakt_fristen",
  difficulty: "normal",
  split: "dev",
  prompt:
    "Mandant M wurde vom Bezirksgericht Linz am 10. Juli 2026 zur Zahlung von € 5.000 verurteilt. Das Urteil wurde am 15. Juli 2026 zugestellt. M möchte Berufung einlegen. Erstellen Sie einen Fristen- und Risikenbericht.",
  case_facts:
    "Urteil des Bezirksgerichts Linz vom 10.07.2026. Streitwert: € 5.000. Zugestellt am 15.07.2026. Parteien: M (Beklagter) vs. K (Kläger). Streitgegenstand: Forderung aus Werkvertrag.",
  deliverables: [
    {
      type: "fristen_report",
      filename: "fristen_report.md",
      description: "Fristen- und Risikenbericht zur Berufung",
      min_length: 400,
      required_sections: ["Fristen", "Verfahrensrisiken", "Empfehlungen"],
    },
  ],
  criteria: [
    {
      id: "crit-001",
      description: "Alle §-Zitate sind im Kontext begründet",
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für AT",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination (keine DE-Gesetze)",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
    },
    {
      id: "crit-005",
      description: "Mindestens 1 Gesetz zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: false,
      params: { min: 1 },
    },
    {
      id: "crit-006",
      description: "Zitierte Gesetze haben gültige Corpus-Receipts",
      check_type: "automated",
      automated_check: "source_provenance",
      critical: false,
    },
    {
      id: "crit-007",
      description: "Wird die Berufungsfrist nach § 514 ZPO (4 Wochen) korrekt berechnet?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Berufungsfrist von 4 Wochen ab Zustellung (15.07.2026) korrekt berechnet? Fristende sollte der 12.08.2026 sein.",
      critical: true,
    },
    {
      id: "crit-008",
      description: "Werden die Verfahrensrisiken der Berufung dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Werden typische Verfahrensrisiken (Kostenrisiko, Erfolgsaussichten, Streitwerterhöhung) angesprochen?",
      critical: false,
    },
    {
      id: "crit-009",
      description: "Ist der Bericht gut strukturiert?",
      check_type: "llm_judge",
      judge_question: "Hat der Bericht eine klare Struktur mit Fristen, Risiken und Empfehlungen?",
      critical: false,
    },
  ],
  expected_laws: ["ZPO"],
  expected_paragraphs: ["514"],
  min_citations: 1,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-14T00:00:00Z",
};

// ── Workflow 3: Schriftsatzentwurf (DE) ───────────────────────────────

export const SAMPLE_TASK_3_DE: Task = {
  id: "lab-dach-de-002",
  title: "Klagebeantwortung — Schadensersatz wegen unerlaubter Handlung",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "schriftsatz_entwurf",
  difficulty: "normal",
  split: "dev",
  prompt:
    "Verfassen Sie einen Klagebeantwortungsentwurf für den Beklagten B. Der Kläger K behauptet, B habe ihn beim Fußballspielen vorsätzlich am Bein verletzt. K fordert 3.000 € Schmerzensgeld und 500 € Heilbehandlungskosten.",
  case_facts:
    "Vorfall: Freundschaftsspiel Fußball am 03.06.2026. K behauptet, B habe ihn bei einem Zweikampf absichtlich am Bein getreten. Zeuge: Z (Mitspieler). K hat Prellung am Schienbein, 2 Tage krankgeschrieben. Arztkosten: 500 €. K fordert 3.000 € Schmerzensgeld nach § 823 BGB.",
  deliverables: [
    {
      type: "schriftsatz",
      filename: "schriftsatz.txt",
      description: "Klagebeantwortungsentwurf",
      min_length: 600,
      required_sections: ["Rubrum", "Anträge", "Begründung", "Beweisangebot"],
    },
  ],
  criteria: [
    {
      id: "crit-001",
      description: "Alle §-Zitate sind im Kontext begründet",
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
    },
    {
      id: "crit-007",
      description: "Werden die Voraussetzungen des § 823 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Werden die Tatbestandsmerkmale des § 823 Abs. 1 BGB (Lebensgut, Verletzungshandlung, Kausalität, Verschulden) im Schriftsatz korrekt behandelt?",
      critical: true,
    },
    {
      id: "crit-008",
      description: "Ist die Verteidigung rechtlich schlüssig?",
      check_type: "llm_judge",
      judge_question:
        "Ist die Verteidigungsstrategie (Bestreiten der Kausalität, Mitverschulden, fehlender Vorsatz) rechtlich schlüssig dargestellt?",
      critical: false,
    },
    {
      id: "crit-009",
      description: "Sind die formellen Anforderungen erfüllt?",
      check_type: "llm_judge",
      judge_question:
        "Hat der Schriftsatz die formellen Anforderungen (Rubrum, Anträge, Begründung, Beweisangebot)?",
      critical: false,
    },
    {
      id: "crit-010",
      description: "Wird das Mitverschulden nach § 254 BGB angesprochen?",
      check_type: "llm_judge",
      judge_question:
        "Wird ein möglicher Mitverschuldenseinwand nach § 254 BGB (Sportverletzungsrisiko) erörtert?",
      critical: false,
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["823", "254"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-14T00:00:00Z",
};

// ── All Sample Tasks ──────────────────────────────────────────────────

export const ALL_SAMPLE_TASKS: Task[] = [SAMPLE_TASK_1_DE, SAMPLE_TASK_2_AT, SAMPLE_TASK_3_DE];
