/**
 * LAB-DACH v3 — Gold Tasks: DE Litigation (BGB)
 *
 * 10 gold tasks covering German civil litigation across narrowly scoped BGB areas.
 * Each task has 8-12 atomic criteria with separated `required` and `severity`.
 * All tasks include: as_of_date, official_sources, reference_output, reviewer, qrels.
 */

import type { Task } from "./types.ts";

const REVIEWER = {
  name: "Dr. Andreas Krenn",
  role: "Rechtsanwalt",
  reviewed_at: "2026-07-15T10:00:00Z",
};

const AS_OF = "2026-07-15";

// ── Task 001: Gewährleistung Gebrauchtwagen ────────────────────────────

export const GOLD_DE_LIT_001: Task = {
  id: "gold-de-lit-001",
  title: "Gewährleistung beim Gebrauchtwagenkauf — Bremsendefekt",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "Käufer K kauft von Verkäufer V einen gebrauchten Pkw (Baujahr 2020, 60.000 km) für 9.500 € von einem gewerblichen Händler. Drei Wochen nach Übergabe stellt K fest, dass die Bremsen defekt sind. Die Reparatur kostet 750 €. Der Kaufvertrag enthält keinen Gewährleistungsausschluss. K möchte wissen, welche Ansprüche er hat.",
  case_facts:
    "Gebrauchtwagenkauf gewerblicher Händler → Privatperson. Baujahr 2020, 60.000 km, Preis 9.500 €. Mangel: Bremsendefekt nach 3 Wochen. Reparaturkosten 750 €. Kein Gewährleistungsausschluss.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zu Gewährleistungsansprüchen",
      min_length: 600,
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination (keine AT/CH-Gesetze)",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Werden die Gewährleistungsansprüche aus § 437 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Werden die Ansprüche aus § 437 BGB (Nacherfüllung → Rücktritt/Minderung/Schadensersatz) in der richtigen Reihenfolge und vollständig genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Verjährungsfrist nach § 438 BGB korrekt angegeben?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Verjährungsfrist für gebrauchte Sachen (2 Jahre ab Ablieferung nach § 438 Abs. 1 Nr. 3 BGB) korrekt genannt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Verbrauchsgüterkauf-Regelung (§ 474 BGB) erkannt?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass es sich um einen Verbrauchsgüterkauf (§ 474 BGB) handelt und der Gewährleistungsausschluss bei gebrauchten Sachen nur die Verjährungsfrist verkürzen kann (§ 475 Abs. 2 BGB)?",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-010",
      description: "Wird der Mangelbegriff nach § 434 BGB korrekt angewendet?",
      check_type: "llm_judge",
      judge_question:
        "Wird der Bremsendefekt als Sachmangel nach § 434 Abs. 1 BGB korrekt subsumiert?",
      critical: false,
      required: true,
      severity: "high",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["434", "437", "438", "474"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__434.html",
      description: "BGB § 434 — Sachmangel",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__437.html",
      description: "BGB § 437 — Rechte des Käufers",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__438.html",
      description: "BGB § 438 — Verjährung der Mängelansprüche",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK kauft von gewerblichen Händler V einen gebrauchten Pkw (Baujahr 2020, 60.000 km) für 9.500 €. Drei Wochen nach Übergabe stellt K einen Bremsendefekt fest. Reparaturkosten: 750 €. Kein Gewährleistungsausschluss.\n\n## Rechtsfrage\nWelche Gewährleistungsansprüche hat K gegen V?\n\n## Rechtliche Würdigung\nEs liegt ein Verbrauchsgüterkauf gem. § 474 Abs. 1 BGB vor. Der Bremsendefekt stellt einen Sachmangel gem. § 434 Abs. 1 BGB dar.\n\nDie Ansprüche des K richten sich nach § 437 BGB:\n1. Nacherfüllung (§ 439 BGB): K kann Nachbesserung oder Nachlieferung verlangen.\n2. Rücktritt oder Minderung (§§ 440, 323, 441 BGB): Nach erfolgloser Nacherfüllung.\n3. Schadensersatz (§§ 440, 280, 281 BGB): Bei Pflichtverletzung.\n\nDie Verjährungsfrist beträgt nach § 438 Abs. 1 Nr. 3 BGB zwei Jahre ab Ablieferung.\n\n## Ergebnis\nK hat gegen V primär einen Anspruch auf Nacherfüllung (§ 437 Nr. 1 BGB). Nach erfolgloser Fristsetzung kann K Rücktritt, Minderung oder Schadensersatz geltend machen. Verjährungsfrist: 2 Jahre ab Ablieferung.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-434", grade: 3, reason: "Sachmangeldefinition — Kernnorm" },
      { slug: "law/de/bgb/§-437", grade: 3, reason: "Rechte des Käufers bei Mängeln — Kernnorm" },
      { slug: "law/de/bgb/§-438", grade: 2, reason: "Verjährung der Mängelansprüche" },
      { slug: "law/de/bgb/§-439", grade: 2, reason: "Nacherfüllung" },
      { slug: "law/de/bgb/§-474", grade: 1, reason: "Verbrauchsgüterkauf — qualifiziert den Kauf" },
    ],
    hard_negatives: [
      {
        slug: "law/de/bgb/§-320",
        grade: 0,
        reason: "Einrede des nicht erfüllten Vertrags — ähnlich aber nicht Gewährleistung",
      },
      { slug: "law/at/abgb/§-922", grade: 0, reason: "AT Gewährleistung — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-280",
        grade: 1,
        reason: "Schadensersatz bei Pflichtverletzung — relevant aber sekundär",
      },
    ],
  },
};

// ── Task 002: Schadensersatz bei Verkehrsunfall ────────────────────────

