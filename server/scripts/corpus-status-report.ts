#!/usr/bin/env bun
/**
 * "Wo stehen wir" as one instant read from corpus_status — no rescanning.
 * Groups every source into exactly the three buckets the audit exists to
 * answer:
 *   1. 100% fertig            — plausibel geprüft (0 Probleme) UND, wo eine
 *                                RIS-Vollständigkeitsprüfung existiert, >=99.5%.
 *   2. Noch nicht heruntergeladen — Vollständigkeit gegen RIS bekanntermaßen
 *                                unter 99.5%, oder nie geprüft.
 *   3. Embedding fehlt         — plausibel UND vollständig (oder ungeprüft-
 *                                aber-plausibel), aber Seiten ohne Vektor.
 * A source can land in more than one bucket (e.g. incomplete AND missing
 * embeddings) — printed under each that applies, so nothing is hidden by
 * whichever check happens to run first.
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
  completeness_pct: string | null;
  last_plausibility_check: string | null;
  last_completeness_check: string | null;
}

export const COMPLETE_THRESHOLD = 99.5;

export function completenessPct(r: Pick<StatusRow, "completeness_pct">): number | null {
  return r.completeness_pct !== null ? Number(r.completeness_pct) : null;
}

/** Plausible everywhere it was checked, and complete wherever completeness has been checked at all. */
export function isFertig(r: StatusRow): boolean {
  const p = completenessPct(r);
  return (
    r.plausible_pages !== null &&
    r.implausible_pages === 0 &&
    (p === null || p >= COMPLETE_THRESHOLD)
  );
}

/** Completeness was checked against RIS and came back below the threshold. */
export function isBestaetigtUnvollstaendig(r: StatusRow): boolean {
  const p = completenessPct(r);
  return p !== null && p < COMPLETE_THRESHOLD;
}

/** Completeness against RIS has never been checked at all — distinct from a confirmed gap. */
export function isNieGeprueft(r: StatusRow): boolean {
  return completenessPct(r) === null;
}

/** Known incomplete, or completeness was never checked — both are "don't know we have it all yet". */
export function isUnvollstaendig(r: StatusRow): boolean {
  return isBestaetigtUnvollstaendig(r) || isNieGeprueft(r);
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
    rows = (await engine.executeRaw(
      `SELECT source_id, doc_class, db_pages, plausible_pages, implausible_pages,
              unembedded_ok_pages, ris_total, completeness_pct::text,
              last_plausibility_check::text, last_completeness_check::text
         FROM corpus_status ORDER BY source_id`
    )) as StatusRow[];
  } catch {
    console.log(
      "corpus_status ist leer oder existiert noch nicht — erst audit-plausibility-full.ts / judikatur-completeness-check.ts laufen lassen."
    );
    await engine.disconnect();
    return;
  } finally {
    await engine.disconnect();
  }

  if (rows.length === 0) {
    console.log(
      "corpus_status ist leer — erst audit-plausibility-full.ts / judikatur-completeness-check.ts laufen lassen."
    );
    return;
  }

  const pct = completenessPct;
  const checked = (t: string | null) =>
    t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "nie";

  const fertig = rows.filter(isFertig);
  const bestaetigtUnvollstaendig = rows.filter(isBestaetigtUnvollstaendig);
  const nieGeprueft = rows.filter(isNieGeprueft);
  const embeddingFehlt = rows.filter(fehltEmbedding);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  1) 100% FERTIG (plausibel + vollständig, wo geprüft)");
  console.log("═══════════════════════════════════════════════════════════");
  if (fertig.length === 0) console.log("  (keine)");
  for (const r of fertig) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT").padStart(9)} Seiten` +
        (pct(r) !== null ? `  (${pct(r)}% ggü. RIS)` : "  (Vollständigkeit ungeprüft)")
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  2a) BESTÄTIGT UNVOLLSTÄNDIG (gegen RIS geprüft, Lücke gefunden)");
  console.log("═══════════════════════════════════════════════════════════");
  if (bestaetigtUnvollstaendig.length === 0) console.log("  (keine bekannten Lücken)");
  for (const r of bestaetigtUnvollstaendig) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT")}/${r.ris_total!.toLocaleString("de-AT")} (${pct(r)}%), zuletzt geprüft ${checked(r.last_completeness_check)}`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  2b) VOLLSTÄNDIGKEIT NIE GEPRÜFT (weder gut noch schlecht bestätigt)");
  console.log("═══════════════════════════════════════════════════════════");
  if (nieGeprueft.length === 0) console.log("  (alles schon einmal geprüft)");
  for (const r of nieGeprueft) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${r.db_pages.toLocaleString("de-AT")} Seiten in DB, kein RIS-Vergleich bisher`
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
