import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/ocr-status — Check whether OCR is enabled in the engine config.
 *
 * Queries the engine's /api/stats endpoint which returns the config table
 * including `embedding_image_ocr`. Returns:
 *   { enabled: boolean, model?: string, detail: string }
 *
 * Used by the dashboard to show a warning banner when OCR is inactive,
 * so users know scanned/image-only PDFs won't be text-extracted.
 */
export async function GET(_req: NextRequest) {
  try {
    const headers = engineHeadersForBrain("default");

    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      headers,
      signal: AbortSignal.timeout(4_000),
    });

    if (!res.ok) {
      return Response.json(
        { enabled: false, detail: `Engine returned ${res.status}` },
        { status: 200 }
      );
    }

    const stats = (await res.json()) as {
      config?: Record<string, unknown>;
    };
    const config = stats.config ?? {};
    const ocrEnabled = config.embedding_image_ocr === true;
    const ocrModel =
      typeof config.embedding_image_ocr_model === "string"
        ? config.embedding_image_ocr_model
        : undefined;

    return Response.json({
      enabled: ocrEnabled,
      model: ocrModel,
      detail: ocrEnabled
        ? "OCR aktiv"
        : "OCR deaktiviert — gescannte Dokumente und Bilder werden nicht text-extrahiert",
    });
  } catch (err) {
    return Response.json(
      {
        enabled: false,
        detail: err instanceof Error ? err.message : "Engine unreachable",
      },
      { status: 200 }
    );
  }
}