export const GOLD_DE_LIT_002: Task = {
  id: "gold-de-lit-002",
  title: "Schadensersatz nach Verkehrsunfall — Auffahrunfall an Ampel",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "A fährt am 01.06.2026 im Stadtverkehr auf den Pkw von B auf, weil B abrupt bremst, obwohl die Ampel grün zeigt. B erleidet einen Blechschaden von 2.500 €. B verlangt Schadensersatz von A. A meint, B habe unerwartet gebremst. Wer ist rechtlich im Recht?",
  case_facts:
    "Auffahrunfall am 01.06.2026. A fährt auf B auf. B bremst abrupt bei grüner Ampel. Blechschaden B: 2.500 €. A argumentiert: B habe unerwartet gebremst (Kinder auf der Fahrbahn).",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Schadensersatzfrage",
      min_length: 600,
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Zitierte Gesetze haben gültige Corpus-Receipts",
      check_type: "automated",
      automated_check: "source_provenance",
      critical: false,
      required: false,
      severity: "low",
    },
    {
      id: "crit-007",
      description: "Wird § 823 Abs. 1 BGB als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 823 Abs. 1 BGB (unerlaubte Handlung — Eigentumsverletzung) als Anspruchsgrundlage korrekt genannt und begründet?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird der Haftungsmaßstab (Verschulden) korrekt geprüft?",
      check_type: "llm_judge",
      judge_question:
        "Wird geprüft, ob A den Unfall verschuldet hat (§ 276 BGB — Fahrlässigkeit) und ob ein Mitverschulden des B vorliegt (§ 254 BGB)?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Beweislastverteilung beim Auffahrunfall korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass beim Auffahrunfall grundsätzlich der Auffahrende haftet, es sei denn er beweist ein unabwendbares Ereignis?",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-010",
      description: "Wird der Schadensumfang nach § 249 BGB korrekt bestimmt?",
      check_type: "llm_judge",
      judge_question:
        "Wird der Umfang des Schadensersatzes nach § 249 Abs. 1 BGB (Naturalrestitution — Reparaturkosten) korrekt dargestellt?",
      critical: false,
      required: true,
      severity: "high",
    },
  ],
  expected_laws: ["BGB", "StVO"],
  expected_paragraphs: ["823", "249", "254", "276"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__823.html",
      description: "BGB § 823 — Schadensersatzpflicht",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__249.html",
      description: "BGB § 249 — Art und Umfang des Schadensersatzes",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__254.html",
      description: "BGB § 254 — Mitverschulden",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nA fährt am 01.06.2026 im Stadtverkehr auf den Pkw von B auf. B bremst abrupt bei grüner Ampel (Kinder auf der Fahrbahn). Blechschaden bei B: 2.500 €.\n\n## Rechtsfrage\nHat B gegen A einen Anspruch auf Schadensersatz?\n\n## Rechtliche Würdigung\nAnspruchsgrundlage: § 823 Abs. 1 BGB. A hat das Eigentum des B verletzt.\n\nTatbestandsmerkmale: Verletzungshandlung (Auffahren), Erfolg (Blechschaden), Kausalität, Verschulden (§ 276 BGB — A hat den Sicherheitsabstand nicht einghalten).\n\nMitverschulden (§ 254 BGB): B bremste wegen Kindern auf der Fahrbahn — dies ist verkehrsbedingt. Ein Mitverschulden liegt nicht vor.\n\nSchadensumfang: § 249 Abs. 1 BGB — Naturalrestitution. B kann 2.500 € Reparaturkosten verlangen.\n\n## Ergebnis\nB hat gegen A einen Anspruch auf Schadensersatz in Höhe von 2.500 € aus § 823 Abs. 1 BGB i.V.m. § 249 BGB. Kein Mitverschulden des B.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-823", grade: 3, reason: "Schadensersatz — Kernnorm" },
      { slug: "law/de/bgb/§-249", grade: 3, reason: "Naturalrestitution — Kernnorm" },
      { slug: "law/de/bgb/§-254", grade: 2, reason: "Mitverschulden" },
      { slug: "law/de/bgb/§-276", grade: 2, reason: "Verschuldensmaßstab" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-831", grade: 0, reason: "Verrichtungsgehilfe — nicht relevant" },
      { slug: "law/at/abgb/§-1295", grade: 0, reason: "AT Schadenersatz — falsche Jurisdiktion" },
      { slug: "law/de/bgb/§-1004", grade: 1, reason: "Beseitigungsanspruch — anders geartet" },
    ],
  },
};

// ── Task 003: Verjährung einer Forderung ───────────────────────────────

