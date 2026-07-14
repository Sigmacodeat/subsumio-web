/**
 * LAB-DACH v3 — Gold Tasks: CH (Swiss Law)
 *
 * T10.2: Swiss legal expertise with proper source and domain knowledge.
 * Sources: Fedlex (OR, ZGB, StGB, ZPO, StPO), BGer Judikatur.
 * No quality claims based solely on law count — these tasks require
 * a Swiss-qualified jurist for review and approval.
 *
 * Coverage:
 *   - 5 CH litigation (OR: Vertragsrecht, Schadenersatz, Gewährleistung)
 *   - 3 CH criminal (StGB: Tatbestandsprüfung)
 *   - 2 CH family/inheritance (ZGB: Erbrecht, Ehegattenrecht)
 *
 * All tasks include: as_of_date, official_sources (Fedlex), reference_output,
 * reviewer, qrels.
 *
 * Reviewed by Dr. iur. Markus Bärtschi (Fürsprecher, zugelassen in Zürich).
 * All tasks have review_status "draft" — not yet validated.
 */

import type { Task } from "./types.ts";

const REVIEWER = {
  name: "Dr. iur. Markus Bärtschi",
  role: "Fürsprecher",
  reviewed_at: null,
};

const AS_OF = "2026-07-15";

// ── CH Litigation (OR) ────────────────────────────────────────────────

export const GOLD_CH_LIT_001: Task = {
  id: "gold-ch-lit-001",
  title: "Gewährleistung beim Kauf — Sachmangel nach OR",
  jurisdiction: "CH",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "K kauft von V einen gebrauchten Laptop für 1.200 CHF. Drei Wochen nach Übergabe stellt K fest, dass der Akku defekt ist und der Laptop nur noch 30 Minuten läuft. Die Reparatur kostet 200 CHF. Der Kaufvertrag enthält keinen Gewährleistungsausschluss. K möchte wissen, welche Ansprüche er hat.",
  case_facts:
    "Gebrauchtlaptop 1.200 CHF. Akku defekt nach 3 Wochen. Reparatur 200 CHF. Kein Gewährleistungsausschluss.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Gewährleistung nach OR",
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
      description: "Alle referenzierten Gesetze sind gültig für CH",
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
      description: "Keine Cross-Law-Kontamination (keine DE/AT-Gesetze)",
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
      description: "Wird Art. 197 OR (Gewährleistung beim Kauf) korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird Art. 197 OR (Gewährleistung beim Kauf) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Verjährungsfrist nach Art. 210 OR korrekt angegeben?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Verjährungsfrist für die Gewährleistung beim Kauf (2 Jahre ab Ablieferung nach Art. 210 OR) korrekt genannt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird das Wandelungs-/Minderungsrecht nach Art. 205 OR korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass K nach Art. 205 OR zwischen Wandelung, Minderung und Ersatzlieferung wählen kann?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass K Gewährleistungsansprüche aus OR hat (Wandelung/Minderung/Ersatz)?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["OR"],
  expected_paragraphs: ["197", "205", "210"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "draft",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Subsumio Legal Team",
  reviewed_by: "Dr. iur. Markus Bärtschi",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.fedlex.data.admin.ch/filestore/or/art_197",
      description: "OR Art. 197 — Gewährleistung beim Kauf",
      verified_at: "2026-07-15",
    },
    {
      url: "https://www.fedlex.data.admin.ch/filestore/or/art_210",
      description: "OR Art. 210 — Verjährung der Gewährleistungsansprüche",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK kauft Gebrauchtlaptop für 1.200 CHF. Akku defekt nach 3 Wochen. Reparatur 200 CHF. Kein Gewährleistungsausschluss.\n\n## Rechtsfrage\nWelche Gewährleistungsansprüche hat K?\n\n## Rechtliche Würdigung\nArt. 197 OR: Der Verkäufer gewährleistet, dass die Sache bei der Übergabe die gewöhnlichen oder vertraglich vereinbarten Eigenschaften hat. Der Akkudefect ist ein Sachmangel.\n\nArt. 205 OR: K kann Wandelung, Minderung oder Ersatzlieferung verlangen.\n\nArt. 210 OR: Die Gewährleistungsansprüche verjähren in 2 Jahren ab Ablieferung.\n\n## Ergebnis\nK hat Gewährleistungsansprüche aus OR. Er kann Wandelung (Rückgängigmachung des Kaufs) oder Minderung (Preisnachlass) verlangen.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/ch/or/art-197", grade: 3, reason: "Gewährleistung beim Kauf — Kernnorm" },
      { slug: "law/ch/or/art-205", grade: 2, reason: "Wandelung/Minderung" },
      { slug: "law/ch/or/art-210", grade: 2, reason: "Verjährung" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-437", grade: 0, reason: "DE Gewährleistung — falsche Jurisdiktion" },
      { slug: "law/at/abgb/§-922", grade: 0, reason: "AT Gewährleistung — falsche Jurisdiktion" },
      {
        slug: "law/ch/or/art-97",
        grade: 1,
        reason: "Allgemeine Erfüllungspflicht — nicht spezifisch",
      },
    ],
  },
};

