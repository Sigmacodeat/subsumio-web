/**
 * Answer-quality eval fixtures: a tiny, self-contained legal corpus and the
 * questions the think pipeline must answer correctly on it.
 *
 * The statute texts are SHORTENED eval excerpts (marked as such) — they test
 * whether the pipeline cites what it retrieved, stays in the matter's
 * jurisdiction and abstains when the corpus has nothing, not legal accuracy
 * of the excerpts themselves.
 */

export interface FixturePage {
  /** Source the page lives in — mirrors production (AT statutes in the
   *  granular law-at-normen source, DE in law-de, matters in the firm source). */
  source: string;
  slug: string;
  type: string;
  title: string;
  text: string;
}

export const FIXTURE_PAGES: FixturePage[] = [
  {
    source: "law-at-normen",
    slug: "legal/statute/at/abgb-1489",
    type: "legal_statute",
    title: "§ 1489 ABGB — Verjährung von Schadenersatzansprüchen",
    text:
      "§ 1489 ABGB (Eval-Auszug). Jede Entschädigungsklage ist in drei Jahren von der Zeit an verjährt, " +
      "zu welcher der Schade und die Person des Beschädigers dem Beschädigten bekannt wurde. Ist dem " +
      "Beschädigten der Schade oder die Person des Beschädigers nicht bekannt geworden oder ist der Schade " +
      "aus einem Verbrechen entstanden, so erlischt das Klagerecht erst nach dreißig Jahren.",
  },
  {
    source: "law-at-normen",
    slug: "legal/statute/at/abgb-933",
    type: "legal_statute",
    title: "§ 933 ABGB — Frist der Gewährleistung",
    text:
      "§ 933 ABGB (Eval-Auszug). Die Frist für die Gewährleistung beträgt bei beweglichen Sachen zwei " +
      "Jahre, bei unbeweglichen Sachen drei Jahre. Die Frist beginnt mit der Übergabe der Sache.",
  },
  {
    source: "law-at-normen",
    slug: "legal/statute/at/zpo-464",
    type: "legal_statute",
    title: "§ 464 ZPO — Berufungsfrist",
    text:
      "§ 464 ZPO (Eval-Auszug). Abs 1: Die Berufungsfrist beträgt vier Wochen. Abs 2: Die Frist beginnt " +
      "mit der Zustellung der schriftlichen Urteilsausfertigung an die Partei.",
  },
  {
    source: "law-de",
    slug: "legal/statute/de/bgb-195",
    type: "legal_statute",
    title: "§ 195 BGB — Regelmäßige Verjährungsfrist (Deutschland)",
    text: "§ 195 BGB (Eval-Auszug). Die regelmäßige Verjährungsfrist beträgt drei Jahre.",
  },
  {
    source: "law-de",
    slug: "legal/statute/de/bgb-438",
    type: "legal_statute",
    title: "§ 438 BGB — Verjährung der Mängelansprüche (Deutschland)",
    text: "§ 438 BGB (Eval-Auszug). Die Mängelansprüche verjähren im Übrigen in zwei Jahren ab Ablieferung der Sache.",
  },
  {
    source: "kanzlei-eval",
    slug: "akten/eval-muster-gegen-beispiel/urteil-zustellung",
    type: "legal_document",
    title: "Zustellnachweis Urteil — Muster gegen Beispiel",
    text:
      "Zustellnachweis. Das Urteil des Landesgerichts in der Rechtssache Muster gegen Beispiel wurde " +
      "der beklagten Partei am 3. März 2026 zugestellt. Die beklagte Partei beabsichtigt, Berufung zu erheben.",
  },
];

/** Firm source of the eval tenant and the sources a web request for an AT
 *  matter may read (tenant + AT statutes + EU), as /api/think federates them. */
export const EVAL_TENANT = "kanzlei-eval";

export interface EvalCase {
  id: string;
  question: string;
  /** Every pattern must match the answer. */
  mustMatch: RegExp[];
  /** No pattern may match the answer (jurisdiction contamination, hallucination). */
  mustNotMatch: RegExp[];
  /** Counted separately: a violation here fails the gate regardless of the pass rate. */
  contamination?: RegExp[];
}

const DE_NORM = /§\s*(195|438)\s+BGB/i;

export const EVAL_CASES: EvalCase[] = [
  {
    id: "verjaehrung-schadenersatz",
    question: "Innerhalb welcher Frist verjähren Schadenersatzansprüche in Österreich?",
    mustMatch: [/1489\s*ABGB/i, /drei\s+Jahre|3\s+Jahre/i],
    mustNotMatch: [],
    contamination: [DE_NORM],
  },
  {
    id: "verjaehrung-beginn",
    question: "Ab wann läuft die Verjährungsfrist für Schadenersatz nach österreichischem Recht?",
    mustMatch: [/1489\s*ABGB/i, /(bekannt|Kenntnis)/i],
    mustNotMatch: [],
    contamination: [DE_NORM],
  },
  {
    id: "berufungsfrist",
    question: "Wie lange ist die Berufungsfrist nach der österreichischen ZPO?",
    mustMatch: [/464\s*(Abs\.?\s*1\s*)?ZPO/i, /vier\s+Wochen|4\s+Wochen/i],
    mustNotMatch: [],
    contamination: [DE_NORM],
  },
  {
    id: "berufungsfrist-akte",
    question:
      "Das Urteil in der Sache Muster gegen Beispiel wurde am 3. März 2026 zugestellt. Bis wann muss die Berufung eingebracht werden?",
    mustMatch: [/31\.\s*(März|3\.)\s*2026|2026-03-31/i, /464/],
    mustNotMatch: [],
    contamination: [DE_NORM],
  },
  {
    id: "gewaehrleistung-beweglich",
    question: "Welche Gewährleistungsfrist gilt in Österreich für bewegliche Sachen?",
    mustMatch: [/933\s*ABGB/i, /zwei\s+Jahre|2\s+Jahre/i],
    mustNotMatch: [],
    contamination: [DE_NORM],
  },
  {
    id: "abstention-ausserhalb-korpus",
    question: "Wie hoch ist die Grunderwerbsteuer in Tirol für ein Betriebsgebäude?",
    // Nothing in the corpus covers this: the answer must say so and cite no norm.
    mustMatch: [
      /(nicht|keine)[^.]{0,80}(Quell|Korpus|Unterlag|Wissensbasis|belegen|Informationen|enthalten|gefunden)/i,
    ],
    mustNotMatch: [/§\s*\d+\s+\p{Lu}/u],
  },
];