export const GOLD_DE_LIT_003: Task = {
  id: "gold-de-lit-003",
  title: "Verjährung einer Kaufpreisforderung — Hemmung durch Verhandlung",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "V hat am 01.03.2023 eine Ware an K geliefert. Die Kaufpreisforderung beträgt 5.000 €. K zahlt nicht. V und K verhandeln ab dem 01.02.2026 über eine Ratenzahlung. Am 01.03.2026 wäre die regelmäßige Verjährungsfrist abgelaufen. V macht die Forderung am 15.06.2026 gerichtlich geltend. Ist der Anspruch noch durchsetzbar?",
  case_facts:
    "Lieferung: 01.03.2023. Forderung: 5.000 € Kaufpreis. Verhandlungen über Ratenzahlung ab 01.02.2026. Reguläre Verjährung: 01.03.2026. Gerichtliche Geltendmachung: 15.06.2026.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Verjährungsfrage",
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird die regelmäßige Verjährungsfrist nach § 195 BGB korrekt genannt?",
      check_type: "llm_judge",
      judge_question:
        "Wird die regelmäßige Verjährungsfrist von 3 Jahren nach § 195 BGB korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird der Verjährungsbeginn nach § 199 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird der Verjährungsbeginn (Ende des Jahres der Entstehung, § 199 Abs. 1 BGB) korrekt dargestellt? Fristbeginn wäre der 31.12.2023, Fristende 31.12.2026.",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Hemmung durch Verhandlungen nach § 203 BGB erkannt?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass die Verhandlungen über Ratenzahlung ab dem 01.02.2026 die Verjährung hemmen (§ 203 BGB)?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis rechtlich korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum korrekten Ergebnis, dass der Anspruch am 15.06.2026 noch nicht verjährt ist?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["195", "199", "203"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__195.html",
      description: "BGB § 195 — Regelmäßige Verjährungsfrist",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__199.html",
      description: "BGB § 199 — Beginn der regelmäßigen Verjährung",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__203.html",
      description: "BGB § 203 — Hemmung der Verjährung bei Verhandlungen",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nV lieferte am 01.03.2023 Ware an K. Kaufpreisforderung: 5.000 €. K zahlt nicht. Ab 01.02.2026 verhandeln V und K über Ratenzahlung. V macht die Forderung am 15.06.2026 gerichtlich geltend.\n\n## Rechtsfrage\nIst der Anspruch am 15.06.2026 noch durchsetzbar?\n\n## Rechtliche Würdigung\nRegelmäßige Verjährungsfrist: § 195 BGB — 3 Jahre.\n\nVerjährungsbeginn: § 199 Abs. 1 BGB — mit Schluss des Jahres der Anspruchsentstehung. Anspruch entstanden am 01.03.2023. Verjährungsbeginn: 31.12.2023. Reguläres Verjährungsende: 31.12.2026.\n\nHemmung: § 203 BGB — Verhandlungen hemmen die Verjährung ab 01.02.2026. Die Hemmung endet 6 Monate nach Abschluss/Abbruch.\n\n## Ergebnis\nDer Anspruch ist am 15.06.2026 nicht verjährt. Die reguläre Frist endet erst am 31.12.2026. Zusätzlich ist die Verjährung seit 01.02.2026 nach § 203 BGB gehemmt.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-195", grade: 3, reason: "Regelmäßige Verjährungsfrist — Kernnorm" },
      { slug: "law/de/bgb/§-199", grade: 3, reason: "Beginn der Verjährung — Kernnorm" },
      { slug: "law/de/bgb/§-203", grade: 3, reason: "Hemmung bei Verhandlungen — entscheidend" },
    ],
    hard_negatives: [
      {
        slug: "law/de/bgb/§-197",
        grade: 0,
        reason: "30-jährige Verjährung — nicht für Kaufpreisforderungen",
      },
      { slug: "law/at/abgb/§-1489", grade: 0, reason: "AT Verjährung — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-204",
        grade: 1,
        reason: "Hemmung durch Rechtsverfolgung — andere Voraussetzungen",
      },
    ],
  },
};

// ── Task 004: Rücktritt vom Kaufvertrag ────────────────────────────────

export const GOLD_DE_LIT_004: Task = {
  id: "gold-de-lit-004",
  title: "Rücktritt vom Kaufvertrag — Nichtlieferung der Ware",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "schriftsatz_entwurf",
  difficulty: "normal",
  split: "test",
  prompt:
    "K hat am 01.05.2026 bei V einen Laptop für 1.200 € bestellt und bezahlt. Lieferfrist: 2 Wochen. V liefert nicht. K setzt V eine Nachfrist von 14 Tagen und erklärt danach den Rücktritt. V weigert sich, den Kaufpreis zurückzuerstatten. Verfassen Sie einen Schriftsatz für K zur Rückabwicklung.",
  case_facts:
    "Bestellung: 01.05.2026. Laptop für 1.200 €. Lieferfrist: 2 Wochen (bis 15.05.2026). Nichtlieferung. Nachfristsetzung: 20.05.2026, 14 Tage. Rücktrittserklärung: 04.06.2026. V weigert Rückzahlung.",
  deliverables: [
    {
      type: "schriftsatz",
      filename: "schriftsatz.txt",
      description: "Schriftsatz zur Geltendmachung des Rücktritts",
      min_length: 700,
      required_sections: ["Rubrum", "Anträge", "Begründung", "Rechtsgrundlagen"],
    },
  ],
  criteria: [
    {
      id: "crit-001",
      description: "Alle §-Zitate sind im Kontext begründet (Guardrail v2)",
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird § 323 BGB als Rücktrittsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 323 BGB (Rücktritt wegen nicht oder nicht vertragsgemäß erbrachter Leistung) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Fristsetzung als Voraussetzung des Rücktritts korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass die Nachfristsetzung (§ 323 Abs. 1 BGB) eine notwendige Voraussetzung für den Rücktritt ist und die gesetzte Frist von 14 Tagen angemessen war?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Rückabwicklung nach § 346 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Rückabwicklungspflicht nach § 346 Abs. 1 BGB (beim Rücktritt sind die empfangenen Leistungen zurückzugewähren) korrekt dargestellt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Sind die formellen Anforderungen an den Schriftsatz erfüllt?",
      check_type: "llm_judge",
      judge_question:
        "Hat der Schriftsatz die formellen Anforderungen (Rubrum, Anträge, Begründung, Rechtsgrundlagen)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["323", "346"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__323.html",
      description: "BGB § 323 — Rücktritt wegen nichterfüllter Leistung",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__346.html",
      description: "BGB § 346 — Wirkungen des Rücktritts",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Rubrum\nKläger: K, [Anschrift]\nBeklagter: V, [Anschrift]\n\n## Anträge\n1. Es wird festgestellt, dass der Käufer K wirksam vom Kaufvertrag vom 01.05.2026 über einen Laptop zum Preis von 1.200 € zurückgetreten ist.\n2. Der Beklagte wird verurteilt, an den Kläger 1.200 € nebst Zinsen in Höhe von 5 Prozentpunkten über dem Basiszinssatz seit dem 05.06.2026 zu zahlen.\n\n## Begründung\nK hat bei V am 01.05.2026 einen Laptop zum Preis von 1.200 € bestellt und den Kaufpreis sofort bezahlt. Die vereinbarte Lieferfrist betrug zwei Wochen, mithin bis zum 15.05.2026. V lieferte den Laptop nicht.\n\nK setzte V mit Schreiben vom 20.05.2026 eine Nachfrist von 14 Tagen, mithin bis zum 03.06.2026. V lieferte auch innerhalb dieser Nachfrist nicht. Daraufhin erklärte K mit Schreiben vom 04.06.2026 den Rücktritt vom Kaufvertrag.\n\nRechtsgrundlagen: § 323 Abs. 1 BGB (Rücktritt wegen Nichterfüllung), § 346 Abs. 1 BGB (Rückabwicklung). Der Rücktritt war wirksam, da die Nachfrist von 14 Tagen angemessen war.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-323", grade: 3, reason: "Rücktritt wegen Nichterfüllung — Kernnorm" },
      { slug: "law/de/bgb/§-346", grade: 3, reason: "Wirkungen des Rücktritts — Rückabwicklung" },
      { slug: "law/de/bgb/§-280", grade: 2, reason: "Schadensersatz bei Pflichtverletzung" },
    ],
    hard_negatives: [
      {
        slug: "law/de/bgb/§-314",
        grade: 0,
        reason: "Rücktritt bei Dauerschuldverhältnis — nicht bei Kaufvertrag",
      },
      { slug: "law/at/abgb/§-918", grade: 0, reason: "AT Rücktritt — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-437",
        grade: 1,
        reason: "Gewährleistung — ähnlich aber Sachmangelbezogen",
      },
    ],
  },
};

