import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 60,
  },
  async (ctx) => {
    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return Response.json({ enabled: false, detail: "Engine unreachable" });
    }
    const data = await res.json();
    const ocrEnabled = Boolean(data.embedding_image_ocr);
    return Response.json({
      enabled: ocrEnabled,
      model: ocrEnabled ? String(data.embedding_image_ocr ?? "unknown") : undefined,
      detail: ocrEnabled ? "OCR is enabled" : "OCR is not configured",
    });
  }
);
