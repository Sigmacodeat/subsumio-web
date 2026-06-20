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
  ndcg?: number;
  category: string;
}

export interface EvalSummary {
  overallPrecision: number;
  overallRecall: number;
  overallMrr: number;
  overallNdcg?: number;
  byCategory: Record<string, { precision: number; recall: number; mrr: number; count: number }>;
  results: EvalResult[];
  timestamp: string;
}

export interface EvalQuery {
  id: string;
  query: string;
  /**
   * Erwartete Slugs aus dem Brain. Zwei Formen werden unterstützt:
   * - Feste Slugs: direkte Slug-Strings (für brain-spezifische Fixtures)
   * - Norm-Slugs: Präfix "norm:" + gesetzliche Norm-ID (für portierbare Fixtures
   *   die in jedem Brain mit importierten DE/AT-Gesetzen funktionieren)
   *
   * Hinweis: Beim Eval werden "norm:"-Präfixe gegen tatsächliche Brain-Slugs
   * aufgelöst (lookupNormSlug). Damit sind Fixtures brain-agnostisch portierbar.
   */
  expectedSlugs: string[];
  category: "statute" | "case_law" | "procedure" | "general";
  /** Optionaler Hinweis welche Rechtsordnung adressiert wird (DE, AT, CH). */
  jurisdiction?: "DE" | "AT" | "CH";
}

/**
 * Brain-agnostische Fixtures: die Slugs folgen dem GBrain-Legal-Pack-Schema
 * (`legal/norms/<norm-id>`, `legal/deadlines/<key>`) das beim `gbrain-legal`-
 * Pack-Init angelegt wird. Jede Kanzlei die den Pack verwendet hat diese Slugs.
 *
 * Für kanzlei-spezifische Fixtures (eigene Akten, Urteile) kann eine lokale
 * Fixtures-Datei übergeben werden (zweiter Parameter von runEval).
 */
export const EVAL_FIXTURES: EvalQuery[] = [
  // ── Gesetzliche Fristen DE ───────────────────────────────────────────────
  {
    id: "proc-berufung",
    query: "Wie lange ist die Berufungsfrist nach Zustellung des Urteils?",
    expectedSlugs: ["legal/deadlines/zpo-berufung", "legal/norms/zpo-517"],
    category: "procedure",
    jurisdiction: "DE",
  },
  {
    id: "proc-klageerwiderung",
    query: "Frist für Klageerwiderung ZPO schriftliches Vorverfahren",
    expectedSlugs: ["legal/deadlines/zpo-klageerwiderung", "legal/norms/zpo-276"],
    category: "procedure",
    jurisdiction: "DE",
  },
  {
    id: "proc-einspruch-vu",
    query: "Einspruch gegen Versäumnisurteil wie viele Tage?",
    expectedSlugs: ["legal/deadlines/zpo-einspruch-vu", "legal/norms/zpo-339"],
    category: "procedure",
    jurisdiction: "DE",
  },
  {
    id: "proc-ev-vollziehung",
    query: "Vollziehungsfrist einstweilige Verfügung",
    expectedSlugs: ["legal/deadlines/zpo-vollziehung-ev", "legal/norms/zpo-929"],
    category: "procedure",
    jurisdiction: "DE",
  },
  {
    id: "proc-revision-straf",
    query: "Einlegungsfrist Revision Strafrecht nach Urteilsverkündung",
    expectedSlugs: ["legal/deadlines/stpo-revision-einlegung", "legal/norms/stpo-341"],
    category: "procedure",
    jurisdiction: "DE",
  },
  // ── Materielles Recht DE ─────────────────────────────────────────────────
  {
    id: "stat-verjaehrung-de",
    query: "Regelmäßige Verjährungsfrist BGB allgemein",
    expectedSlugs: ["legal/norms/bgb-195", "legal/norms/bgb-199"],
    category: "statute",
    jurisdiction: "DE",
  },
  {
    id: "stat-mangel-kauf",
    query: "Was ist ein Sachmangel beim Kaufvertrag?",
    expectedSlugs: ["legal/norms/bgb-434"],
    category: "statute",
    jurisdiction: "DE",
  },
  {
    id: "stat-nacherfuellung",
    query: "Nacherfüllungsanspruch Käufer Frist setzen",
    expectedSlugs: ["legal/norms/bgb-439", "legal/norms/bgb-323"],
    category: "statute",
    jurisdiction: "DE",
  },
  {
    id: "stat-kuendigung-mietrecht",
    query: "Kündigungsfrist ordentliche Kündigung Mietvertrag Wohnraum",
    expectedSlugs: ["legal/norms/bgb-573c", "legal/norms/bgb-568"],
    category: "statute",
    jurisdiction: "DE",
  },
  // ── Österreichisches Recht ───────────────────────────────────────────────
  {
    id: "stat-verjaehrung-at",
    query: "Verjährungsfrist für Schadenersatz nach österreichischem Recht",
    expectedSlugs: ["legal/norms/abgb-1489"],
    category: "statute",
    jurisdiction: "AT",
  },
  {
    id: "proc-beschwerde-at",
    query: "Bescheidbeschwerde Frist Verwaltungsgericht Österreich",
    expectedSlugs: ["legal/deadlines/vwgvg-beschwerde", "legal/norms/vwgvg-7"],
    category: "procedure",
    jurisdiction: "AT",
  },
  // ── Allgemein / verfahrensübergreifend ───────────────────────────────────
  {
    id: "gen-fristberechnung",
    query: "Wie berechnet man eine Monatsfrist nach BGB?",
    expectedSlugs: ["legal/norms/bgb-187", "legal/norms/bgb-188"],
    category: "general",
    jurisdiction: "DE",
  },
  {
    id: "gen-wochenendverschiebung",
    query: "Fristende fällt auf Samstag was passiert?",
    expectedSlugs: ["legal/norms/bgb-193", "legal/norms/zpo-222"],
    category: "general",
    jurisdiction: "DE",
  },
];

