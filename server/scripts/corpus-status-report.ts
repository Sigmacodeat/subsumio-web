#!/usr/bin/env bun
/**
 * "Wo stehen wir" as one instant read from corpus_status — no rescanning.
 *
 * Two independent axes, each with three states, exhaustively partitioned
 * (every source lands in exactly one of the 3x3 cells, never zero, never
 * more than one):
 *   Plausibilität:  ok | issues
 *   Vollständigkeit: bestätigt-vollständig (>=99.5%) | bestätigt-unvollständig | ungeprüft
 *
 * An earlier version had isFertig treat "completeness unchecked" as good
 * enough — a source could then be simultaneously "fertig" AND "nie
 * geprüft" (found 2026-09-21: AVSV, Literatur, SPG, Staatsverträge all
 * printed in both lists). Partitioning on both axes explicitly, instead of
 * folding "unchecked" into "fine", removes the overlap and states plainly
 * when "fertig" actually means "nothing wrong found, but also never
 * checked against RIS" rather than "proven complete".
 *
 * Usage:
 *   bun run scripts/corpus-status-report.ts
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

interface StatusRow {
  source_id: string;
  doc_class: string;
  db_pages: number;
  plausible_pages: number | null;
  implausible_pages: number | null;
  unembedded_ok_pages: number | null;
  ris_total: number | null;
  last_plausibility_check: string | null;
  last_completeness_check: string | null;
}

export const COMPLETE_THRESHOLD = 99.5;

/** ris_total is the only field corpus_reconciliation gives per source; the percentage is derived here, not stored anywhere. */
export function completenessPct(r: Pick<StatusRow, "ris_total" | "db_pages">): number | null {
  if (r.ris_total === null || r.ris_total <= 0) return null;
  return Math.round((r.db_pages / r.ris_total) * 1000) / 10;
}

export type PlausibilityState = "ok" | "issues" | "ungeprueft";
export type CompletenessState =
  | "bestaetigt_vollstaendig"
  | "bestaetigt_unvollstaendig"
  | "ungeprueft";

export function plausibilityState(
  r: Pick<StatusRow, "plausible_pages" | "implausible_pages">
): PlausibilityState {
  if (r.plausible_pages === null) return "ungeprueft";
  return (r.implausible_pages ?? 0) === 0 ? "ok" : "issues";
}

export function completenessState(r: StatusRow): CompletenessState {
  const p = completenessPct(r);
  if (p === null) return "ungeprueft";
  return p >= COMPLETE_THRESHOLD ? "bestaetigt_vollstaendig" : "bestaetigt_unvollstaendig";
}

/** Both axes confirmed good — the only cell that means "100% nachweislich fertig", not "nothing wrong found yet". */
export function isFertig(r: StatusRow): boolean {
  return plausibilityState(r) === "ok" && completenessState(r) === "bestaetigt_vollstaendig";
}

export function isBestaetigtUnvollstaendig(r: StatusRow): boolean {
  return completenessState(r) === "bestaetigt_unvollstaendig";
}

export function isNieGeprueft(r: StatusRow): boolean {
  return completenessState(r) === "ungeprueft";
}

/** Known incomplete, or completeness was never checked — both are "don't know we have it all yet". */
export function isUnvollstaendig(r: StatusRow): boolean {
  return isBestaetigtUnvollstaendig(r) || isNieGeprueft(r);
}

/**
 * Complete, but plausibility found a real problem in what's already there.
 * The exact AsylGH/UVS/DSK/Landesrecht shape: 100%+ against RIS, yet a
 * handful of pages fail the plausibility rule (a scraping artifact, a
 * known-bad fetch generation). Kept separate from isBestaetigtUnvollstaendig
 * on purpose — "wrong text" and "missing text" need different fixes.
 */
export function isVollstaendigAberNichtPlausibel(r: StatusRow): boolean {
  return completenessState(r) === "bestaetigt_vollstaendig" && plausibilityState(r) !== "ok";
}