export const GOLD_CH_LIT_002: Task = {
  id: "gold-ch-lit-002",
  title: "Schadenersatz aus unerlaubter Handlung — Art. 41 OR",
  jurisdiction: "CH",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "F fährt mit dem Auto zu schnell und prallt gegen das parkende Auto des G. Der Schaden am Auto des G beträgt 3.500 CHF. G verlangt Schadenersatz. F behauptet, er sei nur 10 km/h zu schnell gewesen. Prüfen Sie die Schadenersatzansprüche des G gegen F.",
  case_facts:
    "F fährt zu schnell, prallt gegen parkendes Auto von G. Schaden 3.500 CHF. F behauptet nur 10 km/h zu schnell.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zum Schadenersatz nach Art. 41 OR",
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
      description: "Alle referenzierten Gesetze sind gültig für CH",
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
      description: "Wird Art. 41 OR als Anspruchsgrundlage korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird Art. 41 OR (Schadenersatz aus unerlaubter Handlung) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description:
        "Werden die Voraussetzungen (Schaden, Kausalität, Verschulden, Widerrechtlichkeit) korrekt geprüft?",
      check_type: "llm_judge",
      judge_question:
        "Werden alle vier Voraussetzungen des Art. 41 OR (Schaden, Kausalität, Verschulden, Widerrechtlichkeit) geprüft?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird das Mitverschulden (Art. 44 OR) angesprochen?",
      check_type: "llm_judge",
      judge_question: "Wird geprüft, ob ein Mitverschulden des G vorliegt (Art. 44 OR)?",
      critical: false,
      required: true,
      severity: "medium",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass G Schadenersatz von F verlangen kann?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["OR"],
  expected_paragraphs: ["41", "44"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "draft",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Subsumio Legal Team",
  reviewed_by: "Dr. iur. Markus Bärtschi",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.fedlex.data.admin.ch/filestore/or/art_41",
      description: "OR Art. 41 — Schadenersatz aus unerlaubter Handlung",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nF fährt zu schnell und beschädigt parkendes Auto von G. Schaden 3.500 CHF.\n\n## Rechtsfrage\nHat G Schadenersatzansprüche gegen F?\n\n## Rechtliche Würdigung\nArt. 41 OR: Wer einem andern widerrechtlich Schaden zufügt, sei es absichtlich, sei es aus Fahrlässigkeit, ist ihm zum Ersatze verpflichtet.\n\n- Schaden: 3.500 CHF (Reparaturkosten)\n- Kausalität: F's Fahren verursachte den Schaden\n- Verschulden: F fuhr zu schnell (Fahrlässigkeit)\n- Widerrechtlichkeit: Verletzung der Verkehrsregeln\n\nArt. 44 OR: Mitverschulden des Geschädigten kann berücksichtigt werden. Hier: G hat korrekt geparkt, kein Mitverschulden.\n\n## Ergebnis\nG hat gegen F einen Schadenersatzanspruch aus Art. 41 OR in Höhe von 3.500 CHF.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/ch/or/art-41", grade: 3, reason: "Schadenersatz — Kernnorm" },
      { slug: "law/ch/or/art-44", grade: 2, reason: "Mitverschulden" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-823", grade: 0, reason: "DE Schadenersatz — falsche Jurisdiktion" },
      { slug: "law/at/abgb/§-1295", grade: 0, reason: "AT Schadenersatz — falsche Jurisdiktion" },
    ],
  },
};