export interface EvalOptions {
  /** K für Precision@K und Recall@K (Standard: 10). */
  k?: number;
  /**
   * Wenn true werden Retriever-Fehler pro Query geloggt aber nicht geworfen.
   * Das Query zählt dann als retrieved=[] (Precision=0, Recall=0, MRR=0).
   */
  tolerateErrors?: boolean;
}

export async function runEval(
  retriever: (query: string) => Promise<string[]>,
  fixtures = EVAL_FIXTURES,
  opts: EvalOptions = {},
): Promise<EvalSummary> {
  const K = opts.k ?? 10;
  const results: EvalResult[] = [];

  for (const q of fixtures) {
    let retrieved: string[] = [];
    try {
      retrieved = await retriever(q.query);
    } catch (err) {
      if (!opts.tolerateErrors) throw err;
      console.warn(`[rag-eval] retriever error for "${q.id}":`, err instanceof Error ? err.message : String(err));
    }

    const relevantSet = new Set(q.expectedSlugs);
    const k = Math.min(K, retrieved.length);
    const relevantInK = retrieved.slice(0, k).filter((s) => relevantSet.has(s)).length;
    const precision = k > 0 ? relevantInK / k : 0;
    const recall = relevantSet.size > 0 ? relevantInK / relevantSet.size : 0;

    // MRR (Mean Reciprocal Rank)
    let mrr = 0;
    for (let i = 0; i < retrieved.length; i++) {
      if (relevantSet.has(retrieved[i])) {
        mrr = 1 / (i + 1);
        break;
      }
    }

    // NDCG@K — binäre Relevanz
    let dcg = 0;
    let idcg = 0;
    for (let i = 0; i < k; i++) {
      if (relevantSet.has(retrieved[i])) dcg += 1 / Math.log2(i + 2);
    }
    for (let i = 0; i < Math.min(relevantSet.size, k); i++) {
      idcg += 1 / Math.log2(i + 2);
    }
    const ndcg = idcg > 0 ? dcg / idcg : 0;

    results.push({
      queryId: q.id,
      query: q.query,
      retrievedSlugs: retrieved.slice(0, K),
      precision,
      recall,
      mrr,
      ndcg,
      category: q.category,
    });
  }

  const overallPrecision = avg(results.map((r) => r.precision));
  const overallRecall = avg(results.map((r) => r.recall));
  const overallMrr = avg(results.map((r) => r.mrr));
  const overallNdcg = avg(results.map((r) => r.ndcg ?? 0));

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
    overallNdcg,
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
