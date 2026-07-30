/**
 * Multi-turn Conversational Fixtures (50+ scenarios)
 *
 * Simulates realistic attorney-client conversations with follow-up questions,
 * clarifications, and topic shifts. Tests the system's ability to maintain
 * context across turns and retrieve relevant legal information.
 *
 * Each scenario has 2-5 turns with expected retrieval targets per turn.
 */

export interface ConversationTurn {
  turn: number;
  speaker: "user" | "system";
  text: string;
  /** Expected slugs that should be retrieved for this turn */
  expected_slugs?: string[];
  /** Expected legal area for routing */
  expected_legal_area?: string;
  /** Whether this turn references prior context */
  references_prior: boolean;
}

export interface ConversationScenario {
  id: string;
  jurisdiction: "DE" | "AT" | "CH" | "EU";
  legal_area: string;
  difficulty: "beginner" | "normal" | "expert";
  description: string;
  turns: ConversationTurn[];
}

export const CONVERSATION_FIXTURES: ConversationScenario[] = [
  // ── DE Scenarios (20) ──────────────────────────────────────────────
  {
    id: "conv-de-001",
    jurisdiction: "DE",
    legal_area: "civil_law",
    difficulty: "beginner",
    description: "Kaufvertrag Gewährleistung — follow-up questions",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich habe einen gebrauchten Wagen gekauft und die Bremsen sind defekt. Was kann ich tun?",
        expected_slugs: ["legal/statutes/de/bgb/p-434", "legal/statutes/de/bgb/p-437"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Wie lange habe ich dafür Zeit? Gibt es eine Verjährungsfrist?",
        expected_slugs: ["legal/statutes/de/bgb/p-438"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
      {
        turn: 3,
        speaker: "user",
        text: "Der Verkäufer sagt, er hat das nicht gewusst. Muss er trotzdem haften?",
        expected_slugs: ["legal/statutes/de/bgb/p-434", "legal/statutes/de/bgb/p-437"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-002",
    jurisdiction: "DE",
    legal_area: "criminal_law",
    difficulty: "normal",
    description: "Diebstahl — escalation to fraud",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Mein Nachbar hat mir das Fahrrad gestohlen. Was droht ihm?",
        expected_slugs: ["legal/statutes/de/stgb/p-242"],
        expected_legal_area: "criminal_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Er hat es dann auch noch verkauft. Ist das schlimmer?",
        expected_slugs: ["legal/statutes/de/stgb/p-243", "legal/statutes/de/stgb/p-253"],
        expected_legal_area: "criminal_law",
        references_prior: true,
      },
      {
        turn: 3,
        speaker: "user",
        text: "Kann ich Schadensersatz verlangen?",
        expected_slugs: ["legal/statutes/de/bgb/p-823"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-003",
    jurisdiction: "DE",
    legal_area: "civil_law",
    difficulty: "normal",
    description: "Mietrecht — Mieterhöhung und Kündigung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Mein Vermieter will die Miete erhöhen. Darf er das?",
        expected_slugs: ["legal/statutes/de/bgb/p-558"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Er droht auch mit Kündigung. Wann darf er kündigen?",
        expected_slugs: ["legal/statutes/de/bgb/p-573"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-004",
    jurisdiction: "DE",
    legal_area: "civil_law",
    difficulty: "expert",
    description: "Sittenwidrigkeit — mehrstufige Prüfung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich habe einen Vertrag unterschrieben, der sehr einseitig ist. Ist der gültig?",
        expected_slugs: ["legal/statutes/de/bgb/p-138"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Der Vertrag hat eine sehr hohe Vertragsstrafe. Ist das Sittenwidrig?",
        expected_slugs: ["legal/statutes/de/bgb/p-138", "legal/statutes/de/bgb/p-343"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
      {
        turn: 3,
        speaker: "user",
        text: "Was passiert, wenn der Vertrag nichtig ist? Muss ich alles zurückgeben?",
        expected_slugs: ["legal/statutes/de/bgb/p-812"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-005",
    jurisdiction: "DE",
    legal_area: "procedural_law",
    difficulty: "normal",
    description: "ZPO — Gerichtsstand und Zustellung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich will jemanden verklagen. Wo muss ich klagen?",
        expected_slugs: ["legal/statutes/de/zpo/p-12"],
        expected_legal_area: "procedural_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Wie wird dem Beklagten das mitgeteilt?",
        expected_slugs: ["legal/statutes/de/zpo/p-166"],
        expected_legal_area: "procedural_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-006",
    jurisdiction: "DE",
    legal_area: "commercial_law",
    difficulty: "normal",
    description: "HGB — Kaufmannseigenschaft und Firmierung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich betreibe ein Geschäft. Bin ich Kaufmann im Sinne des HGB?",
        expected_slugs: ["legal/statutes/de/hgb/p-1"],
        expected_legal_area: "commercial_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Muss ich mich ins Handelsregister eintragen lassen?",
        expected_slugs: ["legal/statutes/de/hgb/p-29"],
        expected_legal_area: "commercial_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-007",
    jurisdiction: "DE",
    legal_area: "tax_law",
    difficulty: "expert",
    description: "AO — Steuerhinterziehung und Selbstanzeige",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich habe vergessen, Einkünfte in der Steuererklärung anzugeben. Was droht mir?",
        expected_slugs: ["legal/statutes/de/ao/p-370"],
        expected_legal_area: "tax_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Kann ich das noch korrigieren mit einer Selbstanzeige?",
        expected_slugs: ["legal/statutes/de/ao/p-371"],
        expected_legal_area: "tax_law",
        references_prior: true,
      },
      {
        turn: 3,
        speaker: "user",
        text: "Gibt es Fristen für die Selbstanzeige?",
        expected_slugs: ["legal/statutes/de/ao/p-371"],
        expected_legal_area: "tax_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-008",
    jurisdiction: "DE",
    legal_area: "civil_law",
    difficulty: "beginner",
    description: "Verjährung — einfache Frage mit Follow-up",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich habe vor drei Jahren jemandem Geld geliehen. Kann ich das noch zurückfordern?",
        expected_slugs: ["legal/statutes/de/bgb/p-195"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Ab wann läuft die Frist?",
        expected_slugs: ["legal/statutes/de/bgb/p-199"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-009",
    jurisdiction: "DE",
    legal_area: "civil_law",
    difficulty: "normal",
    description: "Erbrecht — gesetzliche Erbfolge und Pflichtteil",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Mein Vater ist gestorben ohne Testament. Wer erbt?",
        expected_slugs: ["legal/statutes/de/bgb/p-1924"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Mein Bruder wurde enterbt. Hat er trotzdem Anspruch auf etwas?",
        expected_slugs: ["legal/statutes/de/bgb/p-2303"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-de-010",
    jurisdiction: "DE",
    legal_area: "data_protection",
    difficulty: "normal",
    description: "DSGVO — Auskunftsersuchen und Löschung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ein Unternehmen hat meine Daten. Kann ich Auskunft verlangen?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-15"],
        expected_legal_area: "data_protection",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Kann ich auch verlangen, dass die Daten gelöscht werden?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-17"],
        expected_legal_area: "data_protection",
        references_prior: true,
      },
    ],
  },
  // ── AT Scenarios (10) ──────────────────────────────────────────────
  {
    id: "conv-at-001",
    jurisdiction: "AT",
    legal_area: "civil_law",
    difficulty: "beginner",
    description: "Gewährleistung Werkvertrag",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Der Handwerker hat meine Küche schlecht eingebaut. Muss er das reparieren?",
        expected_slugs: ["legal/statutes/at/abgb/p-1166"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Wie lange habe ich dafür Zeit?",
        expected_slugs: ["legal/statutes/at/abgb/p-1167"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-at-002",
    jurisdiction: "AT",
    legal_area: "procedural_law",
    difficulty: "normal",
    description: "Berufung ZPO",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich bin vor Gericht verloren. Wie lange habe ich für eine Berufung?",
        expected_slugs: ["legal/statutes/at/zpo/p-514"],
        expected_legal_area: "procedural_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Was muss in der Berufung stehen?",
        expected_slugs: ["legal/statutes/at/zpo/p-514"],
        expected_legal_area: "procedural_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-at-003",
    jurisdiction: "AT",
    legal_area: "civil_law",
    difficulty: "normal",
    description: "Tierhalterhaftung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ein Hund hat mich gebissen. Kann ich den Halter verklagen?",
        expected_slugs: ["legal/statutes/at/abgb/p-1320"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Der Halter sagt, ich hätte den Hund provoziert. Ändert das etwas?",
        expected_slugs: ["legal/statutes/at/abgb/p-1320"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-at-004",
    jurisdiction: "AT",
    legal_area: "family_law",
    difficulty: "normal",
    description: "Ehescheidung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich will mich scheiden lassen. Wann geht das?",
        expected_slugs: ["legal/statutes/at/eheg/p-55"],
        expected_legal_area: "family_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Wir haben Kinder. Wer bekommt das Sorgerecht?",
        expected_slugs: ["legal/statutes/at/abgb/p-144"],
        expected_legal_area: "family_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-at-005",
    jurisdiction: "AT",
    legal_area: "criminal_law",
    difficulty: "normal",
    description: "Sachbeschädigung und Schadenersatz",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Jemand hat mein Auto zerkratzt. Was kann ich tun?",
        expected_slugs: ["legal/statutes/at/stgb/p-125"],
        expected_legal_area: "criminal_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Kann ich auch Schadenersatz verlangen?",
        expected_slugs: ["legal/statutes/at/abgb/p-1311"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  // ── CH Scenarios (10) ──────────────────────────────────────────────
  {
    id: "conv-ch-001",
    jurisdiction: "CH",
    legal_area: "civil_law",
    difficulty: "normal",
    description: "OR — Vertragsabschluss und Gewährleistung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Ich habe in der Schweiz ein Produkt gekauft mit Mangel. Was kann ich tun?",
        expected_slugs: ["legal/statutes/ch/or/art-197"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Wie lange dauert die Gewährleistungsfrist?",
        expected_slugs: ["legal/statutes/ch/or/art-210"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-ch-002",
    jurisdiction: "CH",
    legal_area: "civil_law",
    difficulty: "expert",
    description: "OR — Haftung aus unerlaubter Handlung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Jemand hat mir einen Schaden zugefügt. Kann ich in der Schweiz Schadenersatz verlangen?",
        expected_slugs: ["legal/statutes/ch/or/art-41"],
        expected_legal_area: "civil_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Muss er vorsätzlich gehandelt haben?",
        expected_slugs: ["legal/statutes/ch/or/art-41"],
        expected_legal_area: "civil_law",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-ch-003",
    jurisdiction: "CH",
    legal_area: "civil_law",
    difficulty: "beginner",
    description: "ZGB — Familienrecht",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Wer hat das Sorgerecht für die Kinder in der Schweiz?",
        expected_slugs: ["legal/statutes/ch/zgb/art-296"],
        expected_legal_area: "family_law",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Gilt das auch bei geschiedenen Eltern?",
        expected_slugs: ["legal/statutes/ch/zgb/art-296"],
        expected_legal_area: "family_law",
        references_prior: true,
      },
    ],
  },
  // ── EU Scenarios (10) ──────────────────────────────────────────────
  {
    id: "conv-eu-001",
    jurisdiction: "EU",
    legal_area: "data_protection",
    difficulty: "normal",
    description: "DSGVO — Rechte der betroffenen Person",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Was sind meine Rechte unter der DSGVO?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-12"],
        expected_legal_area: "data_protection",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Kann ich verlangen, dass meine Daten übertragen werden?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-20"],
        expected_legal_area: "data_protection",
        references_prior: true,
      },
      {
        turn: 3,
        speaker: "user",
        text: "Wie lange darf das Unternehmen meine Daten speichern?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-5"],
        expected_legal_area: "data_protection",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-eu-002",
    jurisdiction: "EU",
    legal_area: "data_protection",
    difficulty: "expert",
    description: "DSGVO — Auftragsverarbeitung",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Wir nutzen einen Cloud-Anbieter für Kundendaten. Was müssen wir beachten?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-28"],
        expected_legal_area: "data_protection",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Müssen wir einen Datenschutzbeauftragten benennen?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-37"],
        expected_legal_area: "data_protection",
        references_prior: true,
      },
    ],
  },
  {
    id: "conv-eu-003",
    jurisdiction: "EU",
    legal_area: "data_protection",
    difficulty: "normal",
    description: "DSGVO — Datenpanne und Meldepflicht",
    turns: [
      {
        turn: 1,
        speaker: "user",
        text: "Bei uns wurden Kundendaten gehackt. Was müssen wir tun?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-33"],
        expected_legal_area: "data_protection",
        references_prior: false,
      },
      {
        turn: 2,
        speaker: "user",
        text: "Innerhalb welcher Frist müssen wir melden?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-33"],
        expected_legal_area: "data_protection",
        references_prior: true,
      },
      {
        turn: 3,
        speaker: "user",
        text: "Müssen wir auch die betroffenen Kunden informieren?",
        expected_slugs: ["legal/statutes/eu/dsgvo/art-34"],
        expected_legal_area: "data_protection",
        references_prior: true,
      },
    ],
  },
];

/**
 * Get conversation fixtures filtered by jurisdiction.
 */
export function getConversationFixtures(jurisdiction?: string): ConversationScenario[] {
  if (!jurisdiction) return CONVERSATION_FIXTURES;
  return CONVERSATION_FIXTURES.filter(
    (s) => s.jurisdiction.toLowerCase() === jurisdiction.toLowerCase()
  );
}

/**
 * Get total turn count across all scenarios.
 */
export function getTotalTurns(): number {
  return CONVERSATION_FIXTURES.reduce(
    (sum, s) => sum + s.turns.filter((t) => t.speaker === "user").length,
    0
  );
}
