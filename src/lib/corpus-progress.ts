/**
 * Fortschritt über die Zeit (/ops/corpus): aus den Tagesständen der
 * Nachweis-Messung — wie viel seit gestern nachweislich 1:1 dazukam, wie
 * schnell die offene Arbeit schrumpft, wann eine Quelle fertig ist und ob sie
 * stockt. Rein, ohne I/O (auch im Browser nutzbar); die Tagesstände liefert
 * corpus-sync-history.ts.
 */

import { PROOF_BUCKETS, type ProofCounts } from "@/lib/corpus-proof";

/** Letzter Stand eines Tages (Wiener Datum). */
export interface DailyPoint {
  day: string;
  confirmed: number;
  /** Mit unseren Mitteln schließbar: abweichend, fehlerhaft, ungeprüft, Import, Abruf. */
  open: number;
  /** Alle Töpfe zusammen. */
  total: number;
}

/** Was offen ist und von uns geschlossen werden kann — „RIS ohne Text" gehört nicht dazu. */
export function openOf(c: ProofCounts): number {
  return c.mismatch + c.defective + c.unchecked + c.importOpen + c.fetchOpen;
}

export function pointOf(day: string, c: ProofCounts): DailyPoint {
  return {
    day,
    confirmed: c.confirmed,
    open: openOf(c),
    total: PROOF_BUCKETS.reduce((n, b) => n + c[b], 0),
  };
}

/** Tagesreihen mehrerer Quellen zu einer (Bereich, gesamt) — je Tag summiert. */
export function sumSeries(series: DailyPoint[][]): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  for (const s of series)
    for (const p of s) {
      const d = byDay.get(p.day) ?? { day: p.day, confirmed: 0, open: 0, total: 0 };
      d.confirmed += p.confirmed;
      d.open += p.open;
      d.total += p.total;
      byDay.set(p.day, d);
    }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export type TrendState =
  | "done" //      nichts Schließbares offen
  | "moving" //    offene Arbeit schrumpft
  | "stalled" //   seit STALL_DAYS keine Bewegung, obwohl etwas offen ist
  | "growing" //   offene Arbeit wächst (neue Soll-Dokumente, neue Fehler)
  | "unknown"; //  zu wenig Verlauf

export interface Trend {
  state: TrendState;
  /** Veränderung „nachweislich 1:1" gegenüber dem Vortag; null ohne Vortag. */
  confirmedDelta: number | null;
  /** Abbau offener Dokumente je Tag im Schnitt der letzten Tage (positiv = schrumpft). */
  perDay: number | null;
  /** Tage bis fertig beim aktuellen Tempo; null wenn nicht absehbar. */
  etaDays: number | null;
}

export const STALL_DAYS = 3;
const RATE_WINDOW = 7;

export function trendOf(points: DailyPoint[]): Trend {
  const last = points.at(-1);
  if (!last) return { state: "unknown", confirmedDelta: null, perDay: null, etaDays: null };
  const prev = points.at(-2);
  const confirmedDelta = prev ? last.confirmed - prev.confirmed : null;
  if (last.open === 0) return { state: "done", confirmedDelta, perDay: 0, etaDays: 0 };
  if (points.length < 2) return { state: "unknown", confirmedDelta, perDay: null, etaDays: null };

  const base = points[Math.max(0, points.length - 1 - RATE_WINDOW)]!;
  const days = Math.max(1, daysBetween(base.day, last.day));
  const perDay = (base.open - last.open) / days;

  const stallBase = points.find((p) => daysBetween(p.day, last.day) <= STALL_DAYS);
  const stalled =
    daysBetween(points[0]!.day, last.day) >= STALL_DAYS &&
    stallBase !== undefined &&
    stallBase.open === last.open &&
    stallBase.confirmed === last.confirmed;

  if (stalled) return { state: "stalled", confirmedDelta, perDay: 0, etaDays: null };
  if (perDay < 0) return { state: "growing", confirmedDelta, perDay, etaDays: null };
  if (perDay === 0)
    return {
      state: daysBetween(points[0]!.day, last.day) >= STALL_DAYS ? "stalled" : "unknown",
      confirmedDelta,
      perDay,
      etaDays: null,
    };
  return { state: "moving", confirmedDelta, perDay, etaDays: Math.ceil(last.open / perDay) };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