// ── Task 005: Mietrecht — Mieterhöhung ─────────────────────────────────

export const GOLD_DE_LIT_005: Task = {
  id: "gold-de-lit-005",
  title: "Mieterhöhung bei Wohnraummiete — Zulässigkeit nach § 558 BGB",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "Mieter M wohnt seit 5 Jahren in einer 70-m²-Wohnung in München. Die aktuelle Kaltmiete beträgt 800 €. Vermieter V verlangt eine Mieterhöhung auf 1.100 € unter Verweis auf die ortsübliche Vergleichsmiete. V teilt dies formlos per E-Mail mit. M weigert sich. Ist die Mieterhöhung wirksam?",
  case_facts:
    "Wohnraummiete München. 70 m². Kaltmiete: 800 € (ca. 11,43 €/m²). Gewünschte Miete: 1.100 € (ca. 15,71 €/m²). Mieterhöhung per E-Mail ohne Begründung. Mieter seit 5 Jahren.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Mieterhöhung",
      min_length: 600,
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird § 558 BGB als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 558 BGB (Mieterhöhung bis zur ortsüblichen Vergleichsmiete) als maßgebliche Norm korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird das Formerfordernis nach § 558a BGB korrekt geprüft?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass die Mieterhöhungserklärung per E-Mail ohne Begründung den Formvorschriften des § 558a BGB nicht entspricht?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Kappungsgrenze nach § 558 Abs. 3 BGB angesprochen?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Kappungsgrenze (§ 558 Abs. 3 BGB — max. 20% innerhalb 3 Jahren) erkannt und geprüft?",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis rechtlich korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum korrekten Ergebnis, dass die Mieterhöhung per E-Mail ohne Begründung unwirksam ist?",
      critical: false,
      required: true,
      severity: "high",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["558", "558a"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__558.html",
      description: "BGB § 558 — Mieterhöhung bis zur ortsüblichen Vergleichsmiete",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__558a.html",
      description: "BGB § 558a — Form und Begründung der Mieterhöhung",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nM wohnt seit 5 Jahren in einer 70-m²-Wohnung in München. Kaltmiete: 800 €. V verlangt Mieterhöhung auf 1.100 € per E-Mail ohne Begründung.\n\n## Rechtsfrage\nIst die Mieterhöhung wirksam?\n\n## Rechtliche Würdigung\nAnspruchsgrundlage: § 558 BGB — Mieterhöhung bis zur ortsüblichen Vergleichsmiete.\n\nForm nach § 558a BGB: Die Erklärung bedarf der Textform (E-Mail erfüllt dies). Aber: Die Erklärung muss begründet werden (§ 558a Abs. 1 BGB). V hat keine Begründung angeführt → unwirksam.\n\nKappungsgrenze (§ 558 Abs. 3 BGB): Max. 20% innerhalb 3 Jahren. Von 800 € auf 1.100 € = 37,5% → überschreitet die Kappungsgrenze.\n\n## Ergebnis\nDie Mieterhöhung ist unwirksam. Fehlende Begründung (§ 558a BGB) und Überschreitung der Kappungsgrenze (§ 558 Abs. 3 BGB).",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-558", grade: 3, reason: "Mieterhöhung — Kernnorm" },
      { slug: "law/de/bgb/§-558a", grade: 3, reason: "Form und Begründung — entscheidend" },
      { slug: "law/de/bgb/§-535", grade: 2, reason: "Grundpflichten des Mietvertrags — Kontext" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-573", grade: 1, reason: "Kündigung — anderes Thema" },
      { slug: "law/at/mrg/§-16", grade: 0, reason: "AT Mietrecht — falsche Jurisdiktion" },
      { slug: "law/de/bgb/§-536", grade: 1, reason: "Mietminderung — andere Richtung" },
    ],
  },
};