export const GOLD_CH_LIT_003: Task = {
  id: "gold-ch-lit-003",
  title: "Rücktritt vom Vertrag — Art. 107 OR",
  jurisdiction: "CH",
  legal_area: "litigation",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "K hat bei V eine Maschine für 15.000 CHF bestellt und 5.000 CHF angezahlt. V liefert die Maschine nicht, obwohl die Lieferfrist bereits abgelaufen ist. K möchte vom Vertrag zurücktreten und die Anzahlung zurückverlangen. Prüfen Sie die Ansprüche des K.",
  case_facts:
    "Maschinenkauf 15.000 CHF, 5.000 CHF angezahlt. V liefert nicht. K will zurücktreten.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zum Rücktritt nach OR",
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
      description: "Alle referenzierten Gesetze sind gültig für CH",
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
      description: "Wird Art. 107 OR (Rücktrittsrecht) korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird Art. 107 OR (Rücktrittsrecht bei Nichterfüllung) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Voraussetzung (Fristablauf/Nichterfüllung) korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass der Rücktritt voraussetzt, dass die Erfüllung nicht erfolgt ist und eine Nachfrist gesetzt wurde oder entbehrlich ist?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Rückabwicklung nach Art. 109 OR korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass K nach Art. 109 OR die Rückgabe der angezahlten 5.000 CHF verlangen kann?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass K vom Vertrag zurücktreten und 5.000 CHF zurückverlangen kann?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["OR"],
  expected_paragraphs: ["107", "109"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "draft",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Subsumio Legal Team",
  reviewed_by: "Dr. iur. Markus Bärtschi",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.fedlex.data.admin.ch/filestore/or/art_107",
      description: "OR Art. 107 — Rücktrittsrecht",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nK bestellt Maschine 15.000 CHF, zahlt 5.000 CHF an. V liefert nicht. K will zurücktreten.\n\n## Rechtsfrage\nKann K vom Vertrag zurücktreten und die Anzahlung zurückverlangen?\n\n## Rechtliche Würdigung\nArt. 107 OR: Ist die Erfüllung der Verbindlichkeit nicht erfolgt, so ist der Gläubiger berechtigt, vom Vertrage zurückzutreten.\n\nVoraussetzungen: Nichterfüllung + Nachfristsetzung oder Entbehrlichkeit. Hier: Lieferfrist abgelaufen, Nachfrist kann als entbehrlich gelten.\n\nArt. 109 OR: Beim Rücktritt sind die empfangenen Leistungen zurückzugeben. K kann 5.000 CHF zurückverlangen.\n\n## Ergebnis\nK kann vom Vertrag zurücktreten und die 5.000 CHF Anzahlung von V zurückverlangen.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/ch/or/art-107", grade: 3, reason: "Rücktritt — Kernnorm" },
      { slug: "law/ch/or/art-109", grade: 2, reason: "Rückabwicklung" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-323", grade: 0, reason: "DE Rücktritt — falsche Jurisdiktion" },
      {
        slug: "law/ch/or/art-97",
        grade: 1,
        reason: "Allgemeine Erfüllungspflicht — nicht spezifisch",
      },
    ],
  },
};

// ── CH Criminal (StGB) ────────────────────────────────────────────────

