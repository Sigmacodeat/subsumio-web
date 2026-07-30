/**
 * Non-expert vs Expert Question Distinction
 *
 * Tests whether the system adapts its answer complexity and tone
 * based on the user's expertise level. Legal laypeople need plain
 * language explanations; legal professionals need precise citations
 * and doctrinal discussion.
 *
 * Fixtures are paired: same legal topic, two expertise levels.
 * Evaluation checks:
 * - Answer complexity matches expertise level
 * - Citations are present in both, but explained for laypeople
 * - Legal jargon is minimized for non-expert answers
 */

export interface ExpertiseFixture {
  id: string;
  jurisdiction: "DE" | "AT" | "CH" | "EU";
  legal_area: string;
  topic: string;
  /** Expertise level of the questioner */
  expertise: "non_expert" | "expert";
  /** The question as phrased by this expertise level */
  question: string;
  /** Expected laws/sections for both levels */
  expected_law: string;
  expected_section: string;
  expected_slug: string;
  /** For non-expert: plain language keywords expected */
  expected_plain_keywords?: string[];
  /** For expert: technical terms expected */
  expected_technical_keywords?: string[];
  /** For non-expert: legal jargon that should be EXPLAINED */
  jargon_to_explain?: string[];
  /** For expert: doctrinal concepts expected */
  expected_doctrinal_concepts?: string[];
}

