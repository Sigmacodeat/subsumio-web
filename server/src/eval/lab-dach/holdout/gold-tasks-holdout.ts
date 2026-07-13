/**
 * LAB-DACH v3 — Holdout Gold Tasks
 *
 * 5 holdout tasks stored separately from the dev/test tasks.
 * These tasks are NOT used during development or optimization.
 * They are only evaluated in final production-readiness runs.
 *
 * Split: "holdout"
 *
 * Coverage:
 *   - 2 DE litigation (BGB: Rückgewähr nach Rücktritt, GoA)
 *   - 2 DE criminal (StGB: Erpressung, Brandstiftung)
 *   - 1 AT litigation (ABGB: Klagsänderung)
 */

import type { Task } from "../types.ts";

const R = { name: "Dr. Andreas Krenn", role: "Rechtsanwalt", reviewed_at: "2026-07-15T10:00:00Z" };
const A = "2026-07-15";

export const GOLD_HOLDOUT_001: Task = {
  id: "gold-holdout-001",
  title: "Rückgewähr nach Rücktritt — Herausgabe des Kaufpreises",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "holdout",
  prompt:
    "K hat von V einen Gebrauchtwagen für 8.000 € gekauft. Wegen eines Motorschadens tritt K nach § 437 Nr. 2, § 323 BGB vom Kaufvertrag zurück. K verlangt Rückzahlung des Kaufpreises gegen Rückgabe des Autos. V weigert sich. Prüfen Sie die Ansprüche des K.",
  case_facts:
    "Gebrauchtwagen 8.000 €. Motorschaden. K tritt zurück (§§ 437 Nr. 2, 323 BGB). K verlangt 8.000 € zurück. V weigert.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Rückgewähr nach Rücktritt",
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
        "Wird § 346 BGB (Wirkungen des Rücktritts) als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 346 Abs. 1 BGB (Rückgewährpflicht nach Rücktritt) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Rücktrittsvoraussetzung (§ 323 BGB) korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass der Rücktritt nach § 323 BGB wirksam ist (Fristsetzung oder Entbehrlichkeit)?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Pflicht zur Rückgabe der empfangenen Leistungen korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass K nach § 346 Abs. 1 BGB die empfangene Leistung (Auto) zurückgeben und V den Kaufpreis (8.000 €) zurückzahlen muss?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass K gegen V einen Anspruch auf Rückzahlung von 8.000 € aus § 346 Abs. 1 BGB hat?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["346", "323", "437"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: A,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__346.html",
      description: "BGB § 346 — Wirkungen des Rücktritts",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK kauft Gebrauchtwagen 8.000 €. Motorschaden → Rücktritt nach §§ 437 Nr. 2, 323 BGB. K verlangt 8.000 € zurück.\n\n## Rechtsfrage\nHat K einen Rückzahlungsanspruch?\n\n## Rechtliche Würdigung\n§ 346 Abs. 1 BGB: Nach wirksamem Rücktritt sind die empfangenen Leistungen zurückzugewähren. K muss Auto zurückgeben, V muss 8.000 € zurückzahlen.\n\n## Ergebnis\nK hat gegen V einen Anspruch auf 8.000 € aus § 346 Abs. 1 BGB.",
  reviewer: R,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-346", grade: 3, reason: "Rückgewähr — Kernnorm" },
      { slug: "law/de/bgb/§-323", grade: 2, reason: "Rücktrittsgrund" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-437", grade: 1, reason: "Gewährleistung — Verweisungsnorm" },
      { slug: "law/at/abgb/§-918", grade: 0, reason: "AT Rücktritt — falsche Jurisdiktion" },
      { slug: "law/de/bgb/§-355", grade: 1, reason: "Widerruf — andere Rechtsfolge" },
    ],
  },
};