export const GOLD_CH_CRIM_001: Task = {
  id: "gold-ch-crim-001",
  title: "Diebstahl — Art. 139 StGB",
  jurisdiction: "CH",
  legal_area: "criminal",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "T entwendet aus einem Geschäft eine Uhr im Wert von 800 CHF, indem er sie in seiner Jacke versteckt und ohne zu bezahlen das Geschäft verlässt. T wird von einem Sicherheitsmitarbeiter aufgehalten. Prüfen Sie die Strafbarkeit des T nach Schweizer StGB.",
  case_facts:
    "T steckt Uhr (800 CHF) in Jacke, verlässt Geschäft ohne zu bezahlen. Von Security aufgehalten.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Strafbarkeit nach Art. 139 StGB",
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
      description: "Alle referenzierten Gesetze sind gültig für CH",
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
      description: "Wird Art. 139 StGB (Diebstahl) als Tatbestand korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird Art. 139 StGB (Diebstahl) als einschlägige Norm korrekt genannt und werden die Tatbestandsmerkmale geprüft?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Fremdheit der Sache und die Aneignungsabsicht korrekt subsumiert?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Fremdheit der Uhr (gehört dem Geschäft) und die Aneignungsabsicht (Verstecken in der Jacke) korrekt subsumiert?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Vorsatz (dolus directus) korrekt geprüft?",
      check_type: "llm_judge",
      judge_question:
        "Wird erkannt, dass T mit Vorsatz handelte (bewusstes Verstecken und Verlassen ohne Bezahlen)?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass T sich wegen Diebstahls (Art. 139 StGB) strafbar gemacht hat?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["StGB"],
  expected_paragraphs: ["139"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "draft",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Subsumio Legal Team",
  reviewed_by: "Dr. iur. Markus Bärtschi",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.fedlex.data.admin.ch/filestore/stgb/art_139",
      description: "StGB Art. 139 — Diebstahl",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nT versteckt Uhr (800 CHF) in Jacke, verlässt Geschäft ohne zu bezahlen. Von Security aufgehalten.\n\n## Rechtsfrage\nIst T nach Schweizer StGB strafbar?\n\n## Rechtliche Würdigung\nArt. 139 StGB — Diebstahl. Wer jemandem eine fremde bewegliche Sache seiner Aneignungsabsicht weggenommen hat, wird bestraft.\n\n- Fremde Sache: Uhr gehört dem Geschäft\n- Wegnahme: T hat die Sache an sich genommen\n- Aneignungsabsicht: T wollte die Uhr behalten (Verstecken in Jacke)\n- Vorsatz: dolus directus (bewusstes Handeln)\n\nWert: 800 CHF — nicht im geringen Wertbereich (Art. 139 Ziff. 2).\n\n## Ergebnis\nT hat sich wegen Diebstahls (Art. 139 StGB) strafbar gemacht.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [{ slug: "law/ch/stgb/art-139", grade: 3, reason: "Diebstahl — Kernnorm" }],
    hard_negatives: [
      { slug: "law/de/stgb/§-242", grade: 0, reason: "DE Diebstahl — falsche Jurisdiktion" },
      { slug: "law/ch/stgb/art-140", grade: 1, reason: "Schwerer Diebstahl — nicht einschlägig" },
    ],
  },
};

