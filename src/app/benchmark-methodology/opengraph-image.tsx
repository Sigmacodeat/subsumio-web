import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage("Benchmark-Methodik — Recall@5, Hallucination Rate, Latency", "Methodik");
}
