/**
 * analysis-deadlines.ts — Fristvorschläge aus einer Dokumentanalyse
 * (Upload, E-Mail-Anhang, Portal, Akten-Import → POST /api/legal/analyze).
 *
 * The model may only report dates that stand in the document. A Rechtsmittel-
 * frist's END never does ("Berufungsfrist vier Wochen"), so the model alone
 * can never propose it. Here the deterministic engine computes it from the
 * Zustelldatum (text or grounded key date) and the Fristart (text or document
 * type). The grounding check applies to the Zustelldatum; the computed end is
 * the engine's, not the model's.
 *
 * A past Zustelldatum is the normal case and never drops the deadline. A
 * deadline whose computed end has already passed is still proposed — marked,
 * and without an automatic Fristenbuch entry — so nobody overlooks it.
 * Everything is a suggestion ("unreviewed") until a lawyer confirms it.
 */

import { recognizeDeadlines, type Rechtsraum } from "@/lib/ai-deadline-detect";

export interface AnalysisDeadlineOpts {
  rechtsraum?: Rechtsraum;
  /** ISO day used as "today" (tests pin it). */
  heute?: string;
}

/** Writeback shape (`deadlines[]` of an analysis) plus the engine's facts. */
export type AnalysisDeadline = Record<string, unknown> & {
  label: string;
  date: string;
  urgency: string;
  source: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function engineDeadlineSuggestions(
  parsed: Record<string, unknown>,
  text: string,
  opts: AnalysisDeadlineOpts = {}
): AnalysisDeadline[] {
  const heute = opts.heute ?? todayIso();
  const keyDates = Array.isArray(parsed.key_dates)
    ? (parsed.key_dates as Array<{ date?: unknown; what?: unknown }>)
    : undefined;
  const documentType = typeof parsed.document_type === "string" ? parsed.document_type : undefined;
  const recognized = recognizeDeadlines(text, {
    rechtsraum: opts.rechtsraum,
    documentType,
    keyDates,
  });

  const out: AnalysisDeadline[] = [];
  for (const d of recognized) {
    const b = d.berechnung;
    // Only Fristen the engine computed or could compute with a Zustelldatum;
    // literal dates are handled by the key-date bridge.
    if (!b && !d.rueckfrage) continue;
    const verstrichen = Boolean(d.date && d.date < heute);
    const label = !d.date
      ? `${d.description} — Zustelldatum fehlt`
      : verstrichen
        ? `${d.description} — Fristende bereits verstrichen, bitte prüfen`
        : d.description;
    out.push({
      label,
      date: d.date ?? "",
      // "high" puts an unreviewed entry into the Fristenbuch right away — only
      // for open Notfristen with a computed date.
      urgency: b?.notfrist && d.date && !verstrichen ? "high" : "normal",
      source: d.sourceSnippet,
      confidence: d.confidence,
      engine_computed: Boolean(b),
      ...(b
        ? {
            rechtsraum: b.rechtsraum,
            zustellungsdatum: b.zustellungsdatum,
            ...(b.eingangsdatum ? { eingangsdatum: b.eingangsdatum } : {}),
            ...(b.fristArt ? { frist_art: b.fristArt } : {}),
            ...(b.rechtsgrundlage ? { rechtsgrundlage: b.rechtsgrundlage } : {}),
            vorfrist_date: b.vorfrist,
            notfrist: b.notfrist,
            ...(b.ferialsache ? { ferialsache: b.ferialsache } : {}),
            calculation_note: b.hinweise.join(" · "),
          }
        : {}),
      ...(d.rueckfrage ? { rueckfrage: d.rueckfrage } : {}),
    });
  }
  return out;
}

/**
 * The engine's analysis reports dates as `key_dates` [{date, what}], while the
 * case writeback expects `deadlines` [{label, date, urgency, source}]. Future
 * key dates (hearings, "bis 30.06.") are bridged as they are; past ones
 * (service dates, hearings held) are no deadlines by themselves.
 */
export function withDeadlinesFromKeyDates(
  parsed: Record<string, unknown>,
  heute: string = todayIso()
): Record<string, unknown> {
  if (Array.isArray(parsed.deadlines) && parsed.deadlines.length > 0) return parsed;
  if (!Array.isArray(parsed.key_dates)) return parsed;
  const deadlines = (parsed.key_dates as Array<Record<string, unknown>>)
    .filter(
      (k) => typeof k?.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(k.date) && k.date >= heute
    )
    .map((k) => {
      const what =
        typeof k.what === "string"
          ? k.what
          : typeof k.label === "string"
            ? k.label
            : "Erkannter Termin";
      const urgent =
        /frist|binnen|spätestens|einzubringen|einbringen|erheben|tagsatzung|verhandlung|termin/i.test(
          what
        );
      return {
        label: what,
        date: String(k.date).slice(0, 10),
        urgency: urgent ? "high" : "normal",
        source: what,
      };
    });
  return deadlines.length > 0 ? { ...parsed, deadlines } : parsed;
}

/**
 * All deadline suggestions of an analysis: engine-computed Fristen first, then
 * the literal dates. A literal date equal to a computed Fristende is dropped
 * (same deadline twice).
 */
export function withAnalysisDeadlines(
  parsed: Record<string, unknown>,
  text: string,
  opts: AnalysisDeadlineOpts = {}
): Record<string, unknown> {
  const base = withDeadlinesFromKeyDates(parsed, opts.heute);
  const engine = engineDeadlineSuggestions(parsed, text, opts);
  if (engine.length === 0) return base;
  const computed = new Set(engine.map((e) => e.date).filter(Boolean));
  const existing = Array.isArray(base.deadlines)
    ? (base.deadlines as Array<Record<string, unknown>>).filter(
        (e) => !computed.has(String(e.date ?? "").slice(0, 10))
      )
    : [];
  return { ...base, deadlines: [...engine, ...existing] };
}
