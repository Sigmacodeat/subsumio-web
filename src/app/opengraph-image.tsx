import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "KI-Kanzleisoftware für AT · DE · CH — belegte Antworten, Fristen, Kollisionsprüfung",
    "Subsumio"
  );
}