export const EXPERTISE_FIXTURES: ExpertiseFixture[] = [
  // ── Topic: Gewährleistung Kaufvertrag ───────────────────────────
  {
    id: "exp-de-001-lay",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Gewährleistung beim Kaufvertrag",
    expertise: "non_expert",
    question:
      "Ich habe einen gebrauchten Wagen gekauft und die Bremsen sind defekt. Was kann ich tun?",
    expected_law: "BGB",
    expected_section: "437",
    expected_slug: "legal/statutes/de/bgb/p-437",
    expected_plain_keywords: ["Reparatur", "Geld zurück", "Mangel", "Verkäufer"],
    jargon_to_explain: ["Gewährleistung", "Nacherfüllung", "Rücktritt"],
  },
  {
    id: "exp-de-001-pro",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Gewährleistung beim Kaufvertrag",
    expertise: "expert",
    question:
      "Welche Gewährleistungsrechte stehen dem Käufer einer gebrauchten Sache gemäß § 437 BGB zu?",
    expected_law: "BGB",
    expected_section: "437",
    expected_slug: "legal/statutes/de/bgb/p-437",
    expected_technical_keywords: ["Nacherfüllung", "Rücktritt", "Minderung", "Schadensersatz"],
    expected_doctrinal_concepts: ["Gewährleistung", "Sachmangel", "Gefahrübergang"],
  },
  // ── Topic: Schadensersatz bei Körperverletzung ─────────────────
  {
    id: "exp-de-002-lay",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Schadensersatz bei Körperverletzung",
    expertise: "non_expert",
    question: "Jemand hat mich beim Sport absichtlich verletzt. Kann ich Schmerzensgeld verlangen?",
    expected_law: "BGB",
    expected_section: "823",
    expected_slug: "legal/statutes/de/bgb/p-823",
    expected_plain_keywords: ["Schmerzensgeld", "Schaden", "verletzt", "Schuld"],
    jargon_to_explain: ["Schadensersatz", "Verschuldensprinzip"],
  },
  {
    id: "exp-de-002-pro",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Schadensersatz bei Körperverletzung",
    expertise: "expert",
    question:
      "Welche Anspruchsgrundlagen bestehen für Schadensersatz bei vorsätzlicher Körperverletzung gem. § 823 Abs. 1 BGB?",
    expected_law: "BGB",
    expected_section: "823",
    expected_slug: "legal/statutes/de/bgb/p-823",
    expected_technical_keywords: [
      "Anspruchsgrundlage",
      "Rechtsgutverletzung",
      "Körperverletzung",
      "Verschulden",
    ],
    expected_doctrinal_concepts: ["Verschuldensprinzip", "Kausalität", "Adäquanz"],
  },
  // ── Topic: Diebstahl ────────────────────────────────────────────
  {
    id: "exp-de-003-lay",
    jurisdiction: "DE",
    legal_area: "criminal_law",
    topic: "Diebstahl",
    expertise: "non_expert",
    question: "Mein Nachbar hat mir das Fahrrad gestohlen. Was droht ihm an Strafe?",
    expected_law: "StGB",
    expected_section: "242",
    expected_slug: "legal/statutes/de/stgb/p-242",
    expected_plain_keywords: ["Diebstahl", "Strafe", "Gefängnis", "Geldstrafe"],
    jargon_to_explain: ["Freiheitsstrafe", "Geldstrafe", "Zueignungsabsicht"],
  },
  {
    id: "exp-de-003-pro",
    jurisdiction: "DE",
    legal_area: "criminal_law",
    topic: "Diebstahl",
    expertise: "expert",
    question:
      "Welche Tatbestandsmerkmale des § 242 StGB sind erfüllt bei der Wegnahme eines Fahrrads mit Zueignungsabsicht?",
    expected_law: "StGB",
    expected_section: "242",
    expected_slug: "legal/statutes/de/stgb/p-242",
    expected_technical_keywords: [
      "Tatbestandsmerkmale",
      "Zueignungsabsicht",
      "Wegnahme",
      "Gewahrsam",
    ],
    expected_doctrinal_concepts: ["Subjektiver Tatbestand", "Vorsatz", "rechtswidrig"],
  },
  // ── Topic: Mietrecht ────────────────────────────────────────────
  {
    id: "exp-de-004-lay",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Mieterhöhung",
    expertise: "non_expert",
    question: "Mein Vermieter will die Miete erhöhen. Darf er das einfach so?",
    expected_law: "BGB",
    expected_section: "558",
    expected_slug: "legal/statutes/de/bgb/p-558",
    expected_plain_keywords: ["Miete", "Vermieter", "erhöhen", "Zustimmung"],
    jargon_to_explain: ["ortsübliche Vergleichsmiete", "Mieterhöhung"],
  },
  {
    id: "exp-de-004-pro",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Mieterhöhung",
    expertise: "expert",
    question:
      "Welche Voraussetzungen muss eine Mieterhöhung bis zur ortsüblichen Vergleichsmiete gem. § 558 BGB erfüllen?",
    expected_law: "BGB",
    expected_section: "558",
    expected_slug: "legal/statutes/de/bgb/p-558",
    expected_technical_keywords: [
      "ortsübliche Vergleichsmiete",
      "Mieterhöhung",
      "Begründung",
      "Zustimmungsklage",
    ],
    expected_doctrinal_concepts: ["Formvorschriften", "Kappungsgrenze", "Vergleichsmiete"],
  },
  // ── Topic: Verjährung ───────────────────────────────────────────
  {
    id: "exp-de-005-lay",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Verjährung",
    expertise: "non_expert",
    question: "Ich habe vor drei Jahren jemandem Geld geliehen. Kann ich das noch zurückfordern?",
    expected_law: "BGB",
    expected_section: "195",
    expected_slug: "legal/statutes/de/bgb/p-195",
    expected_plain_keywords: ["Geld", "zurückfordern", "Frist", "drei Jahre"],
    jargon_to_explain: ["Verjährung", "Anspruch"],
  },
  {
    id: "exp-de-005-pro",
    jurisdiction: "DE",
    legal_area: "civil_law",
    topic: "Verjährung",
    expertise: "expert",
    question:
      "Wie berechnet sich die regelmäßige Verjährungsfrist des § 195 BGB und wann beginnt sie gem. § 199 BGB?",
    expected_law: "BGB",
    expected_section: "195",
    expected_slug: "legal/statutes/de/bgb/p-195",
    expected_technical_keywords: [
      "regelmäßige Verjährungsfrist",
      "drei Jahre",
      "Jahresende",
      "Kenntnis",
    ],
    expected_doctrinal_concepts: ["Verjährungsbeginn", "Hemmung", "Neubeginn"],
  },
  // ── Topic: DSGVO Auskunft ───────────────────────────────────────
  {
    id: "exp-eu-001-lay",
    jurisdiction: "EU",
    legal_area: "data_protection",
    topic: "DSGVO Auskunftsersuchen",
    expertise: "non_expert",
    question:
      "Ein Unternehmen hat meine Daten. Kann ich fragen, was die über mich gespeichert haben?",
    expected_law: "DSGVO",
    expected_section: "15",
    expected_slug: "legal/statutes/eu/dsgvo/art-15",
    expected_plain_keywords: ["Auskunft", "Daten", "gespeichert", "Recht"],
    jargon_to_explain: ["Auskunftsersuchen", "betroffene Person"],
  },
  {
    id: "exp-eu-001-pro",
    jurisdiction: "EU",
    legal_area: "data_protection",
    topic: "DSGVO Auskunftsersuchen",
    expertise: "expert",
    question:
      "Welche Auskunftsansprüche hat die betroffene Person gem. Art. 15 DSGVO und welche Frist gilt für die Antwort?",
    expected_law: "DSGVO",
    expected_section: "15",
    expected_slug: "legal/statutes/eu/dsgvo/art-15",
    expected_technical_keywords: ["Auskunftsanspruch", "betroffene Person", "einen Monat", "Kopie"],
    expected_doctrinal_concepts: ["Transparenz", "Verhältnismäßigkeit", "Datenminimierung"],
  },
];

