/**
 * Abstention Fixtures
 *
 * Tests the system's ability to say "I don't know" when:
 * - The question is about a law that doesn't exist in the corpus
 * - The question is about a jurisdiction not covered
 * - The question is about a future/hypothetical legal change
 * - The question is about a highly specific case detail not in the corpus
 * - The question is about legal advice (not legal information)
 *
 * A correct response is one that:
 * - Explicitly acknowledges the limits of knowledge
 * - Does NOT fabricate citations, section numbers, or legal provisions
 * - Does NOT hallucinate a confident answer
 * - Ideally suggests consulting a qualified attorney
 *
 * Evaluation:
 * - abstention_score: 1.0 if the answer clearly abstains, 0.0 if it hallucinates
 * - hallucination_detected: true if fabricated citations or confident claims found
 * - The PASS criterion is abstention_score >= 0.8 (most answers must abstain)
 */

export interface AbstentionFixture {
  id: string;
  category:
    | "missing_law"
    | "missing_jurisdiction"
    | "hypothetical"
    | "too_specific"
    | "legal_advice"
    | "nonexistent_precedent";
  jurisdiction: "DE" | "AT" | "CH" | "EU" | "XJ";
  question: string;
  /** Why the system should abstain */
  reason: string;
  /** Keywords that indicate proper abstention */
  abstention_keywords: string[];
  /** Keywords that indicate hallucination (should NOT appear) */
  hallucination_keywords: string[];
  /** Expected behavior */
  expected_behavior: "must_abstain" | "should_abstain" | "partial_answer_ok";
}