// ── Task 006: Werkvertrag — Mangel und Vergütung ───────────────────────

export const GOLD_DE_LIT_006: Task = {
  id: "gold-de-lit-006",
  title: "Werkvertrag — Mangelhafte Dachdeckerarbeiten und Vergütung",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "schriftsatz_entwurf",
  difficulty: "normal",
  split: "test",
  prompt:
    "Bauer B beauftragt Dachdecker D mit der Neueindeckung seines Dachstuhls für 15.000 €. Nach Abnahme stellt B fest, dass die Dachziegel an mehreren Stellen nicht dicht sind und Wasser eindringt. Die Nachbesserung durch D schlägt zweimal fehl. B verlangt Minderung der Vergütung um 30% und beauftragt einen anderen Dachdecker mit der Reparatur für 4.500 €. Verfassen Sie einen Schriftsatz für B.",
  case_facts:
    "Werkvertrag: Dachdeckerarbeiten. Vergütung: 15.000 €. Mangel: Undichtigkeit nach Abnahme. Nachbesserung 2x fehlgeschlagen. Minderung: 30% (4.500 €). Drittreparatur: 4.500 €.",
  deliverables: [
    {
      type: "schriftsatz",
      filename: "schriftsatz.txt",
      description: "Schriftsatz zur Geltendmachung von Minderung und Schadensersatz",
      min_length: 700,
      required_sections: ["Rubrum", "Anträge", "Begründung", "Rechtsgrundlagen"],
    },
  ],
  criteria: [
    {
      id: "crit-001",
      description: "Alle §-Zitate sind im Kontext begründet (Guardrail v2)",
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird § 633 BGB (Werkmangel) korrekt als Anspruchsgrundlage identifiziert?",
      check_type: "llm_judge",
      judge_question: "Wird § 633 BGB (Werkmangel — Definition) als Grundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description:
        "Wird die Reihenfolge der Gewährleistungsrechte nach § 634 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Reihenfolge nach § 634 BGB (Nacherfüllung → Selbstvornahme → Minderung → Rücktritt) korrekt dargestellt?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Selbstvornahme nach § 637 BGB korrekt begründet?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Selbstvornahme (§ 637 BGB) nach erfolgloser Nacherfüllung korrekt begründet und der Ersatz der Reparaturkosten (4.500 €) eingefordert?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Sind die formellen Anforderungen an den Schriftsatz erfüllt?",
      check_type: "llm_judge",
      judge_question:
        "Hat der Schriftsatz die formellen Anforderungen (Rubrum, Anträge, Begründung, Rechtsgrundlagen)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["633", "634", "637"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__633.html",
      description: "BGB § 633 — Sach- und Rechtsmangel",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__634.html",
      description: "BGB § 634 — Rechte des Bestellers bei Mängeln",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__637.html",
      description: "BGB § 637 — Selbstvornahme",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Rubrum\nKläger: B, [Anschrift]\nBeklagter: D, [Anschrift]\n\n## Anträge\n1. Der Beklagte wird verurteilt, an den Kläger 4.500 € (Minderung) nebst Zinsen zu zahlen.\n2. Der Beklagte wird verurteilt, an den Kläger weitere 4.500 € (Selbstvornahmekosten) nebst Zinsen zu zahlen.\n\n## Begründung\nB beauftragte D mit der Neueindeckung des Dachstuhls für 15.000 €. Nach Abnahme stellte B Wassereintritt fest. Der Mangel wurde durch D zweimal erfolglos nachgebessert.\n\nRechtsgrundlagen:\n- § 633 BGB: Die Dacharbeiten weisen einen Sachmangel auf (Wassereintritt).\n- § 634 Nr. 1 BGB: Nacherfüllung (Nachbesserung) — zweimal erfolglos.\n- § 634 Nr. 2 BGB i.V.m. § 637 BGB: Selbstvornahme — B durfte nach erfolgloser Nacherfüllung einen anderen Dachdecker beauftragen. Kosten: 4.500 €.\n- § 634 Nr. 3 BGB: Minderung — B kann die Vergütung um 30% (4.500 €) mindern.\n\n## Ergebnis\nB hat Anspruch auf 4.500 € Minderung und 4.500 € Selbstvornahmekosten = insgesamt 9.000 €.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-633", grade: 3, reason: "Werkmangel — Kernnorm" },
      { slug: "law/de/bgb/§-634", grade: 3, reason: "Rechte bei Mängeln — Kernnorm" },
      { slug: "law/de/bgb/§-637", grade: 3, reason: "Selbstvornahme — entscheidend" },
    ],
    hard_negatives: [
      {
        slug: "law/de/bgb/§-437",
        grade: 1,
        reason: "Kaufvertragsgewährleistung — ähnlich aber anderes Vertragsverhältnis",
      },
      { slug: "law/at/abgb/§-1166", grade: 0, reason: "AT Werkvertrag — falsche Jurisdiktion" },
      { slug: "law/de/bgb/§-640", grade: 1, reason: "Abnahme — relevant aber nicht Hauptpunkt" },
    ],
  },
};

// ── Task 007: Bereicherungsrecht — Ungerechtfertigte Überweisung ──────

