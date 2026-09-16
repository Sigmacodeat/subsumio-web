import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "Jede Funktion im Überblick — Recherche, Akten, Fristen, Copilot",
    "Features"
  );
}
