// Canonical proof points — the single source for measurable claims used in
// marketing. Only figures with a checked-in measurement receipt (docs/eval,
// product configuration: embedding model, search mode, date, commit) may
// appear here. There is currently no such receipt for a retrieval figure, so
// the website states the method instead of a number. Guarded by
// src/content/claims-guard.test.ts.

export const PROOF = {
  search: {
    /** Canonical plain-language sentence about search quality — no figure. */
    plain:
      "Die Suche kombiniert Sinnsuche, Stichwortsuche und die erkannten Zusammenhänge zwischen Personen, Akten und Dokumenten. Eine Trefferquote veröffentlichen wir erst, wenn ein nachprüfbares Messprotokoll mit der Produktkonfiguration vorliegt. Ob eine Antwort trägt, prüfen Sie anhand der Fundstelle.",
  },
} as const;
