/**
 * Rechenlogik der Nachweis-Ansicht auf /ops/corpus — rein, ohne I/O, damit
 * die Summenprobe testbar ist: Sync-Zeilen nach Rechtsbereich gruppieren,
 * Töpfe aufsummieren und in die vier Fragen der Seite übersetzen
 * (nachweislich richtig · falsch · fehlt · in Arbeit).
 */

import type { CorpusSyncRow } from "@/lib/corpus-sync-inventory";
import { PROOF_BUCKETS, proofTotal, type ProofBucket, type ProofCounts } from "@/lib/corpus-proof";
import { areaOfCorpus, CORPUS_AREAS, type CorpusArea } from "@/lib/corpus-areas";

/** Die vier Fragen, in die die sieben Töpfe zerfallen — ohne Überschneidung. */
export type ProofCategory = "confirmed" | "wrong" | "missing" | "working";

export const CATEGORY_OF: Record<ProofBucket, ProofCategory> = {
  confirmed: "confirmed",
  mismatch: "wrong",
  defective: "wrong",
  fetchOpen: "missing",
  unreachable: "missing",
  importOpen: "working",
  unchecked: "working",
};

export const emptyCounts = (): ProofCounts =>
  Object.fromEntries(PROOF_BUCKETS.map((b) => [b, 0])) as ProofCounts;

export function addCounts(into: ProofCounts, from: ProofCounts): ProofCounts {
  for (const b of PROOF_BUCKETS) into[b] += from[b];
  return into;
}

export function byCategory(c: ProofCounts): Record<ProofCategory, number> {
  const out: Record<ProofCategory, number> = { confirmed: 0, wrong: 0, missing: 0, working: 0 };
  for (const b of PROOF_BUCKETS) out[CATEGORY_OF[b]] += c[b];
  return out;
}

/** Anteil nachweislich richtiger Dokumente, 0–100 mit einer Nachkommastelle; null bei 0 Dokumenten. */
export function confirmedPct(c: ProofCounts): number | null {
  const total = proofTotal(c);
  return total > 0 ? Math.floor((c.confirmed / total) * 1000) / 10 : null;
}

/** Nichts offen: jedes Dokument nachweislich richtig (und es gibt welche). */
export function isFullyConfirmed(c: ProofCounts): boolean {
  const total = proofTotal(c);
  return total > 0 && c.confirmed === total;
}

/**
 * Summenprobe: bei einem Soll aus Dokumentnummern muss die Summe der Töpfe
 * genau das Soll ergeben. null = keine Probe möglich (Soll nur als
 * Trefferzahl oder gar keins).
 */
export function sumCheck(row: CorpusSyncRow): { ok: boolean; sum: number; soll: number } | null {
  if (!row.proof?.sollExact || row.risSoll === null) return null;
  const sum = proofTotal(row.proof.counts);
  return { ok: sum === row.risSoll, sum, soll: row.risSoll };
}

export interface AreaGroup {
  area: CorpusArea;
  rows: CorpusSyncRow[];
  /** Summe der Töpfe aller Zeilen mit Nachweis. */
  counts: ProofCounts;
  /** Zeilen ohne Nachweis (Messung vor dem Ausbau). */
  unmeasured: number;
}

/**
 * Nur der Umfang des Produkts (AT, ohne Archiv), nach Rechtsbereich in der
 * Reihenfolge von CORPUS_AREAS; leere Bereiche entfallen.
 */
export function groupByArea(rows: CorpusSyncRow[]): AreaGroup[] {
  const groups = new Map<string, AreaGroup>();
  for (const area of CORPUS_AREAS)
    groups.set(area.id, { area, rows: [], counts: emptyCounts(), unmeasured: 0 });
  for (const r of rows) {
    if (!r.inScope || r.historical) continue;
    const g = groups.get(areaOfCorpus(r.corpus).area)!;
    g.rows.push(r);
    if (r.proof) addCounts(g.counts, r.proof.counts);
    else g.unmeasured++;
  }
  for (const g of groups.values())
    g.rows.sort(
      (a, b) =>
        areaOfCorpus(a.corpus).rank - areaOfCorpus(b.corpus).rank || a.label.localeCompare(b.label)
    );
  return [...groups.values()].filter((g) => g.rows.length > 0);
}

export function totalCounts(groups: AreaGroup[]): ProofCounts {
  return groups.reduce((acc, g) => addCounts(acc, g.counts), emptyCounts());
}

/** Filter der Seite: welche Zeilen zeigen. */
export type ProofFilter = "alle" | "offen" | ProofCategory;

export function rowMatches(counts: ProofCounts | null, f: ProofFilter): boolean {
  if (f === "alle") return true;
  if (!counts) return f === "offen"; // ohne Messung ist nichts belegt
  const c = byCategory(counts);
  if (f === "offen") return c.wrong + c.missing + c.working > 0;
  return c[f] > 0;
}
