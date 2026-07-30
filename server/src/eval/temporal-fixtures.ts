/**
 * Temporal Reasoning Test Fixtures
 *
 * Tests the system's ability to handle time-sensitive legal questions:
 * - Verjährungsfristen (statute of limitations)
 * - Fristberechnung (deadline calculation)
 * - Übergangsrecht (transitional law)
 * - Zeitliche Geltung (temporal validity of laws)
 *
 * Each fixture has a reference date and expected time-based answer.
 */

export interface TemporalFixture {
  id: string;
  jurisdiction: "DE" | "AT" | "CH" | "EU";
  legal_area: string;
  question: string;
  /** Reference date for the question (when the scenario takes place) */
  reference_date: string;
  /** Expected deadline or temporal answer */
  expected_deadline: string;
  /** Expected legal basis */
  expected_law: string;
  expected_section: string;
  expected_slug: string;
  /** Whether the answer depends on the reference date */
  date_sensitive: boolean;
  /** Keywords that should appear in a correct answer */
  expected_keywords: string[];
}

export const TEMPORAL_FIXTURES: TemporalFixture[] = [
  // ── DE: Verjährung ──────────────────────────────────────────────
  {
    id: "temp-de-001",
    jurisdiction: "DE",
    legal_area: "civil_law",
    question:
      "Ich habe am 15. März 2023 jemandem 5000 Euro geliehen. Bis wann kann ich das zurückfordern?",
    reference_date: "2023-03-15",
    expected_deadline: "2026-12-31",
    expected_law: "BGB",
    expected_section: "195",
    expected_slug: "legal/statutes/de/bgb/p-195",
    date_sensitive: true,
    expected_keywords: ["Verjährung", "drei Jahre", "Jahresende", "195"],
  },
  {
    id: "temp-de-002",
    jurisdiction: "DE",
    legal_area: "civil_law",
    question:
      "Am 1. Juli 2022 ist bei mir ein Schaden entstanden. Bis wann kann ich Schadensersatz verlangen?",
    reference_date: "2022-07-01",
    expected_deadline: "2025-12-31",
    expected_law: "BGB",
    expected_section: "195",
    expected_slug: "legal/statutes/de/bgb/p-195",
    date_sensitive: true,
    expected_keywords: ["Verjährung", "drei Jahre", "Jahresende"],
  },
  {
    id: "temp-de-003",
    jurisdiction: "DE",
    legal_area: "civil_law",
    question:
      "Ich habe 2018 einen Kaufvertrag abgeschlossen. Der Verkäufer hat mir etwas Falsches geliefert. Kann ich noch Gewährleistung verlangen?",
    reference_date: "2018-01-01",
    expected_deadline: "2022-01-01",
    expected_law: "BGB",
    expected_section: "438",
    expected_slug: "legal/statutes/de/bgb/p-438",
    date_sensitive: true,
    expected_keywords: ["Verjährung", "Gewährleistung", "zwei Jahre", "gebraucht"],
  },
  // ── DE: Steuer ──────────────────────────────────────────────────
  {
    id: "temp-de-004",
    jurisdiction: "DE",
    legal_area: "tax_law",
    question:
      "Ich habe meine Steuererklärung für 2023 noch nicht abgegeben. Bis wann muss ich das?",
    reference_date: "2024-01-01",
    expected_deadline: "2024-08-31",
    expected_law: "AO",
    expected_section: "149",
    expected_slug: "legal/statutes/de/ao/p-149",
    date_sensitive: true,
    expected_keywords: ["Abgabefrist", "Steuererklärung", "31. August"],
  },
  {
    id: "temp-de-005",
    jurisdiction: "DE",
    legal_area: "tax_law",
    question:
      "Das Finanzamt hat mir am 10. Mai 2024 einen Bescheid geschickt. Bis wann kann ich Einspruch einlegen?",
    reference_date: "2024-05-10",
    expected_deadline: "2024-08-18",
    expected_law: "AO",
    expected_section: "355",
    expected_slug: "legal/statutes/de/ao/p-355",
    date_sensitive: true,
    expected_keywords: ["Einspruch", "Frist", "einen Monat", "Zustellung"],
  },
  // ── DE: ZPO ─────────────────────────────────────────────────────
  {
    id: "temp-de-006",
    jurisdiction: "DE",
    legal_area: "procedural_law",
    question:
      "Das Urteil ist mir am 3. April 2024 zugestellt worden. Bis wann kann ich Berufung einlegen?",
    reference_date: "2024-04-03",
    expected_deadline: "2024-05-04",
    expected_law: "ZPO",
    expected_section: "517",
    expected_slug: "legal/statutes/de/zpo/p-517",
    date_sensitive: true,
    expected_keywords: ["Berufung", "Frist", "einen Monat", "Zustellung"],
  },
  // ── AT: Fristen ─────────────────────────────────────────────────
  {
    id: "temp-at-001",
    jurisdiction: "AT",
    legal_area: "procedural_law",
    question:
      "Das Urteil ist mir am 15. Jänner 2024 zugestellt worden. Bis wann kann ich Berufung einlegen?",
    reference_date: "2024-01-15",
    expected_deadline: "2024-02-12",
    expected_law: "ZPO",
    expected_section: "514",
    expected_slug: "legal/statutes/at/zpo/p-514",
    date_sensitive: true,
    expected_keywords: ["Berufung", "vier Wochen", "Zustellung"],
  },
  {
    id: "temp-at-002",
    jurisdiction: "AT",
    legal_area: "civil_law",
    question:
      "Ich habe am 1. Februar 2023 einen Werkvertrag abgeschlossen. Bis wann kann ich Gewährleistung verlangen?",
    reference_date: "2023-02-01",
    expected_deadline: "2026-02-01",
    expected_law: "ABGB",
    expected_section: "1166",
    expected_slug: "legal/statutes/at/abgb/p-1166",
    date_sensitive: true,
    expected_keywords: ["Gewährleistung", "drei Jahre", "Werkvertrag"],
  },
  // ── CH: Fristen ─────────────────────────────────────────────────
  {
    id: "temp-ch-001",
    jurisdiction: "CH",
    legal_area: "civil_law",
    question:
      "Ich habe am 1. März 2023 in der Schweiz eine Sache gekauft mit einem Mangel. Bis wann kann ich Gewährleistung verlangen?",
    reference_date: "2023-03-01",
    expected_deadline: "2025-03-01",
    expected_law: "OR",
    expected_section: "210",
    expected_slug: "legal/statutes/ch/or/art-210",
    date_sensitive: true,
    expected_keywords: ["Gewährleistung", "zwei Jahre", "Kaufvertrag"],
  },
  // ── EU: DSGVO ───────────────────────────────────────────────────
  {
    id: "temp-eu-001",
    jurisdiction: "EU",
    legal_area: "data_protection",
    question:
      "Bei uns ist am 1. Juni 2024 eine Datenpanne aufgetreten. Bis wann müssen wir der Aufsichtsbehörde melden?",
    reference_date: "2024-06-01",
    expected_deadline: "2024-06-04",
    expected_law: "DSGVO",
    expected_section: "33",
    expected_slug: "legal/statutes/eu/dsgvo/art-33",
    date_sensitive: true,
    expected_keywords: ["72 Stunden", "Meldepflicht", "Datenpanne"],
  },
  {
    id: "temp-eu-002",
    jurisdiction: "EU",
    legal_area: "data_protection",
    question:
      "Ein Kunde hat am 10. April 2024 um Auskunft über seine Daten gebeten. Bis wann müssen wir antworten?",
    reference_date: "2024-04-10",
    expected_deadline: "2024-05-10",
    expected_law: "DSGVO",
    expected_section: "12",
    expected_slug: "legal/statutes/eu/dsgvo/art-12",
    date_sensitive: true,
    expected_keywords: ["einen Monat", "Auskunft", "Frist"],
  },
];

export function getTemporalFixtures(jurisdiction?: string): TemporalFixture[] {
  if (!jurisdiction) return TEMPORAL_FIXTURES;
  return TEMPORAL_FIXTURES.filter(
    (f) => f.jurisdiction.toLowerCase() === jurisdiction.toLowerCase()
  );
}