export const GOLD_DE_LIT_007: Task = {
  id: "gold-de-lit-007",
  title: "Ungerechtfertigte Bereicherung — Falschüberweisung rückgängig machen",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "K überweist versehentlich 3.000 € an das Konto von S statt an den eigentlichen Empfänger E, da er eine falsche IBAN eingibt. S bemerkt den Geldeingang, hebt das Geld ab und weigert sich, es zurückzuzahlen. K fordert die Rückzahlung. Welche Ansprüche hat K?",
  case_facts:
    "Falschüberweisung: 3.000 € an S statt E. Ursache: Falsche IBAN. S hebt Geld ab, verweigert Rückzahlung. K fordert 3.000 € zurück.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zum Bereicherungsrecht",
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description:
        "Wird § 812 Abs. 1 S. 1 Alt. 1 BGB als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 812 Abs. 1 S. 1 Alt. 1 BGB (Leistungskondiktion — etwas erlangt ohne rechtlichen Grund) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Leistung definitionsgemäß korrekt zugeordnet?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass K an S geleistet hat (bewusste und zweckgerichtete Zuwendung), auch wenn die Zuwendung irrtümlich an den falschen Empfänger erfolgte?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Rechtsgrund (Fehlen eines Rechtsgrunds) korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass zwischen K und S kein Rechtsgrund besteht (kein Vertrag, keine sonstige Verpflichtung), der die Zuwendung rechtfertigt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Wird § 818 BGB (Haftung des Bereicherten) korrekt angewendet?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass S nach § 818 Abs. 1 BGB zur Herausgabe verpflichtet ist und nach § 818 Abs. 4 BGB ab Kenntnis verschärft haftet (Verschuldensmaßstab § 292, 987 ff. BGB)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["812", "818"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__812.html",
      description: "BGB § 812 — Herausgabeanspruch",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__818.html",
      description: "BGB § 818 — Haftung des Bereicherten",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK überweist versehentlich 3.000 € an S statt an E (falsche IBAN). S hebt das Geld ab und weigert die Rückzahlung.\n\n## Rechtsfrage\nWelche Ansprüche hat K gegen S?\n\n## Rechtliche Würdigung\nAnspruchsgrundlage: § 812 Abs. 1 S. 1 Alt. 1 BGB — Leistungskondiktion.\n\nLeistung: K hat bewusst und zweckgerichtet 3.000 € an S überwiesen. Auch bei irrtümlicher Falschüberweisung liegt eine Leistung des K vor (bewusste Zuwendung mit Tilgungswillen, wenn auch bezüglich des falschen Empfängers).\n\nOhne rechtlichen Grund: Zwischen K und S besteht kein Vertrag oder sonstiger Rechtsgrund, der die Zuwendung rechtfertigt.\n\nHerausgabeanspruch: S ist nach § 818 Abs. 1 BGB zur Herausgabe des Erlangten verpflichtet. Da S das Geld bereits abgehoben hat, muss er den Wert ersetzen (§ 818 Abs. 2 BGB). Ab Kenntnis von der Ungerechtfertigkeit haftet S verschärft (§ 818 Abs. 4 BGB i.V.m. §§ 292, 987 ff. BGB).\n\n## Ergebnis\nK hat gegen S einen Anspruch auf Rückzahlung von 3.000 € aus § 812 Abs. 1 S. 1 Alt. 1 BGB i.V.m. § 818 BGB.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-812", grade: 3, reason: "Leistungskondiktion — Kernnorm" },
      { slug: "law/de/bgb/§-818", grade: 3, reason: "Haftung des Bereicherten — Kernnorm" },
    ],
    hard_negatives: [
      {
        slug: "law/de/bgb/§-816",
        grade: 1,
        reason: "Bereicherung des Nichtberechtigten — ähnlich aber andere Konstellation",
      },
      { slug: "law/at/abgb/§-1437", grade: 0, reason: "AT Bereicherung — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-951",
        grade: 1,
        reason: "Entschädigungspflicht bei Rechtsverlust — tangential",
      },
    ],
  },
};

// ── Task 008: Stellvertretung — Vertretung ohne Vertretungsmacht ───────

export const GOLD_DE_LIT_008: Task = {
  id: "gold-de-lit-008",
  title: "Stellvertretung — Vertragsschluss ohne Vertretungsmacht",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "V schließt am 01.06.2026 im Namen des H einen Kaufvertrag über einen gebrauchten Pkw für 5.000 € mit D ab. V hat keine Vertretungsmacht für H. H erfährt davon und willigt nicht ein. D verlangt Schadensersatz von V. Welche Ansprüche hat D gegen V?",
  case_facts:
    "V schließt Vertrag im Namen des H mit D. Kaufpreis: 5.000 €. V hat keine Vertretungsmacht. H verweigert Genehmigung. D verlangt Schadensersatz von V.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Stellvertretung",
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird § 164 BGB (Wirkung der Stellvertretung) korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass für eine wirksame Stellvertretung Vertretungsmacht erforderlich ist (§ 164 Abs. 1 BGB) und diese im vorliegenden Fall fehlte?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird § 177 BGB (Vertrag ohne Vertretungsmacht) korrekt angewendet?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass der Vertrag nach § 177 BGB schwebend unwirksam ist und durch Genehmigung des Vertretenen wirksam werden kann, H aber die Genehmigung verweigert hat?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Haftung des falschen Vertreters nach § 179 BGB korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass V als falscher Vertreter nach § 179 Abs. 1 BGB haftet und D wahlweise Erfüllung oder Schadensersatz verlangen kann?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis rechtlich korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum korrekten Ergebnis, dass D gegen V aus § 179 Abs. 1 BGB vorgehen kann (Erfüllung oder Schadensersatz)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["164", "177", "179"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__164.html",
      description: "BGB § 164 — Wirkung der Stellvertretung",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__177.html",
      description: "BGB § 177 — Vertrag ohne Vertretungsmacht",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__179.html",
      description: "BGB § 179 — Haftung des Vertreters ohne Vertretungsmacht",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nV schließt am 01.06.2026 im Namen des H einen Kaufvertrag über 5.000 € mit D ab, ohne Vertretungsmacht. H verweigert die Genehmigung.\n\n## Rechtsfrage\nWelche Ansprüche hat D?\n\n## Rechtliche Würdigung\nDer Vertrag ist nach § 177 Abs. 1 BGB schwebend unwirksam, da V ohne Vertretungsmacht gehandelt hat (§ 164 Abs. 1 BGB). H hat die Genehmigung verweigert → der Vertrag ist endgültig unwirksam.\n\nHaftung des V: § 179 Abs. 1 BGB — Wer als Vertreter ohne Vertretungsmacht einen Vertrag geschlossen hat, haftet dem anderen Teil nach dessen Wahl auf Erfüllung oder Schadensersatz.\n\nD kann also von V Erfüllung (Übereignung des Pkw) oder Schadensersatz verlangen.\n\n## Ergebnis\nD hat gegen V einen Anspruch nach § 179 Abs. 1 BGB auf Erfüllung oder Schadensersatz, da H die Genehmigung verweigert hat.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-164", grade: 3, reason: "Stellvertretung — Kernnorm" },
      { slug: "law/de/bgb/§-177", grade: 3, reason: "Vertrag ohne Vertretungsmacht — Kernnorm" },
      {
        slug: "law/de/bgb/§-179",
        grade: 3,
        reason: "Haftung des falschen Vertreters — entscheidend",
      },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-168", grade: 1, reason: "Fortdauer der Vertretungsmacht — tangential" },
      { slug: "law/at/abgb/§-1026", grade: 0, reason: "AT Stellvertretung — falsche Jurisdiktion" },
      { slug: "law/de/bgb/§-182", grade: 1, reason: "Einwilligung — ähnlich aber andere Norm" },
    ],
  },
};

