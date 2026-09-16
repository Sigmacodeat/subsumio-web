import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "Die KI-Engine hinter Subsumio — 5-Ebenen-Architektur für belegte Antworten",
    "SuperBrain"
  );
}
