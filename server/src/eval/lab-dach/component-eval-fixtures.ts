/**
 * LAB-DACH v3 — Component Evaluation Fixtures
 *
 * Fixtures for the 4-stage component evaluation:
 *   1. Query-Rewriting: Gold concepts (intent, laws, sections, terms)
 *   2. Retrieval: Gold slugs for hit@k / MRR / recall@token-budget
 *   3. Answer: Gold context (perfect § text injected, isolates generation quality)
 *   4. Citations: Gold citations (expected verified references)
 *
 * CI-Subset: 6 fixtures (3 DE + 3 AT) — fast, mock-friendly
 * Full-Set: 12 fixtures — for CLI runs with real engine + LLM
 */

import type { QueryIntent } from "../../core/think/query-planner.ts";

// ── Fixture Type ──────────────────────────────────────────────────────

export interface ComponentEvalFixture {
  id: string;
  jurisdiction: "DE" | "AT";
  /** Laienfrage — the original user query (colloquial, not legal-formal) */
  question: string;
  /** Gold concepts for Stage 1 (query-rewriting evaluation) */
  gold_concepts: {
    intent: QueryIntent;
    /** Expected law abbreviations (e.g. ["BGB", "ZPO"]) */
    expected_laws: string[];
    /** Expected § numbers as strings (e.g. ["437", "434", "438"]) */
    expected_sections: string[];
    /** Expected legal terms that should appear in rewritten query */
    expected_terms: string[];
  };
  /** Gold slugs for Stage 2 (retrieval evaluation) — slug patterns for matching */
  gold_slugs: string[];
  /** Gold context for Stage 3 (perfect context injected — isolates generation) */
  gold_context: string;
  /** Gold citations for Stage 4 (expected verified references) */
  gold_citations: { code: string; paragraph: string }[];
}

// ── CI-Subset (6 fixtures, 3 DE + 3 AT) ───────────────────────────────