// ── Task 009: Fristsetzung und Schadensersatz ──────────────────────────

export const GOLD_DE_LIT_009: Task = {
  id: "gold-de-lit-009",
  title: "Schadensersatz statt der Leistung — Fristsetzung nach § 281 BGB",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "schriftsatz_entwurf",
  difficulty: "normal",
  split: "test",
  prompt:
    "K hat bei V am 01.04.2026 eine Maschine für 20.000 € bestellt. Liefertermin: 15.05.2026. V liefert am 20.05.2026 — 5 Tage zu spät. K setzt V eine Frist von 10 Tagen zur Lieferung. V liefert nicht innerhalb der Frist. K beauftragt einen anderen Lieferanten für 22.000 € und verlangt den Mehrpreis von 2.000 € als Schadensersatz. Verfassen Sie einen Schriftsatz für K.",
  case_facts:
    "Bestellung: 01.04.2026. Maschine 20.000 €. Liefertermin: 15.05.2026. Tatsächliche Lieferung: 20.05.2026 (verspätet). Nachfrist: 10 Tage. V liefert nicht innerhalb Frist. Deckungskauf: 22.000 €. Mehrpreis: 2.000 €.",
  deliverables: [
    {
      type: "schriftsatz",
      filename: "schriftsatz.txt",
      description: "Schriftsatz zur Geltendmachung von Schadensersatz statt der Leistung",
      min_length: 700,
      required_sections: ["Rubrum", "Anträge", "Begründung", "Rechtsgrundlagen"],
    },
  ],
  criteria: [
    {
      id: "crit-001",
      description: "Alle §-Zitate sind im Kontext begründet (Guardrail v2)",
      check_type: "automated",
      automated_check: "citation_grounded_v2",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird § 281 BGB als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 281 Abs. 1 BGB (Schadensersatz statt der Leistung bei Fristsetzung) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Fristsetzung als Voraussetzung korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass die Fristsetzung nach § 281 Abs. 1 S. 2 BGB eine notwendige Voraussetzung für den Schadensersatzanspruch ist und die Frist von 10 Tagen angemessen war?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Schadensumfang (Mehrkosten/Deckungskauf) korrekt berechnet?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass der Schadensersatz den Mehrpreis des Deckungskaufs (2.000 €) umfasst (§ 249 Abs. 1 BGB — Naturalrestitution)?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Sind die formellen Anforderungen an den Schriftsatz erfüllt?",
      check_type: "llm_judge",
      judge_question:
        "Hat der Schriftsatz die formellen Anforderungen (Rubrum, Anträge, Begründung, Rechtsgrundlagen)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["281", "249"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__281.html",
      description: "BGB § 281 — Schadensersatz statt der Leistung",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__249.html",
      description: "BGB § 249 — Art und Umfang des Schadensersatzes",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Rubrum\nKläger: K, [Anschrift]\nBeklagter: V, [Anschrift]\n\n## Anträge\nDer Beklagte wird verurteilt, an den Kläger 2.000 € nebst Zinsen zu zahlen.\n\n## Begründung\nK bestellte am 01.04.2026 eine Maschine für 20.000 €. Liefertermin: 15.05.2026. V lieferte erst am 20.05.2026 — verspätet. K setzte V eine Nachfrist von 10 Tagen. V lieferte nicht innerhalb der Frist.\n\nRechtsgrundlagen:\n- § 281 Abs. 1 BGB: Schadensersatz statt der Leistung nach erfolgloser Fristsetzung.\n- § 249 Abs. 1 BGB: Naturalrestitution — K musste einen Deckungskauf für 22.000 € tätigen. Mehrpreis: 2.000 €.\n\nDie Frist von 10 Tagen war angemessen. V hat die Leistung nicht innerhalb der Frist erbracht.\n\n## Ergebnis\nK hat gegen V einen Anspruch auf 2.000 € Schadensersatz aus § 281 Abs. 1 BGB i.V.m. § 249 BGB.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-281", grade: 3, reason: "Schadensersatz statt Leistung — Kernnorm" },
      { slug: "law/de/bgb/§-249", grade: 2, reason: "Naturalrestitution — Schadensberechnung" },
      {
        slug: "law/de/bgb/§-280",
        grade: 2,
        reason: "Schadensersatz bei Pflichtverletzung — Grundnorm",
      },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-323", grade: 1, reason: "Rücktritt — Alternative aber nicht primär" },
      { slug: "law/at/abgb/§-921", grade: 0, reason: "AT Schadenersatz — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-283",
        grade: 1,
        reason: "Schadensersatz bei Unmöglichkeit — ähnlich aber andere Voraussetzungen",
      },
    ],
  },
};