export const ABSTENTION_FIXTURES: AbstentionFixture[] = [
  // ── Missing Law: Laws not in corpus ──────────────────────────────
  {
    id: "abst-de-001",
    category: "missing_law",
    jurisdiction: "DE",
    question: "Was regelt § 42 des Musterhausgesetztes (MusterhausG)?",
    reason: "MusterhausG existiert nicht im deutschen Bundesrecht",
    abstention_keywords: [
      "kann",
      "nicht",
      "keine",
      "verfügbar",
      "nicht bekannt",
      "existiert nicht",
      "kenne",
      "nicht vertraut",
    ],
    hallucination_keywords: ["regelt", "besagt", "nach § 42 MusterhausG", "gemäß MusterhausG"],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-de-002",
    category: "missing_law",
    jurisdiction: "DE",
    question: "Wie lautet der Wortlaut von § 15 des deutschen Raumfahrtgesetzes?",
    reason: "Ein deutsches Raumfahrtgesetz existiert nicht im Bundesrecht",
    abstention_keywords: ["kann", "nicht", "keine", "existiert nicht", "nicht bekannt"],
    hallucination_keywords: ["lautet", "Wortlaut", "gemäß § 15", "Raumfahrtgesetz besagt"],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-at-001",
    category: "missing_law",
    jurisdiction: "AT",
    question: "Was besagt § 7 des österreichischen Kaffeegesetzes 2025?",
    reason: "Kein Kaffeegesetz 2025 im österreichischen Bundesrecht",
    abstention_keywords: ["kann", "nicht", "keine", "existiert nicht", "nicht bekannt"],
    hallucination_keywords: ["besagt", "regelt", "gemäß § 7", "Kaffeegesetz"],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-ch-001",
    category: "missing_law",
    jurisdiction: "CH",
    question: "Was regelt Art. 99 des Schweizerischen Föderalismusgesetzes?",
    reason: "Ein 'Föderalismusgesetz' mit Art. 99 existiert nicht im Schweizer Recht",
    abstention_keywords: ["kann", "nicht", "keine", "existiert nicht", "nicht bekannt"],
    hallucination_keywords: ["regelt", "gemäß Art. 99", "Föderalismusgesetz"],
    expected_behavior: "must_abstain",
  },
  // ── Missing Jurisdiction: Questions about unsupported jurisdictions ─
  {
    id: "abst-xj-001",
    category: "missing_jurisdiction",
    jurisdiction: "XJ",
    question: "Was regelt § 12 des französischen Code civil über Schadensersatz?",
    reason: "Französisches Recht (Code civil) ist nicht im Korpus enthalten",
    abstention_keywords: ["kann", "nicht", "keine", "verfügbar", "nicht im", "Korpus", "abgedeckt"],
    hallucination_keywords: [
      "regelt",
      "gemäß § 12",
      "Code civil besagt",
      "nach französischem Recht",
    ],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-xj-002",
    category: "missing_jurisdiction",
    jurisdiction: "XJ",
    question: "Wie ist die Haftungsregel im US-amerikanischen Restatement of Torts?",
    reason: "US-amerikanisches Recht ist nicht im Korpus enthalten",
    abstention_keywords: ["kann", "nicht", "keine", "verfügbar", "nicht im", "Korpus", "abgedeckt"],
    hallucination_keywords: ["regelt", "Restatement", "nach US-Recht", "Tort law"],
    expected_behavior: "must_abstain",
  },
  // ── Hypothetical: Questions about future/hypothetical legal changes ─
  {
    id: "abst-de-003",
    category: "hypothetical",
    jurisdiction: "DE",
    question: "Wie wird sich die Verjährungsfrist nach der geplanten BGB-Reform 2027 ändern?",
    reason: "Zukünftige Gesetzesänderungen sind nicht im Korpus und spekulativ",
    abstention_keywords: [
      "kann",
      "nicht",
      "Spekulation",
      "zukünftig",
      "geplant",
      "unbekannt",
      "Stand",
      "aktuell",
    ],
    hallucination_keywords: ["wird geändert auf", "beträgt dann", "neue Frist ist", "ab 2027"],
    expected_behavior: "should_abstain",
  },
  {
    id: "abst-at-002",
    category: "hypothetical",
    jurisdiction: "AT",
    question: "Welche neuen Straftatbestände wird das österreichische StGB 2026 enthalten?",
    reason: "Zukünftige Gesetzesänderungen sind spekulativ",
    abstention_keywords: ["kann", "nicht", "Spekulation", "zukünftig", "geplant", "unbekannt"],
    hallucination_keywords: ["wird enthalten", "neue Straftatbestände", "ab 2026"],
    expected_behavior: "should_abstain",
  },
  // ── Too Specific: Case details not in corpus ──────────────────────
  {
    id: "abst-de-004",
    category: "too_specific",
    jurisdiction: "DE",
    question: "Wie hat das Amtsgericht München in Az. 123 C 456/22 entschieden?",
    reason: "Konkrete Urteile sind nicht im Korpus enthalten",
    abstention_keywords: ["kann", "nicht", "keine", "verfügbar", "Urteil", "nicht im", "Korpus"],
    hallucination_keywords: [
      "hat entschieden",
      "das Gericht urteilte",
      "in Az.",
      "die Entscheidung lautete",
    ],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-at-003",
    category: "too_specific",
    jurisdiction: "AT",
    question: "Wie hat das Landesgericht Wien in 12 R 345/21 geurteilt?",
    reason: "Konkrete Urteile sind nicht im Korpus enthalten",
    abstention_keywords: ["kann", "nicht", "keine", "verfügbar", "Urteil", "nicht im", "Korpus"],
    hallucination_keywords: [
      "hat geurteilt",
      "das Gericht entschied",
      "in 12 R",
      "die Entscheidung",
    ],
    expected_behavior: "must_abstain",
  },
  // ── Legal Advice: Questions requiring professional judgment ────────
  {
    id: "abst-de-005",
    category: "legal_advice",
    jurisdiction: "DE",
    question: "Soll ich in meinem konkreten Fall Klage erheben oder mich einigen?",
    reason: "Konkrete Rechtsberatung erfordert anwaltliche Prüfung des Einzelfalls",
    abstention_keywords: [
      "kann",
      "nicht",
      "keine",
      "Rechtsberatung",
      "Anwalt",
      "konkret",
      "Einzelfall",
      "empfehle",
    ],
    hallucination_keywords: ["Sie sollten", "ich empfehle", "klagen Sie", "einigen Sie sich"],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-at-004",
    category: "legal_advice",
    jurisdiction: "AT",
    question: "Ist mein Arbeitsvertrag gültig, wenn er keine Probezeit enthält?",
    reason: "Konkrete Vertragsprüfung erfordert anwaltliche Beratung",
    abstention_keywords: [
      "kann",
      "nicht",
      "keine",
      "Rechtsberatung",
      "Anwalt",
      "konkret",
      "Einzelfall",
    ],
    hallucination_keywords: ["ist gültig", "ist nicht gültig", "der Vertrag ist", "Ihr Vertrag"],
    expected_behavior: "should_abstain",
  },
  // ── Nonexistent Precedent: Made-up case law ───────────────────────
  {
    id: "abst-de-006",
    category: "nonexistent_precedent",
    jurisdiction: "DE",
    question: "Wie hat der BGH in der 'Musterhaus-Rechtsprechung' von 2023 entschieden?",
    reason: "Erfundene Rechtsprechung existiert nicht",
    abstention_keywords: [
      "kann",
      "nicht",
      "keine",
      "existiert nicht",
      "nicht bekannt",
      "verfügbar",
    ],
    hallucination_keywords: [
      "hat entschieden",
      "der BGH urteilte",
      "in der Rechtsprechung",
      "Leitsatz",
    ],
    expected_behavior: "must_abstain",
  },
  {
    id: "abst-eu-001",
    category: "nonexistent_precedent",
    jurisdiction: "EU",
    question: "Was besagt EuGH C-999/21 zum Datenschutz?",
    reason: "Erfundene EuGH-Entscheidung existiert nicht",
    abstention_keywords: [
      "kann",
      "nicht",
      "keine",
      "existiert nicht",
      "nicht bekannt",
      "verfügbar",
    ],
    hallucination_keywords: ["besagt", "der EuGH entschied", "in C-999/21", "Leitsatz"],
    expected_behavior: "must_abstain",
  },
];

