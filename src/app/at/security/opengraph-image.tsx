import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "Deine Daten sind der Wert des Produkts — EU-Hosting, DSGVO, On-Prem",
    "Sicherheit"
  );
}