/**
 * Get paired fixtures for a topic (both non-expert and expert).
 */
export function getPairedFixtures(
  topic?: string
): Array<{ topic: string; lay: ExpertiseFixture; pro: ExpertiseFixture }> {
  const topics = topic ? [topic] : [...new Set(EXPERTISE_FIXTURES.map((f) => f.topic))];

  return topics
    .map((t) => {
      const fixtures = EXPERTISE_FIXTURES.filter((f) => f.topic === t);
      const lay = fixtures.find((f) => f.expertise === "non_expert")!;
      const pro = fixtures.find((f) => f.expertise === "expert")!;
      return { topic: t, lay, pro };
    })
    .filter((pair) => pair.lay && pair.pro);
}

/**
 * Evaluate whether an answer matches the expected expertise level.
 * Non-expert answers should use plain language; expert answers should
 * use technical terms.
 */
export function evaluateExpertiseMatch(
  answer: string,
  fixture: ExpertiseFixture
): {
  jargon_score: number;
  keyword_score: number;
  overall_match: number;
  issues: string[];
} {
  const issues: string[] = [];
  const answerLower = answer.toLowerCase();

  if (fixture.expertise === "non_expert") {
    // Check that jargon is explained
    const unexplainedJargon: string[] = [];
    if (fixture.jargon_to_explain) {
      for (const term of fixture.jargon_to_explain) {
        if (answerLower.includes(term.toLowerCase())) {
          // Check if the term is followed by an explanation
          const termIdx = answerLower.indexOf(term.toLowerCase());
          const afterTerm = answer.slice(termIdx + term.length, termIdx + term.length + 200);
          // Simple heuristic: if there's an explanation pattern nearby
          const hasExplanation =
            /(?:das bedeutet|das heißt|also|nämlich|also:|d\.h\.|also dass)/i.test(afterTerm);
          if (!hasExplanation) {
            unexplainedJargon.push(term);
          }
        }
      }
    }
    if (unexplainedJargon.length > 0) {
      issues.push(`Unexplained jargon: ${unexplainedJargon.join(", ")}`);
    }

    // Check for plain language keywords
    let keywordHits = 0;
    if (fixture.expected_plain_keywords) {
      for (const kw of fixture.expected_plain_keywords) {
        if (answerLower.includes(kw.toLowerCase())) keywordHits++;
      }
    }
    const keywordScore = fixture.expected_plain_keywords
      ? keywordHits / fixture.expected_plain_keywords.length
      : 1.0;

    const jargonScore =
      unexplainedJargon.length === 0
        ? 1.0
        : 1.0 - unexplainedJargon.length / (fixture.jargon_to_explain?.length ?? 1);

    return {
      jargon_score: jargonScore,
      keyword_score: keywordScore,
      overall_match: (jargonScore + keywordScore) / 2,
      issues,
    };
  } else {
    // Expert: check for technical terms and doctrinal concepts
    let techHits = 0;
    if (fixture.expected_technical_keywords) {
      for (const kw of fixture.expected_technical_keywords) {
        if (answerLower.includes(kw.toLowerCase())) techHits++;
      }
    }
    const keywordScore = fixture.expected_technical_keywords
      ? techHits / fixture.expected_technical_keywords.length
      : 1.0;

    let doctrinalHits = 0;
    if (fixture.expected_doctrinal_concepts) {
      for (const concept of fixture.expected_doctrinal_concepts) {
        if (answerLower.includes(concept.toLowerCase())) doctrinalHits++;
      }
    }
    const doctrinalScore = fixture.expected_doctrinal_concepts
      ? doctrinalHits / fixture.expected_doctrinal_concepts.length
      : 1.0;

    if (keywordScore < 0.5) {
      issues.push("Missing technical terminology expected for expert-level answer");
    }
    if (doctrinalScore < 0.3) {
      issues.push("Missing doctrinal concepts expected for expert-level answer");
    }

    return {
      jargon_score: doctrinalScore,
      keyword_score: keywordScore,
      overall_match: (keywordScore + doctrinalScore) / 2,
      issues,
    };
  }
}