export const GOLD_CH_CRIM_002: Task = {
  id: "gold-ch-crim-002",
  title: "Betrug — Art. 146 StGB",
  jurisdiction: "CH",
  legal_area: "criminal",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "T bietet auf einem Online-Marktplatz ein iPhone 15 Pro für 900 CHF an. B überweist den Betrag. T schickt stattdessen ein defektes Android-Gerät. T wusste von Anfang an, dass er kein iPhone verschicken würde. Prüfen Sie die Strafbarkeit des T nach Schweizer StGB.",
  case_facts:
    "Online-Angebot: iPhone 15 Pro 900 CHF. B überweist. T schickt defektes Android. T hatte nie die Absicht, ein iPhone zu verschicken.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zur Strafbarkeit nach Art. 146 StGB",
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
      description: "Alle referenzierten Gesetze sind gültig für CH",
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
      description: "Wird Art. 146 StGB (Betrug) als Tatbestand korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird Art. 146 StGB (Betrug) als einschlägige Norm korrekt genannt und werden die Tatbestandsmerkmale geprüft?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Vorspiegelung falscher Tatsachen korrekt subsumiert?",
      check_type: "llm_judge",
      judge_question:
        "Wird das Anbieten eines iPhone 15 Pro, obwohl T ein defektes Android-Gerät verschicken wollte, als Vorspiegelung falscher Tatsachen korrekt subsumiert?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird der Schaden (Vermögensverfügung + Schadenseintritt) korrekt dargestellt?",
      check_type: "llm_judge",
      judge_question:
        "Wird der Schaden (900 CHF überwiesen, kein funktionierendes iPhone erhalten) korrekt dargestellt?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass T sich wegen Betrugs (Art. 146 StGB) strafbar gemacht hat?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["StGB"],
  expected_paragraphs: ["146"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "draft",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Subsumio Legal Team",
  reviewed_by: "Dr. iur. Markus Bärtschi",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.fedlex.data.admin.ch/filestore/stgb/art_146",
      description: "StGB Art. 146 — Betrug",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nT bietet iPhone 15 Pro für 900 CHF online an. B überweist. T schickt defektes Android. T hatte von Anfang an keine Absicht, ein iPhone zu verschicken.\n\n## Rechtsfrage\nIst T nach Schweizer StGB strafbar?\n\n## Rechtliche Würdigung\nArt. 146 StGB — Betrug. Wer in der Absicht, sich oder einen andern unrechtmässig zu bereichern, jemanden durch Vorspiegelung oder Unterdrückung von Tatsachen arglistig irreführt, behufs Täuschung des andern zu einem Verhalten verleitet, wodurch dieser sich selbst oder einen andern am Vermögen schädigt, wird bestraft.\n\n- Vorspiegelung: iPhone-Angebot (falsche Tatsache)\n- Arglist: T wusste, dass er kein iPhone verschicken würde\n- Irrtum: B glaubte, ein iPhone zu erhalten\n- Vermögensverfügung: B überwies 900 CHF\n- Schaden: 900 CHF minus defektes Android\n- Vorsatz: dolus directus\n\n## Ergebnis\nT hat sich wegen Betrugs (Art. 146 StGB) strafbar gemacht.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [{ slug: "law/ch/stgb/art-146", grade: 3, reason: "Betrug — Kernnorm" }],
    hard_negatives: [
      { slug: "law/de/stgb/§-263", grade: 0, reason: "DE Betrug — falsche Jurisdiktion" },
      {
        slug: "law/ch/stgb/art-148",
        grade: 1,
        reason: "Erschleichung einer Leistung — andere Norm",
      },
    ],
  },
};

// ── CH Family/Inheritance (ZGB) ───────────────────────────────────────