export const CI_FIXTURES: ComponentEvalFixture[] = [
  // ── DE 1: Gewährleistung Kaufvertrag ──────────────────────────────
  {
    id: "comp-de-001",
    jurisdiction: "DE",
    question: "Ich habe einen gebrauchten Wagen gekauft und die Bremsen sind defekt. Was kann ich tun?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["BGB"],
      expected_sections: ["434", "437", "438"],
      expected_terms: ["Gewährleistung", "Sachmangel", "Nacherfüllung", "Kaufvertrag"],
    },
    gold_slugs: ["legal/statutes/de/bgb/p-434", "legal/statutes/de/bgb/p-437", "legal/statutes/de/bgb/p-438"],
    gold_context: `## § 434 BGB — Sachmangel
(1) Die Sache ist frei von Sachmängeln, wenn sie bei Gefahrübergang den vereinbarten Zustand hat.

(2) Ist eine Beschaffenheit nicht vereinbart, so ist die Sache frei von Sachmängeln, wenn sie sich für die nach dem Vertrag vorausgesetzte Verwendung eignet.

## § 437 BGB — Rechte des Käufers
Ist die Sache mangelhaft, kann der Käufer
1. nach § 439 Nacherfüllung verlangen,
2. nach den §§ 440, 323 und 326 Abs. 5 den Vertrag rückgängig machen oder nach § 441 den Kaufpreis mindern und
3. Schadensersatz nach den §§ 440, 280, 281, 283 und 311a verlangen.

## § 438 BGB — Verjährung
(1) Die in § 437 Nr. 1 und 3 bezeichneten Ansprüche verjähren
3. in zwei Jahren bei gebrauchten Sachen.`,
    gold_citations: [
      { code: "BGB", paragraph: "434" },
      { code: "BGB", paragraph: "437" },
      { code: "BGB", paragraph: "438" },
    ],
  },
  // ── DE 2: Körperverletzung / Schadensersatz ───────────────────────
  {
    id: "comp-de-002",
    jurisdiction: "DE",
    question: "Jemand hat mich beim Sport absichtlich verletzt. Kann ich Schmerzensgeld verlangen?",
    gold_concepts: {
      intent: "mixed",
      expected_laws: ["BGB", "StGB"],
      expected_sections: ["823", "254"],
      expected_terms: ["Schadensersatz", "unerlaubte Handlung", "Mitverschulden", "Körperverletzung"],
    },
    gold_slugs: ["legal/statutes/de/bgb/p-823", "legal/statutes/de/bgb/p-254"],
    gold_context: `## § 823 BGB — Schadensersatzpflicht
(1) Wer vorsätzlich oder fahrlässig das Leben, den Körper, die Gesundheit, die Freiheit, das Eigentum oder ein sonstiges Recht eines anderen widerrechtlich verletzt, ist dem anderen zum Ersatz des daraus entstehenden Schadens verpflichtet.

## § 254 BGB — Mitverschulden
Hat bei der Entstehung des Schadens ein Verschulden des Beschädigten mitgewirkt, so hängt die Verpflichtung zum Ersatz sowie der Umfang des zu leistenden Ersatzes von den Umständen, insbesondere davon ab, inwieweit der Schaden vorwiegend von dem einen oder dem anderen Teil verursacht worden ist.`,
    gold_citations: [
      { code: "BGB", paragraph: "823" },
      { code: "BGB", paragraph: "254" },
    ],
  },
  // ── DE 3: Diebstahl ───────────────────────────────────────────────
  {
    id: "comp-de-003",
    jurisdiction: "DE",
    question: "Mein Nachbar hat mir das Fahrrad gestohlen. Was droht ihm an Strafe?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["StGB"],
      expected_sections: ["242", "243"],
      expected_terms: ["Diebstahl", "Strafe", "Gewahrsam", "Zueignung"],
    },
    gold_slugs: ["legal/statutes/de/stgb/p-242", "legal/statutes/de/stgb/p-243"],
    gold_context: `## § 242 StGB — Diebstahl
(1) Wer eine fremde bewegliche Sache einem anderen in der Absicht wegnimmt, die Sache sich oder einem Dritten rechtswidrig zuzueignen, wird mit Freiheitsstrafe bis zu fünf Jahren oder mit Geldstrafe bestraft.

## § 243 StGB — Besonders schwerer Fall des Diebstahls
Unter den in § 243 genannten Voraussetzungen (z.B. Einbrechen, Diebstahl mit Waffe) wird ein besonders schwerer Fall des Diebstahls angenommen, der eine höhere Strafe zur Folge hat.`,
    gold_citations: [
      { code: "StGB", paragraph: "242" },
      { code: "StGB", paragraph: "243" },
    ],
  },
  // ── AT 1: Gewährleistung Werkvertrag ──────────────────────────────
  {
    id: "comp-at-001",
    jurisdiction: "AT",
    question: "Der Handwerker hat meine Küche schlecht eingebaut. Muss er das reparieren?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["ABGB"],
      expected_sections: ["1166", "1167", "932"],
      expected_terms: ["Gewährleistung", "Werkvertrag", "Verbesserung", "Mangel"],
    },
    gold_slugs: ["legal/statutes/at/abgb/p-1166", "legal/statutes/at/abgb/p-1167"],
    gold_context: `## § 1166 ABGB — Gewährleistung beim Werkvertrag
Hat der Unternehmer den Vertrag nicht gehörig erfüllt, so hat er dem Besteller den Schaden zu ersetzen, und kann dieser die Verbesserung oder die Herstellung eines neuen Werkes verlangen.

## § 1167 ABGB — Verbesserung
Der Besteller kann zunächst die Verbesserung oder den Austausch verlangen. Ist dies nicht möglich oder mit unverhältnismäßigem Aufwand verbunden, kann er Preisminderung oder Wandlung verlangen.

## § 932 ABGB — Schadenersatz
Wer einem anderen widerrechtlich Schaden zugefügt hat, hat ihn zu ersetzen.`,
    gold_citations: [
      { code: "ABGB", paragraph: "1166" },
      { code: "ABGB", paragraph: "1167" },
    ],
  },
  // ── AT 2: Berufung ZPO ────────────────────────────────────────────
  {
    id: "comp-at-002",
    jurisdiction: "AT",
    question: "Ich bin vor Gericht verloren. Wie lange habe ich Zeit für eine Berufung?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["ZPO"],
      expected_sections: ["514"],
      expected_terms: ["Berufung", "Frist", "Rechtsmittel", "Zustellung"],
    },
    gold_slugs: ["legal/statutes/at/zpo/p-514"],
    gold_context: `## § 514 ZPO — Berufungsfrist
Die Berufung kann binnen vier Wochen ab Zustellung des Urteils eingebracht werden. Die Frist beginnt mit der Zustellung der schriftlichen Ausfertigung des Urteils zu laufen.`,
    gold_citations: [
      { code: "ZPO", paragraph: "514" },
    ],
  },
  // ── AT 3: Betrug StGB ─────────────────────────────────────────────
  {
    id: "comp-at-003",
    jurisdiction: "AT",
    question: "Mir wurde etwas falsch verkauft. Der Verkäufer hat mich absichtlich getäuscht. Ist das Betrug?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["StGB"],
      expected_sections: ["146"],
      expected_terms: ["Betrug", "Täuschung", "Vorsatz", "Schadenszufügung"],
    },
    gold_slugs: ["legal/statutes/at/stgb/p-146"],
    gold_context: `## § 146 StGB — Betrug
Wer einen anderen mit dem Vorsatz, durch die Täuschung über Tatsachen sich oder einen Dritten unrechtmäßig zu bereichern, an seinem Vermögen schädigt, ist mit Freiheitsstrafe bis zu sechs Monaten oder mit Geldstrafe bis zu 360 Tagessätzen zu bestrafen.`,
    gold_citations: [
      { code: "StGB", paragraph: "146" },
    ],
  },
];

