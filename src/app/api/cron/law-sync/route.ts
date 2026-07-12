import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";
import { runAmendmentCheck, buildFreshnessSummary, type Jurisdiction } from "@/lib/statute-freshness";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/law-sync — tägliche Synchronisation des gebündelten Gesetzes-Corpus.
 *
 * 1. Ruft den Engine-Endpunkt /api/admin/law-sync auf, der die Markdown-Dateien
 *    aus law-corpus/ in die Shared Read Sources (law-de, law-at, law-ch) importiert.
 * 2. Führt Amendment-Detection durch: vergleicht aktuelle Gesetzestexte mit
 *    offiziellen Quellen und erkennt §-Änderungen (Gap 3).
 *
 * Die Shared Sources werden von allen Mandanten über SUBSUMIO_SHARED_READ_SOURCES
 * in Suche und Think federiert.
 */

const STATUTES_TO_CHECK: Array<{ jurisdiction: Jurisdiction; statuteCode: string }> = [
  { jurisdiction: "DE", statuteCode: "BGB" },
  { jurisdiction: "DE", statuteCode: "HGB" },
  { jurisdiction: "DE", statuteCode: "StGB" },
  { jurisdiction: "DE", statuteCode: "ZPO" },
  { jurisdiction: "DE", statuteCode: "AO" },
  { jurisdiction: "AT", statuteCode: "ABGB" },
  { jurisdiction: "AT", statuteCode: "StGB" },
  { jurisdiction: "AT", statuteCode: "ZPO" },
  { jurisdiction: "CH", statuteCode: "OR" },
  { jurisdiction: "CH", statuteCode: "ZGB" },
  { jurisdiction: "CH", statuteCode: "StGB" },
  { jurisdiction: "EU", statuteCode: "32016R0679" }, // DSGVO / GDPR
  { jurisdiction: "EU", statuteCode: "32016L0680" }, // DSRD / ePrivacy
];

export const GET = createCronHandler(async (_req: NextRequest) => {
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;

  const res = await fetch(`${ENGINE_URL}/api/admin/law-sync`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(240_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`law-sync failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as {
    success: boolean;
    sources: Record<string, { files: number; imported: number; skipped: number; errors: number }>;
    error?: string;
  };

  const totalFiles = Object.values(result.sources).reduce((sum, s) => sum + s.files, 0);
  const totalImported = Object.values(result.sources).reduce((sum, s) => sum + s.imported, 0);
  const totalSkipped = Object.values(result.sources).reduce((sum, s) => sum + s.skipped, 0);
  const totalErrors = Object.values(result.sources).reduce((sum, s) => sum + s.errors, 0);

  // ── Statute Amendment Detection (Gap 3) ──
  let amendmentResult: { total_amendments: number; freshness_summary: ReturnType<typeof buildFreshnessSummary> | null } = {
    total_amendments: 0,
    freshness_summary: null,
  };
  try {
    const reports = await runAmendmentCheck(STATUTES_TO_CHECK);
    const allAmendments = reports.flatMap((r) => r.amendments);
    const freshnessSummary = buildFreshnessSummary(reports, []);
    amendmentResult = {
      total_amendments: allAmendments.length,
      freshness_summary: freshnessSummary,
    };
  } catch {
    // Amendment check is best-effort — don't fail the cron if it errors
  }

  return Response.json({
    success: result.success,
    total_files: totalFiles,
    total_imported: totalImported,
    total_skipped: totalSkipped,
    total_errors: totalErrors,
    sources: result.sources,
    amendments: amendmentResult,
  });
});