export function fehltEmbedding(r: Pick<StatusRow, "unembedded_ok_pages">): boolean {
  return (r.unembedded_ok_pages ?? 0) > 0;
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  let rows: StatusRow[];
  try {
    // Vollständigkeit comes from corpus_reconciliation (reconcile-ris.ts),
    // the pre-existing table /ops/corpus already reads — not duplicated
    // into corpus_status, so this report and the dashboard can never drift
    // apart on what "vollständig" means for a source.
    rows = (await engine.executeRaw(
      `SELECT s.source_id, s.doc_class, s.db_pages, s.plausible_pages, s.implausible_pages,
              s.unembedded_ok_pages, r.ris_total,
              s.last_plausibility_check::text, r.measured_at::text AS last_completeness_check
         FROM corpus_status s
         LEFT JOIN LATERAL (
           SELECT ris_total, measured_at FROM corpus_reconciliation
            WHERE source_id = s.source_id ORDER BY measured_at DESC LIMIT 1
         ) r ON true
        ORDER BY s.source_id`
    )) as StatusRow[];
  } catch {
    console.log(
      "corpus_status ist leer oder existiert noch nicht — erst audit-plausibility-full.ts laufen lassen."
    );
    await engine.disconnect();
    return;
  } finally {
    await engine.disconnect();
  }

  if (rows.length === 0) {
    console.log("corpus_status ist leer — erst audit-plausibility-full.ts laufen lassen.");
    return;
  }

  const pct = completenessPct;
  const checked = (t: string | null) =>
    t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "nie";

  const fertig = rows.filter(isFertig);
  const bestaetigtUnvollstaendig = rows.filter(isBestaetigtUnvollstaendig);
  const vollstaendigAberNichtPlausibel = rows.filter(isVollstaendigAberNichtPlausibel);
  const nieGeprueftPlausibelOk = rows.filter(
    (r) => isNieGeprueft(r) && plausibilityState(r) === "ok"
  );
  const nieGeprueftMitProblem = rows.filter(
    (r) => isNieGeprueft(r) && plausibilityState(r) !== "ok"
  );
  const embeddingFehlt = rows.filter(fehltEmbedding);

  const seen = new Set<string>();
  for (const bucket of [
    fertig,
    bestaetigtUnvollstaendig,
    vollstaendigAberNichtPlausibel,
    nieGeprueftPlausibelOk,
    nieGeprueftMitProblem,
  ]) {
    for (const r of bucket) seen.add(r.source_id);
  }
  const unaccounted = rows.filter((r) => !seen.has(r.source_id));

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  1) 100% FERTIG — bestätigt vollständig UND plausibel");
  console.log("═══════════════════════════════════════════════════════════");
  if (fertig.length === 0) console.log("  (keine)");
  for (const r of fertig) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT").padStart(9)} Seiten  (${pct(r)}% ggü. RIS)`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  2a) BESTÄTIGT UNVOLLSTÄNDIG (gegen RIS geprüft, Lücke gefunden)");
  console.log("═══════════════════════════════════════════════════════════");
  if (bestaetigtUnvollstaendig.length === 0) console.log("  (keine bekannten Lücken)");
  for (const r of bestaetigtUnvollstaendig) {
    const plausibel =
      plausibilityState(r) === "ok" ? "" : `  [+ ${r.implausible_pages} nicht plausibel]`;
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT")}/${r.ris_total!.toLocaleString("de-AT")} (${pct(r)}%), zuletzt geprüft ${checked(r.last_completeness_check)}${plausibel}`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  2b) VOLLSTÄNDIG, ABER MIT PLAUSIBILITÄTS-PROBLEM");
  console.log("═══════════════════════════════════════════════════════════");
  if (vollstaendigAberNichtPlausibel.length === 0) console.log("  (keine)");
  for (const r of vollstaendigAberNichtPlausibel) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${(r.implausible_pages ?? 0).toLocaleString("de-AT")} von ${r.db_pages.toLocaleString("de-AT")} nicht plausibel  (${pct(r)}% ggü. RIS)`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  2c) PLAUSIBEL, VOLLSTÄNDIGKEIT ABER NIE GEPRÜFT");
  console.log("═══════════════════════════════════════════════════════════");
  if (nieGeprueftPlausibelOk.length === 0) console.log("  (keine)");
  for (const r of nieGeprueftPlausibelOk) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT")} Seiten, plausibel — kein RIS-Vergleich bisher`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  2d) WEDER VOLLSTÄNDIGKEIT NOCH PLAUSIBILITÄT BESTÄTIGT");
  console.log("═══════════════════════════════════════════════════════════");
  if (nieGeprueftMitProblem.length === 0) console.log("  (keine)");
  for (const r of nieGeprueftMitProblem) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT")} Seiten, ${r.implausible_pages} nicht plausibel — kein RIS-Vergleich bisher`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  3) EMBEDDING FEHLT (plausibel, aber ohne Vektor)");
  console.log("═══════════════════════════════════════════════════════════");
  if (embeddingFehlt.length === 0) console.log("  (keine)");
  for (const r of embeddingFehlt) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${(r.unembedded_ok_pages ?? 0).toLocaleString("de-AT")} Seiten`
    );
  }

  if (unaccounted.length > 0) {
    console.log("\n⚠️  Nicht in Kategorie 1/2a-2d eingeordnet (Bug im Report, bitte melden):");
    for (const r of unaccounted) console.log(`  ${r.source_id}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(
    `  Stand Plausibilität: ${checked(rows.find((r) => r.last_plausibility_check)?.last_plausibility_check ?? null)}`
  );
  console.log("═══════════════════════════════════════════════════════════");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
