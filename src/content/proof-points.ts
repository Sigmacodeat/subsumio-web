// Canonical proof points — the single source for benchmark numbers used in
// marketing claims. When a number changes, change it HERE; every stat card,
// counter and structured claim updates together. Prose sentences that mention
// the same numbers must stay consistent with these values.

export const PROOF = {
  /** Headline retrieval benchmark: hybrid search + knowledge graph on
   *  LongMemEval (500 questions), measured vs plain vector RAG. */
  recall8: {
    /** Display value — de-AT decimal comma. */
    value: "99,8 %",
    /** Numeric value for AnimatedCounter (to={...}). */
    numeric: 99.8,
    decimals: 1,
    metric: "Recall@8",
    benchmark: "LongMemEval",
    sampleSize: 500,
    /** Short stat-card label. */
    label: "Recall@8 auf LongMemEval (500 Fragen)",
    /** Canonical full phrase for prose embeddings. */
    full: "99,8 % Recall@8 auf LongMemEval (500 Fragen)",
  },
  /** Recall@5 is the optimal-K result on the same benchmark. */
  recall5: {
    value: "100 %",
    numeric: 100,
    decimals: 0,
    metric: "Recall@5",
    label: "Recall@5 — optimales K bei LongMemEval",
  },
} as const;
