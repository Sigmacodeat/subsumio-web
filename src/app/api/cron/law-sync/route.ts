import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/law-sync — tägliche Synchronisation des gebündelten Gesetzes-Corpus.
 *
 * Ruft den Engine-Endpunkt /api/admin/law-sync auf, der die Markdown-Dateien
 * aus law-corpus/ in die Shared Read Sources (law-de, law-at, law-ch) importiert.
 * Die Shared Sources werden von allen Mandanten über SUBSUMIO_SHARED_READ_SOURCES
 * in Suche und Think federiert.
 */

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

  return Response.json({
    success: result.success,
    total_files: totalFiles,
    total_imported: totalImported,
    total_skipped: totalSkipped,
    total_errors: totalErrors,
    sources: result.sources,
  });
});
