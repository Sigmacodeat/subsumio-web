import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "Die Kanzlei in der Hosentasche — belegte Antworten per WhatsApp",
    "Assistent auf WhatsApp"
  );
}
