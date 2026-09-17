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
    /** Short stat-card label — plain language, no metric jargon. */
    label:
      "der Fälle lag die richtige Textstelle unter den ersten acht Treffern — offen dokumentierter Test mit 500 Fragen. Gemessen wird das Auffinden, nicht die Qualität der Antwort.",
    /** Technical phrase — only for /docs and /benchmark-methodology. */
    full: "99,8 % Recall@8 auf LongMemEval (500 Fragen)",
    /** Canonical plain-language sentence for lawyer-facing prose. Keep the
     *  numbers in sync with `value` / `sampleSize` above. */
    plain:
      "In einem offen dokumentierten Test mit 500 Fragen lag die richtige Textstelle in 99,8 % der Fälle unter den ersten acht Treffern. Gemessen wird das Auffinden, nicht die Qualität der Antwort.",
  },
} as const;