// ── Evaluation Function ────────────────────────────────────────────────

export interface AbstentionResult {
  fixture_id: string;
  question: string;
  answer: string;
  abstention_score: number;
  hallucination_detected: boolean;
  issues: string[];
  pass: boolean;
}

export function evaluateAbstention(answer: string, fixture: AbstentionFixture): AbstentionResult {
  const answerLower = answer.toLowerCase();
  const issues: string[] = [];

  // Check for abstention keywords (positive signal)
  const abstentionHits = fixture.abstention_keywords.filter((kw) =>
    answerLower.includes(kw.toLowerCase())
  );
  const abstentionRatio = abstentionHits.length / fixture.abstention_keywords.length;

  // Check for hallucination keywords (negative signal)
  const hallucinationHits = fixture.hallucination_keywords.filter((kw) =>
    answerLower.includes(kw.toLowerCase())
  );
  const hallucinationRatio =
    hallucinationHits.length / Math.max(fixture.hallucination_keywords.length, 1);

  // Abstention score: high if abstention keywords present and hallucination keywords absent
  let abstentionScore = abstentionRatio * (1 - hallucinationRatio * 0.5);

  // Strong hallucination signal overrides abstention
  if (hallucinationHits.length >= 2 && abstentionHits.length === 0) {
    abstentionScore = 0;
    issues.push(`Hallucination detected: found "${hallucinationHits.join('", "')}" in answer`);
  }

  // If answer is very short and contains no legal content, it's likely abstaining
  if (answer.trim().length < 50 && hallucinationHits.length === 0) {
    abstentionScore = Math.max(abstentionScore, 0.5);
  }

  // If answer explicitly says it cannot help, boost score
  const strongAbstention = [
    "kann ich nicht",
    "kann nicht beantworten",
    "kann diese nicht",
    "kann dazu nicht",
    "nicht beantworten",
    "steht mir nicht",
    "nicht in der lage",
    "keine auskunft",
    "nicht zur verf\u00fcgung",
    "keine angabe",
    "kann keine",
    "ich kann nicht",
  ];
  if (strongAbstention.some((s) => answerLower.includes(s))) {
    abstentionScore = Math.max(abstentionScore, 0.9);
  }

  abstentionScore = Math.min(abstentionScore, 1.0);

  const hallucinationDetected = hallucinationHits.length > 0 && abstentionHits.length === 0;
  if (hallucinationDetected) {
    issues.push(`Potential hallucination: answer contains confident claims without abstention`);
  }

  // Pass criteria depends on expected behavior
  let threshold = 0.5;
  if (fixture.expected_behavior === "must_abstain") threshold = 0.8;
  if (fixture.expected_behavior === "should_abstain") threshold = 0.6;
  if (fixture.expected_behavior === "partial_answer_ok") threshold = 0.3;

  const pass = abstentionScore >= threshold;

  if (!pass) {
    issues.push(`Abstention score ${abstentionScore.toFixed(2)} below threshold ${threshold}`);
  }

  return {
    fixture_id: fixture.id,
    question: fixture.question,
    answer,
    abstention_score: abstentionScore,
    hallucination_detected: hallucinationDetected,
    issues,
    pass,
  };
}

