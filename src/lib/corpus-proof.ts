/**
 * Nachweis je Dokument — spiegelt PROOF_BUCKETS in
 * server/scripts/corpus-sync-inventory.ts. Eigene Datei ohne fs/path, damit
 * Client-Komponenten sie importieren können; corpus-sync-inventory.ts (liest
 * die Messdatei vom Server) reicht alles weiter.
 */

/** Jedes Dokument steht in genau einem Topf; Reihenfolge = Reihenfolge der Arbeit. */
export const PROOF_BUCKETS = [
  "confirmed",
  "mismatch",
  "defective",
  "unchecked",
  "importOpen",
  "fetchOpen",
  "unreachable",
] as const;
export type ProofBucket = (typeof PROOF_BUCKETS)[number];
export type ProofCounts = Record<ProofBucket, number>;

export interface ProofSample {
  id: string;
  label: string | null;
}

export interface ProofUnit {
  counts: ProofCounts;
  samples: Partial<Record<ProofBucket, ProofSample[]>>;
}

export interface SyncProof extends ProofUnit {
  /** true = Soll ist eine Liste von Dokumentnummern: Summe der Töpfe = Soll. */
  sollExact: boolean;
  /** Letzte vollständige Inhaltsprüfung dieser Quelle; null = nie. */
  contentCheckAt: string | null;
  /** Landesrecht: dieselben Töpfe je Land (bgld, ktn, …). */
  parts?: Record<string, ProofUnit>;
  /** Index-Quellen: Töpfe je Gesetz (Schlüssel wie lawKeyFor), in PROOF_BUCKETS-Reihenfolge. */
  laws?: Record<string, number[]>;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function parseCounts(raw: unknown): ProofCounts {
  const r = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(PROOF_BUCKETS.map((b) => [b, num(r[b])])) as ProofCounts;
}

function parseUnit(raw: unknown): ProofUnit {
  const r = (raw ?? {}) as { counts?: unknown; samples?: Record<string, unknown> };
  const samples: ProofUnit["samples"] = {};
  for (const b of PROOF_BUCKETS) {
    const list = r.samples?.[b];
    if (!Array.isArray(list)) continue;
    samples[b] = list
      .filter((x): x is { id: string; label?: unknown } => !!x && typeof x.id === "string")
      .map((x) => ({ id: x.id, label: typeof x.label === "string" ? x.label : null }));
  }
  return { counts: parseCounts(r.counts), samples };
}

/** Defensiv: fehlt oder ist kaputt → undefined (Seite zeigt „noch nicht gemessen"). */
export function parseProof(raw: unknown): SyncProof | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (!r.counts || typeof r.counts !== "object") return undefined;
  const proof: SyncProof = {
    ...parseUnit(r),
    sollExact: r.sollExact === true,
    contentCheckAt: typeof r.contentCheckAt === "string" ? r.contentCheckAt : null,
  };
  if (r.parts && typeof r.parts === "object") {
    proof.parts = Object.fromEntries(
      Object.entries(r.parts as Record<string, unknown>).map(([k, v]) => [k, parseUnit(v)])
    );
  }
  if (r.laws && typeof r.laws === "object") {
    const laws: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(r.laws as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === PROOF_BUCKETS.length) laws[k] = v.map(num);
    }
    proof.laws = laws;
  }
  return proof;
}

/** Summe aller Töpfe. */
export function proofTotal(c: ProofCounts): number {
  return PROOF_BUCKETS.reduce((n, b) => n + c[b], 0);
}