export const GOLD_HOLDOUT_002: Task = {
  id: "gold-holdout-002",
  title: "Geschäftsführung ohne Auftrag — Notmaßnahme",
  jurisdiction: "DE",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "holdout",
  prompt:
    "F sieht, dass das Haus des N in Flammen steht. F bricht die Tür auf und löscht den Brand mit einem Feuerlöscher, bevor die Feuerwehr eintrifft. Die Tür ist beschädigt (300 €). F verlangt Ersatz der Kosten für den Feuerlöscher (50 €) und der Türreparatur. Prüfen Sie die Ansprüche des F gegen N.",
  case_facts:
    "Haus des N brennt. F bricht Tür auf, löscht Brand. Tür beschädigt (300 €), Feuerlöscher (50 €). F verlangt Ersatz.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur GoA nach §§ 677, 683 BGB",
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
      description: "Wird § 677 BGB (GoA) als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 677 BGB (Geschäftsführung ohne Auftrag) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird § 683 BGB (Aufwendungersatz bei berechtigter GoA) korrekt angewendet?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 683 BGB (Aufwendungersatz bei berechtigter Geschäftsführung ohne Auftrag) korrekt angewendet?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird das Interesse des N als wahrgenommen korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass F das Interesse des N (Rettung des Hauses vor Brand) wahrgenommen hat?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass F Aufwendungersatz (Feuerlöscher + Türreparatur) aus §§ 677, 683 BGB verlangen kann?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["BGB"],
  expected_paragraphs: ["677", "683"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: A,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/bgb/__677.html",
      description: "BGB § 677 — GoA",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.gesetze-im-internet.de/bgb/__683.html",
      description: "BGB § 683 — Aufwendungersatz",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nF löscht Brand im Haus des N. Tür beschädigt (300 €), Feuerlöscher (50 €).\n\n## Rechtsfrage\nHat F Aufwendungersatzansprüche?\n\n## Rechtliche Würdigung\n§§ 677, 683 BGB — Berechtigte GoA. F hat ein Geschäft des N (Hausrettung) besorgt. Interesse des N war gegeben. Aufwendungen (Feuerlöscher + Tür) sind ersatzfähig.\n\n## Ergebnis\nF hat gegen N Aufwendungersatz aus §§ 677, 683 BGB (350 €).",
  reviewer: R,
  qrels: {
    relevant: [
      { slug: "law/de/bgb/§-677", grade: 3, reason: "GoA — Kernnorm" },
      { slug: "law/de/bgb/§-683", grade: 3, reason: "Aufwendungersatz — Kernnorm" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-684", grade: 1, reason: "Unberechtigte GoA — nicht einschlägig" },
      { slug: "law/at/abgb/§-1035", grade: 0, reason: "AT GoA — falsche Jurisdiktion" },
      {
        slug: "law/de/bgb/§-670",
        grade: 1,
        reason: "Aufwendungersatz bei Auftrag — andere Grundlage",
      },
    ],
  },
};

export const GOLD_HOLDOUT_003: Task = {
  id: "gold-holdout-003",
  title: "Erpressung — Drohung mit Offenbarung eines Geheimnisses",
  jurisdiction: "DE",
  legal_area: "criminal",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "holdout",
  prompt:
    "T droht O, ein kompromittierendes Foto von O an dessen Arbeitgeber zu schicken, wenn O nicht 5.000 € zahlt. O hat Angst um seinen Job und zahlt. Prüfen Sie die Strafbarkeit des T.",
  case_facts: "T droht O mit Foto an Arbeitgeber. O zahlt 5.000 € aus Angst um Job.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Erpressung nach § 253 StGB",
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
      description: "Wird § 253 StGB (Erpressung) als Tatbestand korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 253 StGB (Erpressung) als einschlägige Norm genannt und werden die Tatbestandsmerkmale geprüft?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Drohung korrekt subsumiert?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Drohung mit Offenbarung des Fotos als Drohung mit einem empfindlichen Übel (§ 253 Abs. 1 StGB) korrekt subsumiert?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Bereicherungsabsicht korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Bereicherungsabsicht (T wollte 5.000 € erlangen) korrekt dargestellt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Wird § 255 StGB (räuberische Erpressung) abgegrenzt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass § 255 StGB (räuberische Erpressung) nicht einschlägig ist, da keine Gewalt angewendet wurde?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["StGB"],
  expected_paragraphs: ["253", "255"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: A,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/stgb/__253.html",
      description: "StGB § 253 — Erpressung",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nT droht O mit Foto an Arbeitgeber. O zahlt 5.000 € aus Angst.\n\n## Rechtsfrage\nIst T nach § 253 StGB strafbar?\n\n## Rechtliche Würdigung\n§ 253 Abs. 1 StGB: Drohung mit empfindlichem Übel (Jobverlust), Bereicherungsabsicht (5.000 €), Vorsatz. § 255 StGB nicht einschlägig (keine Gewalt).\n\n## Ergebnis\nT hat sich wegen Erpressung (§ 253 Abs. 1 StGB) strafbar gemacht.",
  reviewer: R,
  qrels: {
    relevant: [{ slug: "law/de/stgb/§-253", grade: 3, reason: "Erpressung — Kernnorm" }],
    hard_negatives: [
      { slug: "law/de/stgb/§-255", grade: 1, reason: "Räuberische Erpressung — keine Gewalt" },
      { slug: "law/at/stgb/§-144", grade: 0, reason: "AT Erpressung — falsche Jurisdiktion" },
      { slug: "law/de/stgb/§-240", grade: 1, reason: "Nötigung — könnte auch greifen" },
    ],
  },
};

export const GOLD_HOLDOUT_004: Task = {
  id: "gold-holdout-004",
  title: "Brandstiftung — Vorsätzliche Inbrandsetzung eines Gebäudes",
  jurisdiction: "DE",
  legal_area: "criminal",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "holdout",
  prompt:
    "T legt aus Rache an seinem ehemaligen Arbeitgeber Feuer an das Lagergebäude. Das Gebäude brennt vollständig ab. Niemand wird verletzt. Prüfen Sie die Strafbarkeit des T.",
  case_facts:
    "T zündet Lagergebäude des Arbeitgebers aus Rache. Gebäude brennt ab. Keine Verletzten.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Brandstiftung nach § 306 StGB",
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
      description: "Wird § 306 StGB (Brandstiftung) als Tatbestand korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 306 StGB (Brandstiftung — Inbrandsetzung eines Gebäudes) als einschlägige Norm korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird das Gebäude als Tatobjekt korrekt subsumiert?",
      check_type: "llm_judge",
      judge_question:
        "Wird das Lagergebäude als fremdes Gebäude (§ 306 Nr. 1 StGB) korrekt subsumiert?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Vorsatz korrekt geprüft?",
      check_type: "llm_judge",
      judge_question:
        "Wird der Vorsatz (dolus directus — T wollte das Gebäude anzünden) korrekt dargestellt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Wird § 306a StGB (schwere Brandstiftung) abgegrenzt?",
      check_type: "llm_judge",
      judge_question:
        "Wird geprüft, ob § 306a StGB (schwere Brandstiftung — z.B. Gebäude mit Menschen) vorliegt? Hier: Keine Personen im Gebäude, daher § 306.",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["StGB"],
  expected_paragraphs: ["306", "306a"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: A,
  official_sources: [
    {
      url: "https://www.gesetze-im-internet.de/stgb/__306.html",
      description: "StGB § 306 — Brandstiftung",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nT zündet Lagergebäude des Arbeitgebers aus Rache. Gebäude brennt ab. Keine Verletzten.\n\n## Rechtsfrage\nIst T nach § 306 StGB strafbar?\n\n## Rechtliche Würdigung\n§ 306 Nr. 1 StGB: Inbrandsetzung eines fremden Gebäudes. Lagergebäude = fremdes Gebäude. Vorsatz: dolus directus. § 306a StGB: Nicht einschlägig (keine Personen im Gebäude).\n\n## Ergebnis\nT hat sich wegen Brandstiftung (§ 306 Nr. 1 StGB) strafbar gemacht.",
  reviewer: R,
  qrels: {
    relevant: [
      { slug: "law/de/stgb/§-306", grade: 3, reason: "Brandstiftung — Kernnorm" },
      { slug: "law/de/stgb/§-306a", grade: 2, reason: "Schwere Brandstiftung — Abgrenzung" },
    ],
    hard_negatives: [
      {
        slug: "law/de/stgb/§-308",
        grade: 1,
        reason: "Herbeiführen einer Brandgefahr — andere Norm",
      },
      { slug: "law/at/stgb/§-169", grade: 0, reason: "AT Brandstiftung — falsche Jurisdiktion" },
      {
        slug: "law/de/stgb/§-303",
        grade: 1,
        reason: "Sachbeschädigung — Brandstiftung ist Spezialnorm",
      },
    ],
  },
};

export const GOLD_HOLDOUT_005: Task = {
  id: "gold-holdout-005",
  title: "Klagsänderung — Übergang auf einen neuen Streitgegenstand",
  jurisdiction: "AT",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "holdout",
  prompt:
    "K klagt B auf Zahlung von 3.000 € aus einem Werkvertrag. Im Verfahren stellt sich heraus, dass der Anspruch tatsächlich auf ungerechtfertigte Bereicherung gestützt werden muss. K will den Klageanspruch ändern. B widerspricht. Prüfen Sie, ob die Klagsänderung zulässig ist.",
  case_facts:
    "Klage auf 3.000 € aus Werkvertrag. Anspruch tatsächlich auf Bereicherung gestützt. K will Klageanspruch ändern. B widerspricht.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Klagsänderung nach ZPO",
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
      description: "Alle referenzierten Gesetze sind gültig für AT",
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
      description: "Wird die Klagsänderung nach § 230 ZPO korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird § 230 ZPO (Klagsänderung — Übergang auf einen neuen Streitgegenstand) als maßgebliche Norm korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description:
        "Wird die Voraussetzung (Zustimmung des Beklagten oder sachliche Berechtigung) korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass die Klagsänderung der Zustimmung des Beklagten bedarf oder sachlich berechtigt sein muss?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Widerspruch des B korrekt gewürdigt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass B widerspricht und daher das Gericht über die sachliche Berechtigung der Klagsänderung entscheiden muss?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass die Klagsänderung zulässig sein kann, wenn das Gericht sie als sachlich berechtigt ansieht?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["ZPO"],
  expected_paragraphs: ["230"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "approved",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Dr. Andreas Krenn",
  reviewed_by: "Dr. Andreas Krenn",
  as_of_date: A,
  official_sources: [
    {
      url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002271",
      description: "ZPO § 230 — Klagsänderung",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK klagt auf 3.000 € aus Werkvertrag. Anspruch tatsächlich auf Bereicherung. K will Klagsänderung. B widerspricht.\n\n## Rechtsfrage\nIst die Klagsänderung zulässig?\n\n## Rechtliche Würdigung\n§ 230 ZPO: Klagsänderung bedarf Zustimmung des Beklagten oder sachlicher Berechtigung. B widerspricht → Gericht entscheidet über sachliche Berechtigung.\n\n## Ergebnis\nDie Klagsänderung ist zulässig, wenn das Gericht sie als sachlich berechtigt ansieht (§ 230 ZPO).",
  reviewer: R,
  qrels: {
    relevant: [{ slug: "law/at/zpo/§-230", grade: 3, reason: "Klagsänderung — Kernnorm" }],
    hard_negatives: [
      { slug: "law/de/zpo/§-263", grade: 0, reason: "DE Klageänderung — falsche Jurisdiktion" },
      { slug: "law/at/zpo/§-226", grade: 1, reason: "Sachvortrag — tangential" },
      { slug: "law/at/zpo/§-243", grade: 1, reason: "Klagebeantwortung — sekundär" },
    ],
  },
};

export const GOLD_HOLDOUT: Task[] = [
  GOLD_HOLDOUT_001,
  GOLD_HOLDOUT_002,
  GOLD_HOLDOUT_003,
  GOLD_HOLDOUT_004,
  GOLD_HOLDOUT_005,
];