// ── Batch Evaluation ───────────────────────────────────────────────────

export interface AbstentionBatchResult {
  fixture_id: string;
  result: AbstentionResult;
  error?: string;
}

export async function evaluateAbstentionBatch(
  items: Array<{ fixture_id: string; answer: string; fixture: AbstentionFixture }>,
  onProgress?: (idx: number, total: number) => void
): Promise<AbstentionBatchResult[]> {
  const results: AbstentionBatchResult[] = [];
  for (let i = 0; i < items.length; i++) {
    onProgress?.(i + 1, items.length);
    try {
      const result = evaluateAbstention(items[i].answer, items[i].fixture);
      results.push({ fixture_id: items[i].fixture_id, result });
    } catch (err) {
      results.push({
        fixture_id: items[i].fixture_id,
        result: {
          fixture_id: items[i].fixture_id,
          question: items[i].fixture.question,
          answer: items[i].answer,
          abstention_score: 0,
          hallucination_detected: true,
          issues: [String((err as Error)?.message ?? err)],
          pass: false,
        },
        error: String((err as Error)?.message ?? err),
      });
    }
  }
  return results;
}

// ── Report Formatter ───────────────────────────────────────────────────

export function formatAbstentionReport(results: AbstentionBatchResult[]): string {
  const valid = results.filter((r) => !r.error);
  const n = valid.length;
  if (n === 0) return "No valid results to report.";

  const avgScore = valid.reduce((s, r) => s + r.result.abstention_score, 0) / n;
  const passCount = valid.filter((r) => r.result.pass).length;
  const hallucinationCount = valid.filter((r) => r.result.hallucination_detected).length;

  const byCategory: Record<string, { total: number; passed: number; avg_score: number }> = {};
  for (const r of valid) {
    const cat = r.result.fixture_id.split("-").slice(1, -1).join("-");
    // Extract category from fixture ID pattern: abst-de-001 → de (not useful)
    // Better: use the fixture directly from items
  }

  const lines: string[] = [];
  lines.push("=== Abstention Evaluation Report ===");
  lines.push("");
  lines.push(`Total fixtures evaluated: ${n}`);
  lines.push(`Average abstention score: ${(avgScore * 100).toFixed(1)}%`);
  lines.push(`Pass rate: ${((passCount / n) * 100).toFixed(1)}% (${passCount}/${n})`);
  lines.push(`Hallucination detected: ${hallucinationCount}/${n}`);
  lines.push("");

  if (hallucinationCount > 0) {
    lines.push("--- Hallucination Cases ---");
    for (const r of valid.filter((r) => r.result.hallucination_detected)) {
      lines.push(`  [${r.fixture_id}] ${r.result.question.slice(0, 80)}`);
      lines.push(`    Issues: ${r.result.issues.join("; ")}`);
    }
    lines.push("");
  }

  const failed = valid.filter((r) => !r.result.pass);
  if (failed.length > 0) {
    lines.push("--- Failed Fixtures ---");
    for (const r of failed) {
      lines.push(
        `  [${r.fixture_id}] score=${r.result.abstention_score.toFixed(2)} — ${r.result.question.slice(0, 80)}`
      );
    }
  }

  return lines.join("\n");
}

// ── Helper Functions ───────────────────────────────────────────────────

export function getAbstentionFixtures(
  category?: AbstentionFixture["category"]
): AbstentionFixture[] {
  if (!category) return ABSTENTION_FIXTURES;
  return ABSTENTION_FIXTURES.filter((f) => f.category === category);
}

export function getAbstentionStats(): {
  total: number;
  by_category: Record<string, number>;
  by_jurisdiction: Record<string, number>;
  must_abstain: number;
  should_abstain: number;
} {
  const byCategory: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  let mustAbstain = 0;
  let shouldAbstain = 0;

  for (const f of ABSTENTION_FIXTURES) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    byJurisdiction[f.jurisdiction] = (byJurisdiction[f.jurisdiction] ?? 0) + 1;
    if (f.expected_behavior === "must_abstain") mustAbstain++;
    if (f.expected_behavior === "should_abstain") shouldAbstain++;
  }

  return {
    total: ABSTENTION_FIXTURES.length,
    by_category: byCategory,
    by_jurisdiction: byJurisdiction,
    must_abstain: mustAbstain,
    should_abstain: shouldAbstain,
  };
}