// ── Full Set (12 fixtures, for CLI runs) ──────────────────────────────

export const FULL_FIXTURES: ComponentEvalFixture[] = [
  ...CI_FIXTURES,
  // ── DE 4: Mietvertrag ─────────────────────────────────────────────
  {
    id: "comp-de-004",
    jurisdiction: "DE",
    question: "Mein Vermieter will die Miete erhöhen. Darf er das einfach so?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["BGB"],
      expected_sections: ["558", "535"],
      expected_terms: ["Mietvertrag", "Mieterhöhung", "Vermieter", "Miete"],
    },
    gold_slugs: ["legal/statutes/de/bgb/p-558", "legal/statutes/de/bgb/p-535"],
    gold_context: `## § 535 BGB — Inhalt und Hauptpflichten des Mietvertrags
(1) Der Vermieter ist verpflichtet, dem Mieter den Gebrauch der Mietsache während der Mietzeit zu gewähren.

## § 558 BGB — Mieterhöhung bis zur ortsüblichen Vergleichsmiete
(1) Der Vermieter kann die Zustimmung zu einer Erhöhung der Miete bis zur ortsüblichen Vergleichsmiete verlangen.`,
    gold_citations: [
      { code: "BGB", paragraph: "558" },
      { code: "BGB", paragraph: "535" },
    ],
  },
  // ── DE 5: Verjährung ──────────────────────────────────────────────
  {
    id: "comp-de-005",
    jurisdiction: "DE",
    question: "Ich habe vor drei Jahren jemandem Geld geliehen. Kann ich das noch zurückfordern?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["BGB"],
      expected_sections: ["195", "199"],
      expected_terms: ["Verjährung", "Frist", "Rückforderung", "Darlehen"],
    },
    gold_slugs: ["legal/statutes/de/bgb/p-195", "legal/statutes/de/bgb/p-199"],
    gold_context: `## § 195 BGB — Regelmäßige Verjährungsfrist
Die regelmäßige Verjährungsfrist beträgt drei Jahre.

## § 199 BGB — Beginn der regelmäßigen Verjährungsfrist
(1) Die regelmäßige Verjährungsfrist beginnt mit dem Schluss des Jahres, in dem der Anspruch entstanden ist.`,
    gold_citations: [
      { code: "BGB", paragraph: "195" },
      { code: "BGB", paragraph: "199" },
    ],
  },
  // ── DE 6: Erbrecht ────────────────────────────────────────────────
  {
    id: "comp-de-006",
    jurisdiction: "DE",
    question: "Mein Vater ist gestorben ohne Testament. Wer erbt?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["BGB"],
      expected_sections: ["1924", "1937"],
      expected_terms: ["Erbrecht", "gesetzliche Erbfolge", "Testament", "Erbe"],
    },
    gold_slugs: ["legal/statutes/de/bgb/p-1924"],
    gold_context: `## § 1924 BGB — Kinder als gesetzliche Erben
(1) Die Kinder des Erblassers werden bei der gesetzlichen Erbfolge zu gleichen Teilen Erben.`,
    gold_citations: [
      { code: "BGB", paragraph: "1924" },
    ],
  },
  // ── AT 4: Tierhalterhaftung ───────────────────────────────────────
  {
    id: "comp-at-004",
    jurisdiction: "AT",
    question: "Ein Hund hat mich gebissen. Kann ich den Halter verklagen?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["ABGB"],
      expected_sections: ["1320"],
      expected_terms: ["Tierhalter", "Tierhalterhaftung", "Schadenersatz", "Hund"],
    },
    gold_slugs: ["legal/statutes/at/abgb/p-1320"],
    gold_context: `## § 1320 ABGB — Tierhalterhaftung
Wird jemand durch ein Tier beschädigt, so ist derjenige, der das Tier hält, verpflichtet, den Schaden zu ersetzen, es wäre denn, dass der Beschädigte seinerseits den Schaden verursacht hat.`,
    gold_citations: [
      { code: "ABGB", paragraph: "1320" },
    ],
  },
  // ── AT 5: Ehescheidung ────────────────────────────────────────────
  {
    id: "comp-at-005",
    jurisdiction: "AT",
    question: "Ich will mich scheiden lassen. Wann geht das?",
    gold_concepts: {
      intent: "statute_lookup",
      expected_laws: ["EheG"],
      expected_sections: ["55", "49"],
      expected_terms: ["Scheidung", "Ehe", "Zerrüttung", "Scheidungsgrund"],
    },
    gold_slugs: ["legal/statutes/at/eheg/p-55"],
    gold_context: `## § 55 EheG — Verschuldensscheidung
Ein Ehegatte kann Scheidung begehren, wenn der andere Ehegatte durch sein Verhalten die Ehe schuldhaft so zerrüttet hat, dass die Wiederherstellung einer dem Wesen der Ehe entsprechenden Lebensgemeinschaft nicht erwartet werden kann.`,
    gold_citations: [
      { code: "EheG", paragraph: "55" },
    ],
  },
  // ── AT 6: Sachbeschädigung ────────────────────────────────────────
  {
    id: "comp-at-006",
    jurisdiction: "AT",
    question: "Jemand hat mein Auto zerkratzt. Was kann ich tun?",
    gold_concepts: {
      intent: "mixed",
      expected_laws: ["StGB", "ABGB"],
      expected_sections: ["125", "1311"],
      expected_terms: ["Sachbeschädigung", "Schadenersatz", "Vorsatz", "Beschädigung"],
    },
    gold_slugs: ["legal/statutes/at/stgb/p-125", "legal/statutes/at/abgb/p-1311"],
    gold_context: `## § 125 StGB — Sachbeschädigung
Wer fremde Sachen absichtlich beschädigt, zerstört oder unbrauchbar macht, ist mit Freiheitsstrafe bis zu sechs Monaten oder mit Geldstrafe bis zu 360 Tagessätzen zu bestrafen.

## § 1311 ABGB — Schadenersatz
Wer einem anderen widerrechtlich Schaden zugefügt hat, hat ihn zu ersetzen.`,
    gold_citations: [
      { code: "StGB", paragraph: "125" },
      { code: "ABGB", paragraph: "1311" },
    ],
  },
];

// ── Exports ───────────────────────────────────────────────────────────

export function getFixtures(subset: "ci" | "full"): ComponentEvalFixture[] {
  return subset === "ci" ? CI_FIXTURES : FULL_FIXTURES;
}
