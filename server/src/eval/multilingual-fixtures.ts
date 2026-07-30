/**
 * Multilingual CH Fixtures (French & Italian)
 *
 * Switzerland has three official languages: German, French, and Italian.
 * The legal corpus contains texts in all three languages. These fixtures
 * test the system's ability to handle French and Italian legal questions
 * and retrieve the correct Swiss federal law articles.
 *
 * Key laws tested:
 * - OR (Obligationenrecht / Code des obligations / Codice delle obbligazioni)
 * - ZGB (Zivilgesetzbuch / Code civil / Codice civile)
 * - StGB (Strafgesetzbuch / Code pénal / Codice penale)
 * - StPO (Strafprozessordnung / Code de procédure pénale / Codice di procedura penale)
 */

export interface MultilingualFixture {
  id: string;
  jurisdiction: "CH";
  language: "fr" | "it";
  legal_area: string;
  question: string;
  expected_law: string;
  expected_section: string;
  expected_slug: string;
  expected_keywords: string[];
  /** German equivalent for cross-lingual validation */
  german_equivalent: string;
}

export const MULTILINGUAL_CH_FIXTURES: MultilingualFixture[] = [
  // ── French (OR) ─────────────────────────────────────────────────
  {
    id: "multi-ch-fr-001",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "civil_law",
    question: "Quelle est la responsabilité en cas de dommage causé par une chose?",
    expected_law: "OR",
    expected_section: "54",
    expected_slug: "legal/statutes/ch-fr/or/art-54",
    expected_keywords: ["responsabilité", "dommage", "chose", "détenteur"],
    german_equivalent: "Wer ist verantwortlich für Schäden durch eine Sache?",
  },
  {
    id: "multi-ch-fr-002",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "civil_law",
    question: "Quelles sont les règles sur le contrat de vente?",
    expected_law: "OR",
    expected_section: "184",
    expected_slug: "legal/statutes/ch-fr/or/art-184",
    expected_keywords: ["vente", "contrat", "acheteur", "vendeur"],
    german_equivalent: "Was regelt der Kaufvertrag?",
  },
  {
    id: "multi-ch-fr-003",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "civil_law",
    question: "Quel est le délai de garantie pour un contrat de vente?",
    expected_law: "OR",
    expected_section: "210",
    expected_slug: "legal/statutes/ch-fr/or/art-210",
    expected_keywords: ["garantie", "délai", "deux ans", "vente"],
    german_equivalent: "Wie lange ist die Gewährleistungsfrist beim Kauf?",
  },
  {
    id: "multi-ch-fr-004",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "civil_law",
    question: "Que dit l'article 41 CO sur la responsabilité délictuelle?",
    expected_law: "OR",
    expected_section: "41",
    expected_slug: "legal/statutes/ch-fr/or/art-41",
    expected_keywords: ["responsabilité", "fait illicite", "dommage", "faute"],
    german_equivalent: "Was regelt Art. 41 OR über die deliktische Haftung?",
  },
  {
    id: "multi-ch-fr-005",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "civil_law",
    question: "Comment se forme un contrat selon le droit suisse?",
    expected_law: "OR",
    expected_section: "1",
    expected_slug: "legal/statutes/ch-fr/or/art-1",
    expected_keywords: ["contrat", "accord", "volonté", "formation"],
    german_equivalent: "Wie kommt ein Vertrag zustande?",
  },
  // ── French (ZGB) ────────────────────────────────────────────────
  {
    id: "multi-ch-fr-006",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "civil_law",
    question: "Quelle est la capacité civile selon le Code civil suisse?",
    expected_law: "ZGB",
    expected_section: "13",
    expected_slug: "legal/statutes/ch-fr/zgb/art-13",
    expected_keywords: ["capacité", "capable", "actes", "droits"],
    german_equivalent: "Was ist die zivilrechtliche Handlungsfähigkeit?",
  },
  {
    id: "multi-ch-fr-007",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "family_law",
    question: "Quel est l'âge de la majorité en Suisse?",
    expected_law: "ZGB",
    expected_section: "14",
    expected_slug: "legal/statutes/ch-fr/zgb/art-14",
    expected_keywords: ["majeur", "dix-huit", "ans", "majorité"],
    german_equivalent: "Wie alt muss man für die Volljährigkeit sein?",
  },
  // ── French (StGB) ───────────────────────────────────────────────
  {
    id: "multi-ch-fr-008",
    jurisdiction: "CH",
    language: "fr",
    legal_area: "criminal_law",
    question: "Quelle est la peine pour vol selon le Code pénal suisse?",
    expected_law: "StGB",
    expected_section: "139",
    expected_slug: "legal/statutes/ch-fr/stgb/art-139",
    expected_keywords: ["vol", "peine", "emprisonnement", "amende"],
    german_equivalent: "Wie wird Diebstahl im Strafgesetzbuch bestraft?",
  },
  // ── Italian (OR) ────────────────────────────────────────────────
  {
    id: "multi-ch-it-001",
    jurisdiction: "CH",
    language: "it",
    legal_area: "civil_law",
    question: "Qual è la responsabilità per danni causati da una cosa?",
    expected_law: "OR",
    expected_section: "54",
    expected_slug: "legal/statutes/ch-it/or/art-54",
    expected_keywords: ["responsabilità", "danno", "cosa", "detentore"],
    german_equivalent: "Wer ist verantwortlich für Schäden durch eine Sache?",
  },
  {
    id: "multi-ch-it-002",
    jurisdiction: "CH",
    language: "it",
    legal_area: "civil_law",
    question: "Quali sono le regole sul contratto di vendita?",
    expected_law: "OR",
    expected_section: "184",
    expected_slug: "legal/statutes/ch-it/or/art-184",
    expected_keywords: ["vendita", "contratto", "compratore", "venditore"],
    german_equivalent: "Was regelt der Kaufvertrag?",
  },
  {
    id: "multi-ch-it-003",
    jurisdiction: "CH",
    language: "it",
    legal_area: "civil_law",
    question: "Qual è il termine di garanzia per un contratto di vendita?",
    expected_law: "OR",
    expected_section: "210",
    expected_slug: "legal/statutes/ch-it/or/art-210",
    expected_keywords: ["garanzia", "termine", "due anni", "vendita"],
    german_equivalent: "Wie lange ist die Gewährleistungsfrist beim Kauf?",
  },
  {
    id: "multi-ch-it-004",
    jurisdiction: "CH",
    language: "it",
    legal_area: "civil_law",
    question: "Cosa dice l'articolo 41 CO sulla responsabilità extracontrattuale?",
    expected_law: "OR",
    expected_section: "41",
    expected_slug: "legal/statutes/ch-it/or/art-41",
    expected_keywords: ["responsabilità", "illecito", "danno", "colpa"],
    german_equivalent: "Was regelt Art. 41 OR über die deliktische Haftung?",
  },
  {
    id: "multi-ch-it-005",
    jurisdiction: "CH",
    language: "it",
    legal_area: "civil_law",
    question: "Come si forma un contratto secondo il diritto svizzero?",
    expected_law: "OR",
    expected_section: "1",
    expected_slug: "legal/statutes/ch-it/or/art-1",
    expected_keywords: ["contratto", "accordo", "volontà", "formazione"],
    german_equivalent: "Wie kommt ein Vertrag zustande?",
  },
  // ── Italian (ZGB) ───────────────────────────────────────────────
  {
    id: "multi-ch-it-006",
    jurisdiction: "CH",
    language: "it",
    legal_area: "civil_law",
    question: "Qual è la capacità civile secondo il Codice civile svizzero?",
    expected_law: "ZGB",
    expected_section: "13",
    expected_slug: "legal/statutes/ch-it/zgb/art-13",
    expected_keywords: ["capacità", "capace", "atti", "diritti"],
    german_equivalent: "Was ist die zivilrechtliche Handlungsfähigkeit?",
  },
  {
    id: "multi-ch-it-007",
    jurisdiction: "CH",
    language: "it",
    legal_area: "family_law",
    question: "Qual è l'età della maggiore età in Svizzera?",
    expected_law: "ZGB",
    expected_section: "14",
    expected_slug: "legal/statutes/ch-it/zgb/art-14",
    expected_keywords: ["maggiorenne", "diciotto", "anni", "maggiore età"],
    german_equivalent: "Wie alt muss man für die Volljährigkeit sein?",
  },
  // ── Italian (StGB) ──────────────────────────────────────────────
  {
    id: "multi-ch-it-008",
    jurisdiction: "CH",
    language: "it",
    legal_area: "criminal_law",
    question: "Qual è la pena per furto secondo il Codice penale svizzero?",
    expected_law: "StGB",
    expected_section: "139",
    expected_slug: "legal/statutes/ch-it/stgb/art-139",
    expected_keywords: ["furto", "pena", "prigione", "ammenda"],
    german_equivalent: "Wie wird Diebstahl im Strafgesetzbuch bestraft?",
  },
];

// ── Helper Functions ──────────────────────────────────────────────────

export function getMultilingualFixtures(language?: "fr" | "it"): MultilingualFixture[] {
  if (!language) return MULTILINGUAL_CH_FIXTURES;
  return MULTILINGUAL_CH_FIXTURES.filter((f) => f.language === language);
}

export function getCrossLingualPairs(): Array<{
  fr: MultilingualFixture;
  it: MultilingualFixture;
  german_equivalent: string;
}> {
  const pairs: Array<{
    fr: MultilingualFixture;
    it: MultilingualFixture;
    german_equivalent: string;
  }> = [];

  for (const fr of MULTILINGUAL_CH_FIXTURES.filter((f) => f.language === "fr")) {
    const it = MULTILINGUAL_CH_FIXTURES.find(
      (f) =>
        f.language === "it" &&
        f.expected_law === fr.expected_law &&
        f.expected_section === fr.expected_section
    );
    if (it) {
      pairs.push({ fr, it, german_equivalent: fr.german_equivalent });
    }
  }

  return pairs;
}
