/**
 * RAG-Eval Engine für SigmaBrain.
 * Benchmarket die Retrieval-Qualität des Brains anhand von
 * bekannten Frage-Antwort-Paaren (Fixtures).
 *
 * Metriken:
 *   - Precision@K: Anteil relevanter Dokumente in Top-K
 *   - Recall@K: Anteil gefundener relevanter Dokumente
 *   - MRR: Mean Reciprocal Rank (wie schnell kommt das erste richtige)
 *   - NDCG: Normalized Discounted Cumulative Gain
 */

export interface EvalQuery {
  id: string;
  query: string;
  expectedSlugs: string[]; // Slugs der Brain-Pages, die relevant sind
  category: "statute" | "case_law" | "procedure" | "general";
}

export interface EvalResult {
  queryId: string;
  query: string;
  retrievedSlugs: string[];
  precision: number;
  recall: number;
  mrr: number;
  category: string;
}

export interface EvalSummary {
  overallPrecision: number;
  overallRecall: number;
  overallMrr: number;
  byCategory: Record<string, { precision: number; recall: number; mrr: number; count: number }>;
  results: EvalResult[];
  timestamp: string;
}

/** Legale Test-Fixtures — bekannte Fragen mit erwarteten Antworten. */
export const EVAL_FIXTURES: EvalQuery[] = [
  {
    id: "stat-1",
    query: "Wie lange beträgt die Verjährungsfrist für Schadenersatz nach österreichischem Recht?",
    expectedSlugs: ["legal/statutes/abgb-1488", "legal/norms/verjaehrung-schadenersatz"],
    category: "statute",
  },
  {
    id: "stat-2",
    query: "Frist für Klageerwiderung nach ZPO",
    expectedSlugs: ["legal/deadlines/zpo-klageerwiderung", "legal/norms/zpo-167"],
    category: "statute",
  },
  {
    id: "case-1",
    query: "BGH Urteil zur Produkthaftung 2024",
    expectedSlugs: ["legal/judgements/bgh-produkthaftung-2024"],
    category: "case_law",
  },
  {
    id: "proc-1",
    query: "Wann läuft die Berufungsfrist ab Zustellung des Urteils?",
    expectedSlugs: ["legal/deadlines/zpo-berufung"],
    category: "procedure",
  },
  {
    id: "gen-1",
    query: "Was ist ein qualifizierter Mangel im Kaufrecht?",
    expectedSlugs: ["legal/norms/bgb-434", "legal/cases/mangel-beispiel"],
    category: "general",
  },
];

export async function runEval(
  retriever: (query: string) => Promise<string[]>,
  fixtures = EVAL_FIXTURES,
): Promise<EvalSummary> {
  const results: EvalResult[] = [];

  for (const q of fixtures) {
    const retrieved = await retriever(q.query);
    const relevantSet = new Set(q.expectedSlugs);

    // Precision@K (K = min(10, retrieved.length))
    const k = Math.min(10, retrieved.length);
    const relevantInK = retrieved.slice(0, k).filter((s) => relevantSet.has(s)).length;
    const precision = k > 0 ? relevantInK / k : 0;

    // Recall@K
    const recall = relevantSet.size > 0 ? relevantInK / relevantSet.size : 0;

    // MRR (Mean Reciprocal Rank)
    let mrr = 0;
    for (let i = 0; i < retrieved.length; i++) {
      if (relevantSet.has(retrieved[i])) {
        mrr = 1 / (i + 1);
        break;
      }
    }

    results.push({
      queryId: q.id,
      query: q.query,
      retrievedSlugs: retrieved.slice(0, 10),
      precision,
      recall,
      mrr,
      category: q.category,
    });
  }

  // Aggregate
  const overallPrecision = avg(results.map((r) => r.precision));
  const overallRecall = avg(results.map((r) => r.recall));
  const overallMrr = avg(results.map((r) => r.mrr));

  const byCategory: EvalSummary["byCategory"] = {};
  for (const cat of ["statute", "case_law", "procedure", "general"]) {
    const catResults = results.filter((r) => r.category === cat);
    if (catResults.length > 0) {
      byCategory[cat] = {
        precision: avg(catResults.map((r) => r.precision)),
        recall: avg(catResults.map((r) => r.recall)),
        mrr: avg(catResults.map((r) => r.mrr)),
        count: catResults.length,
      };
    }
  }

  return {
    overallPrecision,
    overallRecall,
    overallMrr,
    byCategory,
    results,
    timestamp: new Date().toISOString(),
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 1000) / 1000;
}

/** Bewertungsskala */
export function scoreGrade(precision: number, recall: number, mrr: number): { label: string; color: string } {
  const score = (precision + recall + mrr) / 3;
  if (score >= 0.8) return { label: "Exzellent", color: "emerald" };
  if (score >= 0.6) return { label: "Gut", color: "blue" };
  if (score >= 0.4) return { label: "Ausreichend", color: "amber" };
  return { label: "Verbesserungsbedürftig", color: "red" };
}