// ── Task 010: Gefahrübergang beim Versendungskauf ──────────────────────

export const GOLD_DE_LIT_010: Task = {
  id: "gold-de-lit-010",
  title: "Gefahrübergang beim Versendungskauf — Transportschaden",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "K kauft bei V (Händler) eine Waschmaschine für 600 €. V versendet die Ware am 10.06.2026 per Spedition an K. Am 12.06.2026 wird die Waschmaschine beim Transport beschädigt. K weigert sich, den Kaufpreis zu zahlen. V verlangt Zahlung. Wer trägt das Risiko?",
  case_facts:
    "Versendungskauf: Waschmaschine 600 €. Versendung: 10.06.2026. Transportschaden: 12.06.2026. K weigert Zahlung. V verlangt Kaufpreis.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zum Gefahrübergang",
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
      required: true,
      severity: "critical",
    },
    {
      id: "crit-002",
      description: "Alle referenzierten Gesetze sind gültig für DE",
      check_type: "automated",
      automated_check: "law_valid",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-003",
      description: "Ausgabe ist auf Deutsch",
      check_type: "automated",
      automated_check: "language_german",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-004",
      description: "Keine Cross-Law-Kontamination",
      check_type: "automated",
      automated_check: "jurisdiction_correct",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-005",
      description: "Mindestens 2 verschiedene Gesetze zitiert",
      check_type: "automated",
      automated_check: "min_citations",
      critical: true,
      required: true,
      severity: "high",
      params: { min: 2 },
    },
    {
      id: "crit-006",
      description: "Keine unsubstantiated uncertainty",
      check_type: "automated",
      automated_check: "substantiated_uncertainty",
      critical: false,
      required: false,
      severity: "medium",
    },
    {
      id: "crit-007",
      description: "Wird § 446 BGB (Gefahrübergang) als Kernnorm korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 446 BGB (Gefahrübergang mit Übergabe) als maßgebliche Norm genannt und dargestellt, dass beim Versendungskauf § 447 BGB eingreift?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird § 447 BGB (Versendungskauf) korrekt angewendet?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass beim Versendungskauf (§ 447 BGB) die Gefahr mit Auslieferung an die Spedition auf den Käufer übergeht, wenn V zur Versendung verpflichtet war?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird geprüft, ob V oder K die Transportgefahr trägt?",
      check_type: "llm_judge",
      judge_question:
        "Wird korrekt geprüft, ob V als Händler zur Versendung verpflichtet war (dann § 447 BGB — Gefahr geht auf K über) und ob der Transportschaden nach Gefahrübergang erfolgte?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis rechtlich korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum korrekten Ergebnis, dass K den Kaufpreis zahlen muss, da die Gefahr mit Auslieferung an die Spedition übergegangen ist (§ 447 BGB)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["446", "447"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__446.html",
      description: "BGB § 446 — Gefahrübergang beim Verkauf",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__447.html",
      description: "BGB § 447 — Versendungskauf",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK kauft bei V eine Waschmaschine für 600 €. V versendet am 10.06.2026 per Spedition. Transportschaden am 12.06.2026. K weigert Zahlung.\n\n## Rechtsfrage\nWer trägt das Transportrisiko?\n\n## Rechtliche Würdigung\nBeim Versendungskauf geht die Gefahr nach § 447 Abs. 1 BGB auf den Käufer über, sobald der Verkäufer die Sache dem Spediteur ausgeliefert hat. V hat die Waschmaschine am 10.06.2026 an die Spedition übergeben. Der Schaden trat am 12.06.2026 — also nach Gefahrübergang — ein.\n\nVoraussetzung: V muss zur Versendung verpflichtet gewesen sein. Bei einem Kaufvertrag, bei dem die Versendung vereinbart war, ist dies gegeben.\n\n§ 446 BGB regelt den Normalfall (Gefahrübergang bei Übergabe), § 447 BGB ist die Spezialnorm für den Versendungskauf.\n\n## Ergebnis\nDie Gefahr ist mit Auslieferung an die Spedition am 10.06.2026 auf K übergegangen (§ 447 Abs. 1 BGB). K muss den Kaufpreis von 600 € zahlen. Der Transportschaden geht zu Lasten des K.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-446", grade: 2, reason: "Gefahrübergang bei Übergabe — Grundnorm" },
      { slug: "law/de/bgb/§-447", grade: 3, reason: "Versendungskauf — entscheidende Norm" },
    ],
    hard_negatives: [
      {
        slug: "law/de/bgb/§-434",
        grade: 1,
        reason: "Sachmangel — könnte auch greifen aber Gefahrübergang ist primär",
      },
      { slug: "law/at/abgb/§-1063", grade: 0, reason: "AT Gefahrübergang — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-437",
        grade: 1,
        reason: "Gewährleistung — sekundär, da Schaden nach Gefahrübergang",
      },
    ],
  },
};

export const GOLD_DE_LITIGATION: Task[] = [
  GOLD_DE_LIT_001,
  GOLD_DE_LIT_002,
  GOLD_DE_LIT_003,
  GOLD_DE_LIT_004,
  GOLD_DE_LIT_005,
  GOLD_DE_LIT_006,
  GOLD_DE_LIT_007,
  GOLD_DE_LIT_008,
  GOLD_DE_LIT_009,
  GOLD_DE_LIT_010,
];
