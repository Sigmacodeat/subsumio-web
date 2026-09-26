/**
 * One OCR entry point for every caller (scanned PDF pages, image uploads,
 * images embedded in Office files and e-mails).
 *
 * `GBRAIN_OCR_ENGINE` picks the recognizer:
 *   - `local`  — Tesseract on this host only; nothing leaves the server.
 *   - `vision` — the configured utility vision model through the AI gateway
 *                (subject to the gateway's EU-residency policy).
 *   - `auto`   — default: Tesseract when installed, otherwise the vision model.
 *
 * The result always names the engine and, for Tesseract, the mean word
 * confidence, so a page can say how sure the recognition was.
 */

import { localOcrLanguages, ocrImageLocal } from "./local-ocr.ts";

export type OcrEngineChoice = "local" | "vision" | "auto";

export interface OcrOutcome {
  text: string;
  engine: "tesseract" | "vision";
  confidence: number | null;
}

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrUnavailableError";
  }
}

export function configuredOcrEngine(
  raw: string | undefined = process.env.GBRAIN_OCR_ENGINE
): OcrEngineChoice {
  const value = raw?.trim().toLowerCase();
  return value === "local" || value === "vision" ? value : "auto";
}

/** Which engine would run right now, or null when none is usable. */
export async function resolveOcrEngine(): Promise<"tesseract" | "vision" | null> {
  const choice = configuredOcrEngine();
  if (choice !== "vision" && (await localOcrLanguages())) return "tesseract";
  if (choice === "local") return null;
  const { isAvailable } = await import("../ai/gateway.ts");
  return isAvailable("expansion") ? "vision" : null;
}

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/tiff": ".tif",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

/**
 * Recognize the text in one image. Throws `OcrUnavailableError` when no
 * engine is usable and passes through engine errors, so callers can report
 * the failure instead of silently storing an empty page.
 */
export async function recognizeImage(
  image: Buffer,
  mime: string,
  opts: { signal?: AbortSignal } = {}
): Promise<OcrOutcome> {
  const engine = await resolveOcrEngine();
  if (engine === "tesseract") {
    const result = await ocrImageLocal(image, MIME_EXT[mime] ?? ".png");
    return { text: result.text, engine, confidence: result.confidence };
  }
  if (engine === "vision") {
    const { generateOcrText } = await import("../ai/gateway.ts");
    const text = await generateOcrText(image, mime, opts.signal);
    return { text, engine, confidence: null };
  }
  throw new OcrUnavailableError(
    configuredOcrEngine() === "local"
      ? "local OCR requested but tesseract with German model is not installed"
      : "no OCR engine available (tesseract missing, no vision model configured)"
  );
}