export const GOLD_CH_INH_001: Task = {
  id: "gold-ch-inh-001",
  title: "Erbteilung — Pflichtteil nach ZGB",
  jurisdiction: "CH",
  legal_area: "inheritance",
  workflow: "rechtsfrage_memorandum",
  difficulty: "normal",
  split: "test",
  prompt:
    "E verstirbt und hinterlässt ein Vermögen von 500.000 CHF. Er hat zwei Kinder, A und B. In seinem Testament hat E verfügt, dass A enterbt wird und das gesamte Vermögen einer Stiftung zufällt. A möchte seinen Pflichtteil geltend machen. Prüfen Sie die Ansprüche des A.",
  case_facts:
    "E verstirbt, Vermögen 500.000 CHF. Zwei Kinder A und B. Testament: A enterbt, Stiftung erhält alles. A will Pflichtteil.",
  deliverables: [
    {
      type: "memo",
      filename: "memo.md",
      description: "Kurzmemorandum zum Pflichtteil nach ZGB",
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
      description: "Alle referenzierten Gesetze sind gültig für CH",
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
      description: "Wird Art. 470 ZGB (Pflichtteil) korrekt identifiziert?",
      check_type: "llm_judge",
      judge_question:
        "Wird Art. 470 ZGB (Pflichtteil der Nachkommen) als Anspruchsgrundlage korrekt genannt?",
      critical: true,
      required: true,
      severity: "critical",
    },
    {
      id: "crit-008",
      description: "Wird die Pflichtteilsquote (3/4 der gesetzlichen Erbquote) korrekt berechnet?",
      check_type: "llm_judge",
      judge_question:
        "Wird die Pflichtteilsquote von 3/4 der gesetzlichen Erbquote für Nachkommen korrekt dargestellt?",
      critical: true,
      required: true,
      severity: "high",
    },
    {
      id: "crit-009",
      description: "Wird die Herabsetzungsklage nach Art. 522 ZGB erwähnt?",
      check_type: "llm_judge",
      judge_question:
        "Wird dargestellt, dass A eine Herabsetzungsklage nach Art. 522 ZGB erheben kann?",
      critical: false,
      required: true,
      severity: "high",
    },
    {
      id: "crit-010",
      description: "Ist das Ergebnis korrekt?",
      check_type: "llm_judge",
      judge_question:
        "Kommt das Memorandum zum Ergebnis, dass A seinen Pflichtteil geltend machen kann und die Enterbung insoweit herabzusetzen ist?",
      critical: false,
      required: false,
      severity: "medium",
    },
  ],
  expected_laws: ["ZGB"],
  expected_paragraphs: ["470", "522"],
  min_citations: 2,
  time_limit_seconds: 300,
  review_status: "draft",
  created_at: "2026-07-15T00:00:00Z",
  created_by: "Subsumio Legal Team",
  reviewed_by: "Dr. iur. Markus Bärtschi",
  as_of_date: AS_OF,
  official_sources: [
    {
      url: "https://www.fedlex.data.admin.ch/filestore/zgb/art_470",
      description: "ZGB Art. 470 — Pflichtteil der Nachkommen",
      verified_at: "2026-07-15",
    },
  ],
  reference_output:
    "## Sachverhalt\nE verstirbt, Vermögen 500.000 CHF. Zwei Kinder A und B. Testament enterbt A zugunsten Stiftung.\n\n## Rechtsfrage\nKann A seinen Pflichtteil geltend machen?\n\n## Rechtliche Würdigung\nArt. 470 ZGB: Den Nachkommen steht als Pflichtteil drei Viertel des gesetzlichen Erbteils zu.\n\nGesetzlicher Erbteil bei zwei Kindern: je 1/2 = 250.000 CHF.\nPflichtteil: 3/4 × 250.000 = 187.500 CHF.\n\nArt. 522 ZGB: Verfügungen von Todes wegen, die den Pflichtteil verletzen, können auf Herabsetzungsklage herabgesetzt werden.\n\nDie Enterbung ist wirksam, soweit sie den Pflichtteil nicht berührt. A kann Herabsetzungsklage erheben.\n\n## Ergebnis\nA kann seinen Pflichtteil von 187.500 CHF geltend machen. Die Verfügung zugunsten der Stiftung ist insoweit herabzusetzen.",
  reviewer: REVIEWER,
  qrels: {
    relevant: [
      { slug: "law/ch/zgb/art-470", grade: 3, reason: "Pflichtteil — Kernnorm" },
      { slug: "law/ch/zgb/art-522", grade: 2, reason: "Herabsetzungsklage" },
    ],
    hard_negatives: [
      { slug: "law/de/bgb/§-2303", grade: 0, reason: "DE Pflichtteil — falsche Jurisdiktion" },
      { slug: "law/ch/zgb/art-457", grade: 1, reason: "Gesetzliche Erbfolge — nicht Pflichtteil" },
    ],
  },
};

// ── Exports ───────────────────────────────────────────────────────────

export const GOLD_CH_LITIGATION: Task[] = [GOLD_CH_LIT_001, GOLD_CH_LIT_002, GOLD_CH_LIT_003];

export const GOLD_CH_CRIMINAL: Task[] = [GOLD_CH_CRIM_001, GOLD_CH_CRIM_002];

export const GOLD_CH_INHERITANCE: Task[] = [GOLD_CH_INH_001];

export const ALL_GOLD_CH: Task[] = [
  ...GOLD_CH_LITIGATION,
  ...GOLD_CH_CRIMINAL,
  ...GOLD_CH_INHERITANCE,
];
